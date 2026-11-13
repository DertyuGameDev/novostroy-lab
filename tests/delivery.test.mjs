import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tableHeaders,tableRows} from '../scripts/table-data.mjs';
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
