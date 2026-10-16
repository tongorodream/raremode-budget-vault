'use strict';
const assert = require('assert');
const { stubObsidian, makeCtx, loadInto } = require('./helpers/harness.cjs');
stubObsidian();
const { subcategoryOf, subcategoryList, subcategoryOptions, subcategorySpend } = require('../src/subcategories');
const { stamp, keeps, LENSES } = require('../src/ledger');
const HEAD = '| Date | Description | Category | Amount | Excluded | Note | Subcategory | Reference |';
const month = '---\naccount: "Cash"\nmonth: 2026-09\n---\n\n' + HEAD + '\n'
  + '|------|-------------|----------|-------:|----------|------|-------------|-----------|\n'
  + '| 2026-09-01 | Groceries | Food | -100.00 |  | Keep this note | Home | original-1 |\n'
  + '| 2026-09-02 | Coffee | Food | -30.00 |  | Two products | Office | original-2 |\n'
  + '| 2026-09-03 | Refund | Food | 10.00 |  |  | Home | original-3 |\n';
const files = {
  'Budget/Settings.md': '---\ncurrency: "R"\nmonth_start_day: 1\n---\n',
  'Budget/Categories/Food.md': '---\ntype: food\nsubcategories: "Home, Office, Vegetables"\n---\n',
  'Budget/Accounts/Cash.md': '---\ntype: cash\n---\n',
  'Budget/Transactions/Cash/2026-09.md': month,
};
async function mount(input = files) {
  const ctx = makeCtx(input); await loadInto(ctx);
  const base = ctx.$(''), controls = new Map();
  ctx.$ = selector => {
    if (!controls.has(selector)) controls.set(selector, { ...base });
    return controls.get(selector);
  };
  require('../src/categories')(ctx); require('../src/views/transactions')(ctx);
  return ctx;
}
(async () => {
  const ctx = await mount(), f = ctx.S.txFiles['Cash/2026-09'];
  assert.deepStrictEqual(f.rows.map(r => r.subcategory), ['Home', 'Office', 'Home']);
  assert.deepStrictEqual(subcategoryOptions(ctx.S, 'Food'), ['Home', 'Office', 'Vegetables']);
  assert.strictEqual(ctx.serializeTxFile(f), month, 'loading and saving preserves all original cells');
  f.rows[0].subcategory = 'Vegetables';
  const changed = ctx.serializeTxFile(f);
  assert(changed.includes('| Vegetables | original-1 |'));
  assert(changed.includes('| Keep this note |'));
  assert(changed.includes('| -100.00 |'));
  const again = await mount({ ...files, 'Budget/Transactions/Cash/2026-09.md': changed });
  assert.strictEqual(again.S.txFiles['Cash/2026-09'].rows[0].subcategory, 'Vegetables');
  assert.strictEqual(again.serializeTxFile(again.S.txFiles['Cash/2026-09']), changed, 'repeat save is stable');

  ctx.$('#txWholeHistory').checked = true;
  ctx.$('#txCategory').value = 'Food'; ctx.$('#txSubcategory').value = 'sub:Office';
  ctx.$('#txSearch').value = '';
  const filtered = ctx.filteredRows();
  assert.strictEqual(filtered.rows.length, 1);
  assert.strictEqual(filtered.rows[0].amount, -30);
  assert(filtered.filters.includes('subcategory: Office'), 'exports and bulk actions disclose the child filter');
  ctx.$('#txSubcategory').value = ''; ctx.$('#txSearch').value = 'Two products';
  assert.strictEqual(ctx.filteredRows().rows.length, 1, 'search also finds notes');

  const fresh = { label: 'Cash', month: '2026-10', rows: [{ date: '2026-10-01', desc: 'New', cat: 'Food', amount: -7, note: '', subcategory: 'Home' }] };
  const freshText = ctx.serializeTxFile(fresh);
  assert(freshText.includes('| Note | Subcategory |'));
  const six = { label: 'Cash', month: '2026-10', rows: [{ date: '2026-10-01', desc: 'Old', cat: 'Food', amount: -7, note: '' }] };
  assert(!ctx.serializeTxFile(six).includes('Subcategory'), 'old six-column files are not rewritten to add an empty child');

  const split = { ...fresh, splitHeaderPresent: true, rows: [{ ...fresh.rows[0], split: 'part' }] };
  const splitText = ctx.serializeTxFile(split);
  assert(splitText.includes('| Split | Subcategory |'));
  assert(splitText.includes('| part | Home |'));

  const raw = [
    { cat: 'Food', subcategory: 'Home', amount: -100, label: 'Cash' },
    { cat: 'Food', subcategory: 'Home', amount: 10, label: 'Cash' },
    { cat: 'Food', subcategory: 'Office', amount: -30, label: 'Cash' },
    { cat: 'Food', subcategory: 'Home', amount: -500, label: 'Foreign' },
    { cat: 'Food', subcategory: 'Office', amount: -600, label: 'Cash', excluded: true },
    { cat: 'Food', subcategory: 'Refund only', amount: 5, label: 'Cash' },
  ];
  const eligible = stamp(raw, { foreignLabels: new Map([['Foreign', 'EUR']]), catType: () => 'food', catKnown: () => true })
    .filter(s => keeps(LENSES.BUDGET, s)).map(s => s.row);
  const children = subcategorySpend(eligible, 'Food');
  assert.deepStrictEqual(children, [{ subcategory: 'Home', amount: 90 }, { subcategory: 'Office', amount: 30 }, { subcategory: 'Refund only', amount: -5 }]);
  assert.strictEqual(children.reduce((s, r) => s + r.amount, 0), 115, 'refunds and exclusions reconcile with the parent net spend');
  assert.strictEqual(subcategoryOf({ subcategory: '' }, f), '', 'explicit clear is not replaced with the old extra cell');
  assert.deepStrictEqual(subcategoryList('Home, Office, Home'), ['Home', 'Office']);
  console.log('PASS subcategories — loader, lossless round-trip, edits, filters, new/split files and financial reconciliation');
})().catch(error => { console.error(error); process.exit(1); });
