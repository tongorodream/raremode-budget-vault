'use strict';
const { el } = require('./dom');
const i18n = require('./i18n');
const { todayIso } = require('./dates');
const { dailySpendingTrend } = require('./daily-trend');
const { smoothSegments, smoothLinePath, smoothAreaPath } = require('./smooth-trend');
const { themeColors, createChart, scales, gridlines, axisLabels, phoneWidth,
  areaGradient, tip, trackPoints, rangePills } = require('./chart');

module.exports = function renderDailyTrend(ctx) {
  const { S, $, root, money, periodRange, periodTitle, dayLabel } = ctx;
  const wrap = $('#trendChart'), range = periodRange(S.period), today = todayIso();
  const cumulativeMode = ctx.plugin.settings.chartTrendDailyMode === 'cumulative';
  const all = dailySpendingTrend({ rows: ctx.ledger(range.start, range.end), ...range, today });
  const data = cumulativeMode ? all : all.filter(d => !d.opening);
  const observed = data.filter(d => d.observed);
  const budget = ctx.budgetTotals(S.period).spend;
  const reference = cumulativeMode ? budget : budget / (all.length - 1);
  const spentValue = d => cumulativeMode ? d.spent : d.dailySpent;
  const incomeValue = d => cumulativeMode ? d.income : d.dailyIncome;
  const modeBox = $('#trendMode');
  if (modeBox) modeBox.append(rangePills({
    ranges: [{ key: 'day', label: i18n.t('dash.trend.modeDay') }, { key: 'cumulative', label: i18n.t('dash.trend.modeCumulative') }],
    value: cumulativeMode ? 'cumulative' : 'day', label: i18n.t('dash.trend.modeLabel'),
    onPick: async key => {
      const scroller = wrap.closest('.bud-scroll'), top = scroller?.scrollTop;
      ctx.plugin.settings.chartTrendDailyMode = key;
      try { await ctx.plugin.saveSettings(); }
      catch (e) { ctx.toast(i18n.t('settings.err.save', { error: e.message || e }), true); }
      ctx.renderTrend();
      $('#trendMode')?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
      if (scroller) scroller.scrollTop = top;
    },
  }));
  if (!cumulativeMode) {
    const budgetLegend = $('#trendBudgetLegend'), overLegend = $('#trendOverLegend');
    if (budgetLegend) budgetLegend.textContent = i18n.t('dash.trend.dayBudget');
    if (overLegend) overLegend.textContent = i18n.t('dash.trend.dayOver');
  }
  const period = periodTitle(S.period);
  const label = d => d.opening ? i18n.t('dash.trend.dailyStart') : dayLabel(d.date);
  $('#trendSub').textContent = i18n.t(cumulativeMode ? 'dash.trend.dailySub' : 'dash.trend.daySub', { period });
  const W = 1000, H = 300, c = themeColors(root);
  const max = Math.max(1, reference, ...observed.flatMap(d => [spentValue(d), incomeValue(d)])) * 1.12;
  const min = Math.min(0, ...observed.map(incomeValue));
  const s = scales({ w: W, h: H, count: data.length, max, min, padB: phoneWidth() ? 52 : 40 });
  const { svg, add } = createChart({ w: W, h: H, label: i18n.t(cumulativeMode ? 'dash.trend.dailyAria' : 'dash.trend.daySub', { period }) });
  // Obsidian's aria-label hover tooltip expects HTML, not SVG; use our readout.
  svg.style.setProperty?.('--no-tooltip', 'true');
  svg.setAttribute('data-trend-mode', 'daily');
  svg.setAttribute('data-spending-mode', cumulativeMode ? 'cumulative' : 'day');
  const spentPoints = observed.map((d, i) => [s.x(i), s.y(spentValue(d))]);
  gridlines(add, s, W);
  if (observed.length > 1) {
    const fill = areaGradient(add, 'dailySpentArea', c.success);
    add('path', { d: smoothAreaPath(spentPoints, s.y(0)), fill });
    add('path', { d: smoothLinePath(observed.map((d, i) => [s.x(i), s.y(incomeValue(d))])), fill: 'none',
      stroke: c.info, 'stroke-width': 2, 'stroke-opacity': 0.85 });
  }
  if (reference > 0) add('line', { x1: s.padL, x2: W - s.padR, y1: s.y(reference), y2: s.y(reference),
    stroke: 'currentColor', 'stroke-opacity': 0.28, 'stroke-width': 1.5, 'stroke-dasharray': '5 6' });
  const over = d => reference > 0 && spentValue(d) > reference;
  const segments = smoothSegments(spentPoints).map((segment, i) => add('path', { class: 'trend-seg', d: segment.path,
    stroke: over(observed[i]) || over(observed[i + 1]) ? c.danger : c.success, fill: 'none',
    'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  observed.forEach((d, i) => {
    if (d.dailySpent || i === observed.length - 1) {
      const dot = add('circle', { cx: s.x(i), cy: s.y(spentValue(d)), r: 4,
        'data-date': d.date, 'data-spent': d.spent, 'data-daily-spent': d.dailySpent,
        'data-chart-spent': spentValue(d),
        fill: d.date === today ? 'none' : c.hole, stroke: over(d) ? c.danger : c.success, 'stroke-width': 2 });
      tip(add, dot, `${label(d)}: ${money(spentValue(d))}`);
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
  const primary = row(i18n.t(cumulativeMode ? 'shell.legend.spent' : 'dash.trend.dailyDay'), 'is-spent');
  const secondary = row(i18n.t(cumulativeMode ? 'dash.trend.dailyDay' : 'dash.trend.modeCumulative'), 'is-spent');
  const income = row(i18n.t('shell.legend.income'), 'is-income');
  const limit = row(i18n.t(cumulativeMode ? 'shell.legend.budget' : 'dash.trend.dayBudget'), 'is-budget');
  limit.node.classList.toggle('hidden', !(budget > 0));
  tooltip.append(head, primary.node, secondary.node, income.node, limit.node);
  function focusAt(i) {
    const d = observed[i], x = s.x(i), y = s.y(spentValue(d));
    cross.setAttribute('x1', x); cross.setAttribute('x2', x);
    mark.setAttribute('cx', x); mark.setAttribute('cy', y); mark.setAttribute('stroke', over(d) ? c.danger : c.success);
    segments.forEach((n, k) => n.classList.toggle('is-on', k === i - 1 || k === i));
    svg.classList.add('is-focus');
    head.textContent = label(d); primary.value.textContent = money(spentValue(d));
    primary.swatch.classList.toggle('is-over', over(d));
    secondary.value.textContent = money(cumulativeMode ? d.dailySpent : d.spent);
    income.value.textContent = money(incomeValue(d)); limit.value.textContent = money(reference);
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
  wrap.append(svg, tooltip, el('p', { class: 'text-muted fine-note', style: 'margin:10px 0 0;line-height:1.5' },
    i18n.t(cumulativeMode ? 'dash.trend.dailyNote' : 'dash.trend.dayNote')));
  const assumed = ctx.budgetUsed(S.period).assumed;
  if (assumed > 0) wrap.append(el('p', { class: 'text-muted fine-note' }, i18n.t('dash.trend.dailyProvision', { amount: money(assumed) })));
};
