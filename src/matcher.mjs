import {nearbyLots,selectApartment} from './apartment-prices.mjs?v=14';
export const CITIES = ['Москва', 'Сочи', 'Санкт-Петербург'];
export const DELIVERY_FILTERS = ['all','completed','2026','2027','2028','2029','2030'];

// A deadline is inclusive. Partial commissioning does not mean the whole project is ready.
export function deliverySimilarity(row,filter='all') {
  if(filter==='all'||row.constructionStatus==='Сдан')return 1;
  if(filter==='completed')return row.constructionStatus==='Частично сдан'?.5:0;
  if(!Number.isInteger(row.deliveryYear))return 0;
  return 1/(1+Math.max(0,row.deliveryYear-Number(filter)));
}

export function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const text = value.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}

export function validateInput({ city = 'all', budget = '', priceFrom = '', priceTo = budget, area = 50, query = '', classFilter = 'all', deliveryFilter = 'all', sort = 'price-asc' } = {}) {
  const errors = {};
  const empty = value => value == null || typeof value === 'string' && value.trim() === '';
  const lower = empty(priceFrom) ? null : parseNumber(priceFrom);
  const rublesFrom = lower===0?null:lower;
  const rubles = empty(priceTo) ? null : parseNumber(priceTo);
  const squareMeters = empty(area) ? null : parseNumber(area);
  if (city !== 'all' && !CITIES.includes(city)) errors.city = 'Выберите город из списка.';
  if (rublesFrom !== null && (!Number.isFinite(rublesFrom) || rublesFrom < 0 || rublesFrom > 1e12)) errors.priceFrom = 'Введите цену «от» от 0 до 1 трлн ₽.';
  if (rubles !== null && (!Number.isFinite(rubles) || rubles <= 0 || rubles > 1e12)) errors.priceTo = 'Введите цену «до» больше нуля, до 1 трлн ₽.';
  if (Number.isFinite(rublesFrom)&&Number.isFinite(rubles)&&rublesFrom>rubles) errors.priceTo = 'Цена «до» должна быть не меньше цены «от».';
  if (squareMeters !== null && (!Number.isFinite(squareMeters) || squareMeters < 1 || squareMeters > 1000)) {
    errors.area = 'Введите площадь от 1 до 1 000 м².';
  }
  if ((rubles !== null||rublesFrom!==null) && squareMeters === null) errors.area = 'Укажите желаемую площадь.';
  if (!['all','Бизнес','Премиум'].includes(classFilter)) errors.classFilter = 'Выберите класс из списка.';
  if (!DELIVERY_FILTERS.includes(deliveryFilter)) errors.deliveryFilter = 'Выберите срок сдачи из списка.';
  if (!['recommended','price-asc','price-desc','name'].includes(sort)) errors.sort = 'Выберите сортировку из списка.';
  return { errors, city, budget: rubles, priceFrom:rublesFrom, priceTo:rubles, area: squareMeters, query: String(query).trim(), classFilter, deliveryFilter, sort };
}

export function normalizeSearch(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

export function compareApartmentUnitPrice(a,b,direction=1) {
  if(!a.selectedLot||!b.selectedLot)return Number(!a.selectedLot)-Number(!b.selectedLot)||a.name.localeCompare(b.name,'ru');
  return direction*(a.selectedLot.price/a.selectedLot.area-b.selectedLot.price/b.selectedLot.area)||a.name.localeCompare(b.name,'ru');
}

/** Quote a published apartment, with an explicit ±10% area tolerance. */
export function matchComplexes(records, input = {}, catalog = {lots:[]}) {
  const parsed = validateInput(input);
  if (Object.keys(parsed.errors).length) return { ...parsed, matches: [], total: 0, minimumBudget: null };
  const words = normalizeSearch(parsed.query).split(/\s+/).filter(Boolean);
  const candidates = records.filter(row => (parsed.city === 'all' || row.city === parsed.city)
    && (parsed.classFilter === 'all' || row.class === parsed.classFilter)
    && deliverySimilarity(row,parsed.deliveryFilter)===1
    && words.every(word => normalizeSearch(`${row.name} ${row.developer} ${row.district} ${row.city}`).includes(word))).map(row => {
    const nearby=nearbyLots(catalog.lots,row.id,parsed.area);
    const selectedLot=selectApartment(catalog.lots,row.id,parsed.area,parsed.priceTo,parsed.priceFrom);
    return {...row,selectedLot,estimatedPrice:selectedLot?.price??null,
      matchingLotCount:nearby.filter(lot=>(parsed.priceTo===null||lot.price<=parsed.priceTo)&&(parsed.priceFrom===null||lot.price>=parsed.priceFrom)).length,
      minimumApartmentPrice:nearby.length?Math.min(...nearby.map(lot=>lot.price)):null};
  });
  const known=candidates.map(row=>row.minimumApartmentPrice).filter(Number.isFinite);
  const minimumBudget=known.length?Math.min(...known):null;
  const matches = candidates.filter(row => parsed.priceTo === null&&parsed.priceFrom===null || row.selectedLot!==null).sort((a,b) => {
    const byName = a.name.localeCompare(b.name,'ru');
    if (parsed.sort === 'name') return byName;
    return compareApartmentUnitPrice(a,b,parsed.sort==='price-desc'?-1:1)||byName;
  });
  return { ...parsed, matches, total: matches.length, minimumBudget,missingAreaData:candidates.filter(row=>row.minimumApartmentPrice===null).length };
}

export function cityStats(records) {
  return CITIES.map(city => {
    const rows = records.filter(row => row.city === city);
    const prices = rows.map(row => row.priceFrom);
    const cheapest = rows.reduce((best, row) => !best || row.priceFrom < best.priceFrom ? row : best, null);
    return { city, count: rows.length, min: cheapest?.priceFrom ?? null, max: prices.length ? Math.max(...prices) : null, cheapest };
  });
}
