"""Static shareable chart from the same JSON as the application."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
ROOT = Path(__file__).resolve().parents[1]
records = json.loads((ROOT / 'data/complexes.json').read_text())['records']
colors = {'Москва':'#243e36', 'Сочи':'#a2462f', 'Санкт-Петербург':'#8b734a'}
rows = [r for city in colors for r in sorted((x for x in records if x['city']==city), key=lambda x:x['priceFrom'])]
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.spines.top':False,'axes.spines.right':False,'axes.spines.left':False})
fig, ax = plt.subplots(figsize=(13.5,9), facecolor='#f5f2e9')
ax.set_facecolor('#f5f2e9')
y = [i + i//5*.8 for i in range(15)]
ax.barh(y,[r['priceFrom'] for r in rows], color=[colors[r['city']] for r in rows],height=.65)
ax.set_yticks(y, [r['name'] for r in rows]);ax.invert_yaxis();ax.tick_params(axis='y',length=0,pad=12)
for pos,row in zip(y,rows): ax.text(row['priceFrom']+9000,pos,f"{row['priceFrom']:,}".replace(',',' '),va='center',fontsize=10,color='#243e36')
ax.set_xlim(0,850000);ax.xaxis.set_major_formatter(FuncFormatter(lambda x,p:f'{int(x/1000)} тыс.'))
ax.set_xlabel('Опубликованная цена от, ₽ за м²',labelpad=12);ax.set_axisbelow(True);ax.grid(axis='x',color='#d3d8cd',linewidth=.7)
fig.suptitle('Новостройки: цена входа за квадратный метр',x=.04,y=.97,ha='left',fontsize=21,fontweight='bold',color='#243e36')
handles=[plt.Rectangle((0,0),1,1,color=col) for col in colors.values()]
fig.legend(handles,list(colors),loc='upper left',bbox_to_anchor=(.035,.928),ncol=3,frameon=False,fontsize=11)
fig.text(.04,.045,'15 ЖК · по 5 на город · проверка 12.11.2026 · источники каждой цены в таблице',fontsize=10,color='#5c665f')
fig.text(.04,.022,'Целевая выборка с разным составом классов. Минимумы ЖК не равны средним ценам рынка или ценам любого лота.',fontsize=9,color='#5c665f')
fig.subplots_adjust(left=.285,right=.965,top=.855,bottom=.13)
for target in [ROOT/'research',ROOT/'dist/downloads']:
    target.mkdir(parents=True,exist_ok=True)
    for extension in ['png','svg']:fig.savefig(target/f'prices-chart.{extension}',dpi=160,facecolor=fig.get_facecolor())
print('Chart: research/prices-chart.png + .svg; 15 prices')
