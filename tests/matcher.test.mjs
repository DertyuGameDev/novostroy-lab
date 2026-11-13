import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {matchComplexes,parseNumber,validateInput,cityStats} from '../src/matcher.mjs';
const {records}=JSON.parse(await readFile(new URL('../data/complexes.json',import.meta.url),'utf8'));
test('15 unique ЖК, 5 in each city, valid prices and links for every numeric field',()=>{
  assert.equal(records.length,15);assert.equal(new Set(records.map(r=>r.id)).size,15);
  for(const city of ['Москва','Сочи','Санкт-Петербург']) assert.equal(records.filter(r=>r.city===city).length,5);
  for(const row of records){assert.ok(Number.isSafeInteger(row.priceFrom)&&row.priceFrom>0);assert.ok(['Бизнес','Премиум'].includes(row.class));for(const url of [row.sourceUrl,row.deliverySourceUrl||row.sourceUrl])assert.equal(new URL(url).protocol,'https:');assert.ok(row.developer&&row.district&&row.delivery&&row.notes);}
});
test('Moscow 30m/50m² returns all four matching projects with correct costs',()=>{
  const result=matchComplexes(records,{city:'Москва',budget:30e6,area:50});
  assert.deepEqual(result.matches.map(r=>r.id),['moscow-shagal','moscow-simvol','moscow-sydney','moscow-ostrov']);
  assert.deepEqual(result.matches.map(r=>r.estimatedPrice),[21100000,22185000,27665000,29390000]);
  assert.equal(result.total,4);assert.ok(result.matches.every(r=>r.city==='Москва'&&r.estimatedPrice<=30e6));
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
  const result=matchComplexes(records,{city:'Москва',classFilter:'Премиум',query:'Донстрой',budget:30e6,area:50});
  assert.deepEqual(result.matches.map(r=>r.id),['moscow-ostrov']);
  assert.equal(matchComplexes(records,{city:'Сочи',classFilter:'Премиум'}).total,0);
});
test('sort direction changes the entire result order',()=>{
  const result=matchComplexes(records,{sort:'price-desc'});
  assert.equal(result.matches.length,15);assert.equal(result.matches[0].id,'moscow-prime');assert.equal(result.matches.at(-1).id,'sochi-yuzhny-park');
});
test('budget is optional; supplying it requires a valid area',()=>{
  const free=matchComplexes(records,{budget:'',area:''});
  assert.equal(free.total,15);assert.equal(free.matches[0].estimatedPrice,null);
  const invalid=matchComplexes(records,{budget:30e6,area:''});
  assert.ok(invalid.errors.area);assert.equal(invalid.matches.length,0);
});
test('budget boundary is inclusive and not rounded down',()=>{
  assert.equal(matchComplexes(records,{city:'Сочи',budget:14500000,area:50}).total,1);
  assert.equal(matchComplexes(records,{city:'Сочи',budget:14499999.99,area:50}).total,0);
  assert.equal(matchComplexes(records,{city:'Сочи',budget:14500000,area:50.000001}).total,0);
});
test('one or two matches are not padded with unaffordable projects',()=>{
  const r=matchComplexes(records,{city:'Москва',budget:22200000,area:50});assert.equal(r.matches.length,2);assert.equal(r.total,2);
});
test('no matches reports the actual minimum estimate for that city',()=>{
  const r=matchComplexes(records,{city:'Санкт-Петербург',budget:10e6,area:50});assert.equal(r.matches.length,0);assert.equal(r.minimumBudget,17420000);
});
test('Russian decimals and thousands spaces accepted, ambiguous input rejected',()=>{
  assert.equal(parseNumber(' 30\u00a0000\u202f000 '),30e6);assert.equal(parseNumber('50,5'),50.5);
  for(const value of ['','1e7','12abc','1,2,3','-10','0x100']) assert.ok(Number.isNaN(parseNumber(value)));
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
