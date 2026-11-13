import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rankRecommendations,scoreComplex,featureVector,predictRanker,dot} from '../src/recommender.mjs';
import {tokenize} from '../src/semantic-encoder.mjs';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const {records}=await json('../data/complexes.json');
const model=await json('../src/ml-assets/ranker.json');
const corpus=await json('../src/ml-assets/profiles.json');
const profiles=new Map(corpus.profiles.map(profile=>[profile.id,profile]));
const fixtures=await json('../ml/parity-fixtures.json');
const encoder=await json('../src/ml-assets/encoder.json');
const vocab=await json('../src/ml-assets/vocab.json');

test('real pretrained embeddings cover all source-backed profiles',()=>{
  assert.equal(profiles.size,15);assert.equal(corpus.encoderSha256,encoder.sha256);
  for(const row of records){const p=profiles.get(row.id);assert.ok(p.description&&p.sources.length);assert.equal(p.embedding.length,312);assert.ok(Math.abs(dot(p.embedding,p.embedding)-1)<1e-4);for(const url of p.sources)assert.equal(new URL(url).protocol,'https:');}
});
test('browser WordPiece matches the pinned Python tokenizer',()=>{
  for(const fixture of fixtures.encoder)assert.deepEqual(tokenize(fixture.text,vocab,encoder),fixture.inputIds);
});
test('JSON tree evaluation matches scikit-learn predictions',()=>{
  for(const fixture of fixtures.ranker)assert.ok(Math.abs(predictRanker(fixture.features,model)-fixture.prediction)<1e-8);
});
test('browser feature table matches the Python training pipeline',()=>{
  for(const fixture of fixtures.features){const row=records.find(r=>r.id===fixture.projectId);const actual=featureVector(row,fixture.input,profiles.get(row.id),fixture.queryEmbedding,model);assert.equal(actual.length,model.featureNames.length);for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]-fixture.features[i])<2e-5,`${fixture.projectId} / ${model.featureNames[i]}`);}
});
test('completion feature uses structured status and is independent of the display label',()=>{
  const q=fixtures.encoder[1],input={query:q.text,area:50,budget:null};
  for(const row of records){
    const actual=featureVector(row,input,profiles.get(row.id),q.embedding,model);
    assert.equal(actual[6],Number(row.constructionStatus==='Сдан'));
    assert.deepEqual(actual,featureVector({...row,delivery:'Любая подпись'},input,profiles.get(row.id),q.embedding,model));
  }
});
test('one project has the same raw score alone, in the full catalog, and with extreme neighbours',()=>{
  const q=fixtures.encoder[1],input={query:q.text,sort:'recommended',area:50};
  const all=rankRecommendations(records,input,model,profiles,q.embedding);
  const find=(result,id)=>[...result.featured,...result.recommendations].find(row=>row.id===id);
  const row=records.find(r=>r.id==='moscow-shagal');
  const alone=rankRecommendations([row],input,model,profiles,q.embedding);
  const extreme=records.map(r=>r.id===row.id?r:{...r,priceFrom:r.priceFrom*1000});
  const changed=rankRecommendations(extreme,input,model,profiles,q.embedding);
  const expected=scoreComplex(row,{...input,budget:null},profiles.get(row.id),q.embedding,model);
  for(const result of [all,alone,changed]){
    const actual=find(result,row.id);assert.equal(actual.score,expected.score);assert.equal(actual.rankScore,expected.score);
    assert.equal(actual.score,predictRanker(actual.features,model));assert.ok(actual.score>0&&actual.score<1);
  }
});
test('removing candidates with city and class filters changes no retained scores',()=>{
  const q=fixtures.encoder[1],input={query:q.text,area:50,sort:'recommended'};
  const all=rankRecommendations(records,input,model,profiles,q.embedding);
  const scores=new Map([...all.featured,...all.recommendations].map(r=>[r.id,r.score]));
  const filtered=rankRecommendations(records,{...input,city:'Москва',classFilter:'Премиум'},model,profiles,q.embedding);
  for(const row of [...filtered.featured,...filtered.recommendations])assert.equal(row.score,scores.get(row.id));
});
test('higher semantic similarity or literal match cannot lower an individual score, other features fixed',()=>{
  assert.equal(model.objective,'pointwise_similarity_regression');
  for(const fixture of fixtures.ranker)for(const index of [0,1]){
    let previous=-Infinity;
    for(let step=0;step<=40;step++){
      const features=[...fixture.features];features[index]=Math.fround(step/40);
      const score=predictRanker(features,model);assert.ok(score>=previous-1e-12);previous=score;
    }
  }
});
test('three large cards and remaining recommendations have no duplicate IDs',()=>{
  const r=rankRecommendations(records,{sort:'recommended'},model,profiles);
  assert.equal(r.mode,'hybrid-ml');assert.equal(r.featured.length,3);assert.equal(r.recommendations.length,12);
  const ids=[...r.featured,...r.recommendations].map(row=>row.id);assert.equal(new Set(ids).size,15);
});
test('structured filters are hard constraints in both recommendation blocks',()=>{
  const embedding=fixtures.encoder[1].embedding;
  const r=rankRecommendations(records,{city:'Москва',classFilter:'Премиум',budget:30e6,area:50,query:fixtures.encoder[1].text},model,profiles,embedding);
  assert.equal(r.featured.length,2);assert.equal(r.recommendations.length,0);
  for(const row of [...r.featured,...r.recommendations])assert.ok(row.city==='Москва'&&row.class==='Премиум'&&row.estimatedPrice<=30e6);
});
test('semantic query returns relevant projects without literal name matches',()=>{
  const query=fixtures.encoder[1];
  const r=rankRecommendations(records,{city:'Москва',query:query.text},model,profiles,query.embedding);
  assert.equal(r.featured.length,3);assert.ok(r.featured.filter(row=>row.profile.tags.includes('water')).length>=2);
});
test('explicit project name stays first in learned ranking',()=>{
  const q=fixtures.encoder[0];const r=rankRecommendations(records,{query:q.text},model,profiles,q.embedding);
  assert.equal(r.featured[0].id,'moscow-shagal');
});
test('empty and invalid criteria do not invent recommendations',()=>{
  assert.equal(rankRecommendations(records,{city:'Сочи',classFilter:'Премиум'},model,profiles).total,0);
  const r=rankRecommendations(records,{budget:1,area:50},model,profiles);assert.equal(r.total,0);assert.equal(r.featured.length,0);
  assert.equal(rankRecommendations(records,{area:'abc'},model,profiles).mode,'invalid');
});
test('load failures have an explicit literal fallback, never a fake semantic score',()=>{
  const r=rankRecommendations(records,{query:'Шагал'},null,null);assert.equal(r.mode,'literal-fallback');assert.equal(r.total,1);assert.equal(r.featured[0].id,'moscow-shagal');assert.equal(r.featured[0].rankScore,undefined);
});
test('all encoder chunks have expected size and SHA-256',async()=>{
  for(const chunk of encoder.chunks){const data=await readFile(new URL('../src/ml-assets/'+chunk.file,import.meta.url));assert.equal(data.length,chunk.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),chunk.sha256);}
});
test('validation and test query groups are disjoint from training',async()=>{
  const metrics=await json('../ml/metrics.json');
  for(const a of ['trainGroups','validationGroups','testGroups'])for(const b of ['trainGroups','validationGroups','testGroups'])if(a!==b)assert.ok(metrics[a].every(group=>!metrics[b].includes(group)));
  assert.equal(metrics.labelSource,'synthetic_scenarios_not_real_users');
});
