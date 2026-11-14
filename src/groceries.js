'use strict';
/* Receipt detail is a companion to, never a second copy of, the ledger.
   All money below is integer minor units. Only a dated, amount-matched ledger
   ID is allowed to contribute: excluded/deleted/non-budget rows stay excluded.
   Nutrition and quantities are bought amounts, not food consumed. */

const { isRealIsoDate } = require('./dates');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const finite = n => typeof n === 'number' && Number.isFinite(n);
const cents = n => Number.isSafeInteger(n) && n >= 0;
const fold = s => String(s || '').trim().toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const CATEGORY = 'Продукты';
const GROUPS = {
  'Мясо и птица': ['beef', '🥩'], 'Молочные продукты': ['milk', '🥛'],
  'Хлеб и выпечка': ['croissant', '🥐'], 'Сладости': ['candy', '🍫'],
  'Овощи и зелень': ['carrot', '🥬'], 'Бакалея и соусы': ['wheat', '🌾'],
  'Фрукты': ['apple', '🍎'], 'Вода и безалкогольные напитки': ['glass-water', '💧'],
  'Снеки': ['popcorn', '🍿'], 'Яйца': ['egg', '🥚'],
  'Колбасные изделия': ['sandwich', '🥓'], 'Протеиновые напитки': ['milk', '🥤'],
  'Алкоголь': ['beer', '🍺'], 'Непродовольственное': ['shopping-bag', '🛍️'],
  'Без состава': ['circle-help', '❔'],
};

function foodProfile(product) {
  if (product.food === false || product.category === 'Непродовольственное') return 'Не продукты питания';
  if (product.category === 'Алкоголь') return 'Алкоголь';
  if (['Сладости', 'Снеки'].includes(product.category)) return 'Сладости и снеки — умеренно';
  if (product.category === 'Колбасные изделия') return 'Переработанное мясо — умеренно';
  if (['Овощи и зелень', 'Фрукты', 'Яйца'].includes(product.category)) return 'Базовые продукты';
  // A marinade, a protein drink or a sauce is not judged from its name.
  if (product.category === 'Молочные продукты' && /^(кефир|молоко|творог)(?:\s|$)/u.test(fold(product.name))) return 'Базовые продукты';
  return 'Состав не оценён';
}

function boughtQuantity(product, item) {
  const quantity = (amount, unit) => finite(amount) && amount > 0 ? { amount, unit } : null;
  if (item.unit === 'kg') return quantity(item.quantity * 1000, 'g');
  if (item.unit === 'g' || item.unit === 'ml') return quantity(item.quantity, item.unit);
  if (item.unit !== 'pcs') return null;
  if (finite(product.pack_amount) && product.pack_amount > 0 && ['g', 'ml', 'pcs'].includes(product.pack_unit)) {
    return quantity(item.quantity * product.pack_amount, product.pack_unit);
  }
  return quantity(item.quantity, 'pcs');
}

function nutritionFor(product, item) {
  if (product.food === false) return null;
  const n = product.nutrition, q = boughtQuantity(product, item);
  if (!n || !q || n.unit !== q.unit || !finite(n.basis) || n.basis <= 0) return null;
  if (!['kcal', 'protein', 'fat', 'carbs'].every(k => finite(n[k]) && n[k] >= 0)) return null;
  const result = Object.fromEntries(['kcal', 'protein', 'fat', 'carbs'].map(k => [k, n[k] * q.amount / n.basis]));
  return Object.values(result).every(finite) ? result : null;
}

function parseGroceryFiles(files) {
  const receipts = [], errors = [], seen = new Set();
  for (const { path, text } of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    let data;
    try { data = JSON.parse(text); } catch (_) { errors.push(`${path}: не читается JSON`); continue; }
    // Other .data.json documents are not grocery files.
    if (!data || !Array.isArray(data.receipts) || !data.products) continue;
    if (data.schema_version !== 1 || data.money_unit !== 'kopecks' || typeof data.currency !== 'string') {
      errors.push(`${path}: неподдерживаемый формат чеков`); continue;
    }
    for (const r of data.receipts) {
      const fail = why => errors.push(`${path}: ${r?.id || 'чек без ID'} — ${why}`);
      if (!r || typeof r.id !== 'string' || !r.id.trim() || !isRealIsoDate(r.date) || !cents(r.paid) || !Array.isArray(r.items) || !r.items.length) {
        fail('неверные дата, сумма или товары'); continue;
      }
      let valid = true;
      const items = r.items.map(item => {
        const p = own(data.products, item?.product) && data.products[item.product];
        if (!p || typeof p.name !== 'string' || !p.name.trim() || !finite(item.quantity) || item.quantity <= 0 || !['pcs', 'kg', 'g', 'ml'].includes(item.unit) || !cents(item.line_total) || !cents(item.unit_price)) {
          valid = false; return null;
        }
        return { ...item, detail: { ...p, category: p.category || 'Без группы' } };
      });
      if (!valid || items.reduce((s, i) => s + i.line_total, 0) !== r.paid) { fail('состав не сходится с итогом'); continue; }
      if (seen.has(r.id)) { fail('повторный ID, повтор не учтён'); continue; }
      seen.add(r.id);
      const merchant = String(r.merchant || data.merchant || (r.id.startsWith('5ka-') ? 'Пятёрочка' : 'Магазин не указан'));
      receipts.push({ ...r, items, merchant, currency: data.currency.toUpperCase(), sourcePath: path,
        notePath: path.replace(/\.data\.json$/i, '.md') });
    }
  }
  return { receipts, errors };
}

function linkedReceipts(receipts, transactions, currency) {
  const byId = new Map(receipts.filter(r => r.currency === currency).map(r => [r.id, r]));
  const linked = [], used = new Set(), issues = [];
  for (const tx of transactions) {
    if (tx.cat !== CATEGORY || !finite(tx.amount) || tx.amount >= 0) continue;
    const ids = [...String(tx.note || '').matchAll(/\bID:\s*([^\s.]+)(?=\.|\s|$)/g)].map(m => m[1]);
    const found = ids.map(id => byId.get(id)).filter(Boolean);
    if (found.length !== 1) continue;
    const receipt = found[0];
    if (receipt.date !== tx.date || receipt.paid !== Math.round(-tx.amount * 100)) { issues.push(`${receipt.id}: дата или сумма отличается от транзакции`); continue; }
    if (used.has(receipt.id)) { issues.push(`${receipt.id}: несколько транзакций с одним чеком`); continue; }
    used.add(receipt.id); linked.push(receipt);
  }
  return { linked, issues };
}

function sortedTotals(map) {
  return [...map].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value);

function groceryAnalytics(receipts, transactions, { start, end, currency = 'RUB' }) {
  const { linked, issues } = linkedReceipts(receipts, transactions, currency);
  const current = linked.filter(r => r.date >= start && r.date <= end);
  const txNow = transactions.filter(t => t.cat === CATEGORY && t.date >= start && t.date <= end);
  const expense = txNow.reduce((s, t) => s + (t.amount < 0 ? Math.round(-t.amount * 100) : 0), 0);
  const refunds = txNow.reduce((s, t) => s + (t.amount > 0 ? Math.round(t.amount * 100) : 0), 0);
  const detailed = current.reduce((s, r) => s + r.paid, 0), uncovered = Math.max(0, expense - detailed);
  const groups = new Map(), profiles = new Map(), merchants = new Map(), stores = new Map(), products = new Map();
  const nutrition = { kcal: 0, protein: 0, fat: 0, carbs: 0, knownCost: 0, knownLines: 0, foodCost: 0, foodLines: 0 };
  let lines = 0;
  for (const r of current) {
    add(merchants, r.merchant, r.paid);
    add(stores, `${r.merchant} · ${r.store || 'Адрес не указан'}`, r.paid);
    for (const item of r.items) {
      const p = item.detail;
      lines++;
      add(groups, p.category, item.line_total);
      add(profiles, foodProfile(p), item.line_total);
      add(products, p.name, item.line_total);
      if (p.food === false || p.category === 'Непродовольственное') continue;
      nutrition.foodCost += item.line_total; nutrition.foodLines++;
      const n = nutritionFor(p, item);
      if (!n) continue;
      nutrition.knownLines++; nutrition.knownCost += item.line_total;
      for (const key of ['kcal', 'protein', 'fat', 'carbs']) nutrition[key] += n[key];
    }
  }
  if (uncovered) {
    add(groups, 'Без состава', uncovered); add(profiles, 'Состав не оценён', uncovered);
    add(merchants, 'Магазин неизвестен', uncovered); add(stores, 'Магазин неизвестен', uncovered);
  }
  return { receipts: current, history: linked, issues, expense, refunds, detailed, uncovered, lines,
    groups: sortedTotals(groups), profiles: sortedTotals(profiles), merchants: sortedTotals(merchants), stores: sortedTotals(stores),
    products: sortedTotals(products), nutrition };
}

/* Compare the same named SKU/recipe, not a changing basket of "dairy".
   price_key is an optional explicit stable identity across different packs. */
function priceHistory(receipts, endMonth, count = 12) {
  const products = new Map();
  const [y, m] = endMonth.split('-').map(Number);
  const months = Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - count + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  for (const r of receipts) {
    const month = r.date.slice(0, 7);
    if (!months.includes(month)) continue;
    for (const item of r.items) {
      const p = item.detail;
      if (p.food === false || p.category === 'Непродовольственное') continue;
      const q = boughtQuantity(p, item);
      if (!q || !q.amount) continue;
      const key = `${fold(p.price_key || p.name)}\u001f${q.unit}`;
      if (!products.has(key)) products.set(key, { key, name: p.name, unit: q.unit, months: new Map(), purchases: 0 });
      const product = products.get(key);
      const row = product.months.get(month) || { month, amount: 0, cost: 0, purchases: 0 };
      row.amount += q.amount; row.cost += item.line_total; row.purchases++; product.purchases++;
      product.months.set(month, row);
    }
  }
  return [...products.values()].map(p => ({ ...p, months: months.map(month => {
    const row = p.months.get(month);
    return row ? { ...row, perUnit: row.cost / 100 / row.amount } : { month, perUnit: null, purchases: 0 };
  }) })).sort((a, b) => b.purchases - a.purchases || a.name.localeCompare(b.name));
}

module.exports = { CATEGORY, GROUPS, foodProfile, boughtQuantity, nutritionFor, parseGroceryFiles, linkedReceipts, groceryAnalytics, priceHistory };
