import {matchComplexes,normalizeSearch,validateInput} from './matcher.mjs?v=6';

export const TAG_LABELS={green:'Парк и озеленение',water:'У реки',sea:'Близость моря',family:'Детская инфраструктура',wellness:'Бассейн и SPA',heritage:'Историческое окружение',ready:'Сданный комплекс',terrace:'Террасы',sport:'Спортивные площадки',urban:'Городская инфраструктура',views:'Видовые квартиры'};
export function dot(a,b){return a.reduce((sum,value,index)=>sum+value*b[index],0);}
function lexical(query,row) {
  const words=normalizeSearch(query).split(/\s+/).filter(Boolean);
  const hay=normalizeSearch(`${row.name} ${row.developer} ${row.district} ${row.city}`);
  return words.length?words.filter(word=>hay.includes(word)).length/words.length:0;
}
export function featureVector(row,input,profile,queryEmbedding,model) {
  const hasQuery=Boolean(input.query);
  const features=[hasQuery&&queryEmbedding?dot(queryEmbedding,profile.embedding):0,lexical(input.query,row),
    input.budget?Math.min(2,row.priceFrom*input.area/input.budget):0,Math.log1p(row.priceFrom)/Math.log(10000001),
    Number(Boolean(input.budget)),Math.log1p(input.area??50)/Math.log(1001),Number(row.delivery.toLocaleLowerCase('ru').startsWith('сдан')),Number(hasQuery)];
  for(const anchor of model.anchors) {
    const q=hasQuery&&queryEmbedding?dot(queryEmbedding,anchor.embedding):0;
    const d=dot(profile.embedding,anchor.embedding);
    features.push(q,d,q*d);
  }
  return features.map(Math.fround);
}
export function predictRanker(features,model) {
  let score=model.init;
  for(const tree of model.trees) {
    let node=0;
    while(tree.feature[node]>=0)node=features[tree.feature[node]]<=tree.threshold[node]?tree.left[node]:tree.right[node];
    score+=model.learningRate*tree.value[node];
  }
  return score;
}
// A pure pointwise prediction: no other projects or their scores are inputs.
export function scoreComplex(row,input,profile,queryEmbedding,model) {
  const features=featureVector(row,input,profile,queryEmbedding,model);
  const score=predictRanker(features,model);
  return {...row,profile,features,score,rankScore:score,semanticScore:features[0]};
}

export function rankRecommendations(records,rawInput,model,profiles,queryEmbedding=null) {
  const input=validateInput(rawInput);
  if(Object.keys(input.errors).length)return {...input,featured:[],recommendations:[],total:0,minimumBudget:null,mode:'invalid'};
  // Structured criteria are strict. Text is used for semantic ranking.
  const pool=matchComplexes(records,{...input,query:'',sort:'price-asc'});
  const available=Boolean(model&&profiles&&(!input.query||queryEmbedding));
  if(!available) {
    const fallback=matchComplexes(records,input);
    return {...fallback,featured:fallback.matches.slice(0,3),recommendations:fallback.matches.slice(3),mode:'literal-fallback'};
  }
  const ranked=pool.matches.map(row=>scoreComplex(row,input,profiles.get(row.id),queryEmbedding,model));
  for(const row of ranked) {
    const tags=[...row.profile.tags].sort((a,b)=>{
      if(!queryEmbedding)return 0;
      const score=tag=>{const anchor=model.anchors.find(x=>x.tag===tag);return anchor?dot(queryEmbedding,anchor.embedding):0;};
      return score(b)-score(a);
    });
    row.reasons=[...(input.budget?['В пределах бюджета']:[]),...tags.slice(0,input.budget?1:2).map(tag=>TAG_LABELS[tag]).filter(Boolean)];
  }
  ranked.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const featured=ranked.slice(0,3),recommendations=ranked.slice(3);
  if(input.sort==='price-asc')recommendations.sort((a,b)=>a.priceFrom-b.priceFrom);
  if(input.sort==='price-desc')recommendations.sort((a,b)=>b.priceFrom-a.priceFrom);
  if(input.sort==='name')recommendations.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  return {...pool,...input,featured,recommendations,total:ranked.length,mode:'hybrid-ml'};
}
