import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {tableHeaders,tableRows,toCsv} from './table-data.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=JSON.parse(await readFile(path.join(root,'data/complexes.json'),'utf8'));
const records=source.records,folder=path.join(root,'market-research');
const out=path.join(root,'outputs/task-719-excel');
await mkdir(folder,{recursive:true});await mkdir(out,{recursive:true});
assert.equal(records.length,15);assert.equal(new Set(records.map(r=>r.id)).size,15);
const wb=Workbook.create(),analysis=wb.worksheets.add('Анализ'),data=wb.worksheets.add('Данные');
const dateSerial=iso=>iso?(Date.parse(iso+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000:'Не указана';
const headers=['Город','Название ЖК','Застройщик','Район','Класс','Цена от, ₽/м²','Статус строительства','Период ввода','Тип срока','Источник цены','Источник срока','Дата цены в источнике','Проверено','Область срока','Примечания','ID'];
const rows=records.map(r=>[r.city,r.name,r.developer,r.district,r.class,r.priceFrom,r.constructionStatus,r.delivery,r.deliveryKind==='fact'?'Факт':'План',r.sourceUrl,r.deliverySourceUrl||r.sourceUrl,dateSerial(r.sourceDate),dateSerial(r.checkedAt),r.deliveryScope,r.notes,r.id]);
data.getRange('A1:P16').values=[headers,...rows];
data.showGridLines=false;data.freezePanes.freezeRows(1);data.freezePanes.freezeColumns(2);
data.getRange('A1:P16').format.font={name:'Arial',size:11,color:'#000000'};
data.getRange('A1:P16').format.verticalAlignment='top';data.getRange('A1:P16').format.wrapText=true;
data.getRange('A1:P1').format.font.bold=true;data.getRange('A1:P1').format.rowHeight=36;
data.getRange('A2:P16').format.rowHeight=65;
data.getRange('A1:P1').format.borders={bottom:{style:'thin',color:'#888888'}};
for(const [col,width]of Object.entries({A:145,B:240,C:220,D:185,E:105,F:140,G:155,H:215,I:90,J:420,K:460,L:145,M:145,N:460,O:600,P:220}))data.getRange(`${col}:${col}`).format.columnWidthPx=width;
data.getRange('F2:F16').setNumberFormat('#,##0');data.getRange('L2:M16').setNumberFormat('yyyy-mm-dd');

analysis.showGridLines=false;
analysis.getRange('A1:F48').format.font={name:'Arial',size:11,color:'#000000'};
analysis.getRange('A1:F48').format.rowHeight=24;analysis.getRange('A1:F48').format.verticalAlignment='center';
for(const [col,width]of Object.entries({A:245,B:170,C:85,D:290,E:160,F:140}))analysis.getRange(`${col}:${col}`).format.columnWidthPx=width;
function block(range,value,formula=false){const r=analysis.getRange(range);r.merge();r.format.wrapText=true;r.format.horizontalAlignment='left';if(formula)analysis.getRange(range.split(':')[0]).formulas=[[value]];else r.values=[[value]];}
block('A2:F2','Новостройки: сравнение минимальных цен');analysis.getRange('A2').format.font={name:'Arial',size:16,bold:true,color:'#000000'};
analysis.getRange('A2:F2').format.borders={bottom:{style:'thin',color:'#888888'}};
block('A3:F3','15 ЖК бизнес- и премиум-класса. Снимок проверки: 13.11.2026. Цены в рублях за м².');
analysis.getRange('A5:C5').values=[['Город','Минимум, ₽/м²','Число ЖК']];
analysis.getRange('D5:F5').values=[['Показатель','Значение','Единица']];
analysis.getRange('A5:F5').format.font.bold=true;analysis.getRange('A5:F5').format.horizontalAlignment='center';
analysis.getRange('A5:F5').format.borders={bottom:{style:'thin',color:'#888888'}};
const cities=['Москва','Сочи','Санкт-Петербург'];
for(const [i,city]of cities.entries()){
  const row=6+i;analysis.getRange(`A${row}`).values=[[city]];
  analysis.getRange(`B${row}:C${row}`).formulas=[[
    `=_xlfn.MINIFS('Данные'!$F$2:$F$16,'Данные'!$A$2:$A$16,A${row})`,
    `=COUNTIFS('Данные'!$A$2:$A$16,A${row})`,
  ]];
}
const stats=[
  ['Минимум всей выборки',"=MIN('Данные'!$F$2:$F$16)",'₽/м²'],
  ['Максимум всей выборки',"=MAX('Данные'!$F$2:$F$16)",'₽/м²'],
  ['Разброс максимума к минимуму','=E7/E6','раза'],
  ['Москва выше Сочи','=B6/B7-1',''],
  ['Neva Residence',"=SUMIFS('Данные'!$F$2:$F$16,'Данные'!$P$2:$P$16,\"spb-neva\")",'₽/м², премиум'],
  ['Мануфактура James Beck',"=SUMIFS('Данные'!$F$2:$F$16,'Данные'!$P$2:$P$16,\"spb-james\")",'₽/м², бизнес'],
  ['Neva Residence ниже James Beck','=1-E10/E11',''],
];
for(const [i,[label,formula,unit]]of stats.entries()){
  const row=6+i;analysis.getRange(`D${row}`).values=[[label]];analysis.getRange(`E${row}`).formulas=[[formula]];analysis.getRange(`F${row}`).values=[[unit]];
}
analysis.getRange('B6:C8').setNumberFormat('#,##0');analysis.getRange('E6:E7').setNumberFormat('#,##0');
analysis.getRange('E8').setNumberFormat('0.00');analysis.getRange('E9').setNumberFormat('0.0%');analysis.getRange('E10:E11').setNumberFormat('#,##0');analysis.getRange('E12').setNumberFormat('0.0%');
analysis.getRange('B6:B8').format.horizontalAlignment='right';analysis.getRange('C6:C8').format.horizontalAlignment='center';analysis.getRange('E6:E12').format.horizontalAlignment='right';
const chart=analysis.charts.add('bar',analysis.getRange('A5:B8'));
chart.barOptions.direction='column';chart.barOptions.grouping='clustered';chart.barOptions.gapWidth=150;
chart.title='Минимальная цена среди пяти ЖК каждого города, ₽/м²';chart.hasLegend=false;
chart.titleTextStyle.typeface='Arial';chart.titleTextStyle.fontSize=16;
chart.series.items[0].fill='#444444';
chart.xAxis={axisType:'textAxis',textStyle:{typeface:'Arial',fontSize:14}};
chart.yAxis={numberFormatCode:'#,##0',numberFormatSourceLinked:false,textStyle:{typeface:'Arial',fontSize:12}};
chart.dataLabels={showValue:true,position:'outEnd',textStyle:{typeface:'Arial',fontSize:14}};
chart.setPosition('A14','F31');
block('A33:F33','Четыре вывода');analysis.getRange('A33').format.font.bold=true;
block('A34:F35','="1. Нижний порог Москвы — "&TEXT(B6,"#,##0")&" ₽/м², Сочи — "&TEXT(B7,"#,##0")&" ₽/м². Московский минимум выше на "&TEXT(E9,"0%")&"."',true);
block('A36:F37','="2. Петербург с минимумом "&TEXT(B8,"#,##0")&" ₽/м² находится между Москвой и Сочи. Сравниваются минимумы пяти выбранных ЖК каждого города."',true);
block('A38:F40','="3. Самый доступный стартовый метр — «"&INDEX(\'Данные\'!$B$2:$B$16,MATCH(E6,\'Данные\'!$F$2:$F$16,0))&"» ("&TEXT(E6,"#,##0")&" ₽/м²), самый дорогой — «"&INDEX(\'Данные\'!$B$2:$B$16,MATCH(E7,\'Данные\'!$F$2:$F$16,0))&"» ("&TEXT(E7,"#,##0")&" ₽/м²). Разброс — "&TEXT(E8,"0.00")&" раза."',true);
block('A41:F43','="4. Удивило: премиум Neva Residence ("&TEXT(E10,"#,##0")&" ₽/м²) ниже бизнеса James Beck ("&TEXT(E11,"#,##0")&" ₽/м²) на "&TEXT(E12,"0%")&". Класс не определяет стартовый метр: минимумы относятся к разным квартирам."',true);
block('A45:F47','Это целевая выборка, не оценка всего рынка. В Сочи все 5 ЖК — бизнес-класс; в Москве и Петербурге есть премиум. Даты прайсов различаются. Минимальную ставку нельзя умножать на произвольную площадь: наличие такой квартиры не подтверждено. Источники и даты сохранены на листе «Данные».');
for(const row of [34,36,38,41]){
  const cell=analysis.getRange(`A${row}`);
  cell.formulas=[[cell.formulas[0][0].replace(/TEXT\(([^,]+),"#,##0"\)/g,'SUBSTITUTE(TEXT($1,"#,##0"),","," ")')]];
}

// Verify both independent arithmetic and a real source edit, then restore the snapshot.
wb.recalculate();
assert.deepEqual(analysis.getRange('B6:C8').values,[[422000,5],[290000,5],[348400,5]]);
assert.equal(analysis.getRange('E6').values[0][0],290000);assert.equal(analysis.getRange('E7').values[0][0],738700);
assert.equal(analysis.getRange('E10').values[0][0],348400);assert.equal(analysis.getRange('E11').values[0][0],405000);
const shagal=records.findIndex(r=>r.id==='moscow-shagal')+2,original=data.getRange(`F${shagal}`).values[0][0];
data.getRange(`F${shagal}`).values=[[original+10000]];wb.recalculate();
const changedMinimum=Math.min(...records.filter(r=>r.city==='Москва').map(r=>r.id==='moscow-shagal'?r.priceFrom+10000:r.priceFrom));
assert.equal(analysis.getRange('B6').values[0][0],changedMinimum);
assert.ok(String(analysis.getRange('A34').values[0][0]).includes('432'));
data.getRange(`F${shagal}`).values=[[original]];wb.recalculate();
const findings=[34,36,38,41].map(row=>analysis.getRange(`A${row}`).values[0][0]);
assert.ok(findings.every((v,i)=>typeof v==='string'&&v.startsWith(`${i+1}. `)));
assert.ok(findings[2].includes('2.55'));
console.log((await wb.inspect({kind:'table',range:"'Анализ'!A5:F12",include:'values,formulas',tableMaxRows:8,tableMaxCols:6,maxChars:1900})).ndjson);
console.log((await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},summary:'Formula errors'})).ndjson);
for(const [sheetName,range,file]of [['Анализ','A1:F47','analysis-preview.png'],['Данные','A1:I16','data-preview.png'],['Данные','J1:P16','sources-preview.png'],['Анализ','A14:F31','chart.png']]){
  const blob=await wb.render({sheetName,range,scale:1,format:'png'});await writeFile(path.join(out,file),new Uint8Array(await blob.arrayBuffer()));
}
// Remove worksheet row/column headings from the PNG export of the same native chart.
const crop=spawnSync('/Users/sviat/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',['-c','from PIL import Image; import sys; p=sys.argv[1]; im=Image.open(p); im.crop((40,20,im.width,im.height)).save(p)',path.join(out,'chart.png')],{encoding:'utf8'});
if(crop.status!==0)throw new Error(crop.stderr);
const result=await SpreadsheetFile.exportXlsx(wb);const file=path.join(out,'market-analysis.xlsx');await result.save(file);
// Complete two exporter gaps: native chart caches and clickable external source URLs.
// All cells, formulas, chart objects and their bindings were authored above with Artifact Tool.
const nativeCompletion=spawnSync('/Users/sviat/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',['-c',String.raw`
import sys,json,zipfile,xml.etree.ElementTree as E
p=sys.argv[1]; payload=json.loads(sys.argv[2])
C='http://schemas.openxmlformats.org/drawingml/2006/chart'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P='http://schemas.openxmlformats.org/package/2006/relationships'
E.register_namespace('c',C);E.register_namespace('a',A);E.register_namespace('r',R)
with zipfile.ZipFile(p) as z:
    infos=z.infolist(); parts={i.filename:z.read(i.filename) for i in infos}
types=E.fromstring(parts['[Content_Types].xml'])
chart_part=next(e.attrib['PartName'].lstrip('/') for e in types if e.attrib.get('ContentType','').endswith('drawingml.chart+xml'))
chart=E.fromstring(parts[chart_part])
for kind,key in [('str','categories'),('num','values')]:
    ref=chart.find('.//{'+C+'}'+('cat' if kind=='str' else 'val')+'/{'+C+'}'+kind+'Ref')
    cache=ref.find('{'+C+'}'+kind+'Cache')
    if cache is None: cache=E.SubElement(ref,'{'+C+'}'+kind+'Cache')
    cache.clear()
    if kind=='num': E.SubElement(cache,'{'+C+'}formatCode').text='#,##0'
    E.SubElement(cache,'{'+C+'}ptCount',{'val':str(len(payload[key]))})
    for i,value in enumerate(payload[key]): E.SubElement(E.SubElement(cache,'{'+C+'}pt',{'idx':str(i)}),'{'+C+'}v').text=str(value)
scaling=chart.find('.//{'+C+'}valAx/{'+C+'}scaling')
if scaling is not None and scaling.find('{'+C+'}min') is None: E.SubElement(scaling,'{'+C+'}min',{'val':'0'})
parts[chart_part]=E.tostring(chart,encoding='utf-8',xml_declaration=True)
sheet_part='xl/worksheets/sheet2.xml'; rels_part='xl/worksheets/_rels/sheet2.xml.rels'
sheet=E.fromstring(parts[sheet_part]); links=E.Element('{'+S+'}hyperlinks')
rels=E.fromstring(parts[rels_part]) if rels_part in parts else E.Element('{'+P+'}Relationships')
for i,item in enumerate(payload['links']):
    rid='rIdSource'+str(i+1)
    E.SubElement(links,'{'+S+'}hyperlink',{'ref':item['cell'],'{'+R+'}id':rid})
    E.SubElement(rels,'{'+P+'}Relationship',{'Id':rid,'Type':R+'/hyperlink','Target':item['url'],'TargetMode':'External'})
after={'printOptions','pageMargins','pageSetup','headerFooter','drawing','legacyDrawing','extLst'}
position=next((i for i,e in enumerate(sheet) if e.tag.split('}')[-1] in after),len(sheet))
sheet.insert(position,links); E.register_namespace('',S)
parts[sheet_part]=E.tostring(sheet,encoding='utf-8',xml_declaration=True)
parts[rels_part]=E.tostring(rels,encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
    for info in infos: z.writestr(info,parts.pop(info.filename))
    for name,content in parts.items(): z.writestr(name,content)
`,file,JSON.stringify({categories:analysis.getRange('A6:A8').values.map(r=>r[0]),values:analysis.getRange('B6:B8').values.map(r=>r[0]),links:records.flatMap((r,i)=>[{cell:`J${i+2}`,url:r.sourceUrl},{cell:`K${i+2}`,url:r.deliverySourceUrl||r.sourceUrl}])})],{encoding:'utf8'});
if(nativeCompletion.status!==0)throw new Error(nativeCompletion.stderr);
await copyFile(file,path.join(folder,'market-analysis.xlsx'));await copyFile(path.join(out,'chart.png'),path.join(folder,'chart.png'));
await copyFile(path.join(root,'data/complexes.json'),path.join(folder,'complexes.json'));
await writeFile(path.join(folder,'complexes.csv'),toCsv([tableHeaders,...tableRows(records)]));
await writeFile(path.join(folder,'README.md'),`# Исследование новостроек\n\n[Excel: график, расчёты, выводы и 15 ЖК](market-analysis.xlsx)\n\nДанные проверки 13.11.2026: по 5 ЖК в Москве, Сочи и Санкт-Петербурге. Сравнивается минимальная опубликованная цена за м², без медиан и усреднения.\n\n![Минимальная цена по городам](chart.png)\n\n## Четыре вывода\n\n${findings.join('\n\n')}\n\n## Данные и метод\n\n- [CSV с источниками и датами](complexes.csv), [полный снимок JSON](complexes.json).\n- В Excel на листе «Анализ» одна редактируемая диаграмма, минимумы MINIFS, сравнения и выводы, связанные формулами с листом «Данные».\n- PNG получен отрисовкой этой диаграммы, отдельный график в Python не строился.\n- Это целевая выборка, а не оценка всего рынка. Состав классов и даты прайсов различаются; минимальная ставка не распространяется на произвольную площадь квартиры.\n- Все таблицы и график без цветных выделений. Числа — в рублях за м²; у исходных цен и сроков есть ссылки.\n`);
await writeFile(path.join(out,'verification.json'),JSON.stringify({rows:records.length,cities:analysis.getRange('A6:C8').values,findings,series:chart.series.items.map(s=>({values:s.formula,categories:s.categoryFormula})),file},null,2));
console.log(JSON.stringify({file,folder,rows:records.length,chartCount:analysis.charts.items.length,findings}));
