import {parseNumber} from './matcher.mjs?v=14';

const DEFAULT_CAP=100_000_000,STEP=100_000,MAX_PRICE=1e12;
const full=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:20});
const short=value=>new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:1}).format(value);

export function initPriceRange() {
  const from=document.querySelector('#price-from'),to=document.querySelector('#price-to');
  const low=document.querySelector('#price-range-from'),high=document.querySelector('#price-range-to');
  const slider=document.querySelector('#price-range'),summary=document.querySelector('#price-summary');
  let cap=DEFAULT_CAP;
  const read=field=>field.value.trim()===''?null:parseNumber(field.value);

  function sync(format=false) {
    const minimum=read(from),maximum=read(to);
    if(format===true)for(const [field,value] of [[from,minimum],[to,maximum]])if(value!==null&&Number.isFinite(value)&&value>=0&&value<=MAX_PRICE)field.value=full(value);
    if([minimum,maximum].some(n=>n!==null&&(!Number.isFinite(n)||n<0||n>MAX_PRICE))||maximum===0||minimum!==null&&maximum!==null&&minimum>maximum){summary.textContent='Проверьте цену';return;}
    const largest=Math.max(minimum||0,maximum||0);
    cap=Math.min(MAX_PRICE,Math.max(cap,(Math.floor(largest/DEFAULT_CAP)+1)*DEFAULT_CAP));
    const a=minimum??0,b=maximum??cap;
    for(const range of [low,high])range.max=String(cap);
    low.value=String(a);high.value=String(b);
    low.setAttribute('aria-valuemax',String(b));high.setAttribute('aria-valuemin',String(a));
    low.setAttribute('aria-valuetext',`${full(a)} рублей`);
    high.setAttribute('aria-valuetext',maximum===null?'Без верхнего ограничения':`${full(b)} рублей`);
    slider.style.setProperty('--price-from',`${a/cap*100}%`);
    slider.style.setProperty('--price-to',`${b/cap*100}%`);
    low.style.zIndex=a>cap*.9?'4':'2';
    document.querySelector('#price-scale-max').textContent=`${short(cap)}+`;
    summary.textContent=minimum!==null&&minimum>0
      ? (maximum!==null?`${short(minimum)} – ${short(maximum)}`:`От ${short(minimum)}`)
      : (maximum!==null?`До ${short(maximum)}`:'Любая цена');
  }

  function slide(range,exact=false) {
    let value=exact?Number(range.value):Math.round(Number(range.value)/STEP)*STEP;
    if(range===low){
      const upper=read(to);
      value=Math.max(0,Math.min(value,Number.isFinite(upper)?upper:cap));
      from.value=value===0?'':full(value);
    }else{
      const lower=read(from);
      value=Math.max(Number.isFinite(lower)?lower:0,Math.min(cap,value));
      to.value=value===cap?'':full(Math.max(1,value));
    }
    sync();
  }
  for(const field of [from,to]){field.addEventListener('input',sync);field.addEventListener('blur',()=>sync(true));}
  for(const range of [low,high]){
    range.addEventListener('input',event=>slide(range,Boolean(event.detail?.exact)));
    range.addEventListener('keydown',event=>{
      const deltas={ArrowLeft:-STEP,ArrowDown:-STEP,ArrowRight:STEP,ArrowUp:STEP,PageDown:-10*STEP,PageUp:10*STEP};
      if(!(event.key in deltas)&&!['Home','End'].includes(event.key))return;
      event.preventDefault();
      range.value=String(event.key==='Home'?0:event.key==='End'?cap:Math.max(0,Math.min(cap,Number(range.value)+deltas[event.key])));
      range.dispatchEvent(new CustomEvent('input',{bubbles:true,detail:{exact:true}}));
    });
  }
  slider.addEventListener('pointerdown',event=>{
    if(event.target===low||event.target===high)return;
    const rect=slider.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left-22)/(rect.width-44)));
    const value=ratio*cap,range=Math.abs(value-Number(low.value))<Math.abs(value-Number(high.value))?low:high;
    event.preventDefault();range.focus();range.value=String(value);range.dispatchEvent(new Event('input',{bubbles:true}));
  });
  function reset(){cap=DEFAULT_CAP;from.value='';to.value='';sync();}
  document.querySelector('#reset-price').addEventListener('click',()=>{reset();from.dispatchEvent(new Event('input',{bubbles:true}));});
  sync();
  return {sync,reset};
}
