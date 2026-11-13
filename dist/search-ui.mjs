export function initSearchUI() {
  const header=document.querySelector('#site-header'),form=document.querySelector('#match-form');
  const toggle=document.querySelector('#toggle-filters'),panel=document.querySelector('#extra-filters'),highlight=document.querySelector('#search-highlight');
  const priceToggle=document.querySelector('#price-toggle'),pricePanel=document.querySelector('#price-panel');
  let segment=null,scheduled=false;
  function positionHighlight() {
    if(!segment)return;
    const box=segment.getBoundingClientRect(),parent=form.getBoundingClientRect();
    for(const [key,value]of Object.entries({x:box.left-parent.left-form.clientLeft,width:box.width,y:box.top-parent.top-form.clientTop,height:box.height}))highlight.style.setProperty(`--highlight-${key}`,`${value}px`);
  }
  function positionPrice() {
    if(pricePanel.hidden)return;
    const parent=priceToggle.parentElement.getBoundingClientRect(),width=pricePanel.offsetWidth;
    const left=Math.max(18,Math.min(parent.left+parent.width/2-width/2,innerWidth-18-width));
    pricePanel.style.left=`${left-parent.left}px`;
  }
  function update() {
    scheduled=false;const active=form.contains(document.activeElement);
    header.classList.toggle('is-compact',scrollY>80&&!active&&panel.hidden&&pricePanel.hidden&&document.body.dataset.view==='selection');
    form.classList.toggle('has-focus',active||!panel.hidden||!pricePanel.hidden);
    form.classList.toggle('has-highlight',Boolean(active&&segment));positionHighlight();
    positionPrice();
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
  function openFilters(){closePrice();panel.hidden=false;toggle.setAttribute('aria-expanded','true');update();}
  function closeFilters(restoreFocus=false){panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(restoreFocus)toggle.focus();schedule();}
  function openPrice(){closeFilters();pricePanel.hidden=false;priceToggle.setAttribute('aria-expanded','true');update();}
  function closePrice(restoreFocus=false){pricePanel.hidden=true;priceToggle.setAttribute('aria-expanded','false');if(restoreFocus)priceToggle.focus();schedule();}
  function closePanels(){closeFilters();closePrice();}
  form.addEventListener('focusin',event=>{segment=event.target.closest('.search-segment');update();});
  form.addEventListener('focusout',schedule);
  form.addEventListener('submit',()=>{closePanels();if(form.contains(document.activeElement))document.activeElement.blur();schedule();});
  toggle.addEventListener('click',()=>panel.hidden?openFilters():closeFilters());
  priceToggle.addEventListener('click',()=>pricePanel.hidden?openPrice():closePrice());
  form.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!pricePanel.hidden){event.preventDefault();closePrice(true);}else if(!panel.hidden){event.preventDefault();closeFilters(true);}}});
  document.addEventListener('pointerdown',event=>{
    if(!form.contains(event.target)){closePanels();segment=null;form.classList.remove('has-focus');}
    else{
      if(!pricePanel.contains(event.target)&&!priceToggle.contains(event.target))closePrice();
      if(!panel.contains(event.target)&&!toggle.contains(event.target))closeFilters();
    }
  });
  window.addEventListener('scroll',schedule,{passive:true});
  const observer=new ResizeObserver(()=>{positionHighlight();positionPrice();});observer.observe(form);
  for(const field of form.querySelectorAll('.search-segment'))observer.observe(field);
  window.addEventListener('resize',schedule);update();
  return {update,closeFilters,openFilters,openPrice,closePanels};
}
