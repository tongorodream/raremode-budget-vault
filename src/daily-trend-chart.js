'use strict';
const { el } = require('./dom');
const i18n = require('./i18n');
const { todayIso } = require('./dates');
const { dailySpendingTrend } = require('./daily-trend');
const { themeColors, createChart, scales, gridlines, axisLabels, phoneWidth,
  linePath, areaPath, areaGradient, tip, trackPoints } = require('./chart');

module.exports = function renderDailyTrend(ctx) {
  const { S, $, root, money, periodRange, periodTitle, dayLabel } = ctx;
  const wrap = $('#trendChart'), range = periodRange(S.period), today = todayIso();
  const data = dailySpendingTrend({ rows: ctx.ledger(range.start, range.end), ...range, today });
  const observed = data.filter(d => d.observed);
  const budget = ctx.budgetTotals(S.period).spend;
  const period = periodTitle(S.period);
  const label = d => d.opening ? i18n.t('dash.trend.dailyStart') : dayLabel(d.date);
  $('#trendSub').textContent = i18n.t('dash.trend.dailySub', { period });
  const W = 1000, H = 300, c = themeColors(root);
  const max = Math.max(1, budget, ...observed.flatMap(d => [d.spent, d.income])) * 1.12;
  const min = Math.min(0, ...observed.map(d => d.income));
  const s = scales({ w: W, h: H, count: data.length, max, min, padB: phoneWidth() ? 52 : 40 });
  const { svg, add } = createChart({ w: W, h: H, label: i18n.t('dash.trend.dailyAria', { period }) });
  svg.setAttribute('data-trend-mode', 'daily');
  gridlines(add, s, W);
  if (observed.length > 1) {
    const fill = areaGradient(add, 'dailySpentArea', c.success);
    add('path', { d: areaPath(observed.map((d, i) => [s.x(i), s.y(d.spent)]), s.y(0)), fill });
    add('path', { d: linePath(observed.map((d, i) => [s.x(i), s.y(d.income)])), fill: 'none',
      stroke: c.info, 'stroke-width': 2, 'stroke-opacity': 0.85 });
  }
  if (budget > 0) add('line', { x1: s.padL, x2: W - s.padR, y1: s.y(budget), y2: s.y(budget),
    stroke: 'currentColor', 'stroke-opacity': 0.28, 'stroke-width': 1.5, 'stroke-dasharray': '5 6' });
  const over = d => budget > 0 && d.spent > budget;
  const segments = [];
  observed.forEach((d, i) => {
    if (i) segments.push(add('line', { class: 'trend-seg', x1: s.x(i - 1), y1: s.y(observed[i - 1].spent),
      x2: s.x(i), y2: s.y(d.spent), stroke: over(d) || over(observed[i - 1]) ? c.danger : c.success,
      'stroke-width': 2.5, 'stroke-linecap': 'round' }));
    if (d.dailySpent || i === observed.length - 1) {
      const dot = add('circle', { cx: s.x(i), cy: s.y(d.spent), r: 4,
        'data-date': d.date, 'data-spent': d.spent, 'data-daily-spent': d.dailySpent,
        fill: d.date === today ? 'none' : c.hole, stroke: over(d) ? c.danger : c.success, 'stroke-width': 2 });
      tip(add, dot, `${label(d)}: ${money(d.spent)}`);
    }
  });
  const focus = add('g', { class: 'trend-focus', 'pointer-events': 'none' });
  const cross = add('line', { y1: s.padT, y2: s.baseline, stroke: 'currentColor', 'stroke-opacity': 0.28,
    'stroke-dasharray': '3 4' }, focus);
  const mark = add('circle', { r: 6, fill: c.hole, stroke: c.success, 'stroke-width': 3 }, focus);
  const tooltip = el('div', { class: 'trend-tip', role: 'status' });
  const head = el('div', { class: 'trend-tip-head' });
  const row = (name, cls) => {
    const value = el('span', { class: 'trend-tip-val num' });
    const swatch = el('i', { class: `trend-tip-dot ${cls}` });
    const node = el('div', { class: 'trend-tip-row' }, swatch,
      el('span', { class: 'trend-tip-name' }, name), value);
    return { node, value, swatch };
  };
  const cumulative = row(i18n.t('shell.legend.spent'), 'is-spent');
  const daily = row(i18n.t('dash.trend.dailyDay'), 'is-spent');
  const income = row(i18n.t('shell.legend.income'), 'is-income');
  const limit = row(i18n.t('shell.legend.budget'), 'is-budget');
  limit.node.classList.toggle('hidden', !(budget > 0));
  tooltip.append(head, cumulative.node, daily.node, income.node, limit.node);
  function focusAt(i) {
    const d = observed[i], x = s.x(i), y = s.y(d.spent);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x);
    mark.setAttribute('cx', x); mark.setAttribute('cy', y); mark.setAttribute('stroke', over(d) ? c.danger : c.success);
    segments.forEach((n, k) => n.classList.toggle('is-on', k === i - 1 || k === i));
    svg.classList.add('is-focus');
    head.textContent = label(d); cumulative.value.textContent = money(d.spent);
    cumulative.swatch.classList.toggle('is-over', over(d));
    daily.value.textContent = money(d.dailySpent); income.value.textContent = money(d.income); limit.value.textContent = money(budget);
    const percent = x / W * 100;
    tooltip.style.left = `${percent}%`; tooltip.style.top = `${y / H * 100}%`;
    tooltip.style.transform = `translate(${percent < 16 ? '0%' : percent > 84 ? '-100%' : '-50%'}, ${y < H * 0.42 ? '0' : '-100%'})`;
    tooltip.classList.toggle('is-below', y < H * 0.42); tooltip.classList.add('is-on');
  }
  function clear() {
    svg.classList.remove('is-focus'); tooltip.classList.remove('is-on');
    for (const n of segments) n.classList.remove('is-on');
  }
  const wired = trackPoints({ svg, w: W, xs: observed.map((d, i) => s.x(i)), onFocus: focusAt, onClear: clear });
  if (!wired) observed.forEach((d, i) => {
    const hit = add('rect', { x: s.x(i) - s.innerW / (data.length * 2), y: s.padT,
      width: s.innerW / data.length, height: s.innerH, fill: 'transparent' });
    tip(add, hit, `${label(d)} · ${i18n.t('shell.legend.spent')} ${money(d.spent)} · ${i18n.t('dash.trend.dailyDay')} ${money(d.dailySpent)}`);
  });
  axisLabels(add, s, data.map(label), H, { maxLabels: 7 });
  wrap.append(svg, tooltip, el('p', { class: 'text-muted fine-note', style: 'margin:10px 0 0;line-height:1.5' }, i18n.t('dash.trend.dailyNote')));
  const assumed = ctx.budgetUsed(S.period).assumed;
  if (assumed > 0) wrap.append(el('p', { class: 'text-muted fine-note' }, i18n.t('dash.trend.dailyProvision', { amount: money(assumed) })));
};
