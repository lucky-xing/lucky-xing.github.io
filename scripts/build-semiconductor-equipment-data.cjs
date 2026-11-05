const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const date = '2026-11-05';
const cache = path.join(root, '.cache/robot', date);
const universe = {
  '002371': '北方华创', '688012': '中微公司', '688072': '拓荆科技',
  '688120': '华海清科', '688082': '盛美上海', '688361': '中科飞测',
  '300604': '长川科技', '159516': '国泰半导体设备ETF',
  '159327': '万家半导体设备ETF', '000300': '沪深300'
};
const read = (code, key) => {
  try { return JSON.parse(fs.readFileSync(path.join(cache, code + '-' + key + '.json'))); }
  catch { return null; }
};
const avg = a => a.reduce((x,y) => x+y,0)/a.length;
const stats = daily => {
  const end = daily.at(-1).close;
  return {
    ret: [5,20,60].map(n => (end/daily.at(-n-1).close-1)*100),
    ma20: avg(daily.slice(-20).map(x=>x.close)),
    ma60: avg(daily.slice(-60).map(x=>x.close)),
    low: Math.min(...daily.slice(-60).map(x=>x.low)),
    high: Math.max(...daily.slice(-60).map(x=>x.high)),
    amount20: daily.slice(-20).every(x=>x.amount>0) ? avg(daily.slice(-20).map(x=>x.amount)) : null
  };
};
const rows = Object.entries(universe).map(([code,name]) => {
  const sym = (code.startsWith('6') || code==='000300'?'sh':'sz')+code;
  const day = read(code,'day').data[sym];
  const month = read(code,'month').data[sym];
  const quote = day.qt[sym];
  const series = (data, kind) => (data['qfq'+kind] || data[kind]).filter(v=>v[0]<=date)
    .map(v=>({date:v[0],close:+v[2],low:+v[4],high:+v[3],volume:+v[5]}));
  const history = (read(code,'prices')?.data?.klines || []).map(x => {
    const [date,,close,high,low,volume,amount]=x.split(',');
    return {date,close:+close,high:+high,low:+low,volume:+volume,amount:+amount};
  }).filter(x=>x.date<=date);
  const daily = history.slice(-250);
  assert.equal(daily.at(-1).date,date,code);
  assert(quote[30].startsWith(date.replaceAll('-','')),code+' quote date');
  assert.equal(daily.at(-1).close,+quote[3],code+' close');
  const flows=(read(code,'flow')?.data?.klines || []).map(x=>{
    const [date,net]=x.split(','); return {date,net:+net};
  }).filter(x=>x.date<=date).slice(-60);
  const finance=read(code,'finance')?.result?.data;
  const current=finance?.[0];
  const prior=finance?.find(x=>x.REPORT_DATE.startsWith('2025'+current.REPORT_DATE.slice(4,10)));
  const annual=finance?.find(x=>x.REPORT_DATE.startsWith('2025-12-31'));
  const cap=+quote[45]*1e8;
  const monthly=series(month,'month').filter(x=>x.date.slice(0,7)<date.slice(0,7));
  monthly.push(daily.at(-1));
  return {code,name,close:+quote[3],cap,daily,monthly,
    stats:stats(daily),flows,current,prior,annual};
});
const payload={date,rows};
fs.writeFileSync(path.join(root,'finance/sectors/data/semiconductor-equipment-20261105.js'),
  'window.SEMICONDUCTOR_EQUIPMENT = '+JSON.stringify(payload)+';\n');
for (const s of rows) {
  const f=s.current;
  console.log(s.code,s.close,s.cap/1e8,s.stats,s.flows.at(-1),
    f && [f.REPORT_DATE,f.TOTALOPERATEREVE/1e8,f.PARENTNETPROFIT/1e8,
      f.KCFJCXSYJLR/1e8,f.NETCASH_OPERATE_PK/1e8,f.KCFJCXSYJLRTZ,
      s.cap/(s.annual.PARENTNETPROFIT+f.PARENTNETPROFIT-s.prior.PARENTNETPROFIT)]);
}
