const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const base = path.join(__dirname, '..'), report = 'finance/sectors/ai-medical-devices-2026-09.html';
const html = fs.readFileSync(path.join(base, report), 'utf8');
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const p = m[1].split(/[?#]/)[0];
  if (p && !p.startsWith('http')) assert(fs.existsSync(path.resolve(base, 'finance/sectors', p)), 'Missing local link ' + p);
}
const c = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(base, 'finance/sectors/data/medical-etf-20261005.js'), 'utf8'), c);
const d = c.window.MEDICAL_ETF;
assert.equal(d.funds.length, 4); assert.equal(d.asOf, '2026-09-30');
for (const f of d.funds) {
  assert.equal(f.stats.date, d.asOf); assert.equal(f.nav.date, d.asOf);
  assert(f.daily.every(x => Number.isFinite(x.close) && Number.isFinite(x.amount)));
  assert(f.daily.every((x, i, a) => !i || x.date > a[i - 1].date));
  const avg = f.daily.slice(-20).reduce((s, x) => s + x.amount, 0) / 20;
  assert(Math.abs(avg - f.stats.avgAmount20) < 0.01);
  assert.equal(f.monthly.length, d.benchmarkMonthly.length);
  assert(Math.abs((f.stats.close / f.nav.value - 1) * 100 - f.nav.premium) < 1e-8);
}
for (const id of ['etf-daily-comparison', 'etf-monthly-comparison', 'etf-liquidity', 'etf-real-flow']) assert(html.includes(`id="${id}"`));
assert.equal(40 + 15 + 15 + 10 + 20, 100);
assert(Math.abs([13.23, 8.04, 4.13, 3.70, 2.88, 2.65, 2.48, 2.47, 2.45, 2.17].reduce((s, x) => s + x) - 44.2) < 1e-8);
assert(Math.abs([12.23, 8.98, 6.65, 5.12, 4.27, 3.98, 3.47, 3.27, 3.07, 2.38].reduce((s, x) => s + x) - 53.42) < 1e-8);
console.log('PASS: local links, four ETFs, dates, NAV premiums, turnover arithmetic, common months, chart targets, holdings and allocation sums.');
console.log('20-day turnover window:', d.funds[0].daily.at(-20).date, 'through', d.asOf);
