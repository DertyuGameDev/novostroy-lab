"""Save the anonymous public responses used by the area-price import.

Run from any directory, then inspect the snapshots and their publication dates
before running import-lot-snapshots.py. No credentials or private API are used.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import math
from pathlib import Path
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs/lots-evidence'
OUT.mkdir(parents=True,exist_ok=True)
REALTY={'sochi-yuzhny-park':289,'sochi-luigi':322,'sochi-svetskiy-les':105,'sochi-olivia':85,'sochi-yuzhnoe-more-2':118}
KVADROOM={
 'moscow-simvol':('kvadroom.ru','zhiloy-kvartal-simvol'),
 'moscow-ostrov':('kvadroom.ru','zhk-ostrov'),
 'moscow-shagal':('kvadroom.ru','zk-shagal'),
 'moscow-sydney':('kvadroom.ru','zhk-sidney-siti'),
 'moscow-prime':('kvadroom.ru','zhk-prime-park'),
 'spb-james-beck':('spb.kvadroom.ru','manufaktura-james-beck'),
 'spb-black-river':('spb.kvadroom.ru','chernaya_rechka_41'),
 'spb-mir':('spb.kvadroom.ru','mir'),
 'spb-neva':('spb.kvadroom.ru','neva-residence'),
 'spb-ldm':('spb.kvadroom.ru','ldm'),
}
def read(url):
    with urlopen(Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=30) as response:
        return json.load(response)
def collect(key):
    if key in REALTY:
        payload=read(f'https://realty5.ru/api/complex/{REALTY[key]}/lots');suffix='lots'
    else:
        domain,slug=KVADROOM[key];root=f'https://{domain}/api/buildings/{slug}/flats'
        first=read(root+'?page=1');last=first['meta']['last_page']
        pages=sorted(set([1,math.ceil(last/3),math.ceil(last*2/3),last]));lots=[]
        for page in pages:
            data=first if page==1 else read(root+f'?page={page}')
            for lot in data['data']:
                lot['evidenceUrl']=root+f'?page={page}';lots.append(lot)
        payload={'projectUrl':f'https://{domain}/complex/{slug}','total':first['meta']['total'],'pages':pages,'lots':lots};suffix='sample'
    file=OUT/f'{key}-{suffix}.json'
    file.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    return key,len(payload['lots'])
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:
        for key,count in pool.map(collect,[*REALTY,*KVADROOM]):print(key,count)
