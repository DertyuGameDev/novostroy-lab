import { initSearchUI } from './search-ui.mjs?v=9';
import { validateInput, cityStats, CITIES } from './matcher.mjs?v=11';
import { rankRecommendations } from './recommender.mjs?v=11';
import {summarizeAreaPrices,AREA_TOLERANCE} from './apartment-prices.mjs?v=11';
import { semanticEncoder } from './semantic-encoder.mjs?v=8';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
const rubles = value => `${number(value)} ₽`;
const date = value => value ? value.split('-').reverse().join('.') : 'Не указана';
const link = (url, text, className = '') => `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
let records = [], apartmentCatalog={lots:[],projects:[]};
const searchUI = initSearchUI();

function route() {
  const id = location.hash.slice(1) || 'selection';
  const selected = ['selection','catalog','area-prices','research','process'].includes(id) ? id : 'selection';
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== selected || !records.length;
  for (const item of document.querySelectorAll('[data-nav]')) {
    if (item.dataset.nav === selected) item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  }
  document.body.dataset.view=selected;
  searchUI.closeFilters();
  for(const menu of document.querySelectorAll('.materials-menu'))menu.open=false;
  searchUI.update();
  window.scrollTo(0,0);
  document.title = `${{selection:'Каталог новостроек',catalog:'15 ЖК с источниками','area-prices':'Цены по площади',research:'Исследование цен',process:'Работа с ИИ'}[selected]} — Метр`;
}

const cardNodes = new Map();
const filterFields = { city:'city', budget:'budget', area:'area', classFilter:'class-filter', sort:'sort' };
let ranker = null, profiles = null, renderRevision = 0, renderTimer = null;

function pendingResults() {
  for (const node of cardNodes.values()) node.hidden = true;
  const empty = $('#result-cards .empty');
  if (empty) empty.hidden = true;
  $('#recommendations').hidden = true;
  $('#result-cards').setAttribute('aria-busy','true');
}

function renderCard(row, area, rank, featured) {
  let node=cardNodes.get(row.id);
  const profile=row.profile||profiles?.get(row.id);
  if(!node){
    node=document.createElement('article');node.className='complex-card';node.dataset.id=row.id;
    node.innerHTML=`<p class="card-label">${escape(row.city)} · ${escape(row.class)}</p><h3>${escape(row.name)}</h3><p class="district">${escape(row.district)}</p>
      <p class="cost"><small>от</small> ${link(row.sourceUrl,number(row.priceFrom))} <small>₽/м²</small></p><p class="apartment-estimate"></p><p class="delivery">${escape(row.constructionStatus)} · ${link(row.deliverySourceUrl||row.sourceUrl,escape(row.delivery))}</p>
      <details class="profile-details"><summary>Подробнее</summary><p class="description"></p><p>Застройщик: ${escape(row.developer)}</p><p class="match-score"></p><p>Проверено: ${date(row.checkedAt)}. Дата источника: ${date(row.sourceDate)}.</p><p>${escape(row.notes)}</p><span class="profile-source"></span></details>`;
    cardNodes.set(row.id,node);
  }
  node.hidden=false;node.classList.toggle('featured-card',featured);node.classList.toggle('recommendation-card',!featured);
  const lot=row.selectedLot;
  node.querySelector('.cost').innerHTML=lot
    ? `${link(lot.sourceUrl,number(Math.round(lot.price/lot.area)))} <small>₽/м²</small>`
    : '— <small>₽/м²</small>';
  node.querySelector('.apartment-estimate').innerHTML=lot
    ? `${number(lot.area)} м² · ${link(lot.sourceUrl,rubles(lot.price))}`
    : (area===null?'Цена квартиры не подтверждена':`В выборке нет лота ${number(area*(1-AREA_TOLERANCE))}–${number(area*(1+AREA_TOLERANCE))} м²`);
  node.querySelector('.description').textContent=profile?.description||'';
  node.querySelector('.profile-source').innerHTML=(profile?link(profile.sources[0],'Источник характеристик','source-link'):'')+(lot?`<p>Лот ${escape(lot.sourceLotId)} · ${escape(lot.building||'Корпус не указан')} · ${lot.floor??'—'} этаж. ${escape(lot.finish||'Отделка не указана')}. ${escape(lot.terms)} Проверено: ${date(lot.checkedAt)}. Дата прайса: ${date(lot.sourceDate)}.</p>`:'');
  const score=node.querySelector('.match-score');score.hidden=!$('#search').value.trim()||!Number.isFinite(row.score);
  score.textContent=score.hidden?'':`Соответствие запросу: ${row.score.toLocaleString('ru-RU',{minimumFractionDigits:3,maximumFractionDigits:3})} / 1`;
  if(Number.isFinite(row.score))node.dataset.matchScore=String(row.score);else delete node.dataset.matchScore;
  return node;
}

async function renderResults(focusError = false) {
  clearTimeout(renderTimer);
  const revision = ++renderRevision;
  const input = {city:$('#city').value,budget:$('#budget').value,area:$('#area').value,
    query:$('#search').value,classFilter:$('#class-filter').value,sort:$('#sort').value};
  const parsed = validateInput(input);
  for (const [key,id] of Object.entries(filterFields)) {
    $(`#${id}-error`).textContent = parsed.errors[key] || '';
    $(`#${id}`).setAttribute('aria-invalid',String(Boolean(parsed.errors[key])));
  }
  const invalid = Object.keys(parsed.errors);
  $('#filter-errors').textContent = invalid.length ? 'Проверьте фильтры: ' + Object.values(parsed.errors).join(' ') : '';
  $('#estimate-note').hidden = Boolean(invalid.length);
  pendingResults();
  if (invalid.length) {
    $('#result-status').textContent = 'Проверьте параметры фильтров.';
    $('#ranking-status').textContent = '';
    $('#result-cards').setAttribute('aria-busy','false');
    if (focusError) $(`#${filterFields[invalid[0]]}`).focus();
    return;
  }
  let embedding = null, semanticFailure = false;
  if (parsed.query && ranker && profiles) {
    $('#result-status').textContent = 'Сопоставляем запрос с описаниями…';
    $('#ranking-status').textContent = 'Поиск по смыслу…';
    try {
      embedding = await semanticEncoder.embed(parsed.query,message=>{if(revision===renderRevision)$('#ranking-status').textContent=message;});
    } catch(error) {
      semanticFailure = true;
      console.warn('Семантический поиск недоступен, используем поиск по названию:',error.message);
    }
  }
  if (revision !== renderRevision) return;
  const result = rankRecommendations(records,input,ranker,profiles,embedding,apartmentCatalog);
  $('#selection').dataset.rankingMode = result.mode;
  $('#ranking-status').textContent = semanticFailure || result.mode === 'literal-fallback'
    ? 'Поиск по названию: модель рекомендаций недоступна. Попробуйте изменить запрос или обновить страницу.' : '';
  $('#result-status').textContent = `${result.total} ЖК`;
  $('#results-title').textContent = result.featured.length ? (result.query ? 'Под ваш запрос' : 'Новостройки') : 'Ничего не найдено';
  const container = $('#result-cards'), empty = container.querySelector('.empty');
  if(result.total)empty?.remove();
  for (const [index,row] of result.featured.entries()) {
    const node = renderCard(row,result.area,index,true);
    if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);
  }
  $('#recommendations').hidden = !result.recommendations.length;
  $('#recommendation-count').textContent = `Ещё ${result.recommendations.length} ЖК`;
  for (const [index,row] of result.recommendations.entries()) {
    const node = renderCard(row,result.area,index,false), list = $('#recommendation-cards');
    if(list.children[index]!==node)list.insertBefore(node,list.children[index]||null);
  }
  if (!result.total) {
    const node = empty || document.createElement('div');
    if(!empty) {
      node.className='empty';
      node.innerHTML='<h2>Попробуйте другие параметры</h2><p></p><button class="secondary" type="button">Сбросить фильтры</button>';
      node.querySelector('button').addEventListener('click',resetFilters);
      container.append(node);
    }
    node.hidden=false;
    node.querySelector('p').textContent=result.minimumBudget!==null && result.budget!==null
      ? `В выборке лоты близкой площади стоят от ${rubles(result.minimumBudget)}. Измените бюджет или площадь.`
      : (result.budget!==null?'В выборке нет подтверждённых лотов в этом диапазоне площади. Измените площадь или снимите ограничение бюджета.':'Попробуйте другой город, класс или запрос.');
  }
  $('#result-cards').setAttribute('aria-busy','false');
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries({city:result.city,budget:result.budget,area:result.area,query:result.query,classFilter:result.classFilter,sort:result.sort})) {
    if(value!==null && value!=='')params.set(key,String(value));
  }
  history.replaceState(null,'',`${location.pathname}?${params}${location.hash||'#selection'}`);
}

function queueResults() {
  clearTimeout(renderTimer);
  renderRevision++;
  pendingResults();
  $('#result-status').textContent='Обновляем подбор…';
  renderTimer=setTimeout(()=>renderResults(),180);
}
function resetFilters() {
  const fromEmpty=$('#result-cards .empty')?.contains(document.activeElement);
  $('#match-form').reset();
  renderResults();
  if(fromEmpty)$('#search').focus();
}

function renderCatalog() {
  const city = $('#catalog-city').value;
  const filtered = records.filter(row => city === 'all' || row.city === city);
  $('#catalog-count').textContent = `${filtered.length} ЖК`;
  $('#catalog-body').innerHTML = filtered.map(row => `<tr>
    <td><span class="city-label">${escape(row.city)}</span><strong>${escape(row.name)}</strong><details><summary>Проверка и примечания</summary><p>${escape(row.notes)}</p><p>Проверено: ${date(row.checkedAt)}. ${row.verification === 'search-index' ? 'Использован поисковый снимок страницы.' : 'Страница открыта при исследовании.'}</p>${row.classSourceUrl ? link(row.classSourceUrl,'Источник класса ↗') : ''}${row.developerSourceUrl ? link(row.developerSourceUrl,'Источник застройщика ↗') : ''}</details></td>
    <td>${escape(row.developer)}</td><td>${escape(row.district)}</td><td><span class="badge">${escape(row.class)}</span></td>
    <td>${link(row.sourceUrl,number(row.priceFrom)+' ↗')}<small>${escape(row.sourceName)}</small></td>
    <td>${escape(row.constructionStatus)}</td><td>${link(row.deliverySourceUrl || row.sourceUrl,escape(row.delivery)+' ↗')}<small>${row.deliveryKind==='fact'?'Факт':'План'}. ${row.deliveryVerification==='search-index'?'Проверено по индексу. ':''}${escape(row.deliveryScope)}</small></td>
    <td>${date(row.sourceDate)}<small>${escape(row.dateMeaning)}</small></td></tr>`).join('');
}

function renderResearch() {
  const stats = cityStats(records);
  $('#stats').innerHTML = stats.map(row => `<article class="stat"><h2>${escape(row.city)}</h2><p class="stat-label">Минимальная цена за м²</p><p class="value">${number(row.min)} <span>₽/м²</span></p><p>${link(row.cheapest.sourceUrl,escape(row.cheapest.name)+' ↗')}</p><small>Минимум среди ${row.count} ЖК выборки</small></article>`).join('');
  const colors = {'Москва':'moscow','Сочи':'sochi','Санкт-Петербург':'spb'};
  const max = Math.ceil(Math.max(...records.map(row=>row.priceFrom))/100000)*100000;
  $('#chart').innerHTML = CITIES.map(city=>`<div class="chart-group">${records.filter(row=>row.city===city).sort((a,b)=>a.priceFrom-b.priceFrom).map(row=>`<div class="chart-row"><span class="chart-label">${escape(row.name)}</span><div class="bar-track" aria-hidden="true"><div class="bar ${colors[city]}" style="width:${row.priceFrom/max*100}%"></div></div><span class="chart-value">${number(row.priceFrom)}</span></div>`).join('')}</div>`).join('')+`<div class="chart-axis" aria-hidden="true"><span>0</span><span>${number(max/2)}</span><span>${number(max)}</span></div>`;
  const moscow = stats.find(row=>row.city==='Москва');
  const sochi = stats.find(row=>row.city==='Сочи');
  const spb = stats.find(row=>row.city==='Санкт-Петербург');
  $('#findings-list').innerHTML = [
    `<strong>Самая высокая минимальная цена — в Москве:</strong> ${number(moscow.min)} ₽/м² против ${number(sochi.min)} в Сочи — разница ${number(Math.round((moscow.min/sochi.min-1)*100))}%. Сравниваются минимумы выбранных ЖК в каждом городе.`,
    `<strong>Самый низкий порог — у «Южного Парка»:</strong> ${number(sochi.min)} ₽/м². Самый высокий — у PRIME PARK: ${number(moscow.max)} ₽/м². Разница в ${number(Math.round(moscow.max/sochi.min*100)/100)} раза.`,
    `<strong>Петербург находится между двумя городами:</strong> минимальная цена ${number(spb.min)} ₽/м² у Neva Residence. Это минимальная ставка одного лота, а не ставка для любой площади. Фактические цены квартир собраны в отдельной таблице по размерам.`,
    `<strong>Неожиданный результат — премиум дешевле бизнеса по стартовому метру:</strong> Neva Residence — 348 400 ₽/м², James Beck — 405 000. Минимумы относятся к разным лотам; одного класса недостаточно для сопоставления квартир.`
  ].map(text=>`<li><div>${text}</div></li>`).join('');
}

function renderAreaPrices() {
  const projectId=$('#area-project').value;
  const rows=summarizeAreaPrices(records,apartmentCatalog).filter(row=>projectId==='all'||row.projectId===projectId);
  $('#area-price-body').innerHTML=rows.map(row=>{
    const coverage=apartmentCatalog.projects.find(p=>p.projectId===row.projectId);
    const details=row.count?`${row.buildings.length} корп. · этажи ${row.floors.length?`${row.floors[0]}–${row.floors.at(-1)}`:'не указаны'}. ${row.finishes.join('; ')||'Отделка не указана'}`:'В проверенной выборке нет лотов этого размера';
    return `<tr><td><span class="city-label">${escape(row.city)}</span><strong>${escape(row.name)}</strong><small>${escape(coverage.coverage)}</small></td><td>${escape(row.bandLabel)}</td><td>${row.count}</td><td>${row.count?`${number(Math.round(row.minUnit))}–${number(Math.round(row.maxUnit))}`:'Нет данных'}</td><td>${row.count?`${rubles(row.minPrice)}–${rubles(row.maxPrice)}`:'Нет данных'}</td><td>${escape(details)}</td><td>${link(row.sourceUrl,'Источник ↗')}<small>Проверено ${date(coverage.checkedAt)}. Прайс ${date(coverage.sourceDate)}.</small></td></tr>`;
  }).join('');
}

window.addEventListener('hashchange',route);
$('#match-form').addEventListener('submit',event=>{event.preventDefault();renderResults(true);});
$('#match-form').addEventListener('input',queueResults);
$('#search').addEventListener('search',queueResults);
$('#reset-filters').addEventListener('click',resetFilters);
$('#catalog-city').addEventListener('change',renderCatalog);
$('#area-project').addEventListener('change',renderAreaPrices);

try {
  const response = await fetch('./data/complexes.json');
  if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.records?.length !== 15) throw new Error('Invalid dataset');
  records = payload.records;
  const lotResponse=await fetch('./data/apartment-lots.json?v=11');
  if(!lotResponse.ok)throw new Error('Apartment prices unavailable');
  apartmentCatalog=await lotResponse.json();
  if(!Array.isArray(apartmentCatalog.lots)||apartmentCatalog.projects?.length!==15)throw new Error('Invalid apartment catalogue');
  $('#area-project').innerHTML='<option value="all">Все ЖК</option>'+records.map(r=>`<option value="${r.id}">${escape(r.city)} · ${escape(r.name)}</option>`).join('');
  try {
    const loadJson=async path=>{const response=await fetch(path);if(!response.ok)throw new Error(path);return response.json();};
    const [model,corpus]=await Promise.all([loadJson('./ml-assets/ranker.json?v=11'),loadJson('./ml-assets/profiles.json?v=11')]);
    ranker=model;profiles=new Map(corpus.profiles.map(profile=>[profile.id,profile]));
  } catch(error) { console.warn('ML artifacts unavailable:',error.message); }
  const query = new URLSearchParams(location.search);
  for (const [key,id] of Object.entries({...filterFields,query:'search'})) if(query.has(key)) $(`#${id}`).value=query.get(key);
  renderCatalog();renderAreaPrices();renderResearch();route();await renderResults(false);
  if(!$('#search').value && ranker) setTimeout(()=>semanticEncoder.ready().catch(()=>{}),500);
} catch (error) {
  console.error('Не удалось инициализировать подборщик:',error);
  $('#load-error').hidden=false;
} finally { $('#loading').hidden=true; }
