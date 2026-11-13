import { validateInput, cityStats, CITIES } from './matcher.mjs?v=5';
import { rankRecommendations } from './recommender.mjs?v=5';
import { semanticEncoder } from './semantic-encoder.mjs?v=5';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
const rubles = value => `${number(value)} ₽`;
const date = value => value ? value.split('-').reverse().join('.') : 'Не указана';
const link = (url, text, className = '') => `<a class="${className}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
let records = [];

function route() {
  const id = location.hash.slice(1) || 'selection';
  const selected = ['selection','catalog','research','process'].includes(id) ? id : 'selection';
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== selected || !records.length;
  for (const item of document.querySelectorAll('[data-nav]')) {
    if (item.dataset.nav === selected) item.setAttribute('aria-current','page');
    else item.removeAttribute('aria-current');
  }
  document.title = `${{selection:'Каталог новостроек',catalog:'15 ЖК с источниками',research:'Исследование цен',process:'Работа с ИИ'}[selected]} — Метр`;
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
  let node = cardNodes.get(row.id);
  const profile = row.profile || profiles?.get(row.id);
  if (!node) {
    node = document.createElement('article');
    node.className = 'complex-card';
    node.dataset.id = row.id;
    node.innerHTML = `
      <div class="card-top"><span class="badge">${escape(row.class)}</span><span class="city-label">${escape(row.city)}</span><span class="rank"></span></div>
      <h3>${escape(row.name)}</h3><p class="district">${escape(row.district)} · ${escape(row.developer)}</p>
      <p class="profile-summary"></p><ul class="reason-list" aria-label="Особенности варианта"></ul>
      <p class="cost"><span class="price-prefix">от</span> ${number(row.priceFrom)} <span class="price-unit">₽/м²</span></p>
      <div class="apartment-estimate"><span></span><strong></strong></div><p class="calculation"></p>
      <p class="delivery">Сдача: ${link(row.deliverySourceUrl || row.sourceUrl,escape(row.delivery))}</p>
      <details class="profile-details"><summary>Подробнее о комплексе</summary><p></p><span></span></details>
      <div class="card-footer"><span>Источник: ${date(row.sourceDate)}${row.sourceDate ? '' : ' (дата прайса)'}</span>${link(row.sourceUrl,'Цена в источнике ↗','text-link')}</div>`;
    cardNodes.set(row.id,node);
  }
  node.hidden = false;
  node.classList.toggle('featured-card',featured);
  node.classList.toggle('recommendation-card',!featured);
  node.querySelector('.rank').textContent = featured ? `0${rank+1}` : '';
  node.querySelector('.profile-summary').textContent = profile?.description || '';
  node.querySelector('.reason-list').innerHTML = (row.reasons || []).map(reason=>`<li>${escape(reason)}</li>`).join('');
  node.querySelector('.apartment-estimate span').textContent = area === null ? 'Расчёт стоимости' : `Квартира ${number(area)} м²`;
  node.querySelector('.apartment-estimate strong').textContent = row.estimatedPrice === null ? 'Укажите площадь' : `≈ ${rubles(row.estimatedPrice)}`;
  node.querySelector('.calculation').textContent = area === null ? '' : `${rubles(row.priceFrom)} / м² × ${number(area)} м²`;
  node.querySelector('.profile-details').hidden = !profile;
  node.querySelector('.profile-details p').textContent = profile?.description || '';
  node.querySelector('.profile-details span').innerHTML = profile ? link(profile.sources[0],'Источник характеристик ↗') : '';
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
  const result = rankRecommendations(records,input,ranker,profiles,embedding);
  $('#selection').dataset.rankingMode = result.mode;
  $('#ranking-status').textContent = semanticFailure || result.mode === 'literal-fallback'
    ? 'Поиск по названию: модель рекомендаций недоступна. Попробуйте изменить запрос или обновить страницу.' : '';
  $('#result-status').textContent = `Показано ${result.featured.length} лучших · всего ${result.total} ЖК`;
  $('#results-title').textContent = result.featured.length ? 'Под ваш запрос' : 'Совпадений не найдено';
  const container = $('#result-cards'), empty = container.querySelector('.empty');
  if(result.total)empty?.remove();
  for (const [index,row] of result.featured.entries()) {
    const node = renderCard(row,result.area,index,true);
    if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);
  }
  $('#recommendations').hidden = !result.recommendations.length;
  $('#recommendation-count').textContent = `Ещё ${result.recommendations.length} ЖК по вашим фильтрам`;
  for (const [index,row] of result.recommendations.entries()) {
    const node = renderCard(row,result.area,index,false), list = $('#recommendation-cards');
    if(list.children[index]!==node)list.insertBefore(node,list.children[index]||null);
  }
  if (!result.total) {
    const node = empty || document.createElement('div');
    if(!empty) {
      node.className='empty';
      node.innerHTML='<h3>По этим параметрам ничего не найдено</h3><p></p><button class="secondary" type="button">Сбросить фильтры</button>';
      node.querySelector('button').addEventListener('click',resetFilters);
      container.append(node);
    }
    node.hidden=false;
    node.querySelector('p').textContent=result.minimumBudget!==null && result.budget!==null
      ? `При выбранной площади расчёт начинается от ${rubles(result.minimumBudget)}. Измените бюджет или фильтры.`
      : 'Попробуйте другой город, класс или запрос.';
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
  $('#catalog-count').textContent = `Показано ${filtered.length} из 15 ЖК`;
  $('#catalog-body').innerHTML = filtered.map(row => `<tr>
    <td><span class="city-label">${escape(row.city)}</span><strong>${escape(row.name)}</strong><details><summary>Проверка и примечания</summary><p>${escape(row.notes)}</p><p>Проверено: ${date(row.checkedAt)}. ${row.verification === 'search-index' ? 'Использован поисковый снимок страницы.' : 'Страница открыта при исследовании.'}</p>${row.classSourceUrl ? link(row.classSourceUrl,'Источник класса ↗') : ''}${row.developerSourceUrl ? link(row.developerSourceUrl,'Источник застройщика ↗') : ''}</details></td>
    <td>${escape(row.developer)}</td><td>${escape(row.district)}</td><td><span class="badge">${escape(row.class)}</span></td>
    <td>${link(row.sourceUrl,number(row.priceFrom)+' ↗')}<small>${escape(row.sourceName)}</small></td>
    <td>${link(row.deliverySourceUrl || row.sourceUrl,escape(row.delivery)+' ↗')}</td>
    <td>${date(row.sourceDate)}<small>${escape(row.dateMeaning)}</small></td></tr>`).join('');
}

function renderResearch() {
  const stats = cityStats(records);
  $('#hero-prices').innerHTML = stats.map(row => link(row.cheapest.sourceUrl,`<span>${escape(row.city)}</span><strong>${number(row.min)} <small>↗</small></strong>`,'entry-price')).join('');
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
    `<strong>Петербург находится между двумя городами:</strong> минимальная цена ${number(spb.min)} ₽/м² у Neva Residence. При условных 50 м² ориентир — ${number(spb.min*50/1e6)} млн ₽; наличие квартиры по этой ставке не подтверждено.`,
    `<strong>Неожиданный результат — премиум дешевле бизнеса по стартовому метру:</strong> Neva Residence — 348 400 ₽/м², James Beck — 405 000. Минимумы относятся к разным лотам; одного класса недостаточно для сопоставления квартир.`
  ].map(text=>`<li><div>${text}</div></li>`).join('');
}

window.addEventListener('hashchange',route);
$('#match-form').addEventListener('submit',event=>{event.preventDefault();renderResults(true);});
$('#match-form').addEventListener('input',queueResults);
$('#search').addEventListener('search',queueResults);
$('#reset-filters').addEventListener('click',resetFilters);
$('#catalog-city').addEventListener('change',renderCatalog);

try {
  const response = await fetch('./data/complexes.json');
  if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.records?.length !== 15) throw new Error('Invalid dataset');
  records = payload.records;
  try {
    const loadJson=async path=>{const response=await fetch(path);if(!response.ok)throw new Error(path);return response.json();};
    const [model,corpus]=await Promise.all([loadJson('./ml-assets/ranker.json'),loadJson('./ml-assets/profiles.json')]);
    ranker=model;profiles=new Map(corpus.profiles.map(profile=>[profile.id,profile]));
  } catch(error) { console.warn('ML artifacts unavailable:',error.message); }
  const query = new URLSearchParams(location.search);
  for (const [key,id] of Object.entries({...filterFields,query:'search'})) if(query.has(key)) $(`#${id}`).value=query.get(key);
  renderCatalog();renderResearch();route();await renderResults(false);
  if(!$('#search').value && ranker) setTimeout(()=>semanticEncoder.ready().catch(()=>{}),500);
} catch (error) {
  console.error('Не удалось инициализировать подборщик:',error);
  $('#load-error').hidden=false;
} finally { $('#loading').hidden=true; }
