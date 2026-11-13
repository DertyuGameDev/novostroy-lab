import {normalizeSearch,validateInput} from './matcher.mjs?v=12';
import {AREA_TOLERANCE,usableLot} from './apartment-prices.mjs?v=12';

// Fixed priorities. Never fitted to examples or normalized across candidates.
// City outweighs other criteria combined; class outweighs text and numbers.
export const SIMILARITY_WEIGHTS=Object.freeze({city:32,class:9,text:4,budget:2,area:2});
const clamp=value=>Math.max(0,Math.min(1,value));
export function dot(a,b){return a.reduce((sum,value,index)=>sum+value*b[index],0);}
export function cosineSimilarity(a,b) {
  if(!a?.length||a.length!==b?.length)return null;
  const norm=Math.sqrt(dot(a,a)*dot(b,b));
  return norm>0?clamp(dot(a,b)/norm):null;
}
export function lexicalSimilarity(query,row) {
  const words=normalizeSearch(query).split(/\s+/).filter(Boolean);
  const hay=normalizeSearch(`${row.name} ${row.developer} ${row.district} ${row.city}`);
  return words.length?words.filter(word=>hay.includes(word)).length/words.length:0;
}
export const areaSimilarity=(desired,actual)=>Number.isFinite(actual)&&actual>0?Math.min(desired,actual)/Math.max(desired,actual):0;
export const budgetSimilarity=(limit,price)=>Number.isFinite(price)&&price>0?Math.min(1,limit/price):0;

export function closestApartment(lots,projectId,input) {
  const candidates=lots.filter(lot=>lot.projectId===projectId&&usableLot(lot));
  const score=lot=>(input.area===null?0:SIMILARITY_WEIGHTS.area*areaSimilarity(input.area,lot.area))
    +(input.budget===null?0:SIMILARITY_WEIGHTS.budget*budgetSimilarity(input.budget,lot.price));
  return candidates.sort((a,b)=>score(b)-score(a)||a.price-b.price||a.id.localeCompare(b.id))[0]||null;
}

// One project + one request -> one absolute similarity score.
export function scoreComplex(row,input,profile,queryEmbedding,catalog={lots:[]}) {
  const selectedLot=closestApartment(catalog.lots,row.id,input),components=[];
  const add=(criterion,value)=>components.push({criterion,value,weight:SIMILARITY_WEIGHTS[criterion]});
  if(input.city!=='all')add('city',Number(row.city===input.city));
  if(input.classFilter!=='all')add('class',Number(row.class===input.classFilter));
  const semanticScore=input.query?cosineSimilarity(queryEmbedding,profile?.embedding):null;
  const literalScore=lexicalSimilarity(input.query,row);
  if(input.query)add('text',literalScore===1?1:(semanticScore??literalScore));
  if(input.budget!==null)add('budget',budgetSimilarity(input.budget,selectedLot?.price));
  if(input.area!==null)add('area',areaSimilarity(input.area,selectedLot?.area));
  const weight=components.reduce((sum,item)=>sum+item.weight,0);
  const score=weight?components.reduce((sum,item)=>sum+item.value*item.weight,0)/weight:1;
  const deviations=[];
  if(input.city!=='all'&&row.city!==input.city)deviations.push(`${row.city} вместо ${input.city}`);
  if(input.classFilter!=='all'&&row.class!==input.classFilter)deviations.push(`${row.class} вместо ${input.classFilter.toLocaleLowerCase('ru-RU')}`);
  if(!selectedLot)deviations.push('Нет подтверждённой цены квартиры');
  else {
    if(input.budget!==null&&selectedLot.price>input.budget)deviations.push(`Выше бюджета на ${Math.ceil(selectedLot.price-input.budget).toLocaleString('ru-RU')} ₽`);
    if(input.area!==null&&Math.abs(selectedLot.area-input.area)>input.area*AREA_TOLERANCE+1e-9)
      deviations.push(`${selectedLot.area.toLocaleString('ru-RU')} м² вместо ${input.area.toLocaleString('ru-RU')} м²`);
  }
  return {...row,profile,selectedLot,estimatedPrice:selectedLot?.price??null,score,rankScore:score,semanticScore,literalScore,components,deviations};
}

export function rankRecommendations(records,rawInput,profiles,queryEmbedding=null,catalog={lots:[]}) {
  const input=validateInput({...rawInput,sort:'recommended'});
  if(Object.keys(input.errors).length)return {...input,featured:[],recommendations:[],total:0,mode:'invalid'};
  const ranked=records.map(row=>scoreComplex(row,input,profiles?.get(row.id),queryEmbedding,catalog));
  ranked.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return {...input,featured:ranked.slice(0,3),recommendations:ranked.slice(3),total:ranked.length,
    mode:input.query?(queryEmbedding&&profiles?'direct-cosine':'direct-lexical'):'direct-filters'};
}
