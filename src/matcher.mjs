export const CITIES = ['Москва', 'Сочи', 'Санкт-Петербург'];

export function parseNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const text = value.trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
}

export function validateInput({ city, budget, area }) {
  const errors = {};
  const rubles = parseNumber(budget);
  const squareMeters = parseNumber(area);
  if (!CITIES.includes(city)) errors.city = 'Выберите город из списка.';
  if (!Number.isFinite(rubles) || rubles <= 0 || rubles > 1e12) {
    errors.budget = 'Введите бюджет больше нуля, до 1 трлн ₽.';
  }
  if (!Number.isFinite(squareMeters) || squareMeters < 1 || squareMeters > 1000) {
    errors.area = 'Введите площадь от 1 до 1 000 м².';
  }
  return { errors, city, budget: rubles, area: squareMeters };
}

/** The dataset has project-level starting prices, not apartment inventory. */
export function matchComplexes(records, input) {
  const parsed = validateInput(input);
  if (Object.keys(parsed.errors).length) return { ...parsed, matches: [], total: 0, minimumBudget: null };
  const candidates = records.filter(row => row.city === parsed.city).map(row => ({
    ...row,
    // Compare unrounded values: rounding must never admit an over-budget option.
    estimatedPrice: row.priceFrom * parsed.area,
  })).sort((a, b) => a.estimatedPrice - b.estimatedPrice || a.name.localeCompare(b.name, 'ru'));
  const matches = candidates.filter(row => row.estimatedPrice <= parsed.budget);
  return { ...parsed, matches: matches.slice(0, 3), total: matches.length, minimumBudget: candidates[0]?.estimatedPrice ?? null };
}

export function median(numbers) {
  const values = [...numbers].sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function cityStats(records) {
  return CITIES.map(city => {
    const rows = records.filter(row => row.city === city);
    const prices = rows.map(row => row.priceFrom);
    return { city, count: rows.length, median: median(prices), min: Math.min(...prices), max: Math.max(...prices) };
  });
}
