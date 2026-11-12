// Requires @oai/artifact-tool in the author's artifact runtime; app has no dependencies.
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const {records}=JSON.parse(await readFile(path.join(root,'data/complexes.json'),'utf8'));
const out=path.join(root,'outputs/2026-11-12');await mkdir(out,{recursive:true});
const wb=Workbook.create();
const summary=wb.worksheets.add('Сравнение');
const data=wb.worksheets.add('ЖК');
const dark='#182126',cream='#FFFFFF',muted='#616D75',accent='#345C73';
for(const [sheet,range] of [[summary,'A1:N36'],[data,'A1:N24']]){
  sheet.showGridLines=false;sheet.getRange(range).format.font={name:'Arial',size:11,color:dark};
  sheet.getRange(range).format.fill=cream;sheet.getRange(range).format.verticalAlignment='center';
  sheet.getRange(range).format.rowHeight=25;
}
function title(sheet,range,text){sheet.mergeCells(range);sheet.getRange(range.split(':')[0]).values=[[text]];sheet.getRange(range).format.font={name:'Arial',size:23,bold:true,color:dark};sheet.getRange(range).format.rowHeight=42;}
title(data,'A1:N1','15 ЖК • Москва, Сочи, Санкт-Петербург');
data.mergeCells('A2:N2');data.getRange('A2').values=[['Проверка 12.11.2026. Цены от — снимок каталога; сроки и цены конкретного лота уточняются. Ссылки H/I и примечания K.']];data.getRange('A2:N2').format.font={size:10,color:muted};
const headers=['Город','Название ЖК','Застройщик','Район','Класс','Цена от, ₽/м²','Срок сдачи','Источник цены','Источник срока','Дата источника','Проверка и примечания','Источник класса','Источник застройщика','Проверено'];
data.getRange('A4:N19').values=[headers,...records.map(r=>[r.city,r.name,r.developer,r.district,r.class,r.priceFrom,r.delivery,r.sourceUrl,r.deliverySourceUrl||r.sourceUrl,r.sourceDate||'Не указана',r.dateMeaning+'. '+r.notes,r.classSourceUrl||r.sourceUrl,r.developerSourceUrl||r.sourceUrl,r.checkedAt])];
data.tables.add('A4:N19',true,'Complexes');
data.getRange('A4:N4').format={fill:dark,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},wrapText:true,rowHeight:36};
data.getRange('A5:N19').format.wrapText=true;data.getRange('A5:N19').format.rowHeight=110;
for(const [col,width] of [['A',145],['B',200],['C',205],['D',165],['E',90],['F',130],['G',205],['H',300],['I',300],['J',120],['K',480],['L',300],['M',300],['N',115]])data.getRange(`${col}:${col}`).format.columnWidthPx=width;
data.getRange('F5:F19').format.numberFormat='#,##0';data.getRange('F5:F19').format.font={color:accent,bold:true};
for(let i=0;i<records.length;i++){
  const r=records[i],n=i+5;
  for(const [col,url,label] of [['H',r.sourceUrl,'Открыть цену ↗'],['I',r.deliverySourceUrl||r.sourceUrl,'Открыть срок ↗'],['L',r.classSourceUrl||r.sourceUrl,'Класс ↗'],['M',r.developerSourceUrl||r.sourceUrl,'Застройщик ↗']]){
    // The artifact runtime does not calculate HYPERLINK reliably. Keep the full
    // auditable URL as a plain value instead of exporting an invalid cached result.
    data.getRange(`${col}${n}`).values=[[url]];
    data.getRange(`${col}${n}`).format.font={size:9,color:accent};
  }
}
data.freezePanes.freezeRows(4);data.freezePanes.freezeColumns(2);
title(summary,'A1:N1','Метр • исследование новостроек');
summary.mergeCells('A2:N2');summary.getRange('A2').values=[['Минимальная опубликованная цена за м² по городу • по 5 ЖК в выборке • проверка 12.11.2026']];summary.getRange('A2:N2').format.font={size:10,color:muted};
summary.getRange('A:N').format.columnWidth=13;
summary.getRange('A:A').format.columnWidth=22;summary.getRange('B:C').format.columnWidth=17;summary.getRange('D:D').format.columnWidth=8;summary.getRange('E:E').format.columnWidth=24;
summary.getRange('A4:E4').values=[['Город','Минимум, ₽/м²','Максимум, ₽/м²','ЖК','ЖК с минимальной ценой']];
summary.getRange('A4:E4').format={fill:dark,font:{bold:true,color:'#FFFFFF',size:10},wrapText:true,rowHeight:36};
for(const [index,city,start,end] of [[5,'Москва',10,14],[6,'Сочи',5,9],[7,'Санкт-Петербург',15,19]]){
  summary.getRange(`A${index}`).values=[[city]];
  summary.getRange(`B${index}:E${index}`).formulas=[[`=MIN('ЖК'!F${start}:F${end})`,`=MAX('ЖК'!F${start}:F${end})`,`=COUNT('ЖК'!F${start}:F${end})`,`=INDEX('ЖК'!B${start}:B${end},MATCH(B${index},'ЖК'!F${start}:F${end},0))`]];
}
summary.getRange('B5:C7').format.numberFormat='#,##0';summary.getRange('B5:B7').format.font={bold:true,color:accent};summary.getRange('E5:E7').format.wrapText=true;summary.getRange('A5:E7').format.rowHeight=35;
const chart=summary.charts.add('bar',summary.getRange('A4:B7'));
chart.title='Минимальная цена за м² по городам';chart.titleTextStyle.fontSize=15;chart.titleTextStyle.typeface='Arial';chart.hasLegend=false;
chart.xAxis={axisType:'textAxis',textStyle:{typeface:'Arial',fontSize:11}};
chart.yAxis={numberFormatCode:'#,##0',numberFormatSourceLinked:false,textStyle:{typeface:'Arial',fontSize:10}};
chart.series.items[0].fill=dark;chart.setPosition('G4','N20');
summary.getRange('A10:E10').merge();summary.getRange('A10').values=[['Четыре вывода по выборке']];summary.getRange('A10:E10').format.font={bold:true,size:14};
const findings=[
 'Москва: минимум 422 000 ₽/м² у Шагал. Сочи: 290 000 ₽/м² у Южного Парка. Разница около 46%.',
 'Минимум: Южный Парк — 290 000 ₽/м². Максимум: PRIME PARK — 738 700. Разброс 2,55 раза.',
 'Петербург: минимум 348 400 ₽/м² у Neva Residence. Условные 50 м² × эта ставка = 17 420 000 ₽.',
 'Neva Residence (премиум) от 348 400 ₽/м² ниже James Beck (бизнес) от 405 000. Это разные лоты и каталоги.'
];
for(let i=0;i<findings.length;i++){const row=12+i*3;summary.mergeCells(`A${row}:E${row+1}`);summary.getRange(`A${row}`).values=[[`${i+1}. ${findings[i]}`]];summary.getRange(`A${row}:E${row+1}`).format.wrapText=true;}
summary.mergeCells('A26:N28');summary.getRange('A26').values=[['Методика: минимум опубликованных цен от среди пяти выбранных ЖК каждого города. Это нижняя граница выборки. Сочи: 5 бизнес; Москва: 2 бизнес + 3 премиум; СПб: 3 бизнес + 2 премиум. Цены, источники и ограничения — на листе ЖК.']];summary.getRange('A26:N28').format.wrapText=true;
summary.mergeCells('A30:N32');summary.getRange('A30').values=[['Подборщик: цена от за м² × площадь. Это ориентир, не найденная в продаже квартира. Дата проверки не равна дате прайса. У Острова и Olivia использована индексированная выдача; подробности — в примечаниях.']];summary.getRange('A30:N32').format.wrapText=true;summary.getRange('A30:N32').format.font={color:muted,size:10};
summary.freezePanes.freezeRows(4);
wb.recalculate();
console.log((await wb.inspect({kind:'region',sheetId:'Сравнение',range:'A4:E7',maxChars:2000,tableMaxRows:5,tableMaxCols:5})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!|#N/A',options:{useRegex:true,maxResults:20},maxChars:2000})).ndjson);
for(const [sheetName,range,file] of [['Сравнение','A1:N33','workbook-summary.png'],['ЖК','A1:N19','workbook-data.png']]){
  const image=await wb.render({sheetName,range,scale:1,format:'png'});await writeFile(path.join(out,file),new Uint8Array(await image.arrayBuffer()));
}
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(path.join(out,'complexes.xlsx'));
await copyFile(path.join(out,'complexes.xlsx'),path.join(root,'dist/downloads/complexes.xlsx'));
console.log('XLSX exported + both worksheet previews');
