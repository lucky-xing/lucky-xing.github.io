const fs = require('fs');
const path = require('path');

const base = 'https://push2his.eastmoney.com/api/qt/stock';
const fields1 = 'f1,f2,f3,f4,f5,f6';
const fields2 = 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61';

async function json(url) {
  const res = await fetch(url, { headers: { Referer: 'https://quote.eastmoney.com/' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function klines(secid, limit = 2000) {
  const url = `${base}/kline/get?secid=${secid}&klt=101&fqt=1&lmt=${limit}&end=20500101&fields1=${fields1}&fields2=${fields2}`;
  const payload = await json(url);
  if (!payload.data?.klines) throw new Error(`No kline data for ${secid}`);
  return payload.data.klines.map((row) => {
    const [date, open, close, high, low, volume, amount] = row.split(',');
    return { date, open: +open, close: +close, high: +high, low: +low, volume: +volume, amount: +amount };
  });
}

async function flows(secid, limit = 120) {
  const url = `${base}/fflow/kline/get?lmt=${limit}&klt=101&secid=${secid}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63`;
  const payload = await json(url);
  if (!payload.data?.klines) return [];
  return payload.data.klines.map((row) => {
    const [date, main, small, medium, large, extraLarge] = row.split(',');
    return { date, main: +main, small: +small, medium: +medium, large: +large, extraLarge: +extraLarge };
  });
}

function monthly(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([month, values]) => ({
    month,
    open: values[0].open,
    close: values.at(-1).close,
    high: Math.max(...values.map((d) => d.high)),
    low: Math.min(...values.map((d) => d.low)),
    amount: values.reduce((sum, d) => sum + d.amount, 0)
  }));
}

function sliceFrom(rows, date) { return rows.filter((d) => d.date >= date); }

async function main() {
  const [drug, csi300, flow] = await Promise.all([
    klines('1.515120'),
    klines('1.000300'),
    flows('1.515120')
  ]);
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'Eastmoney public quote API; fund flow is provider-estimated order-flow, not ETF subscription/redemption cash flow.',
    proxy: '515120.SH (广发中证创新药产业ETF, tracking 931152.CSI)',
    benchmark: '000300.SH (CSI 300)',
    daily: { drug: sliceFrom(drug, '2025-09-01'), csi300: sliceFrom(csi300, '2025-09-01') },
    monthly: { drug: monthly(sliceFrom(drug, '2021-01-01')), csi300: monthly(sliceFrom(csi300, '2021-01-01')) },
    flow
  };
  const destination = path.join(__dirname, '..', 'finance', 'sectors', 'data', 'innovative-drugs-market.js');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, `window.INNOVATIVE_DRUG_MARKET=${JSON.stringify(output)};\n`, 'utf8');
  console.log(`Wrote ${destination}: ${output.daily.drug.length} daily, ${output.monthly.drug.length} monthly, ${flow.length} flow rows`);
}

main().catch((error) => { console.error(error); process.exit(1); });
