'use strict';

const { escMd, unescMd } = require('./markdown');

// Keep the upstream six-column prefix and optional Split column intact. The
// existing extra-column mechanism also lets the original plugin keep this data.
function subcategoryIndex(file) {
  return (file?.extraCols?.headers || []).findIndex(h =>
    ['subcategory', 'подкатегория'].includes(String(h).trim().toLowerCase()));
}

function subcategoryOf(row, file) {
  if (row?.subcategory != null) return String(row.subcategory).trim();
  const index = subcategoryIndex(file);
  return index < 0 ? '' : unescMd(String(row?.extraCells?.[index] || '')).trim();
}

function subcategoryList(value) {
  const values = Array.isArray(value) ? value : String(value || '').replace(/^['"]|['"]$/g, '').split(',');
  return [...new Set(values.map(x => String(x).trim()).filter(Boolean))];
}

function subcategoryOptions(state, category) {
  const values = [];
  for (const c of state.categories || []) {
    if (!category || c.name === category) values.push(...subcategoryList(c.subcategories));
  }
  for (const file of Object.values(state.txFiles || {})) {
    for (const row of file.rows) if (!category || row.cat === category) values.push(subcategoryOf(row, file));
  }
  return subcategoryList(values).sort((a, b) => a.localeCompare(b));
}

function withSubcategoryColumn(file) {
  const index = subcategoryIndex(file);
  const hasValues = file.rows.some(r => subcategoryOf(r, file));
  if (index < 0 && !hasValues) return file;
  const extraCols = file.extraCols
    ? { ...file.extraCols, headers: [...file.extraCols.headers], sep: [...file.extraCols.sep] }
    : { known: file.splitHeaderPresent ? 7 : 6, headers: [], sep: [] };
  const at = index < 0 ? extraCols.headers.length : index;
  if (index < 0) { extraCols.headers.push('Subcategory'); extraCols.sep.push('-------------'); }
  const rows = file.rows.map(row => {
    const extraCells = [...(row.extraCells || [])];
    while (extraCells.length <= at) extraCells.push('');
    extraCells[at] = escMd(subcategoryOf(row, file));
    return { ...row, extraCells };
  });
  return { ...file, extraCols, rows };
}

function subcategorySpend(rows, category) {
  const amounts = new Map();
  for (const row of rows) {
    if (row.cat !== category) continue;
    const sub = subcategoryOf(row);
    amounts.set(sub, (amounts.get(sub) || 0) - Number(row.amount || 0));
  }
  // Refunds stay signed: never inflate a parent's total by dropping a negative
  // child. The drill-down is a table and can represent both signs honestly.
  return [...amounts].map(([subcategory, amount]) => ({ subcategory, amount }))
    .filter(x => x.amount !== 0).sort((a, b) => b.amount - a.amount);
}

module.exports = { subcategoryOf, subcategoryList, subcategoryOptions, withSubcategoryColumn, subcategorySpend };
