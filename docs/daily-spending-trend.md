# Daily spending trend — Kelly Finance 0.3.2

**1M** on the Dashboard plots recorded expenses cumulatively by day, within the budget period selected by the header. For a calendar-month budget this is the selected month. A non-monthly pay cycle uses its actual boundaries and labels the control **1P**, rather than claiming seven days are a month.

The line starts at zero before the first day's spending. Each dated expense adds to it; a day without an expense stays flat. The tooltip and keyboard focus show both accumulated spending and the amount posted on that day. Future dates keep their positions on the axis but have no recorded expense/income points, so the unfinished month is not extended as a flat forecast.

The budget limit is horizontal, when a spending budget exists. Income is accumulated by day as context. The ledger's existing BUDGET exclusions still apply (excluded entries, non-budget/foreign accounts, earmarked outflows and transfers). Savings/investment allocations are excluded from this expense line. Refunds are not subtracted from gross recorded expenses, matching the period budget-used numerator's posted-spending component.

Undated assume-spent provisions are disclosed separately; they are not invented as transactions on the first or last day. Therefore the last recorded point agrees with `budgetUsed(period).spent - budgetUsed(period).assumed`, not with a numerator that includes an undated provision. Data is limited to recorded transactions, not a claim that a partial import covers all actual spending.

`chartTrendRange` defaults to `1m`. `chartTrendDefaultVersion: 1` marks the new default. On the first load of an older settings file, the in-memory range becomes `1m`; subsequent normal settings saves persist the marker. A later explicit range choice is retained across reloads. Loading does not perform an extra settings write. Multi-period ranges retain their previous calculations and historical-gap behaviour.
