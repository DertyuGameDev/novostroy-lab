import { matchComplexes, cityStats, CITIES } from './matcher.mjs?v=4';

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
function renderResults(focusError = false) {
  const result = matchComplexes(records, {
    city:$('#city').value, budget:$('#budget').value, area:$('#area').value,
    query:$('#search').value, classFilter:$('#class-filter').value, sort:$('#sort').value,
  });
  for (const [key,id] of Object.entries(filterFields)) {
    $(`#${id}-error`).textContent = result.errors[key] || '';
    $(`#${id}`).setAttribute('aria-invalid', String(Boolean(result.errors[key])));
  }
  const invalid = Object.keys(result.errors);
  $('#filter-errors').textContent = invalid.length ? 'Проверьте фильтры: ' + Object.values(result.errors).join(' ') : '';
  $('#estimate-note').hidden = Boolean(invalid.length);
  const container = $('#result-cards');
  const emptyNode = container.querySelector('.empty');
  for (const node of cardNodes.values()) node.hidden = true;
  if (invalid.length) {
    emptyNode?.remove();
    $('#result-status').textContent = 'Проверьте параметры фильтров.';
    if (focusError) $(`#${filterFields[invalid[0]]}`).focus();
    return;
  }
  $('#result-status').textContent = `Найдено ${result.total} из ${records.length} ЖК`;
  $('#results-title').textContent = result.total === records.length ? 'Все жилые комплексы' : 'Результаты поиска';
  if (result.total) emptyNode?.remove();
  for (const [index,row] of result.matches.entries()) {
    let node = cardNodes.get(row.id);
    if (!node) {
      node = document.createElement('article');
      node.className = 'complex-card';
      node.dataset.id = row.id;
      node.innerHTML = `
        <div class="card-top"><span class="badge">${escape(row.class)}</span><span class="city-label">${escape(row.city)}</span></div>
        <h3>${escape(row.name)}</h3><p class="district">${escape(row.district)} · ${escape(row.developer)}</p>
        <p class="cost"><span class="price-prefix">от</span> ${number(row.priceFrom)} <span class="price-unit">₽/м²</span></p>
        <div class="apartment-estimate"><span></span><strong></strong></div><p class="calculation"></p>
        <p class="delivery">Сдача: ${link(row.deliverySourceUrl || row.sourceUrl,escape(row.delivery))}</p>
        <div class="card-footer"><span>Источник: ${date(row.sourceDate)}${row.sourceDate ? '' : ' (дата прайса)'}</span>${link(row.sourceUrl,'Цена в источнике ↗','text-link')}</div>`;
      cardNodes.set(row.id,node);
    }
    node.hidden = false;
    node.querySelector('.apartment-estimate span').textContent = result.area === null ? 'Расчёт стоимости' : `Квартира ${number(result.area)} м²`;
    node.querySelector('.apartment-estimate strong').textContent = row.estimatedPrice === null ? 'Укажите площадь' : `≈ ${rubles(row.estimatedPrice)}`;
    node.querySelector('.calculation').textContent = result.area === null ? '' : `${rubles(row.priceFrom)} / м² × ${number(result.area)} м²`;
    if (container.children[index] !== node) container.insertBefore(node,container.children[index] || null);
  }
  if (!result.total) {
    const empty = emptyNode || document.createElement('div');
    if (!emptyNode) {
      empty.className = 'empty';
      empty.innerHTML = '<h3>По этим параметрам ничего не найдено</h3><p></p><button class="secondary" type="button">Сбросить фильтры</button>';
      empty.querySelector('button').addEventListener('click',resetFilters);
      container.append(empty);
    }
    empty.querySelector('p').textContent = result.minimumBudget !== null && result.budget !== null ? `Для выбранных ЖК и площади расчёт начинается от ${rubles(result.minimumBudget)}. Увеличьте бюджет или измените фильтры.` : 'Попробуйте другое название, город или класс жилья.';
  }
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries({city:result.city,budget:result.budget,area:result.area,query:result.query,classFilter:result.classFilter,sort:result.sort})) {
    if (value !== null && value !== '') params.set(key,String(value));
  }
  history.replaceState(null,'',`${location.pathname}?${params}${location.hash || '#selection'}`);
}

function resetFilters() {
  const fromEmpty = $('#result-cards .empty')?.contains(document.activeElement);
  $('#match-form').reset();
  renderResults();
  if (fromEmpty) $('#search').focus();
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
$('#match-form').addEventListener('input',()=>renderResults());
$('#search').addEventListener('search',()=>renderResults());
$('#reset-filters').addEventListener('click',resetFilters);
$('#catalog-city').addEventListener('change',renderCatalog);

try {
  const response = await fetch('./data/complexes.json');
  if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.records?.length !== 15) throw new Error('Invalid dataset');
  records = payload.records;
  const query = new URLSearchParams(location.search);
  for (const [key,id] of Object.entries({...filterFields,query:'search'})) if(query.has(key)) $(`#${id}`).value=query.get(key);
  renderCatalog();renderResearch();route();renderResults(false);
} catch (error) {
  console.error('Не удалось инициализировать подборщик:',error);
  $('#load-error').hidden=false;
} finally { $('#loading').hidden=true; }
