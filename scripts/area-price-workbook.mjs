import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {areaBand,summarizeAreaPrices} from '../src/apartment-prices.mjs';
import {toCsv} from './table-data.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const {records}=JSON.parse(await readFile(path.join(root,'data/complexes.json'),'utf8'));
const catalog=JSON.parse(await readFile(path.join(root,'data/apartment-lots.json'),'utf8'));
const out=path.join(root,'outputs/2026-11-13-area-prices');await mkdir(out,{recursive:true});
const wb=Workbook.create(),summary=wb.worksheets.add('Цены по площади'),detail=wb.worksheets.add('Лоты');
const serial=date=>date?(Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000:null;
const byId=new Map(records.map(r=>[r.id,r]));
const rawHeaders=['Город','ЖК','ID лота в источнике','Площадь, м²','Комнат','Корпус','Этаж','Цена квартиры, ₽','Цена за м², ₽','Диапазон площади','Отделка','Условия / ограничения','Проверено','Дата прайса','Источник лота','Публичный ответ каталога','Учтён в сводке','ID ЖК'];
const raw=catalog.lots.map(lot=>[byId.get(lot.projectId).city,byId.get(lot.projectId).name,lot.sourceLotId,lot.area,lot.rooms,lot.building,lot.floor,lot.price,null,areaBand(lot.area).label,lot.finish||'Не указана',lot.terms,serial(lot.checkedAt),serial(lot.sourceDate),lot.sourceUrl,lot.evidenceUrl,lot.eligibility==='included'?'Да':'Нет',lot.projectId]);
const end=raw.length+1;detail.getRange(`A1:R${end}`).values=[rawHeaders,...raw];
detail.getRange('I2').formulas=[['=H2/D2']];detail.getRange(`I2:I${end}`).fillDown();
const rows=summarizeAreaPrices(records,catalog);
const headers=['Город','ЖК','Диапазон площади','Лотов в выборке','Минимум, ₽/м²','Максимум, ₽/м²','Цена квартиры от, ₽','Цена квартиры до, ₽','Проверено','Особенности; граница «от» включается, «до» — нет','Охват данных','Источник сводки'];
const data=rows.map(row=>{
  const project=catalog.projects.find(p=>p.projectId===row.projectId);
  const note=row.count?`${row.buildings.length} корп.; этажи ${row.floors.length?row.floors[0]+'–'+row.floors.at(-1):'не указаны'}. ${row.finishes.join('; ')||'Отделка не указана'}. Это разные лоты: влияние одной площади не выделено.`:'В проверенной выборке нет лотов этого размера; это не означает отсутствие квартир на рынке.';
  return [row.city,row.name,row.bandLabel,null,null,null,null,null,serial(project.checkedAt),note,project.coverage,project.sourceUrl];
});
summary.getRange(`A1:L${rows.length+1}`).values=[headers,...data];
const ids=`'Лоты'!$R$2:$R$${end}`,bands=`'Лоты'!$J$2:$J$${end}`,included=`'Лоты'!$Q$2:$Q$${end}`;
for(let i=0;i<rows.length;i++){
  const r=i+2,criteria=`${ids},"${rows[i].projectId}",${bands},C${r},${included},"Да"`;
  summary.getRange(`D${r}:H${r}`).formulas=[[
    `=COUNTIFS(${criteria})`,
    ...[['MINIFS','I'],['MAXIFS','I'],['MINIFS','H'],['MAXIFS','H']].map(([fn,col])=>`=IF(D${r}=0,"Нет данных",_xlfn.${fn}('Лоты'!$${col}$2:$${col}$${end},${criteria}))`)
  ]];
}
for(const [sheet,last,cols] of [[summary,rows.length+1,{A:130,B:205,C:125,D:95,E:130,F:130,G:145,H:145,I:110,J:420,K:390,L:520}],[detail,end,{A:130,B:205,C:125,D:110,E:75,F:190,G:70,H:145,I:125,J:125,K:220,L:500,M:110,N:110,O:600,P:600,Q:100,R:190}]]){
  const lastCol=sheet===summary?'L':'R';sheet.getRange(`A1:${lastCol}${last}`).format.font={name:'Arial',size:10,color:'#000000'};
  sheet.getRange(`A1:${lastCol}${last}`).format.wrapText=true;sheet.getRange(`A1:${lastCol}${last}`).format.verticalAlignment='top';
  sheet.getRange(`A1:${lastCol}1`).format.rowHeight=36;sheet.getRange(`A2:${lastCol}${last}`).format.rowHeight=58;
  for(const [col,width]of Object.entries(cols))sheet.getRange(`${col}:${col}`).format.columnWidthPx=width;
  sheet.freezePanes.freezeRows(1);
}
summary.getRange(`D2:H${rows.length+1}`).format.numberFormat='#,##0';summary.getRange(`I2:I${rows.length+1}`).format.numberFormat='yyyy-mm-dd';
detail.getRange(`D2:D${end}`).format.numberFormat='0.00';detail.getRange(`H2:I${end}`).format.numberFormat='#,##0';detail.getRange(`M2:N${end}`).format.numberFormat='yyyy-mm-dd';
// Exercise the editable source-to-summary dependency, then restore the snapshot.
const original=detail.getRange('H2').values[0][0];
detail.getRange('H2').values=[[original+3320000]];wb.recalculate();
if(Math.abs(summary.getRange('E32').values[0][0]-914000)>1e-8)throw new Error('Source price edit did not update area summary');
detail.getRange('H2').values=[[original]];wb.recalculate();
console.log((await wb.inspect({kind:'table',range:'\'Цены по площади\'!A2:I6',include:'values,formulas',tableMaxRows:5,tableMaxCols:9,maxChars:2400})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#SPILL!',options:{useRegex:true,maxResults:10},summary:'Formula errors'})).ndjson);
for(const [sheetName,range,file]of [['Цены по площади','A1:I26','summary-1.png'],['Цены по площади','A27:I51','summary-2.png'],['Цены по площади','A52:L76','summary-3.png'],['Лоты','A1:N8','lots-start.png'],['Лоты',`A${end-5}:N${end}`,'lots-end.png']]){
  const blob=await wb.render({sheetName,range,scale:1,format:'png'});await writeFile(path.join(out,file),new Uint8Array(await blob.arrayBuffer()));
}
const output=await SpreadsheetFile.exportXlsx(wb);const file=path.join(out,'Цены_квартир_по_площади_13-11-2026.xlsx');await output.save(file);
await copyFile(file,path.join(root,'dist/downloads/apartment-prices.xlsx'));
await writeFile(path.join(out,'Цены_по_площади.csv'),toCsv([headers,...rows.map((row,i)=>{const values=[...data[i]];values.splice(3,5,row.count,row.minUnit??'Нет данных',row.maxUnit??'Нет данных',row.minPrice??'Нет данных',row.maxPrice??'Нет данных');values[8]=catalog.checkedAt;return values;})]));
await writeFile(path.join(out,'expected-summary.json'),JSON.stringify(rows));
console.log(JSON.stringify({file,lotRows:raw.length,summaryRows:rows.length}));
