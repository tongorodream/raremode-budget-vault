'use strict';
const assert = require('assert');
const { stubObsidian, makeCtx, loadInto } = require('./helpers/harness.cjs');
stubObsidian();
const { categoryTrendScope } = require('../src/trend-scope');
const { dailySpendingTrend } = require('../src/daily-trend');
const { receiptForTransaction } = require('../src/groceries');
const B='Budget';
const table = rows => '---\naccount: Cash\nmonth: 2026-07\n---\n\n| Date | Description | Category | Amount | Excluded | Note |\n|---|---|---|---:|---|---|\n'+rows.map(r=>'| '+r.join(' | ')+' |').join('\n')+'\n';
const files = {
  [`${B}/Settings.md`]: '---\nmonth_start_day: 1\ncurrency: "₽"\ncurrency_code: RUB\ncountry: other\nlanguage: en\n---\n',
  [`${B}/Accounts/Cash.md`]: '---\ntype: cash\n---\n',
  [`${B}/Accounts/Euro.md`]: '---\ntype: checking\ncurrency: "€"\ncurrency_code: EUR\n---\n',
  [`${B}/Categories/Food.md`]: '---\ntype: food\n---\n',
  [`${B}/Categories/Health.md`]: '---\ntype: expense\n---\n',
  [`${B}/Categories/Rent.md`]: '---\ntype: expense\nassume_spent: true\n---\n',
  [`${B}/Budgets/2026-07.md`]: '---\nmonth: 2026-07\n---\n\n| Category | Type | Amount | Notes |\n|---|---|---:|---|\n| Food | food | 300 | |\n| Health | expense | 600 | |\n| Rent | expense | 2000 | |\n',
  [`${B}/Transactions/Cash/2026-07.md`]: table([
    ['2026-07-01','food','Food','-100','',''],['2026-07-02','refund','Food','20','',''],
    ['2026-07-03','health','Health','-250','',''],['2026-07-04','excluded','Food','-10','yes',''],
    ['2026-07-05','blank','','-17','',''],['2026-07-05','rent','Rent','-500','',''],
    ['2026-07-20','future food','Food','-500','',''],['2026-07-25','future rent','Rent','-500','',''],
  ]),
  [`${B}/Transactions/Euro/2026-07.md`]: table([['2026-07-03','foreign','Food','-1000','','']]),
};
(async()=>{
  const ctx=makeCtx(files);await loadInto(ctx);
  const food=categoryTrendScope(ctx,'2026-07','Food','2026-07-10');
  assert.strictEqual(food.spent,100,'gross recorded category spend is not reduced by refunds or enlarged by other categories/foreign/excluded/future rows');
  assert.strictEqual(food.budget,300);
  assert.strictEqual(food.income,0);
  const days=dailySpendingTrend({rows:food.rows,start:'2026-07-01',end:'2026-07-31',today:'2026-07-10'});
  assert.strictEqual(days[10].spent,100);
  assert.strictEqual(categoryTrendScope(ctx,'2026-07','__none__','2026-07-10').spent,17);
  const rent=categoryTrendScope(ctx,'2026-07','Rent','2026-07-10');
  assert.strictEqual(rent.spent,2000);
  assert.strictEqual(rent.assumed,1500,'undated provisions use the existing per-category oracle and the same date cutoff');
  assert.strictEqual(rent.budget,2000);

  const receipt={id:'test-receipt',date:'2026-07-01',currency:'RUB',paid:10000,receipt_url:'https://example.org/check',items:[
    {quantity:.4,unit:'kg',unit_price:20000,line_total:8000,detail:{name:'Бананы',category:'Фрукты'}},
    {kind:'delivery_fee',quantity:1,unit:'pcs',unit_price:2000,line_total:2000,detail:{name:'Доставка',category:'Непродовольственное',food:false}},
  ]};
  const index=new Map([[receipt.id,receipt]]),row={date:receipt.date,amount:-100,note:'Source. ID: test-receipt.',excluded:true};
  assert.strictEqual(receiptForTransaction(index,row,'RUB'),receipt,'an excluded transaction can disclose its source without re-entering budget totals');
  assert.strictEqual(receiptForTransaction(index,{...row,amount:-99},'RUB'),null);
  assert.strictEqual(receiptForTransaction(index,{...row,date:'2026-07-02'},'RUB'),null);
  assert.strictEqual(receiptForTransaction(index,row,'EUR'),null);
  assert.strictEqual(receiptForTransaction(index,{...row,note:''},'RUB'),null);
  const {makeDom}=require('./helpers/dom-stub.cjs');makeDom();
  const before=JSON.stringify(receipt);
  const panel=require('../src/receipt-detail')(receipt,n=>'₽ '+n.toFixed(2));
  assert.strictEqual(panel.querySelectorAll('.bv-receipt-item').length,2);
  assert(panel.textContent.includes('🍌') && panel.textContent.includes('🚚'));
  assert(panel.textContent.includes('80.00') && panel.textContent.includes('20.00') && panel.textContent.includes('100.00'));
  assert.strictEqual(JSON.stringify(receipt),before,'disclosure is read-only');
  console.log('PASS receipt and category trend — strict receipt identity, excluded-row read-only detail, item prices/icons, category budget isolation, gross spend and undated provisions');
})().catch(e=>{console.error(e);process.exit(1);});
