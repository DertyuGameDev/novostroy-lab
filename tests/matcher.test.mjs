import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {matchComplexes as matchRaw,parseNumber,validateInput,cityStats} from '../src/matcher.mjs';
const {records}=JSON.parse(await readFile(new URL('../data/complexes.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await readFile(new URL('../data/apartment-lots.json',import.meta.url),'utf8'));
const matchComplexes=(rows,input)=>matchRaw(rows,input,catalog);
test('15 unique ЖК, 5 in each city, valid prices and links for every numeric field',()=>{
  assert.equal(records.length,15);assert.equal(new Set(records.map(r=>r.id)).size,15);
  for(const city of ['Москва','Сочи','Санкт-Петербург']) assert.equal(records.filter(r=>r.city===city).length,5);
  for(const row of records){assert.ok(Number.isSafeInteger(row.priceFrom)&&row.priceFrom>0);assert.ok(['Бизнес','Премиум'].includes(row.class));for(const url of [row.sourceUrl,row.deliverySourceUrl||row.sourceUrl])assert.equal(new URL(url).protocol,'https:');assert.ok(row.developer&&row.district&&row.delivery&&row.notes);}
});
test('Moscow 30m/50m² filters by full posted apartment prices',()=>{
  const result=matchComplexes(records,{city:'Москва',budget:30e6,area:50});
  assert.deepEqual(result.matches.map(r=>r.id),['moscow-simvol']);
  assert.deepEqual(result.matches.map(r=>r.estimatedPrice),[29047200]);
  assert.equal(result.total,1);assert.ok(result.matches.every(r=>r.city==='Москва'&&r.estimatedPrice<=30e6));
});
test('unfiltered catalog shows all 15 projects instead of truncating to three',()=>{
  const result=matchComplexes(records);
  assert.equal(result.total,15);assert.equal(result.matches.length,15);
  assert.equal(result.matches[0].id,'sochi-yuzhny-park');
});
test('search handles case, yo, punctuation, developer, district and combined words',()=>{
  assert.deepEqual(matchComplexes(records,{query:'ЧЕРНАЯ РЕЧКА 41'}).matches.map(r=>r.id),['spb-black-river']);
  assert.deepEqual(matchComplexes(records,{query:'москва ДОНСТРОЙ'}).matches.map(r=>r.id),['moscow-simvol','moscow-ostrov']);
  assert.ok(matchComplexes(records,{query:'Петроградский'}).matches.every(r=>r.district==='Петроградский'));
  assert.equal(matchComplexes(records,{query:'sydney city'}).matches[0].id,'moscow-sydney');
  assert.equal(matchComplexes(records,{query:'несуществующий ЖК'}).minimumBudget,null);
});
test('query, city, class and budget filters intersect',()=>{
  const result=matchComplexes(records,{city:'Москва',classFilter:'Премиум',query:'Донстрой',budget:40e6,area:50});
  assert.deepEqual(result.matches.map(r=>r.id),['moscow-ostrov']);
  assert.equal(matchComplexes(records,{city:'Сочи',classFilter:'Премиум'}).total,0);
});
test('sort direction changes the entire result order',()=>{
  const result=matchComplexes(records,{sort:'price-desc'});
  assert.equal(result.matches.length,15);const known=result.matches.filter(row=>row.selectedLot);assert.ok(known.every((row,i)=>i===0||row.selectedLot.price/row.selectedLot.area<=known[i-1].selectedLot.price/known[i-1].selectedLot.area));assert.equal(result.matches.at(-1).selectedLot,null);
});
test('budget is optional; supplying it requires a valid area',()=>{
  const free=matchComplexes(records,{budget:'',area:''});
  assert.equal(free.total,15);assert.ok(free.matches.every(row=>row.estimatedPrice===null||row.estimatedPrice===row.selectedLot.price));
  const invalid=matchComplexes(records,{budget:30e6,area:''});
  assert.ok(invalid.errors.area);assert.equal(invalid.matches.length,0);
});
test('budget boundary uses full lot price, without area multiplication',()=>{
  assert.equal(matchComplexes(records,{city:'Сочи',budget:14906000,area:50}).total,1);
  assert.equal(matchComplexes(records,{city:'Сочи',budget:14905999.99,area:50}).total,0);
  assert.equal(matchComplexes(records,{city:'Сочи',budget:14906000,area:50.000001}).total,1);
});
test('one or two matches are not padded with unaffordable projects',()=>{
  const r=matchComplexes(records,{city:'Москва',budget:30000000,area:50});assert.equal(r.matches.length,1);assert.equal(r.total,1);
});
test('no matches reports the actual minimum estimate for that city',()=>{
  const r=matchComplexes(records,{city:'Санкт-Петербург',budget:10e6,area:50});assert.equal(r.matches.length,0);assert.equal(r.minimumBudget,24131097);
});
test('Russian decimals and thousands spaces accepted, ambiguous input rejected',()=>{
  assert.equal(parseNumber(' 30\u00a0000\u202f000 '),30e6);assert.equal(parseNumber('50,5'),50.5);
  for(const value of ['','1e7','12abc','1,2,3','-10','0x100']) assert.ok(Number.isNaN(parseNumber(value)));
});
test('price range supports each open end, exact boundaries, Russian input and old budget links',()=>{
  const parsed=validateInput({priceFrom:'10 000 000',priceTo:'30 000 000,50'});
  assert.equal(parsed.priceFrom,10e6);assert.equal(parsed.priceTo,30000000.5);assert.deepEqual(parsed.errors,{});
  assert.equal(validateInput({priceFrom:'0',priceTo:''}).priceFrom,null);
  assert.equal(validateInput({priceFrom:10e6}).priceTo,null);
  assert.equal(validateInput({budget:30e6}).priceTo,30e6);
  assert.equal(validateInput({budget:30e6,priceTo:40e6}).priceTo,40e6);
  assert.deepEqual(validateInput({priceFrom:30e6,priceTo:30e6}).errors,{});
  for(const input of [{priceFrom:40e6,priceTo:30e6},{priceFrom:'oops'},{priceTo:'-1'},{priceTo:0},{priceFrom:Infinity},{priceFrom:1e13}])assert.ok(Object.keys(validateInput(input).errors).length);
  const result=matchComplexes(records,{priceFrom:30e6,priceTo:40e6,area:50});
  assert.ok(result.total>0);assert.ok(result.matches.every(r=>r.selectedLot.price>=30e6&&r.selectedLot.price<=40e6));
});
test('invalid inputs cannot produce results',()=>{
  for(const input of [{city:'Казань',budget:30e6,area:50},{city:'Москва',budget:Infinity,area:50},{city:'Москва',budget:0,area:50},{city:'Москва',budget:30e6,area:NaN},{city:'Москва',budget:30e6,area:1001}]){
    const r=matchComplexes(records,input);assert.ok(Object.keys(r.errors).length);assert.equal(r.matches.length,0);
  }
  assert.equal(Object.keys(validateInput({city:'Сочи',budget:'30 000 000',area:'50,5'}).errors).length,0);
});
test('city minimum prices identify their actual source projects',()=>{
  assert.deepEqual(cityStats(records).map(r=>[r.city,r.min,r.cheapest.id]),[['Москва',422000,'moscow-shagal'],['Сочи',290000,'sochi-yuzhny-park'],['Санкт-Петербург',348400,'spb-neva']]);
  for(const stat of cityStats(records)) assert.equal(stat.min,stat.cheapest.priceFrom);
  assert.ok(cityStats([]).every(r=>r.min===null&&r.max===null&&r.cheapest===null));
});
