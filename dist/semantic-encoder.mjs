const ASSETS = new URL('./ml-assets/',import.meta.url);

export function tokenize(text, vocabulary, meta) {
  const vocabularyMap = vocabulary instanceof Map ? vocabulary : new Map(vocabulary.map((word,index)=>[word,index]));
  const ids=[];
  const special=meta.specialTokens;
  const cleaned=[...String(text)].map(char=>{
    const code=char.codePointAt(0);
    if(code===0||code===0xfffd)return '';
    if(/\s/u.test(char))return ' ';
    if(/[\p{Cc}\p{Cf}]/u.test(char))return '';
    if(code>=0x4e00&&code<=0x9fff)return ` ${char} `;
    return char;
  }).join('');
  const words=[];
  for(const token of cleaned.trim().split(/\s+/u).filter(Boolean)) {
    let word='';
    for(const char of token) {
      const c=char.codePointAt(0);
      if(c>=33&&c<=47||c>=58&&c<=64||c>=91&&c<=96||c>=123&&c<=126||/\p{P}/u.test(char)) {
        if(word){words.push(word);word='';} words.push(char);
      } else word+=char;
    }
    if(word)words.push(word);
  }
  for(const word of words) {
    const chars=[...word];
    if(chars.length>100){ids.push(special.unk);continue;}
    const pieces=[];let start=0,failed=false;
    while(start<chars.length) {
      let end=chars.length,found=null;
      while(end>start) {
        const piece=(start?'##':'')+chars.slice(start,end).join('');
        if(vocabularyMap.has(piece)){found=vocabularyMap.get(piece);break;}
        end--;
      }
      if(found===null){failed=true;break;}
      pieces.push(found);start=end;
    }
    ids.push(...(failed?[special.unk]:pieces));
  }
  return [special.cls,...ids.slice(0,meta.maxLength-2),special.sep];
}

async function json(url) {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`ML asset HTTP ${response.status}: ${url}`);
  return response.json();
}

export function createSemanticEncoder() {
  let initialization=null;
  const cache=new Map();
  async function ready(onStatus=()=>{}) {
    if(!initialization)initialization=(async()=>{
      onStatus('Готовим поиск по смыслу…');
      const [meta,vocab,ort]=await Promise.all([
        json(new URL('encoder.json',ASSETS)),json(new URL('vocab.json',ASSETS)),import('./vendor/ort/ort.wasm.min.mjs'),
      ]);
      ort.env.logLevel='error';
      ort.env.wasm.numThreads=1;
      ort.env.wasm.proxy=false;
      ort.env.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
      const chunks=await Promise.all(meta.chunks.map(async chunk=>{
        const response=await fetch(new URL(chunk.file,ASSETS));
        if(!response.ok)throw new Error(`Encoder chunk HTTP ${response.status}`);
        const data=new Uint8Array(await response.arrayBuffer());
        if(data.length!==chunk.bytes)throw new Error('Incomplete encoder chunk');
        const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
        if(hash!==chunk.sha256)throw new Error('Encoder chunk checksum mismatch');
        return data;
      }));
      const model=new Uint8Array(meta.bytes);let offset=0;
      for(const chunk of chunks){model.set(chunk,offset);offset+=chunk.length;}
      const session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all',logSeverityLevel:3});
      return {meta,vocab:new Map(vocab.map((word,index)=>[word,index])),ort,session};
    })().catch(error=>{initialization=null;throw error;});
    return initialization;
  }
  async function embed(text,onStatus) {
    const key=String(text).trim();
    if(cache.has(key))return cache.get(key);
    const {meta,vocab,ort,session}=await ready(onStatus);
    const ids=tokenize(key,vocab,meta);
    const tensor=values=>new ort.Tensor('int64',BigInt64Array.from(values,x=>BigInt(x)),[1,values.length]);
    const output=await session.run({input_ids:tensor(ids),attention_mask:tensor(ids.map(()=>1)),token_type_ids:tensor(ids.map(()=>0))});
    const vector=Array.from(output.embedding.data);
    if(vector.length!==meta.dimension||vector.some(x=>!Number.isFinite(x)))throw new Error('Invalid sentence embedding');
    cache.set(key,vector);if(cache.size>64)cache.delete(cache.keys().next().value);
    return vector;
  }
  return {ready,embed};
}

export const semanticEncoder=createSemanticEncoder();
