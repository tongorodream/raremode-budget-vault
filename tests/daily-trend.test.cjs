'use strict';
const assert = require('assert');
const { dailySpendingTrend } = require('../src/daily-trend');
const { stamp, tally, LENSES } = require('../src/ledger');
const { stubObsidian } = require('./helpers/harness.cjs');

const env = { nonBudgetLabels: new Set(['Business']), foreignLabels: new Map([['Euro', 'EUR']]),
  earmarkedLabels: new Set(['Fund']), catType: cat => ({ salary: 'income', transfer: 'transfer', savings: 'savings' }[cat] || 'food'), catKnown: () => true };
const tx = (date, amount, cat = 'food', extra = {}) => ({ date, amount, cat, label: 'Cash', ...extra });
const raw = [
  tx('2026-11-01', -100), tx('2026-11-01', -20.50), tx('2026-11-03', -79.50),
  tx('2026-11-02', 40), // refunds do not undo gross recorded spending
  tx('2026-11-02', 1000, 'salary'), tx('2026-11-04', -50, 'salary'),
  tx('2026-11-02', -500, 'savings'), tx('2026-11-02', -500, 'transfer'),
  tx('2026-11-02', -500, 'food', { excluded: true }),
  tx('2026-11-02', -500, 'food', { label: 'Business' }),
  tx('2026-11-02', -500, 'food', { label: 'Euro' }),
  tx('2026-11-02', -500, 'food', { label: 'Fund' }),
  tx('2026-11-15', -999), tx('2026-10-31', -999), tx('2026-12-01', -999),
];
const rows = stamp(raw, env);
const window = { start: '2026-11-01', end: '2026-11-30', today: '2026-11-14' };
const result = dailySpendingTrend({ rows, ...window });
assert.strictEqual(result.length, 31, 'opening balance plus all 30 dates on the axis');
assert.strictEqual(result[0].spent, 0);
assert.strictEqual(result[1].dailySpent, 120.5);
assert.strictEqual(result[2].spent, 120.5, 'no-spend days retain the accumulation');
assert.strictEqual(result[3].dailySpent, 79.5);
assert.strictEqual(result[3].spent, 200);
assert.strictEqual(result[14].spent, 200);
assert.strictEqual(result[14].income, 950);
assert.strictEqual(result[2].dailyIncome, 1000);
assert.strictEqual(result[4].dailyIncome, -50, 'daily income is not the cumulative total');
assert.strictEqual(result[15].spent, null, 'future dates are not a flat projection');
assert.strictEqual(result[15].income, null);
const actual = tally(rows.filter(r => r.date >= window.start && r.date <= window.today), LENSES.BUDGET);
assert.strictEqual(result[14].spent, actual.spend - actual.setAside, 'last point reconciles with posted budget spending, excluding undated provisions');
assert.strictEqual(result[14].income, actual.income);
assert.strictEqual(result.filter(d => d.observed).length, 15, 'focus stops on today, not on a future day');

const historical = dailySpendingTrend({ rows, ...window, today: '2026-12-31' });
assert.strictEqual(historical[30].spent, 1199);
assert(historical.every(d => d.observed));
const future = dailySpendingTrend({ rows, ...window, today: '2026-10-31' });
assert(future.every(d => !d.observed && d.spent === null));
const leap = dailySpendingTrend({ rows: [], start: '2028-02-01', end: '2028-02-29', today: '2028-03-01' });
assert.strictEqual(leap.length, 30);
assert.strictEqual(leap[29].date, '2028-02-29');
const fractional = dailySpendingTrend({ ...window, rows: stamp([tx('2026-11-01', -.004), tx('2026-11-02', -.004), tx('2026-11-03', -.004)], env) });
assert.strictEqual(fractional[3].spent, .01, 'round the displayed cumulative figure, not the running balance after every day');
assert.throws(() => dailySpendingTrend({ rows, ...window, start: '2026-02-30' }));
assert.throws(() => dailySpendingTrend({ rows, ...window, end: '2026-10-31' }));

stubObsidian();
const BudgetPlugin = require('../src/main');
async function load(saved) {
  const plugin = Object.create(BudgetPlugin.prototype);
  plugin.loadData = async () => saved;
  plugin.app = { vault: { getFileByPath: () => null } };
  await plugin.loadSettings();
  return plugin.settings;
}
(async () => {
  const initial = await load({ chartTrendRange: '6m', theme: 'dark', privacyLock: false });
  assert.strictEqual(initial.chartTrendRange, '1m', 'existing installations switch to the requested daily default once');
  assert.strictEqual(initial.chartTrendDefaultVersion, 1);
  assert.strictEqual(initial.chartTrendDailyMode, 'day');
  assert.strictEqual(initial.theme, 'dark');
  assert.strictEqual(initial.privacyLock, false);
  const chosen = await load({ ...initial, chartTrendRange: '3m' });
  assert.strictEqual(chosen.chartTrendRange, '3m', 'subsequent explicit range choices survive reload');
  assert.strictEqual((await load({ ...initial, chartTrendDailyMode: 'cumulative' })).chartTrendDailyMode, 'cumulative', 'the optional cumulative mode is retained');
  assert.strictEqual((await load(null)).chartTrendRange, '1m');
  const { makeDom } = require('./helpers/dom-stub.cjs');
  const { $ } = makeDom();
  const render = require('../src/daily-trend-chart');
  const context = { $, root: $('#root'), S: { period: '2026-01' },
    plugin: { settings: { chartTrendDailyMode: 'day' } }, money: n => String(n),
    periodRange: () => ({ start: '2026-01-01', end: '2026-01-31' }),
    periodTitle: () => 'January', dayLabel: d => d,
    ledger: () => stamp([tx('2026-01-01', -50), tx('2026-01-02', -100)], env),
    budgetTotals: () => ({ spend: 310 }), budgetUsed: () => ({ assumed: 0 }) };
  render(context);
  const guide = () => $('#trendChart').querySelectorAll('line').find(e => e.getAttribute('stroke-dasharray') === '5 6');
  assert(Number(guide().getAttribute('y1')) > 150, 'daily guide is 310/31 = 10, not the whole 310 budget');
  assert(/Budget\/day/.test($('#trendBudgetLegend').textContent));
  const values = () => $('#trendChart').querySelectorAll('circle').filter(e => e.getAttribute('data-chart-spent') !== null).map(e => Number(e.getAttribute('data-chart-spent')));
  assert.deepStrictEqual(values(), [50, 100, 0], 'daily rendering uses actual day totals and can fall to zero');
  $('#trendChart').empty(); $('#trendMode').empty();
  context.plugin.settings.chartTrendDailyMode = 'cumulative';
  render(context);
  assert(Number(guide().getAttribute('y1')) < 100, 'cumulative guide is the full period budget');
  assert.deepStrictEqual(values(), [50, 150, 150]);
  console.log('PASS daily trend — daily accumulation, flats and spikes, future cutoff, ledger vetoes, income reversals, leap days, precision and default migration');
})().catch(e => { console.error(e); process.exit(1); });
