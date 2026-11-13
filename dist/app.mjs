import { matchComplexes, cityStats, CITIES } from './matcher.mjs?v=2';

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
  document.title = `${{selection:'Подбор новостроек',catalog:'15 ЖК с источниками',research:'Исследование цен',process:'Работа с ИИ'}[selected]} — Метр`;
}

function renderResults(announce = true) {
  const input = {city:$('#city').value,budget:$('#budget').value,area:$('#area').value};
  const result = matchComplexes(records, input);
  for (const key of ['city','budget','area']) {
    $(`#${key}-error`).textContent = result.errors[key] || '';
    $(`#${key}`).setAttribute('aria-invalid', String(Boolean(result.errors[key])));
  }
  if (Object.keys(result.errors).length) {
    // Remove stale results so invalid new input cannot appear to have succeeded.
    $('#result-cards').replaceChildren();
    $('#result-status').textContent = 'Проверьте параметры подбора.';
    $('#estimate-note').hidden = true;
    $(`#${Object.keys(result.errors)[0]}`).focus();
    return;
  }
  $('#estimate-note').hidden = false;
  $('#result-status').textContent = `${result.city} · ${number(result.area)} м² · показано ${result.matches.length} из ${result.total} подходящих ЖК`;
  if (!result.matches.length) {
    $('#result-cards').innerHTML = `<div class="empty"><h3>В этой выборке вариантов нет</h3><p>При площади ${number(result.area)} м² расчёт начинается от ${rubles(result.minimumBudget)}. Можно увеличить бюджет или уменьшить площадь.</p><button class="secondary" id="use-minimum" type="button">Поставить минимальный бюджет</button></div>`;
    $('#use-minimum').addEventListener('click', () => {
      $('#budget').value = number(Math.ceil(result.minimumBudget));
      renderResults();
    });
  } else {
    $('#result-cards').innerHTML = result.matches.map((row,index) => `<article class="complex-card">
      <div class="card-top"><span class="badge">${escape(row.class)}</span><span class="rank">0${index+1}</span></div>
      <h3>${escape(row.name)}</h3><p class="district">${escape(row.district)} · ${escape(row.developer)}</p>
      <p class="cost"><span class="price-prefix">от</span> ${number(row.priceFrom)} <span class="price-unit">₽/м²</span></p>
      <div class="apartment-estimate"><span>Квартира ${number(result.area)} м²</span><strong>≈ ${rubles(row.estimatedPrice)}</strong></div>
      <p class="calculation">${rubles(row.priceFrom)} / м² × ${number(result.area)} м²</p>
      <p class="delivery">Сдача: ${link(row.deliverySourceUrl || row.sourceUrl,escape(row.delivery))}</p>
      <div class="card-footer"><span>Источник: ${date(row.sourceDate)}${row.sourceDate ? '' : ' (дата прайса)'}</span>${link(row.sourceUrl,'Цена в источнике ↗','text-link')}</div>
    </article>`).join('');
  }
  const query = new URLSearchParams({city:result.city,budget:String(result.budget),area:String(result.area)});
  history.replaceState(null,'',`${location.pathname}?${query}${location.hash || '#selection'}`);
  if (announce && matchMedia('(max-width: 800px)').matches) $('#results').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
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
$('#match-form').addEventListener('submit',event=>{event.preventDefault();renderResults();});
// Clear previous results while editing, so they never look matched to changed parameters.
$('#match-form').addEventListener('input',()=>{ $('#result-status').textContent='Параметры изменены. Нажмите «Подобрать комплексы».';$('#result-cards').replaceChildren();$('#estimate-note').hidden=true; });
$('#catalog-city').addEventListener('change',renderCatalog);

try {
  const response = await fetch('./data/complexes.json');
  if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.records?.length !== 15) throw new Error('Invalid dataset');
  records = payload.records;
  const query = new URLSearchParams(location.search);
  for (const key of ['city','budget','area']) if(query.has(key)) $(`#${key}`).value=query.get(key);
  renderCatalog();renderResearch();route();renderResults(false);
} catch (error) {
  console.error('Не удалось инициализировать подборщик:',error);
  $('#load-error').hidden=false;
} finally { $('#loading').hidden=true; }
