# Grocery analytics — Kelly Finance

The Russian-language «Продукты» page opens from the dashboard's category row or donut sector, and from the drawer. The header's period navigation applies to the page. «Все операции» opens the ordinary category-filtered transaction list.

## Data and reconciliation

The existing Markdown transactions remain the monetary source of truth. A purchase stays one transaction; its items are never added to transaction totals a second time.

Read-only companion files named `*.data.json` under the budget folder provide detail. Version 1 uses `schema_version: 1`, `money_unit: "kopecks"`, `currency`, optional `merchant`, a `products` dictionary and a `receipts` array. All monetary fields are nonnegative integer minor units. The legacy minor-unit name currently denotes a currency with two decimal places.

A receipt carries a unique `id`, ISO `date`, optional local `time`, `merchant`, `store`, `receipt_url`, `paid`, and `items`. Each item names a dictionary `product`, positive `quantity`, `unit` (`pcs`, `kg`, `g`, `ml`), `unit_price` and paid `line_total`. Item totals must add up to `paid`; discounts/points already allocated to lines are not subtracted again.

To associate a receipt with a transaction, include `ID: receipt-id.` in the transaction's Note. The date, negative amount and «Продукты» category must agree. Only transactions admitted by the budget ledger lens participate; exclusions, deleted transactions and accounts outside the budget cannot reappear via JSON. The file currency must agree with `Settings.md`'s explicit `currency_code`. Duplicate receipt IDs, invalid data and mismatches are disclosed on screen. Missing detail is a separate spending slice. Refunds are shown separately from purchase distributions.

Products carry `name`, a food-group `category`, optional `food: false`, and optional `pack_amount`/`pack_unit`. Packages of eggs can use `pack_amount: 10, pack_unit: "pcs"`. Do not turn eggs into grams or milk millilitres into grams without actual conversion data.

## Nutrition and qualitative groups

Optional `nutrition` stores `basis`, `unit`, `kcal`, `protein`, `fat`, `carbs`, source/provenance and a status such as `reference`. Values describe that stated basis, not necessarily 100 g. `null` means unknown, never zero. A purchased total is available only when all four nutrition values exist and its quantity unit matches the nutrition basis. Values remain estimates until checked against the actual label. Purchased totals are not a food-consumption diary.

Nutrition coverage is the share of food spending with a complete, quantity-scalable record, including unitemised food expenses in the unknown denominator and excluding known nonfood items. The macro chart uses 4/9/4 kcal per gram, not a claim that these coefficients reproduce every label exactly.

«Польза и умеренность» is an explicit qualitative grouping by product type, measured by spending. Vegetables, fruits, eggs and plain milk/kefir/curd are grouped as basic foods; sweets/snacks, processed meat and alcohol have distinct groups. Products requiring more composition information remain unassessed. It is not a medical rating or a claim about an overall diet.

## Price history

Price is sum of paid line amounts divided by total purchased quantity for that calendar month, after discounts. Since 0.3.1, icon buttons choose staple groups such as eggs, bananas, tomatoes, pork ham, pork neck, chicken breast, kefir, cream and butter. Brands and packs in a group are deliberately combined. An expandable list shows the product names included. Unknown recipes retain their own identity instead of being classified from a filling/flavour. `price_group` can explicitly name a group (`price_key` remains accepted); optional `price_icon` customises its icon.

Groups without quantity-backed purchases are disabled rather than assigned a made-up price. Changing a group or unit updates only the price panel; the surrounding page, icon picker and scroll position remain in place. A group containing both weight and volume presents a separate measure selector.

Grams, millilitres and pieces form separate series. Units can be displayed per 1, 100 or 1000 g/ml; pieces stay per piece. Months without purchases are gaps, not zero prices, and a percentage change is printed only against the immediately preceding month with observations. A single known month displays one point and a table, not an invented trend. These are prices of purchased product groups, not a fixed-basket inflation index: changing brands, varieties, egg sizes or fat contents can change the average too.
