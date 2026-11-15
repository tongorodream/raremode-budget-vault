'use strict';
/* Recorded expense accumulation under the same budget lens as the dashboard.
   No dated fiction for savings, assume-spent provisions or future transactions. */
const { keeps, LENSES } = require('./ledger');
const { roundCents } = require('./amount');
const { isoDayNumber, isoFromDayNumber, isRealIsoDate } = require('./dates');

function dailySpendingTrend({ rows, start, end, today }) {
  if (![start, end, today].every(isRealIsoDate)) throw new Error('Invalid daily trend date');
  const first = isoDayNumber(start), last = isoDayNumber(end);
  if (last < first || last - first > 366) throw new Error('Daily trend range must be at most one year');
  const days = new Map();
  for (const row of rows || []) {
    if (!keeps(LENSES.BUDGET, row) || !Number.isFinite(row.amount) || !isRealIsoDate(row.date)
        || row.date < start || row.date > end || row.date > today) continue;
    const day = days.get(row.date) || { spent: 0, income: 0 };
    if (row.type === 'income') day.income += row.amount;
    else if (row.amount < 0 && !row.setAside) day.spent -= row.amount;
    days.set(row.date, day);
  }
  const points = [{ date: start, opening: true, observed: start <= today,
    spent: start <= today ? 0 : null, income: start <= today ? 0 : null, dailySpent: 0 }];
  let spent = 0, income = 0;
  for (let n = first; n <= last; n++) {
    const date = isoFromDayNumber(n), observed = date <= today;
    const day = days.get(date) || { spent: 0, income: 0 };
    spent += day.spent; income += day.income;
    if (!Number.isFinite(spent) || !Number.isFinite(income)) throw new Error('Daily trend amount overflow');
    points.push({ date, opening: false, observed, spent: observed ? roundCents(spent) : null,
      income: observed ? roundCents(income) : null, dailySpent: observed ? roundCents(day.spent) : null });
  }
  return points;
}

module.exports = { dailySpendingTrend };
