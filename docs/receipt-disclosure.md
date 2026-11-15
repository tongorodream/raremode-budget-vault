# Inline receipt disclosure

Transactions whose Note contains a receipt ID can expand directly in the transaction list. The name is a real keyboard-operable button with `aria-expanded`; tapping noninteractive transaction cells is a pointer convenience. Category selectors, checkboxes, note editing, copy, split and delete retain their own actions.

Matching is strict: one known ID, the same calendar date, the same negative paid amount and the row's explicit currency scope. This read-only disclosure can also show the source for excluded transactions, without making them eligible for grocery/budget totals. Orphaned, amount/date-mismatched and foreign-currency references do not disclose an unrelated receipt.

The expanded panel is an eight-column spanning row next to its parent. It contains only presentation nodes: product icon, original name, purchased quantity × unit price, line total, paid total and source link. Delivery services use a truck icon and remain nonfood metadata. Expanding/collapsing never changes the ledger row or marks it dirty. Existing notes, including IDs and links, remain intact and editable inside a compact Note disclosure. Transactions lacking item data keep their existing note field.

## Category-scoped spending trend

`chartTrendCategory` remembers the selected expense category; empty means all categories and `__none__` means uncategorised. The choice applies to 1M daily/cumulative and longer period views. Existing budget ledger vetoes and date cutoffs apply. The category's own budget rows are passed to the existing budget-used oracle, so unrelated category budgets/undated provisions cannot enter the filtered figure.

Daily lines still show posted actual expenses, with any selected category's undated provision disclosed separately. Multi-period selected-category spending includes that category's provision, matching the existing longer-range budget-used reading. Global income is omitted for a single expense category. The normal all-category calculations remain unchanged.

The permanent chart legend, status subtitle and explanatory paragraphs are visually compacted/removed; accessible labels, tooltips and the actual mode/category/date controls remain. Category changes preserve chart scroll and focus. Expanded category/subcategory rows in the dashboard legend use an actual grid, with the child breakdown across both columns; the editable transaction disclosure has separate portrait/landscape row rules.
