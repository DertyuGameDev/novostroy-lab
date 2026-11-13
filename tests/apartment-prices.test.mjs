import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectApartment,summarizeAreaPrices,areaBand} from '../src/apartment-prices.mjs';
import {matchComplexes} from '../src/matcher.mjs';
const catalog=JSON.parse(await readFile(new URL('../data/apartment-lots.json',import.meta.url),'utf8'));
const {records}=JSON.parse(await readFile(new URL('../data/complexes.json',import.meta.url),'utf8'));
const lot=(id,area,price,eligibility='included')=>({id,area,price,projectId:'test',eligibility});
const examples=[lot('small',30,9e6),lot('medium',50,12.5e6),lot('large',80,24e6)];
test('different sizes retain their own posted unit and total prices; no extrapolation to 10 m²',()=>{
  assert.equal(selectApartment(examples,'test',30).price/30,300000);
  assert.equal(selectApartment(examples,'test',50).price/50,250000);
  assert.equal(selectApartment(examples,'test',80).price/80,300000);
  assert.equal(selectApartment(examples,'test',10),null);
});
test('area interval includes ±10% boundaries and rejects the next outside value',()=>{
  assert.equal(selectApartment([lot('a',45,10e6)],'test',50).area,45);
  assert.equal(selectApartment([lot('a',55,10e6)],'test',50).area,55);
  assert.equal(selectApartment([lot('a',55.001,10e6)],'test',50),null);
});
test('an affordable nearby alternative beats an unaffordable exact size, with its actual price',()=>{
  const rows=[lot('exact',50,20e6),lot('nearby',48,12e6)];
  assert.equal(selectApartment(rows,'test',50,15e6).id,'nearby');
  assert.equal(selectApartment(rows,'test',50,11999999.99),null);
  assert.equal(selectApartment(rows,'test',50,12e6).price,12e6);
});
test('unknown and excluded quotes never pass a hard budget',()=>{
  const record={id:'test',name:'Тест',city:'Москва',class:'Бизнес',priceFrom:1,developer:'Тест',district:'Тест'};
  assert.equal(matchComplexes([record],{budget:1e8,area:50}).total,0);
  assert.equal(selectApartment([lot('excluded',50,1,'excluded')],'test',50,1e8),null);
});
test('all 15 projects have traceable positive full-price quotes and explicit coverage',()=>{
  assert.equal(catalog.projects.length,15);assert.equal(new Set(catalog.lots.map(lot=>lot.id)).size,catalog.lots.length);
  for(const record of records)assert.ok(catalog.lots.some(lot=>lot.projectId===record.id));
  for(const row of catalog.lots){assert.ok(row.area>0&&Number.isSafeInteger(row.price)&&row.price>0);assert.ok(row.sourceLotId&&row.checkedAt&&row.terms);for(const url of [row.sourceUrl,row.evidenceUrl])assert.equal(new URL(url).protocol,'https:');}
});
test('band boundaries do not overlap and missing observations remain null, not zero prices',()=>{
  assert.deepEqual([34.99,35,50,70,100].map(area=>areaBand(area).id),['under-35','35-50','50-70','70-100','100-plus']);
  const summary=summarizeAreaPrices([{id:'test',city:'Москва',name:'Тест'}],{lots:examples,projects:[]});
  assert.equal(summary.find(r=>r.band==='50-70').minUnit,250000);
  assert.equal(summary.find(r=>r.band==='100-plus').minUnit,null);
  assert.equal(summary.reduce((n,r)=>n+r.count,0),examples.length);
});
test('budget quotes always refer to an actual selected lot, never a synthetic multiplication',()=>{
  for(const area of [10,30,50,80,120]){
    const r=matchComplexes(records,{area,budget:40e6},catalog);
    for(const row of r.matches){assert.equal(row.estimatedPrice,row.selectedLot.price);assert.ok(row.estimatedPrice<=40e6);assert.ok(Math.abs(row.selectedLot.area-area)<=area*.1+1e-9);}
    if(area===10)assert.equal(r.total,0);
  }
});
