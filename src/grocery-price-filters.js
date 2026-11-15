'use strict';
/* Compare paid totals / bought quantities, never an average of monthly prices.
   Weight, volume and pieces stay separate even when all cards are visible. */
const UNIT_ORDER = { g: 0, ml: 1, pcs: 2 };
const UNIT_LABEL = { g: 'кг', ml: 'л', pcs: 'шт.' };

function priceWindow(endMonth, months = 1) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) throw new Error('Invalid price window');
  const count = [1, 3, 6, 12].includes(Number(months)) ? Number(months) : 1;
  const [year, month] = endMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - count, 1));
  const start = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return { start, end: endMonth, months: count };
}

function priceSummary(series, window) {
  let cost = 0, amount = 0, purchases = 0;
  for (const row of series.months) {
    if (row.month < window.start || row.month > window.end || row.perUnit === null) continue;
    if (!Number.isFinite(row.amount) || row.amount <= 0 || !Number.isFinite(row.cost) || row.cost < 0) continue;
    cost += row.cost; amount += row.amount; purchases += row.purchases || 0;
  }
  if (!amount || !Number.isFinite(cost) || !Number.isFinite(amount)) return null;
  const scale = series.unit === 'pcs' ? 1 : 1000;
  const price = cost / 100 / amount * scale;
  return Number.isFinite(price) ? { price, cost, amount, purchases } : null;
}

function priceCards(groups, endMonth, { months = 1, measure = 'all', sort = 'asc' } = {}) {
  const window = priceWindow(endMonth, months);
  const cards = [];
  for (const group of groups) {
    const series = group.series.filter(p => measure === 'all' || p.unit === measure);
    if (measure !== 'all' && !series.length) continue;
    const summaries = [...series].sort((a,b) => UNIT_ORDER[a.unit] - UNIT_ORDER[b.unit]).map(p => ({
      key: p.key, unit: p.unit, label: UNIT_LABEL[p.unit], summary: priceSummary(p, window),
    }));
    const primary = summaries.find(p => p.summary !== null) || null;
    cards.push({ ...group, series, summaries, primary });
  }
  if (sort === 'name') cards.sort((a,b) => a.name.localeCompare(b.name, 'ru'));
  else if (sort === 'asc' || sort === 'desc') cards.sort((a,b) => {
    if (!!a.primary !== !!b.primary) return a.primary ? -1 : 1;
    if (!a.primary) return 0;
    const unit = UNIT_ORDER[a.primary.unit] - UNIT_ORDER[b.primary.unit];
    if (unit) return unit;
    const difference = a.primary.summary.price - b.primary.summary.price;
    return (sort === 'desc' ? -difference : difference) || a.name.localeCompare(b.name, 'ru');
  });
  return { cards, window };
}

module.exports = { priceWindow, priceSummary, priceCards };
