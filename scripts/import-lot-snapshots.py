"""Normalize anonymous public catalogue responses saved in outputs/lots-evidence.

The files preserve posted prices, not transaction prices. Kvadroom is a four-page
sample; REALTY5 supplies its complete published board. No inferred area prices.
"""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT/'outputs/lots-evidence'
CHECKED='2026-11-13'
REALTY={
 'sochi-yuzhny-park':(289,'zhiloy-kompleks-yuzhnyy-park-289'),
 'sochi-luigi':(322,'zhiloy-kompleks-luidzhi-322'),
 'sochi-svetskiy-les':(105,'zhiloy-kompleks-svetskiy-les-105'),
 'sochi-olivia':(85,'zhiloy-kompleks-olivia-85'),
 'sochi-yuzhnoe-more':(118,'zhiloy-kompleks-yuzhnoe-more-2-118'),
}
aliases={'sochi-yuzhnoe-more':'sochi-yuzhnoe-more-2','spb-james':'spb-james-beck'}
lots=[];projects=[]
records=json.loads((ROOT/'data/complexes.json').read_text())['records']
for record in records:
    pid=record['id'];key=aliases.get(pid,pid)
    file=EVIDENCE/f'{key}-{"lots" if pid in REALTY else "sample"}.json'
    raw=json.loads(file.read_text());source_date=(CHECKED if pid not in REALTY or pid=='sochi-luigi' else '2026-10-21')
    if pid in REALTY:
        cid,slug=REALTY[pid];source=f'https://realty5.ru/complex/{slug}#lots'
        evidence=f'https://realty5.ru/api/complex/{cid}/lots'
        entries=raw['lots'];coverage='Полная опубликованная шахматка; только свободные лоты с ценой'
        for item in entries:
            if item['status']!='free' or not item.get('area') or not item.get('price'):continue
            excluded=None
            # The board contains non-residential first-floor premises in Olivia.
            if pid=='sochi-olivia' and (item.get('floor') is None or item['floor']<2):
                excluded='Тип помещения на первом этаже не подтверждён как квартира. В подбор не включено.'
            lots.append({'id':f'realty5-{item["id"]}','sourceLotId':str(item['id']),'projectId':pid,
                'area':item['area'],'price':item['price'],'rooms':item.get('rooms'),'floor':item.get('floor'),
                'building':item.get('building'),'finish':None,'sourceUrl':source,'evidenceUrl':evidence,
                'sourceDate':source_date,'checkedAt':CHECKED,'eligibility':'excluded' if excluded else 'included',
                'terms':excluded or 'Цена опубликованного свободного лота; способ оплаты не указан. Наличие не бронировалось.'})
    else:
        source=raw['projectUrl'];entries=raw['lots'];coverage=f'Выборка страниц {", ".join(map(str,raw["pages"]))}; в каталоге {raw["total"]} лотов'
        seen=set()
        for item in entries:
            if item['id'] in seen:continue
            seen.add(item['id']);area=float(item['square']);price=int(item['price'])
            # The developer verifies the same Black River quote and payment terms.
            official=pid=='spb-black-river' and area==52.08
            lots.append({'id':f'kvadroom-{item["id"]}','sourceLotId':str(item['id']),'projectId':pid,
                'area':area,'price':price,'rooms':item.get('rooms'),'floor':item.get('floor'),
                'building':item.get('house_name'),'finish':'TechnoBox, уточнить комплектацию' if official else item.get('renovation'),
                'sourceUrl':'https://flats.legenda-dom.ru/projects/chernaya-rechka-41/1-14-2' if official else source.split('/complex/')[0]+f'/offer/{item["id"]}',
                'evidenceUrl':item['evidenceUrl'],'sourceDate':None if official else source_date,'checkedAt':CHECKED,
                'eligibility':'included','terms':'100% оплата или ипотека; при рассрочке 28 048 800 ₽. Комплектация TechnoBox; отделку уточнить.' if official else 'Цена объявления в каталоге. Условия скидки и способ оплаты уточнить.'})
    project_lots=[lot for lot in lots if lot['projectId']==pid]
    projects.append({'projectId':pid,'sourceUrl':source,'coverage':coverage,'observedLots':len(project_lots),
        'includedLots':sum(lot['eligibility']=='included' for lot in project_lots),'sourceDate':source_date,'checkedAt':CHECKED,
        'snapshotSha256':hashlib.sha256(file.read_bytes()).hexdigest()})
payload={'schemaVersion':1,'checkedAt':CHECKED,'areaTolerance':.1,
 'method':'Квартиры подбираются по опубликованной полной цене в пределах ±10% желаемой площади. Цена ЖК на площадь не умножается. Диапазоны включают нижнюю границу и не включают верхнюю. Выборка не доказывает причинное влияние площади.',
 'projects':projects,'lots':sorted(lots,key=lambda lot:(lot['projectId'],lot['area'],lot['price'],lot['id']))}
(ROOT/'data/apartment-lots.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'lots':len(lots),'projects':len(projects),'excluded':sum(lot['eligibility']=='excluded'for lot in lots)},ensure_ascii=False))
