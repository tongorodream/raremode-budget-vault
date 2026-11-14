'use strict';
const assert = require('assert');
const { parseGroceryFiles, groceryAnalytics, priceHistory, nutritionFor, foodProfile } = require('../src/groceries');
const { stamp, keeps, LENSES } = require('../src/ledger');

const product = { name: 'Кефир 3,2%, 500 г', category: 'Молочные продукты', pack_amount: 500, pack_unit: 'g',
  nutrition: { basis: 100, unit: 'g', kcal: 57, protein: 3, fat: 3.2, carbs: 4 } };
const receipt = (id, date, paid, quantity, overrides = {}) => ({ id, date, paid, merchant: 'Пятёрочка', store: 'Адрес А',
  items: [{ product: 'kefir', quantity, unit: 'pcs', unit_price: Math.round(paid / quantity), line_total: paid }], ...overrides });
const dataset = receipts => ({ schema_version: 1, money_unit: 'kopecks', currency: 'RUB',
  products: { kefir: product, bag: { name: 'Пакет', category: 'Непродовольственное', food: false } }, receipts });
const parse = data => parseGroceryFiles([{ path: 'Budget/Notes/test.data.json', text: JSON.stringify(data) }]);
const tx = r => ({ date: r.date, cat: 'Продукты', amount: -r.paid / 100, note: `Состав. ID: ${r.id}.`, label: 'Cash' });

const october = receipt('old', '2026-10-12', 5000, 1);
const november = receipt('current', '2026-11-12', 18000, 3);
const small = receipt('small', '2026-11-13', 2000, 1, { merchant: 'Другой магазин', store: 'Адрес Б' });
const data = parse(dataset([october, november, small]));
assert.deepStrictEqual(data.errors, []);
const settings = { start: '2026-11-01', end: '2026-11-14', currency: 'RUB' };
const transactionRows = [october, november, small].map(tx);
transactionRows.push({ date: '2026-11-10', cat: 'Продукты', amount: -7, note: '', label: 'Cash' });
transactionRows.push({ date: '2026-11-11', cat: 'Продукты', amount: 5, note: 'Возврат', label: 'Cash' });
const report = groceryAnalytics(data.receipts, transactionRows, settings);
assert.strictEqual(report.expense, 20700);
assert.strictEqual(report.refunds, 500, 'refunds stay distinct from positive purchase distributions');
assert.strictEqual(report.detailed, 20000);
assert.strictEqual(report.uncovered, 700);
for (const field of ['groups', 'profiles', 'merchants', 'stores']) {
  assert.strictEqual(report[field].reduce((s, r) => s + r.amount, 0), report.expense, field + ' reconciles including missing detail');
}
assert.strictEqual(report.receipts.length, 2);
assert.strictEqual(report.nutrition.protein, 60);
assert.strictEqual(report.nutrition.knownLines, 2);
assert.strictEqual(report.nutrition.foodCost, 20000);
assert.strictEqual(foodProfile(product), 'Базовые продукты');
assert.strictEqual(foodProfile({ name: 'Индейка в сливочном соусе', category: 'Мясо и птица' }), 'Состав не оценён', 'a marinade is not judged healthy from the meat category');

const price = priceHistory(report.history, '2026-11')[0];
assert.strictEqual(price.months.length, 12);
assert.strictEqual(price.months[10].perUnit, 0.1);
assert.strictEqual(price.months[11].perUnit, 0.1, 'weighted by bought grams, not a mean of sticker prices');
assert.strictEqual(price.months[9].perUnit, null, 'missing months are not free food');
const sparse = priceHistory(parse(dataset([october, receipt('later', '2026-12-01', 7000, 1)])).receipts, '2026-12')[0];
assert.strictEqual(sparse.months[10].perUnit, null, 'a gap remains a gap between two known months');

const mismatch = groceryAnalytics(data.receipts, [{ ...tx(november), amount: -181 }], settings);
assert.strictEqual(mismatch.receipts.length, 0);
assert.strictEqual(mismatch.uncovered, 18100, 'never silently rescale an edited transaction to an old receipt');
assert.strictEqual(mismatch.issues.length, 1);
assert.strictEqual(groceryAnalytics(data.receipts, [{ ...tx(november), date: '2026-11-11' }], settings).receipts.length, 0);
assert.strictEqual(groceryAnalytics(data.receipts, transactionRows, { ...settings, currency: 'USD' }).receipts.length, 0, 'foreign receipts cannot enter home-currency totals');
assert.strictEqual(groceryAnalytics(data.receipts, transactionRows, { ...settings, end: '2026-11-11' }).receipts.length, 0, 'as-of cut excludes later receipts');
assert.strictEqual(groceryAnalytics(data.receipts, [tx(november), tx(november)], settings).receipts.length, 1, 'a duplicate ledger link cannot double the receipt');

const all = [tx(november), { ...tx(small), excluded: true }, { ...tx(october), label: 'Business' }];
const eligible = stamp(all, { nonBudgetLabels: new Set(['Business']), catType: () => 'food', catKnown: () => true })
  .filter(r => keeps(LENSES.BUDGET, r)).map(r => r.row);
assert.strictEqual(groceryAnalytics(data.receipts, eligible, settings).detailed, 18000, 'excluded and non-budget rows never return through companion JSON');
assert.strictEqual(priceHistory(groceryAnalytics(data.receipts, eligible, settings).history, '2026-11')[0].months[10].perUnit, null);

assert.strictEqual(nutritionFor({ ...product, pack_unit: 'ml' }, november.items[0]), null, 'ml are not grams');
assert.strictEqual(nutritionFor({ ...product, nutrition: null }, november.items[0]), null);
assert.strictEqual(nutritionFor(product, { quantity: 1e308, unit: 'pcs' }), null, 'overflowing quantities cannot manufacture zero unit prices or infinite calories');
assert.strictEqual(nutritionFor({ ...product, nutrition: { ...product.nutrition, fat: null } }, november.items[0]), null, 'partial nutrition is not zero-filled');
assert.strictEqual(nutritionFor({ ...product, pack_amount: 150, nutrition: { basis: 30, unit: 'g', kcal: 140, protein: 2.4, fat: 7, carbs: 18 } }, { quantity: 1, unit: 'pcs' }).kcal, 700, 'manufacturer portions need not be 100 g');

const invalid = dataset([november, { ...small, paid: 9999 }]);
const partial = parse(invalid);
assert.strictEqual(partial.receipts.length, 1);
assert.strictEqual(partial.errors.length, 1, 'one bad receipt does not hide good receipts');
const duplicate = parseGroceryFiles([
  { path: 'a.data.json', text: JSON.stringify(dataset([november])) },
  { path: 'b.data.json', text: JSON.stringify(dataset([november])) },
  { path: 'broken.data.json', text: '{' },
]);
assert.strictEqual(duplicate.receipts.length, 1);
assert.strictEqual(duplicate.errors.length, 2);
assert.strictEqual(parse({ ...dataset([november]), schema_version: 999 }).receipts.length, 0);

const eggs = parse({ ...dataset([november]), products: { kefir: { name: 'Яйца 10 шт.', category: 'Яйца', pack_amount: 10, pack_unit: 'pcs', nutrition: null } } });
assert.strictEqual(priceHistory(eggs.receipts, '2026-11')[0].months[11].perUnit, 6, 'three ten-egg packs are 30 eggs, not three grams or three eggs');
console.log('PASS groceries — ledger reconciliation, exclusions, refunds, identity, missing detail, nutrition units, weighted prices, gaps, malformed files and duplicates');
