'use strict';
const { el } = require('./dom');
const i18n = require('./i18n');
const { basicProduct } = require('./groceries');

module.exports = function receiptDetail(receipt, money) {
  const list = el('div', { class: 'bv-receipt-items', role: 'list' });
  const number = n => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(n);
  for (const item of receipt.items) {
    const product = item.detail;
    const icon = item.kind === 'delivery_fee' ? '🚚' : product.food === false ? '🛍️' : basicProduct(product).icon;
    const quantity = `${number(item.quantity)}${item.unit === 'pcs' ? '' : ' ' + item.unit}`;
    const suffix = item.unit === 'pcs' ? '' : '/' + item.unit;
    list.append(el('div', { class: 'bv-receipt-item', role: 'listitem' },
      el('span', { class: 'bv-receipt-icon', 'aria-hidden': 'true' }, icon),
      el('div', { class: 'bv-receipt-product' }, el('span', {}, product.name),
        el('small', {}, `${quantity} × ${money(item.unit_price / 100)}${suffix}`)),
      el('strong', { class: 'num' }, money(item.line_total / 100))));
  }
  const panel = el('div', { class: 'bv-receipt-detail', role: 'group', 'aria-label': i18n.t('tx.receipt.items', { count: receipt.items.length }) },
    list, el('div', { class: 'bv-receipt-total' }, el('span', {}, i18n.t('tx.receipt.paid')),
      el('strong', { class: 'num' }, money(receipt.paid / 100))));
  if (/^https:\/\/[^\s]+$/i.test(receipt.receipt_url || '')) panel.append(el('a', { class: 'bv-receipt-source',
    href: receipt.receipt_url, target: '_blank', rel: 'noopener noreferrer' }, i18n.t('tx.receipt.source')));
  return panel;
};
