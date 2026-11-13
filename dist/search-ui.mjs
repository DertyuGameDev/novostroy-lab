export function initSearchUI() {
  const header=document.querySelector('#site-header'),form=document.querySelector('#match-form');
  const toggle=document.querySelector('#toggle-filters'),panel=document.querySelector('#extra-filters'),highlight=document.querySelector('#search-highlight');
  let segment=null,scheduled=false;
  function positionHighlight() {
    if(!segment)return;
    const box=segment.getBoundingClientRect(),parent=form.getBoundingClientRect();
    for(const [key,value]of Object.entries({x:box.left-parent.left-form.clientLeft,width:box.width,y:box.top-parent.top-form.clientTop,height:box.height}))highlight.style.setProperty(`--highlight-${key}`,`${value}px`);
  }
  function update() {
    scheduled=false;const active=form.contains(document.activeElement);
    header.classList.toggle('is-compact',scrollY>80&&!active&&panel.hidden&&document.body.dataset.view==='selection');
    form.classList.toggle('has-focus',active||!panel.hidden);
    form.classList.toggle('has-highlight',Boolean(active&&segment));positionHighlight();
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(update);}}
  function openFilters(){panel.hidden=false;toggle.setAttribute('aria-expanded','true');update();}
  function closeFilters(restoreFocus=false){panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(restoreFocus)toggle.focus();schedule();}
  form.addEventListener('focusin',event=>{segment=event.target.closest('.search-segment');update();});
  form.addEventListener('focusout',schedule);
  form.addEventListener('submit',()=>{closeFilters();if(form.contains(document.activeElement))document.activeElement.blur();schedule();});
  toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));update();});
  form.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();closeFilters(true);}});
  document.addEventListener('pointerdown',event=>{if(!form.contains(event.target)){closeFilters();segment=null;form.classList.remove('has-focus');}});
  window.addEventListener('scroll',schedule,{passive:true});
  const observer=new ResizeObserver(positionHighlight);observer.observe(form);
  for(const field of form.querySelectorAll('.search-segment'))observer.observe(field);
  window.addEventListener('resize',schedule);update();
  return {update,closeFilters,openFilters};
}
