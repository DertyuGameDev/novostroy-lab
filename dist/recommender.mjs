import {normalizeSearch,validateInput,deliverySimilarity} from './matcher.mjs?v=14';
import {AREA_TOLERANCE,usableLot} from './apartment-prices.mjs?v=14';

// Fixed priorities. Never fitted to examples or normalized across candidates.
// City outweighs other criteria combined; class outweighs text, delivery and numbers.
export const SIMILARITY_WEIGHTS=Object.freeze({city:32,class:13,text:4,delivery:4,budget:2,area:2});
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
export function budgetSimilarity(limit,price,minimum=null) {
  if(!Number.isFinite(price)||price<=0)return 0;
  if(minimum!==null&&price<minimum)return price/minimum;
  if(limit!==null&&price>limit)return limit/price;
  return 1;
}

export function closestApartment(lots,projectId,input) {
  const candidates=lots.filter(lot=>lot.projectId===projectId&&usableLot(lot));
  const score=lot=>(input.area===null?0:SIMILARITY_WEIGHTS.area*areaSimilarity(input.area,lot.area))
    +(input.priceFrom===null&&input.priceTo===null?0:SIMILARITY_WEIGHTS.budget*budgetSimilarity(input.priceTo,lot.price,input.priceFrom));
  return candidates.sort((a,b)=>score(b)-score(a)||a.price-b.price||a.id.localeCompare(b.id))[0]||null;
}

// One project + one request -> one absolute similarity score.
export function scoreComplex(row,input,profile,queryEmbedding,catalog={lots:[]}) {
  const selectedLot=closestApartment(catalog.lots,row.id,input),components=[];
  const add=(criterion,value)=>components.push({criterion,value,weight:SIMILARITY_WEIGHTS[criterion]});
  if(input.city!=='all')add('city',Number(row.city===input.city));
  if(input.classFilter!=='all')add('class',Number(row.class===input.classFilter));
  const deliveryScore=deliverySimilarity(row,input.deliveryFilter);
  if(input.deliveryFilter!=='all')add('delivery',deliveryScore);
  const semanticScore=input.query?cosineSimilarity(queryEmbedding,profile?.embedding):null;
  const literalScore=lexicalSimilarity(input.query,row);
  if(input.query)add('text',literalScore===1?1:(semanticScore??literalScore));
  if(input.priceFrom!==null||input.priceTo!==null)add('budget',budgetSimilarity(input.priceTo,selectedLot?.price,input.priceFrom));
  if(input.area!==null)add('area',areaSimilarity(input.area,selectedLot?.area));
  const weight=components.reduce((sum,item)=>sum+item.weight,0);
  const score=weight?components.reduce((sum,item)=>sum+item.value*item.weight,0)/weight:1;
  const deviations=[];
  if(input.city!=='all'&&row.city!==input.city)deviations.push(`${row.city} вместо ${input.city}`);
  if(input.classFilter!=='all'&&row.class!==input.classFilter)deviations.push(`${row.class} вместо ${input.classFilter.toLocaleLowerCase('ru-RU')}`);
  if(input.deliveryFilter!=='all'&&deliveryScore<1)deviations.push(input.deliveryFilter==='completed'
    ? (row.constructionStatus==='Частично сдан'?'ЖК сдан частично':'ЖК ещё не сдан')
    : (Number.isInteger(row.deliveryYear)?`Сдача позже ${input.deliveryFilter} года`:'Срок сдачи не подтверждён'));
  if(!selectedLot)deviations.push('Нет подтверждённой цены квартиры');
  else {
    if(input.priceTo!==null&&selectedLot.price>input.priceTo)deviations.push(`Выше диапазона на ${Math.ceil(selectedLot.price-input.priceTo).toLocaleString('ru-RU')} ₽`);
    if(input.priceFrom!==null&&selectedLot.price<input.priceFrom)deviations.push(`Ниже диапазона на ${Math.ceil(input.priceFrom-selectedLot.price).toLocaleString('ru-RU')} ₽`);
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
