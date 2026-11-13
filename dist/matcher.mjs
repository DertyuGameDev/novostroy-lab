export const CITIES = ['Москва', 'Сочи', 'Санкт-Петербург'];

export function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const text = value.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}

export function validateInput({ city = 'all', budget = '', area = 50, query = '', classFilter = 'all', sort = 'price-asc' } = {}) {
  const errors = {};
  const empty = value => value == null || typeof value === 'string' && value.trim() === '';
  const rubles = empty(budget) ? null : parseNumber(budget);
  const squareMeters = empty(area) ? null : parseNumber(area);
  if (city !== 'all' && !CITIES.includes(city)) errors.city = 'Выберите город из списка.';
  if (rubles !== null && (!Number.isFinite(rubles) || rubles <= 0 || rubles > 1e12)) {
    errors.budget = 'Введите бюджет больше нуля, до 1 трлн ₽.';
  }
  if (squareMeters !== null && (!Number.isFinite(squareMeters) || squareMeters < 1 || squareMeters > 1000)) {
    errors.area = 'Введите площадь от 1 до 1 000 м².';
  }
  if (rubles !== null && squareMeters === null) errors.area = 'Укажите площадь для расчёта бюджета.';
  if (!['all','Бизнес','Премиум'].includes(classFilter)) errors.classFilter = 'Выберите класс из списка.';
  if (!['recommended','price-asc','price-desc','name'].includes(sort)) errors.sort = 'Выберите сортировку из списка.';
  return { errors, city, budget: rubles, area: squareMeters, query: String(query).trim(), classFilter, sort };
}

export function normalizeSearch(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

/** The dataset has project-level starting prices, not apartment inventory. */
export function matchComplexes(records, input = {}) {
  const parsed = validateInput(input);
  if (Object.keys(parsed.errors).length) return { ...parsed, matches: [], total: 0, minimumBudget: null };
  const words = normalizeSearch(parsed.query).split(/\s+/).filter(Boolean);
  const candidates = records.filter(row => (parsed.city === 'all' || row.city === parsed.city)
    && (parsed.classFilter === 'all' || row.class === parsed.classFilter)
    && words.every(word => normalizeSearch(`${row.name} ${row.developer} ${row.district} ${row.city}`).includes(word))).map(row => ({
    ...row,
    // Compare unrounded values: rounding must never admit an over-budget option.
    estimatedPrice: parsed.area === null ? null : row.priceFrom * parsed.area,
  }));
  const minimumBudget = candidates.length && parsed.area !== null ? Math.min(...candidates.map(row => row.estimatedPrice)) : null;
  const matches = candidates.filter(row => parsed.budget === null || row.estimatedPrice <= parsed.budget).sort((a,b) => {
    const byName = a.name.localeCompare(b.name,'ru');
    if (parsed.sort === 'name') return byName;
    return (parsed.sort === 'price-desc' ? b.priceFrom-a.priceFrom : a.priceFrom-b.priceFrom) || byName;
  });
  return { ...parsed, matches, total: matches.length, minimumBudget };
}

export function cityStats(records) {
  return CITIES.map(city => {
    const rows = records.filter(row => row.city === city);
    const prices = rows.map(row => row.priceFrom);
    const cheapest = rows.reduce((best, row) => !best || row.priceFrom < best.priceFrom ? row : best, null);
    return { city, count: rows.length, min: cheapest?.priceFrom ?? null, max: prices.length ? Math.max(...prices) : null, cheapest };
  });
}
