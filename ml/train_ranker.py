"""Reproducible starter ranker. All preference labels below are SYNTHETIC."""
import csv
import hashlib
import json
from pathlib import Path
import re
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import ndcg_score, mean_absolute_error

ROOT = Path(__file__).resolve().parents[1]
SEED = 42
BASE_FEATURES = ['semantic_cosine','lexical_match','budget_utilization','city_price_position','has_budget','area_normalized','completed','has_query']
ANCHORS = {
 'green':'парк, зелень, деревья, сад и прогулочные аллеи',
 'water':'берег реки, вода, прогулочная набережная',
 'sea':'морской берег, море, пляж, курорт',
 'family':'семья с детьми, школа, детский сад, игровая площадка',
 'wellness':'бассейн, фитнес, спа, оздоровление',
 'heritage':'исторический центр, архитектура, кирпичный фасад',
 'ready':'готовый сданный дом, заселение, переезд',
 'terrace':'открытая терраса, отдых на крыше дома',
 'sport':'спортивные площадки, воркаут, занятия спортом',
 'urban':'городская инфраструктура, деловая и культурная жизнь',
 'premium':'премиальный класс жилого комплекса',
}
FEATURES = BASE_FEATURES + [f'{tag}_{part}' for tag in ANCHORS for part in ['query','project','interaction']]
INTENTS = {
 'green':['рядом зелёный парк для прогулок','хочу жить среди деревьев и зелени','дом около сада и прогулочных аллей','зелёная территория и отдых на природе','парк рядом с квартирой'],
 'water':['дом у реки с набережной','хочу гулять вдоль воды каждый вечер','квартира около речного берега','прогулочная набережная рядом с домом','жить у воды в городе'],
 'sea':['жильё рядом с морем','хочу отдыхать на морском берегу','квартира поближе к морю','курортная жизнь около пляжа','морское побережье рядом'],
 'family':['семья с детьми школа и детский сад','нужны детские площадки около дома','удобно жить с ребёнком рядом с садиком','семейный квартал с инфраструктурой для детей','школы и детские сады поблизости'],
 'wellness':['бассейн и спа рядом с домом','хочу плавать и отдыхать в SPA','жильё с бассейном и местом для отдыха','спа и оздоровительная инфраструктура','фитнес и бассейн в комплексе'],
 'heritage':['историческая архитектура в центре города','люблю кирпичные фасады и старые кварталы','дом в историческом окружении','архитектура с историей и культурная среда','хочу жить в исторической части города'],
 'ready':['готовый сданный дом','хочу переехать без ожидания строительства','дом уже введён в эксплуатацию','нужна квартира в готовом комплексе','сданное жильё для переезда'],
 'terrace':['жильё с террасами','открытые террасы для отдыха','возможность отдыхать на террасе','квартиры и общие пространства с террасой','нравятся открытые площадки на крыше'],
 'sport':['спортивные площадки на улице','хочу заниматься спортом рядом с домом','места для воркаута и активного отдыха','спорт и активные прогулки в квартале','площадки для тренировок под открытым небом'],
 'urban':['городская среда деловая и культурная жизнь','нужна инфраструктура большого города','деловой район и городские пространства','хочу жить в городской среде с культурой','жильё около городской инфраструктуры'],
 'premium':['премиальный жилой комплекс','нужен премиум класс','жильё высокого премиального класса','ищу премиальный квартал','квартиры премиум класса'],
}

def normal(text):
    return re.sub(r'[^\w]+',' ',str(text).lower().replace('ё','е'),flags=re.UNICODE).strip()

def lexical(query, record):
    words=normal(query).split()
    hay=normal(' '.join(str(record[k]) for k in ['name','developer','district','city']))
    return sum(word in hay for word in words)/len(words) if words else 0.

def feature_row(record, query, embedding, vector, budget, area, city_ranges, anchors):
    lo,hi=city_ranges[record['city']]
    base = [float(embedding@vector) if query else 0., lexical(query,record),
        min(2.,record['priceFrom']*area/budget) if budget else 0.,
        (record['priceFrom']-lo)/max(1,hi-lo), float(bool(budget)),
        float(np.log1p(area)/np.log(1001)), float(record['delivery'].lower().startswith('сдан')), float(bool(query))]
    for anchor in anchors.values():
        q=float(embedding@anchor) if query else 0.
        d=float(vector@anchor)
        base.extend([q,d,q*d])
    return base

def export_model(model):
    trees=[]
    for entry in model.estimators_[:,0]:
        tree=entry.tree_
        trees.append({'feature':tree.feature.tolist(),'threshold':tree.threshold.tolist(),'left':tree.children_left.tolist(),
            'right':tree.children_right.tolist(),'value':tree.value[:,0,0].tolist()})
    return {'schemaVersion':1,'type':'GradientBoostingRegressor','featureNames':FEATURES,'init':float(model.init_.constant_[0,0]),
        'learningRate':model.learning_rate,'trees':trees,'featureImportances':dict(zip(FEATURES,model.feature_importances_.tolist())),
        'labelSource':'synthetic_scenarios_not_user_preferences','seed':SEED}

def main():
    rng=np.random.default_rng(SEED)
    records=json.loads((ROOT/'data/complexes.json').read_text())['records']
    profiles=json.loads((ROOT/'data/profiles.json').read_text())['profiles']
    by_id={p['id']:p for p in profiles}
    encoder_meta=json.loads((ROOT/'src/ml-assets/encoder.json').read_text())
    tokenizer=AutoTokenizer.from_pretrained('cointegrated/rubert-tiny2',revision=encoder_meta['revision'],local_files_only=True)
    session=ort.InferenceSession(str(ROOT/'outputs/ml-tools/rubert-int8.onnx'),providers=['CPUExecutionProvider'])
    def embed(text):
        tokens=tokenizer(text,return_tensors='np',truncation=True,max_length=128)
        return session.run(None,{key:np.asarray(value,dtype=np.int64) for key,value in tokens.items()})[0][0]
    documents={r['id']:f"{r['name']}. {r['city']}, {r['district']}. {r['class']}. {by_id[r['id']]['description']}" for r in records}
    doc_vectors={key:embed(text) for key,text in documents.items()}
    intents=[{'group':f'{tag}:{i}','query':q,'tag':tag,'target':None} for tag,phrases in INTENTS.items() for i,q in enumerate(phrases)]
    intents += [{'group':f'named:{r["id"]}','query':r['name'],'tag':'named','target':r['id']} for r in records]
    intents += [{'group':'no-query','query':'','tag':None,'target':None}]
    vectors={item['query']:embed(item['query']) if item['query'] else np.zeros(312,dtype=np.float32) for item in intents}
    anchors={tag:embed(text) for tag,text in ANCHORS.items()}
    ranges={city:(min(r['priceFrom'] for r in records if r['city']==city),max(r['priceFrom'] for r in records if r['city']==city)) for city in {r['city'] for r in records}}
    rows=[];groups=[];scenarios={}
    for intent in intents:
        for i in range(64):
            city=rng.choice(['all','Москва','Сочи','Санкт-Петербург'])
            cls=rng.choice(['all','all','Бизнес','Премиум'])
            area=float(rng.choice([25,35,50,65,80,100,120]))
            budget=None if i%4==0 else float(rng.choice([12,18,25,30,40,55,80])*1e6)
            selected=[r for r in records if (city=='all' or r['city']==city) and (cls=='all' or r['class']==cls)
                and (budget is None or r['priceFrom']*area<=budget)]
            if len(selected)<2: continue
            sid=f'{intent["group"]}/{i}'
            indices=[]
            for r in selected:
                f=feature_row(r,intent['query'],vectors[intent['query']],doc_vectors[r['id']],budget,area,ranges,anchors)
                if intent['tag']=='named': grade=3. if r['id']==intent['target'] else 0.
                elif intent['tag']=='premium': grade=3. if r['class']=='Премиум' else 0.
                else: grade=3. if intent['tag'] in by_id[r['id']]['tags'] else 0.
                # Explicit synthetic relevance rubric; these are not observed choices.
                label=grade + .45*max(0,f[0]) + .55*f[1] + .6*(1-f[3]) + (.3*(1-f[2]) if budget else 0.)
                rows.append({'scenario':sid,'group':intent['group'],'projectId':r['id'],'query':intent['query'],
                    'city':city,'classFilter':cls,'budget':budget,'area':area,'labelSource':'synthetic',
                    **dict(zip(FEATURES,f)),'label':label})
                groups.append(intent['group']);indices.append(len(rows)-1)
            scenarios[sid]=indices
    X=np.asarray([[row[name] for name in FEATURES] for row in rows],dtype=np.float32)
    y=np.asarray([row['label'] for row in rows])
    split=GroupShuffleSplit(n_splits=1,test_size=.2,random_state=20261113)
    development,test=next(split.split(X,y,groups))
    train_sub,validation_sub=next(GroupShuffleSplit(n_splits=1,test_size=.25,random_state=20261113).split(X[development],y[development],np.asarray(groups)[development]))
    train,validation=development[train_sub],development[validation_sub]
    model=GradientBoostingRegressor(n_estimators=160,max_depth=3,min_samples_leaf=20,learning_rate=.05,random_state=SEED)
    model.fit(X[train],y[train])
    prediction=model.predict(X)
    test_set=set(test.tolist())
    val_set=set(validation.tolist())
    def metric(scores, selected=test_set):
        return float(np.mean([ndcg_score([y[idx]],[scores[idx]],k=3) for idx in scenarios.values() if idx[0] in selected]))
    def normalize_scenarios(scores):
        normalized=np.zeros(len(scores))
        for idx in scenarios.values():
            values=scores[idx]; delta=values.max()-values.min()
            normalized[idx]=(values-values.min())/delta if delta>1e-9 else 0.
        return normalized
    semantic=normalize_scenarios(X[:,0]);ml=normalize_scenarios(prediction)
    # Blend selection uses only validation groups. The test set is untouched.
    trials={str(alpha):metric(alpha*ml+(1-alpha)*semantic,val_set) for alpha in [.15,.3,.5,.7,1.]}
    alpha=float(max(trials,key=trials.get))
    mixed=alpha*ml+(1-alpha)*semantic
    base_model=GradientBoostingRegressor(n_estimators=160,max_depth=3,min_samples_leaf=20,learning_rate=.05,random_state=SEED).fit(X[train,:8],y[train])
    metrics={'labelSource':'synthetic_scenarios_not_real_users','split':'GroupShuffleSplit by complete query-template group; numeric variants stay together',
        'seed':SEED,'rows':len(rows),'scenarios':len(scenarios),'trainRows':len(train),'validationRows':len(validation),'testRows':len(test),
        'trainGroups':sorted(set(np.asarray(groups)[train])),'testGroups':sorted(set(np.asarray(groups)[test])),
        'validationGroups':sorted(set(np.asarray(groups)[validation])),
        'ndcgAt3':metric(mixed),'mlOnlyNdcgAt3':metric(prediction),'eightFeatureAblationNdcgAt3':metric(base_model.predict(X[:,:8])),
        'semanticOnlyNdcgAt3':metric(X[:,0]),'priceOnlyNdcgAt3':metric(-X[:,3]),'blendAlpha':alpha,'validationBlendTrials':trials,
        'mae':float(mean_absolute_error(y[test],prediction[test])),
        'meaning':'Measures reproduction of the documented synthetic rubric, not recommendation quality for actual buyers.'}
    assert not set(metrics['trainGroups']) & set(metrics['testGroups'])
    assert not set(metrics['trainGroups']) & set(metrics['validationGroups'])
    assert not set(metrics['validationGroups']) & set(metrics['testGroups'])
    target=ROOT/'src/ml-assets'
    model_json=export_model(model)
    model_json['anchors']=[{'tag':tag,'text':ANCHORS[tag],'embedding':vec.tolist()} for tag,vec in anchors.items()]
    model_json['blendAlpha']=alpha
    (target/'ranker.json').write_text(json.dumps(model_json,ensure_ascii=False,separators=(',',':'))+'\n')
    corpus={'schemaVersion':1,'encoderSha256':encoder_meta['sha256'],'dimension':312,'profiles':[
        {**by_id[r['id']],'text':documents[r['id']],'embedding':doc_vectors[r['id']].tolist()} for r in records]}
    (target/'profiles.json').write_text(json.dumps(corpus,ensure_ascii=False,separators=(',',':'))+'\n')
    (ROOT/'ml/metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
    with (ROOT/'ml/training-features.csv').open('w',newline='') as file:
        writer=csv.DictWriter(file,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    # Browser/Python parity fixtures use texts, token ids, embeddings and true estimator outputs.
    fixtures=[]
    for text in ['Шагал','Жить у воды рядом с парком','квартира для семьи с детьми']:
        tokens=tokenizer(text,truncation=True,max_length=128)
        fixtures.append({'text':text,'inputIds':tokens['input_ids'],'embedding':embed(text).tolist()})
    parity=[{'features':X[i].tolist(),'prediction':float(prediction[i])} for i in test[:25]]
    features_parity=[]
    for query,budget,area in [('дом у реки',30000000,50),('',None,80)]:
        embedding=embed(query) if query else np.zeros(312,dtype=np.float32)
        for r in records[:3]:
            feature=feature_row(r,query,embedding,doc_vectors[r['id']],budget,area,ranges,anchors)
            features_parity.append({'projectId':r['id'],'input':{'query':query,'budget':budget,'area':area},'queryEmbedding':embedding.tolist(),'features':np.asarray(feature,dtype=np.float32).tolist()})
    (ROOT/'ml/parity-fixtures.json').write_text(json.dumps({'encoder':fixtures,'ranker':parity,'features':features_parity},ensure_ascii=False,separators=(',',':'))+'\n')
    report={k:v for k,v in metrics.items() if k not in ['trainGroups','testGroups','validationGroups']}
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
