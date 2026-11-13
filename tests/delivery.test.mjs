import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tableHeaders,tableRows} from '../scripts/table-data.mjs';
import {deliverySimilarity,validateInput,matchComplexes} from '../src/matcher.mjs';
import {rankRecommendations} from '../src/recommender.mjs';
const {records}=JSON.parse(await readFile(new URL('../data/complexes.json',import.meta.url),'utf8'));
test('every project has separate status, year, quarter precision, fact/plan and scope',()=>{
  const roman={1:'I',2:'II',3:'III',4:'IV'};
  for(const r of records){
    assert.ok(['Сдан','Строится','Частично сдан'].includes(r.constructionStatus));
    assert.ok(Number.isInteger(r.deliveryYear)&&r.deliveryYear>=2000);
    assert.equal(r.deliveryKind,r.constructionStatus==='Сдан'?'fact':'plan');
    const from=r.deliveryQuarterFrom,to=r.deliveryQuarterTo;
    assert.ok(from===null&&to===null||[from,to].every(q=>Number.isInteger(q)&&q>=1&&q<=4)&&from<=to);
    const q=from===null?'квартал не указан':(from===to?roman[from]:`${roman[from]}–${roman[to]}`)+' кв.';
    assert.equal(r.delivery,`${r.deliveryYear} · ${q}`);
    assert.ok(r.deliveryScope&&r.deliveryCheckedAt);
    assert.equal(new URL(r.deliverySourceUrl||r.sourceUrl).protocol,'https:');
  }
});
test('Yuzhnoe More 2 uses actual commissioning evidence, not the conflicting marketing plan',()=>{
  const r=records.find(r=>r.id==='sochi-yuzhnoe-more');
  assert.equal(r.constructionStatus,'Сдан');assert.equal(r.deliveryKind,'fact');
  assert.equal(r.commissionedAt,'2026-05-22');assert.equal(r.deliveryQuarterFrom,2);
  assert.ok(r.deliverySourceUrl.startsWith('https://iskevrostroy.ru/storage/projects/documents/'));
  assert.ok(r.deliveryScope.includes('литеры 2 и 5'));
});
test('CSV and XLSX use the same plain schema, keeping status distinct from period',()=>{
  const rows=tableRows(records);assert.equal(rows.length,15);
  for(const [i,row]of rows.entries()){
    assert.equal(row.length,tableHeaders.length);assert.equal(typeof row[5],'number');
    assert.equal(row[6],records[i].constructionStatus);assert.match(row[7],/^\d{4} · /);
    assert.ok(['Факт','План'].includes(row[8]));
    assert.ok(row[9].includes(records[i].sourceUrl)&&row[9].includes(records[i].deliverySourceUrl||records[i].sourceUrl));
  }
});

test('deadline is inclusive, with later delivery gradually less similar',()=>{
  const row={constructionStatus:'Строится',deliveryYear:2027};
  assert.equal(deliverySimilarity(row,'2027'),1);
  assert.equal(deliverySimilarity({...row,deliveryYear:2028},'2027'),.5);
  assert.equal(deliverySimilarity({...row,deliveryYear:2030},'2027'),.25);
  assert.equal(deliverySimilarity({constructionStatus:'Строится'},'2027'),0);
  assert.equal(deliverySimilarity(records.find(r=>r.id==='sochi-yuzhnoe-more'),'2026'),1);
});
test('ready means fully commissioned; partially commissioned remains an explicit near match',()=>{
  const result=rankRecommendations(records,{area:'',deliveryFilter:'completed'},null);
  const rows=[...result.featured,...result.recommendations];
  assert.equal(result.total,15);assert.equal(result.featured.length,3);
  assert.ok(rows.slice(0,5).every(r=>r.constructionStatus==='Сдан'&&r.score===1));
  const partial=rows.find(r=>r.constructionStatus==='Частично сдан');
  assert.equal(partial.score,.5);assert.ok(partial.deviations.includes('ЖК сдан частично'));
  const building=rows.find(r=>r.constructionStatus==='Строится');
  assert.equal(building.score,0);assert.ok(building.deviations.includes('ЖК ещё не сдан'));
});
test('a deadline contributes independently without dropping any recommendations',()=>{
  const input={area:'',deliveryFilter:'2027'};
  const result=rankRecommendations(records,input,null),rows=[...result.featured,...result.recommendations];
  assert.equal(rows.length,15);
  assert.ok(rows.filter(r=>r.deliveryYear<=2027).every(r=>r.score===1&&!r.deviations.some(d=>d.startsWith('Сдача позже'))));
  assert.ok(rows.filter(r=>r.deliveryYear>2027).every(r=>r.score<1&&r.deviations.includes('Сдача позже 2027 года')));
  for(const row of rows){
    const alone=rankRecommendations([row],input,null).featured[0];
    assert.equal(alone.score,row.score);
    const later=rankRecommendations([row],{...input,deliveryFilter:'2028'},null).featured[0];
    assert.ok(later.score>=row.score);
  }
});
test('delivery input validates the same values used by the form and defaults to no preference',()=>{
  assert.equal(validateInput({}).deliveryFilter,'all');
  for(const deliveryFilter of ['all','completed','2026','2027','2028','2029','2030'])assert.ok(!validateInput({deliveryFilter}).errors.deliveryFilter);
  assert.ok(validateInput({deliveryFilter:'soon'}).errors.deliveryFilter);
  assert.equal(rankRecommendations(records,{deliveryFilter:'soon'},null).mode,'invalid');
  const strict=matchComplexes(records,{area:'',deliveryFilter:'completed'});
  assert.equal(strict.total,5);assert.ok(strict.matches.every(r=>r.constructionStatus==='Сдан'));
});
