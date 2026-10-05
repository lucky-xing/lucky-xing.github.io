const fs = require('fs'), path = require('path');
const asOf = '2026-09-30';
const universe = [
  ['159883', '医疗器械ETF永赢', '0.159883'],
  ['159898', '医疗器械ETF招商', '0.159898'],
  ['159797', '医疗器械ETF汇添富', '0.159797'],
  ['512170', '医疗ETF华宝', '1.512170'],
  ['000300', '沪深300', '1.000300']
];
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { Referer: 'https://fundf10.eastmoney.com/', 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw Error(r.status); return await r.json(); }
    catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 500)); }
  }
}
async function prices(id) {
  const j = await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${id}&klt=101&fqt=1&lmt=1600&end=20260930&fields1=f1,f2&fields2=f51,f52,f53,f54,f55,f56,f57`);
  if (!j.data?.klines?.length) throw Error('Missing prices ' + id);
  return j.data.klines.map(s => { const [date, open, close, high, low, volume, amount] = s.split(','); return { date, open: +open, close: +close, high: +high, low: +low, volume: +volume, amount: +amount }; }).filter(d => d.date <= asOf);
}
function stats(a, b) {
  const avg = v => v.reduce((s, n) => s + n, 0) / v.length;
  const last = a.at(-1), ret = n => (last.close / a.at(-1 - n).close - 1) * 100;
  const r = a.slice(-61).map((d, i, arr) => i ? Math.log(d.close / arr[i - 1].close) : null).filter(x => x !== null), mean = avg(r);
  let peak = 0, dd = 0; for (const d of a.slice(-250)) { peak = Math.max(peak, d.close); dd = Math.min(dd, (d.close / peak - 1) * 100); }
  return { date: last.date, close: last.close, ma20: avg(a.slice(-20).map(d => d.close)), ma60: avg(a.slice(-60).map(d => d.close)), avgAmount20: avg(a.slice(-20).map(d => d.amount)), avgAmount60: avg(a.slice(-60).map(d => d.amount)), ret20: ret(20), ret60: ret(60), ret250: ret(250), excess60: ret(60) - (b.at(-1).close / b.at(-61).close - 1) * 100, volatility60: Math.sqrt(avg(r.map(x => (x - mean) ** 2)) * 250) * 100, maxDrawdown250: dd };
}
async function main() {
  const raw = []; for (const [code, name, id] of universe) raw.push({ code, name, data: await prices(id) });
  const benchmark = raw.at(-1).data;
  const funds = [];
  for (const f of raw.slice(0, -1)) {
    let nav = null;
    try { const j = await get(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${f.code}&pageIndex=1&pageSize=2&startDate=${asOf}&endDate=${asOf}`); const d = j.Data?.LSJZList?.find(x => x.FSRQ === asOf); if (d) nav = { date: d.FSRQ, value: +d.DWJZ, premium: (f.data.at(-1).close / +d.DWJZ - 1) * 100 }; } catch (_) {}
    funds.push({ code: f.code, name: f.name, stats: stats(f.data, benchmark), nav, daily: f.data.filter(d => d.date >= '2025-09-30'), monthly: [...new Map(f.data.filter(d => d.date >= '2022-05-01').map(d => [d.date.slice(0, 7), d])).values()].map(d => ({ date: d.date, close: d.close })) });
  }
  const out = { asOf, generatedAt: new Date().toISOString(), source: 'Eastmoney public adjusted-price and historical-NAV APIs; returns use exchange close, not fund NAV; not total-return index.', funds, benchmark: benchmark.filter(d => d.date >= '2025-09-30'), benchmarkMonthly: [...new Map(benchmark.filter(d => d.date >= '2022-05-01').map(d => [d.date.slice(0, 7), d])).values()].map(d => ({ date: d.date, close: d.close })) };
  fs.writeFileSync(path.join(__dirname, '../finance/sectors/data/medical-etf-20261005.js'), 'window.MEDICAL_ETF=' + JSON.stringify(out) + ';\n');
  console.log(JSON.stringify(funds.map(f => ({ code: f.code, stats: f.stats, nav: f.nav })), null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
