import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rankRecommendations,scoreComplex,cosineSimilarity,areaSimilarity,budgetSimilarity,closestApartment,dot} from '../src/recommender.mjs';
import {validateInput} from '../src/matcher.mjs';
import {tokenize} from '../src/semantic-encoder.mjs';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const {records}=await json('../data/complexes.json'),catalog=await json('../data/apartment-lots.json');
const corpus=await json('../src/ml-assets/profiles.json'),profiles=new Map(corpus.profiles.map(p=>[p.id,p]));
const encoder=await json('../src/ml-assets/encoder.json'),vocab=await json('../src/ml-assets/vocab.json'),fixtures=await json('../ml/encoder-fixtures.json');
const rank=(rows,input,embedding=null)=>rankRecommendations(rows,input,profiles,embedding,catalog);
const all=result=>[...result.featured,...result.recommendations];
const record={id:'test',name:'Тест',developer:'Девелопер',district:'Район',city:'Москва',class:'Бизнес'};
const lot=(id,area,price)=>({id,area,price,projectId:'test',eligibility:'included'});

test('verified descriptions and normalized pretrained vectors cover all 15 projects',()=>{
  assert.equal(profiles.size,15);assert.equal(corpus.encoderSha256,encoder.sha256);
  for(const row of records){const p=profiles.get(row.id);assert.ok(p.description&&p.sources.length);assert.equal(p.embedding.length,312);assert.ok(Math.abs(dot(p.embedding,p.embedding)-1)<1e-4);}
});
test('browser tokenizer still matches the pinned encoder',()=>{for(const f of fixtures)assert.deepEqual(tokenize(f.text,vocab,encoder),f.inputIds);});
test('text score is the direct cosine, including scale-invariance and unavailable vectors',()=>{
  assert.equal(cosineSimilarity([2,0],[8,0]),1);assert.equal(cosineSimilarity([1,0],[0,1]),0);
  assert.equal(cosineSimilarity([0,0],[1,0]),null);assert.equal(cosineSimilarity(null,[1,0]),null);
  assert.ok(Math.abs(cosineSimilarity([1,0],[.6,.8])-.6)<1e-12);
});
test('numeric similarities use a real full price and symmetric area ratio',()=>{
  assert.equal(areaSimilarity(50,40),.8);assert.equal(areaSimilarity(40,50),.8);
  assert.equal(budgetSimilarity(10e6,8e6),1);assert.equal(budgetSimilarity(10e6,12.5e6),.8);
  assert.equal(budgetSimilarity(10e6,undefined),0);
});
test('fixed weighted mean can be independently calculated without a trained estimator',()=>{
  const input=validateInput({city:'Москва',classFilter:'Бизнес',area:50,budget:10e6});
  const r=scoreComplex(record,input,null,null,{lots:[lot('a',45,12.5e6)]});
  assert.ok(Math.abs(r.score-(32+13+2*.8+2*.9)/49)<1e-12);
  assert.ok(r.deviations.some(x=>x.startsWith('Выше бюджета')));
});
test('the chosen apartment maximizes joint area and budget closeness, not a scaled starting rate',()=>{
  const input=validateInput({area:50,budget:15e6});
  assert.equal(closestApartment([lot('exact',50,20e6),lot('nearby',45,10e6)],'test',input).id,'nearby');
});
test('one project keeps the exact same score and quote alone, with neighbours, and with extreme neighbour prices',()=>{
  const input={city:'Москва',budget:30e6,area:50,query:fixtures[1].text},embedding=fixtures[1].embedding;
  const row=records.find(r=>r.id==='moscow-shagal');
  const expected=all(rank([row],input,embedding))[0];
  for(const rows of [records,records.filter(r=>r.city==='Москва'),records.map(r=>r.id===row.id?r:{...r,priceFrom:1})]){
    const actual=all(rank(rows,input,embedding)).find(r=>r.id===row.id);
    assert.equal(actual.score,expected.score);assert.equal(actual.selectedLot.id,expected.selectedLot.id);
  }
});
test('higher cosine cannot lower an individual score when the other criteria stay fixed',()=>{
  const input=validateInput({query:'абстрактный запрос',area:'',budget:''});let previous=-1;
  for(let i=0;i<=40;i++){const c=i/40;const r=scoreComplex(record,input,{embedding:[1,0]},[c,Math.sqrt(1-c*c)]);assert.ok(r.score>=previous-1e-12);previous=r.score;assert.ok(Math.abs(r.score-c)<1e-12);}
});
test('three largest and twelve smaller cards always retain every candidate without duplicates',()=>{
  for(const input of [{},{city:'Сочи',classFilter:'Премиум',budget:1,area:10},{query:'несуществующий объект',budget:1,area:1000}]){
    const r=rank(records,input);assert.equal(r.total,15);assert.equal(r.featured.length,3);assert.equal(r.recommendations.length,12);
    assert.equal(new Set(all(r).map(x=>x.id)).size,15);assert.ok(all(r).every(x=>Number.isFinite(x.score)&&x.score>=0&&x.score<=1));
  }
});
test('nonmatching filters are explicit deviations rather than silently disappearing candidates',()=>{
  const r=rank(records,{city:'Сочи',classFilter:'Премиум',budget:1,area:10});
  for(const row of all(r)){
    assert.ok(row.deviations.some(x=>x.startsWith('Выше бюджета')));
    if(row.city!=='Сочи')assert.ok(row.deviations.includes(`${row.city} вместо Сочи`));
    assert.ok(row.selectedLot.area!==10);assert.equal(row.estimatedPrice,row.selectedLot.price);
  }
});
test('explicit city has first priority, including when a query names a project in another city',()=>{
  const r=rank(records,{city:'Сочи',query:'Шагал',area:50},fixtures[0].embedding);
  assert.ok(all(r).slice(0,5).every(row=>row.city==='Сочи'));
});
test('every displayed position follows the same descending score, even for old manual-sort URLs',()=>{
  const input={city:'Москва',budget:30e6,area:50,query:fixtures[1].text};
  const expected=all(rank(records,input,fixtures[1].embedding));
  for(const sort of ['name','price-asc','price-desc'])assert.deepEqual(all(rank(records,{...input,sort},fixtures[1].embedding)).map(x=>x.id),expected.map(x=>x.id));
  assert.ok(expected.every((row,i)=>!i||expected[i-1].score>=row.score));
});
test('an exact project name has text similarity one and stays above approximate matches',()=>{
  const r=rank(records,{query:'Шагал'},fixtures[0].embedding);
  assert.equal(r.featured[0].id,'moscow-shagal');assert.equal(r.featured[0].components.find(c=>c.criterion==='text').value,1);
});
test('missing quote never invents an apartment price or a budget match',()=>{
  const r=rankRecommendations([record],{area:50,budget:20e6},null,null,{lots:[]});
  assert.equal(r.total,1);assert.equal(r.featured[0].estimatedPrice,null);assert.equal(r.featured[0].components.find(c=>c.criterion==='budget').value,0);
});
test('encoder failure falls back to direct word similarity while still recommending all projects',()=>{
  const r=rankRecommendations(records,{query:'Шагал'},null,null,catalog);
  assert.equal(r.mode,'direct-lexical');assert.equal(r.total,15);assert.equal(r.featured[0].id,'moscow-shagal');assert.equal(r.featured[0].semanticScore,null);
});
test('empty criteria contribute no artificial differences and invalid inputs remain errors',()=>{
  assert.ok(all(rank(records,{area:'',budget:''})).every(r=>r.score===1));
  const r=rank(records,{area:'abc'});assert.equal(r.mode,'invalid');assert.equal(r.total,0);assert.ok(r.errors.area);
});
test('all encoder chunks retain their expected bytes and SHA-256',async()=>{
  for(const chunk of encoder.chunks){const data=await readFile(new URL('../src/ml-assets/'+chunk.file,import.meta.url));assert.equal(data.length,chunk.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),chunk.sha256);}
});
test('public UI contains no table routes, downloads, or forest loader',async()=>{
  const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8'),app=await readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(html,/<table\b|#catalog|#area-prices|\.xlsx|\.csv/);assert.doesNotMatch(app,/ranker\.json|predictRanker|RandomForest/);
});
