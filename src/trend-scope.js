'use strict';
const { todayIso } = require('./dates');

function categoryMatches(row, category) {
  return !category || (category === '__none__' ? !row.cat : row.cat === category);
}

function categoryTrendScope(ctx, period, category, today = todayIso()) {
  const { start, end } = ctx.periodRange(period);
  const rows = ctx.ledger(start, end).filter(row => categoryMatches(row, category));
  const stop = end < today ? end : today;
  const actual = ctx.tally(rows.filter(row => row.date <= stop), ctx.LENSES.BUDGET);
  const budgetRows = (ctx.S.budgets[period] || []).filter(row => row.category === category);
  const used = ctx.budgetUsed(period, { rows: budgetRows, today });
  return { rows, budget: used.budgeted, assumed: used.assumed,
    spent: actual.spend - actual.setAside + used.assumed, income: 0 };
}

module.exports = { categoryMatches, categoryTrendScope };
