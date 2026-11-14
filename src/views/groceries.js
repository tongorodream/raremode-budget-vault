'use strict';

const { el, icoEl } = require('../dom');
const { createChart, arcPath, tip, themeColors, SLICE_PALETTE } = require('../chart');
const { keeps } = require('../ledger');
const { sharePercents } = require('../share-percents');
const { CATEGORY, GROUPS, boughtQuantity, parseGroceryFiles, groceryAnalytics, priceHistory } = require('../groceries');

module.exports = function registerGroceries(ctx) {
  const { S, $, app, vault, root, money } = ctx;
  let selectedProduct = '', priceScale = 1000, storeMode = 'merchant', groupFilter = '';
  const number = (n, digits = 1) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
  const cash = cents => money(cents / 100, 2);
  const monthLabel = m => new Date(`${m}-15T12:00:00`).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
  const small = text => el('p', { class: 'gr-note' }, text);
  const button = (text, fn, cls = 'btn-ghost') => el('button', { type: 'button', class: cls, onclick: fn }, text);
  const card = (title, icon, subtitle) => el('section', { class: 'gr-card' },
    el('div', { class: 'gr-card-head' }, icoEl([icon, 'circle']), el('h2', {}, title)), subtitle ? small(subtitle) : []);

  async function loadGroceryData() {
    const base = ctx.basePath() + '/';
    const files = vault.getFiles().filter(f => f.path.startsWith(base) && /\.data\.json$/i.test(f.path));
    const input = [], errors = [];
    await Promise.all(files.map(async f => {
      try { input.push({ path: f.path, text: await vault.cachedRead(f) }); }
      catch (_) { errors.push(`${f.path}: не удалось прочитать`); }
    }));
    S.groceryData = parseGroceryFiles(input);
    S.groceryData.errors.push(...errors);
  }

  function allTransactions() {
    return ctx.ledger('0001-01-01', '9999-12-31').filter(row => keeps(ctx.LENSES.BUDGET, row)).map(row => row.row);
  }

  function openTransactions() {
    ctx.switchView('transactions');
    $('#txCategory').value = CATEGORY;
    $('#txAccount').value = ''; $('#txSearch').value = '';
    $('#txSubcategory').value = ''; $('#txWholeHistory').checked = false;
    ctx.setTxInBudgetOnly(CATEGORY); ctx.renderTransactions();
  }

  function donut(host, rows, { center, caption = 'по расходам', value = cash, onSelect, icons = false } = {}) {
    rows = rows.filter(r => Number.isFinite(r.amount) && r.amount > 0);
    if (!rows.length) { host.append(small('Пока нет данных для диаграммы.')); return; }
    const total = rows.reduce((s, r) => s + r.amount, 0), shares = sharePercents(rows.map(r => r.amount));
    const colors = themeColors(root), wrap = el('div', { class: 'gr-donut-wrap' });
    const { svg, add } = createChart({ w: 260, h: 260, cls: 'gr-donut',
      label: rows.map((r, i) => `${r.name}: ${value(r.amount)}, ${shares[i]}%`).join('; ') });
    let angle = -Math.PI / 2;
    const palette = [...SLICE_PALETTE, '#b58bdb', '#28c0ce', '#c59954', '#889faa'];
    const paint = (row, i) => {
      if (['Без состава', 'Магазин неизвестен', 'Состав не оценён'].includes(row.name)) return colors.muted;
      const stable = icons ? Object.keys(GROUPS).indexOf(row.name) : -1;
      return row.color || palette[(stable < 0 ? i : stable) % palette.length];
    };
    rows.forEach((r, i) => {
      const next = angle + r.amount / total * 2 * Math.PI;
      const path = add('path', { d: arcPath(130, 130, 117, 83, angle, next), fill: paint(r, i),
        stroke: colors.hole, 'stroke-width': 2, class: onSelect ? 'donut-slice' : null });
      tip(add, path, `${r.name}: ${value(r.amount)} · ${shares[i]}%`);
      if (onSelect) path.addEventListener('click', () => onSelect(r.name));
      angle = next;
    });
    add('text', { x: 130, y: 125, 'text-anchor': 'middle', fill: 'currentColor', 'font-size': 22, 'font-weight': 650 }).textContent = center || value(total);
    add('text', { x: 130, y: 149, 'text-anchor': 'middle', fill: 'currentColor', opacity: 0.6, 'font-size': 12 }).textContent = caption;
    const legend = el('ul', { class: 'gr-legend' });
    rows.forEach((r, i) => {
      const face = [el('i', { style: `background:${paint(r, i)}` }),
        ...(icons ? [el('span', { class: 'gr-food-icon', 'aria-hidden': 'true' }, GROUPS[r.name]?.[1] || '🍽️')] : []),
        el('span', { class: 'gr-legend-name' }, r.name), el('strong', { class: 'num' }, value(r.amount)),
        el('span', { class: 'gr-percent num' }, `${shares[i]}%`)];
      legend.append(el('li', {}, onSelect ? el('button', { type: 'button', class: 'gr-legend-button',
        'aria-pressed': groupFilter === r.name ? 'true' : 'false', onclick: () => onSelect(r.name) }, face) : el('div', { class: 'gr-legend-row' }, face)));
    });
    wrap.append(svg, legend); host.append(wrap);
  }

  function renderGroceries() {
    const host = $('#groceryContent'); host.replaceChildren();
    const range = ctx.periodRange(S.period), summary = ctx.periodSummary(S.period);
    const end = summary.asOf || range.end;
    const source = S.groceryData || { receipts: [], errors: [] };
    const transactions = allTransactions().filter(t => t.date <= end);
    const report = groceryAnalytics(source.receipts, transactions, { start: range.start, end, currency: S.settings.currency_code || '' });
    const n = report.nutrition;
    const foodCost = n.foodCost + report.uncovered;
    const coverage = foodCost ? 100 * n.knownCost / foodCost : 0;
    const header = el('header', { class: 'gr-header' },
      el('div', {}, button('← Обзор бюджета', () => ctx.switchView('dashboard'), 'gr-back'),
        el('div', { class: 'gr-eyebrow' }, 'Питание · покупки · цены'),
        el('h1', {}, 'Продукты'), small(`${ctx.periodTitle(S.period)} · ${report.receipts.length} покупок с составом · ${report.lines} товарных строк`)),
      button('Все операции', openTransactions, 'btn-secondary'));
    host.append(header);
    if (source.errors.length || report.issues.length) host.append(el('details', { class: 'gr-data-issues' },
      el('summary', {}, `Не учтены проблемные данные: ${source.errors.length + report.issues.length}`),
      el('ul', {}, [...source.errors, ...report.issues].map(text => el('li', {}, text)))));
    host.append(el('div', { class: 'gr-kpis' },
      kpi('Расходы на покупки', cash(report.expense), report.refunds ? `Возвраты отдельно: ${cash(report.refunds)}` : 'Фактическая оплата после скидок'),
      kpi('Состав известен', cash(report.detailed), `${report.expense ? number(report.detailed / report.expense * 100, 1) : 0}% расходов`),
      kpi('Разных товаров', number(report.products.length, 0), `${report.lines} строк в ${report.receipts.length} чеках`),
      kpi('Покрытие КБЖУ', foodCost ? `${number(coverage)}%` : '—', 'Доля продовольственных расходов с расчётом')));
    if (report.uncovered) host.append(small(`Без состава: ${cash(report.uncovered)}. Эти расходы показаны отдельным сектором; КБЖУ для них неизвестно.`));
    const grid = el('div', { class: 'gr-grid' });
    const categories = card('Что покупал', 'shopping-basket', 'Группы продуктов · доля от расходов. Нажми группу, чтобы увидеть товары в чеках.');
    donut(categories, report.groups, { icons: true, center: cash(report.expense), onSelect: name => {
      groupFilter = groupFilter === name ? '' : name; renderGroceries();
      $('#groceryContent').querySelector('.gr-purchases')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } });
    const nutrition = card('Калории и БЖУ', 'flame', 'Куплено, не съедено. Только товары с известными значениями и совместимыми единицами массы/объёма.');
    nutrition.append(el('div', { class: 'gr-nutrition-stats' },
      kpi('Энергия', n.knownLines ? `${number(n.kcal, 0)} ккал` : '—'), kpi('Белки', n.knownLines ? `${number(n.protein)} г` : '—'),
      kpi('Жиры', n.knownLines ? `${number(n.fat)} г` : '—'), kpi('Углеводы', n.knownLines ? `${number(n.carbs)} г` : '—')));
    donut(nutrition, [
      { name: 'Белки', amount: n.protein * 4, color: '#36b9ac' },
      { name: 'Жиры', amount: n.fat * 9, color: '#f3b449' },
      { name: 'Углеводы', amount: n.carbs * 4, color: '#8f91ed' },
    ], { center: `${number(coverage)}%`, caption: 'расходов покрыто', value: v => `${number(v, 0)} ккал` });
    nutrition.append(small(`Расчёт для ${n.knownLines} из ${n.foodLines} продовольственных строк (${cash(n.knownCost)}). Вклад БЖУ — 4/9/4 ккал на грамм. Неизвестное не считается нулём; справочные КБЖУ могут отличаться от этикетки.`));
    const profile = card('Польза и умеренность', 'heart-pulse', 'Условные группы по типу продуктов, доля по деньгам. Это не медицинская оценка и не оценка съеденного рациона.');
    donut(profile, report.profiles, { center: 'Баланс', caption: 'состава покупок' });
    profile.append(small('Базовые: овощи, фрукты, яйца, обычные молоко/кефир/творог. Сладости, снеки и переработанное мясо выделены для умеренного потребления; алкоголь отдельно. Для остальных нужен состав.'));
    const stores = card('Где покупал', 'store', 'Сравнение магазинов и торговых точек по сумме чеков.');
    const storeSelect = el('select', { class: 'form-select', 'aria-label': 'Группировка магазинов', onchange: e => { storeMode = e.target.value; renderGroceries(); } },
      el('option', { value: 'merchant' }, 'По сетям'), el('option', { value: 'store' }, 'По адресам магазинов'));
    storeSelect.value = storeMode; stores.append(storeSelect);
    donut(stores, storeMode === 'store' ? report.stores : report.merchants, { center: number(report.receipts.length, 0), caption: 'покупок с составом' });
    grid.append(categories, nutrition, profile, stores); host.append(grid);
    renderPrices(host, report.history, end.slice(0, 7));
    renderPurchases(host, report);
  }

  function kpi(label, value, description) {
    return el('div', { class: 'gr-kpi' }, el('span', {}, label), el('strong', { class: 'num' }, value), description ? el('small', {}, description) : []);
  }

  function renderPrices(host, history, endMonth) {
    const section = card('Как менялась цена', 'chart-no-axes-combined', 'Последние 12 календарных месяцев. Средневзвешенная фактически оплаченная цена одного и того же товара, с учётом скидок.');
    section.classList.add('gr-prices');
    const products = priceHistory(history, endMonth);
    if (!products.length) { section.append(small('Нужны чеки с количеством и фасовкой. Покупки без состава не дают цену за грамм.')); host.append(section); return; }
    if (!products.some(p => p.key === selectedProduct)) selectedProduct = products[0].key;
    const select = el('select', { class: 'form-select', 'aria-label': 'Продукт для сравнения цен', onchange: e => { selectedProduct = e.target.value; renderGroceries(); } },
      products.map(p => el('option', { value: p.key }, p.name)));
    select.value = selectedProduct;
    const product = products.find(p => p.key === selectedProduct), unit = product.unit;
    const scaleSelect = el('select', { class: 'form-select', 'aria-label': 'Единица сравнения цены', onchange: e => { priceScale = Number(e.target.value); renderGroceries(); } },
      (unit === 'pcs' ? [[1, 'За 1 штуку']] : [[1, unit === 'g' ? 'За 1 грамм' : 'За 1 миллилитр'], [100, unit === 'g' ? 'За 100 грамм' : 'За 100 миллилитров'], [1000, unit === 'g' ? 'За 1 килограмм' : 'За 1 литр']]).map(([value, label]) => el('option', { value }, label)));
    const scale = unit === 'pcs' ? 1 : priceScale;
    scaleSelect.value = String(scale);
    section.append(el('div', { class: 'gr-price-controls' }, select, scaleSelect));
    const known = product.months.filter(m => m.perUnit !== null);
    section.append(small(known.length < 2 ? 'Пока есть только один месяц с детализацией. Линия динамики появится после покупок в другом месяце; пропуски не заменяются нулями.' : 'Сопоставляется этот товар, а не средняя цена меняющегося набора продуктов.'));
    const caption = unit === 'g' ? (scale === 1000 ? 'кг' : `${scale} г`) : unit === 'ml' ? (scale === 1000 ? 'л' : `${scale} мл`) : 'шт.';
    const latest = known[known.length - 1];
    section.append(el('div', { class: 'gr-price-current' }, el('span', {}, `Средняя цена · ${monthLabel(latest.month)}`),
      el('strong', { class: 'num' }, `${money(latest.perUnit * scale, scale === 1 && unit !== 'pcs' ? 4 : 2)} / ${caption}`)));
    priceChart(section, product, scale, caption);
    const headers = ['Месяц', 'Куплено', 'Потрачено', `Цена / ${caption}`, 'К пред. месяцу'];
    const table = el('table', { class: 'gr-table' }, el('thead', {}, el('tr', {}, headers.map(h => el('th', { scope: 'col' }, h)))));
    const body = el('tbody');
    product.months.forEach((m, i) => {
      if (m.perUnit === null) return;
      const prev = product.months[i - 1];
      const change = prev?.perUnit > 0 ? (m.perUnit / prev.perUnit - 1) * 100 : null;
      body.append(el('tr', {}, [monthLabel(m.month), `${number(m.amount, 3)} ${unit === 'g' ? 'г' : unit === 'ml' ? 'мл' : 'шт.'}`, cash(m.cost),
        money(m.perUnit * scale, scale === 1 && unit !== 'pcs' ? 4 : 2), change === null ? '—' : `${change > 0 ? '+' : ''}${number(change)}%`].map(v => el('td', {}, v))));
    });
    table.append(body); section.append(el('div', { class: 'gr-table-wrap' }, table),
      small('Цена = сумма оплаченных строк / купленное количество. Граммы и миллилитры не смешиваются. Яйца — за штуку; бананы — за купленный вес с кожурой. Изменение считается только к соседнему месяцу с покупками.'));
    host.append(section);
  }

  function priceChart(host, product, scale, caption) {
    const values = product.months.filter(m => m.perUnit !== null).map(m => m.perUnit * scale);
    const min = Math.min(...values), max = Math.max(...values), pad = Math.max((max - min) * 0.25, max * 0.05, 0.01);
    const lo = Math.max(0, min - pad), hi = max + pad;
    const { svg, add } = createChart({ w: 720, h: 220, cls: 'gr-price-chart', label: `${product.name}, цена за ${caption}. ` + product.months.filter(m => m.perUnit !== null).map(m => `${monthLabel(m.month)}: ${money(m.perUnit * scale, 4)}`).join('; ') });
    const colors = themeColors(root), x = i => 112 + i * 576 / 11, y = value => 165 - (value - lo) / (hi - lo) * 135;
    for (let i = 0; i < 3; i++) {
      const val = lo + (hi - lo) * i / 2, yy = y(val);
      add('line', { x1: 112, x2: 688, y1: yy, y2: yy, stroke: 'currentColor', opacity: 0.1 });
      add('text', { x: 100, y: yy + 4, 'text-anchor': 'end', fill: 'currentColor', opacity: 0.65, 'font-size': 12 }).textContent = number(val, scale === 1 ? 3 : 1);
    }
    let last = null;
    product.months.forEach((m, i) => {
      if (m.perUnit === null) { last = null; return; }
      const point = [x(i), y(m.perUnit * scale)];
      if (last) add('line', { x1: last[0], y1: last[1], x2: point[0], y2: point[1], stroke: colors.accent, 'stroke-width': 3 });
      const dot = add('circle', { cx: point[0], cy: point[1], r: 5, fill: colors.accent });
      tip(add, dot, `${monthLabel(m.month)}: ${money(m.perUnit * scale, 4)} / ${caption}`);
      last = point;
    });
    product.months.forEach((m, i) => {
      if (i % 4 && i !== 11) return;
      add('text', { x: x(i), y: 197, 'text-anchor': i === 11 ? 'end' : i === 0 ? 'start' : 'middle', fill: 'currentColor', opacity: 0.65, 'font-size': 12 }).textContent = `${m.month.slice(5)}.${m.month.slice(2, 4)}`;
    });
    host.append(svg);
  }

  function renderPurchases(host, report) {
    const section = card('Покупки и состав', 'receipt', 'Одна транзакция — один чек. Раскрой покупку, чтобы увидеть товары, количество и цены.');
    section.classList.add('gr-purchases');
    if (groupFilter) section.append(el('div', { class: 'gr-active-filter' }, `Группа: ${groupFilter}`, button('Сбросить', () => { groupFilter = ''; renderGroceries(); })));
    let shown = 0;
    for (const receipt of [...report.receipts].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''))) {
      const items = receipt.items.filter(i => !groupFilter || i.detail.category === groupFilter);
      if (!items.length) continue;
      shown++;
      const details = el('details', { class: 'gr-receipt' }, el('summary', {},
        el('span', {}, el('strong', {}, `${receipt.date.slice(8)}.${receipt.date.slice(5, 7)} · ${receipt.time || ''}`), el('small', {}, `${receipt.merchant} · ${receipt.store || ''}`)),
        el('strong', { class: 'num' }, cash(receipt.paid))));
      if (groupFilter) details.append(small(`В выбранной группе: ${cash(items.reduce((s, i) => s + i.line_total, 0))}; справа в заголовке — вся покупка.`));
      const body = el('tbody');
      for (const item of items) {
        const p = item.detail, q = boughtQuantity(p, item);
        body.append(el('tr', {},
          el('td', {}, el('strong', {}, p.name), el('small', {}, `${GROUPS[p.category]?.[1] || '🍽️'} ${p.category}${q ? ` · всего ${number(q.amount, 3)} ${q.unit === 'g' ? 'г' : q.unit === 'ml' ? 'мл' : 'шт.'}` : ''}`)),
          el('td', {}, `${number(item.quantity, 3)} ${item.unit === 'kg' ? 'кг' : item.unit === 'g' ? 'г' : item.unit === 'ml' ? 'мл' : 'уп.'}`),
          el('td', { class: 'num' }, cash(item.unit_price)), el('td', { class: 'num' }, cash(item.line_total))));
      }
      details.append(el('div', { class: 'gr-table-wrap' }, el('table', { class: 'gr-table' },
        el('thead', {}, el('tr', {}, ['Товар', 'Количество', 'Цена за ед.', 'Сумма'].map(h => el('th', { scope: 'col' }, h)))), body)));
      if (receipt.receipt_url && /^https:\/\/[^\s]+$/i.test(receipt.receipt_url)) details.append(el('a', { href: receipt.receipt_url, class: 'gr-source-link', target: '_blank', rel: 'noopener noreferrer' }, 'Электронный чек ↗'));
      section.append(details);
    }
    if (!shown) section.append(small(groupFilter === 'Без состава' ? 'Эти покупки есть в операциях, но товарные строки ещё не добавлены.' : 'В этом периоде нет подходящих чеков с составом.'));
    const notes = [...new Set(report.receipts.map(r => r.notePath))].filter(path => app.vault.getAbstractFileByPath(path));
    if (notes.length) section.append(button('Открыть заметку с детализацией', () => app.workspace.getLeaf('tab').openFile(app.vault.getAbstractFileByPath(notes[0]))));
    host.append(section);
  }

  ctx.provide({ loadGroceryData, renderGroceries });
};
