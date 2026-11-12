const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const date = '2026-11-11';
const hk = path.join(root,'.cache/robot/hk-nonbank');
const cn = path.join(root,'.cache/robot',date);
const read = (dir,file) => JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
const cut = rows => rows.filter(row=>row[0]<=date);
const stats = rows => {
  const last=rows.at(-1)[1];
  return {close:last,ret:[5,20,60].map(n=>100*(last/rows.at(-n-1)[1]-1)),
    ma20:rows.slice(-20).reduce((a,r)=>a+r[1],0)/20,
    ma60:rows.slice(-60).reduce((a,r)=>a+r[1],0)/60};
};
const monthly = rows => [...new Map(rows.map(row=>[row[0].slice(0,7),row])).values()];
const fx = Object.entries(read(hk,'fx.json').rates).map(([d,r])=>[d,r.CNY]);
const fxAt = d => fx.findLast(row=>row[0]<=d)?.[1];
const twins = [
  ['601318','02318','中国平安'],['601628','02628','中国人寿'],['601601','02601','中国太保'],
  ['600030','06030','中信证券'],['601688','06886','华泰证券'],['601211','02611','国泰海通']
];
const cnDaily = code => cut(read(cn,code+'-prices.json').data.klines.map(x=>{
  const v=x.split(',');return [v[0],+v[2],+v[6],+v[4],+v[3]];
}));
const orderFlow = code => cut((read(cn,code+'-flow.json').data?.klines||[]).map(s=>{
  const r=s.split(',');return [r[0],+r[1]/1e8];
})).slice(-60);
const hkDaily = code => cut(read(hk,code+'-day.json').data['hk'+code].day.map(v=>[v[0],+v[2],+v[5],+v[4],+v[3]]));
const hkMonth = code => {
  const month=read(hk,code+'-month.json').data['hk'+code].month;
  return cut(month.map(v=>[v[0],+v[2]])).filter(r=>r[0].slice(0,7)!==date.slice(0,7))
    .concat([hkDaily(code).at(-1).slice(0,2)]);
};
const fundamentals=new Map();
const companies=twins.map(([a,h,name])=>{
  const reports=read(hk,a+'-long.json').result.data;
  fundamentals.set(h,reports);
  const f=reports[0], fy=reports.find(x=>x.REPORT_DATE.startsWith('2025-12-31'));
  const prior=reports.find(x=>x.REPORT_DATE.startsWith('2025-09-30'));
  const earnings=fy.PARENTNETPROFIT+f.PARENTNETPROFIT-prior.PARENTNETPROFIT;
  const hp=hkDaily(h).at(-1)[1], ap=cnDaily(a).at(-1)[1];
  const e=earnings/f.TOTAL_SHARE, converted=hp*fxAt(date);
  return {a,h,name,ap,hp,cap:converted*f.TOTAL_SHARE/1e8,ape:ap/e,hpe:converted/e,
    apb:ap/f.BPS,hpb:converted/f.BPS,discount:100*(converted/ap-1),
    earnings:earnings/1e8,profit:f.PARENTNETPROFIT/1e8,yoy:f.PARENTNETPROFITTZ,
    revenue:f.TOTALOPERATEREVE/1e8,roe:f.ROEJQ,bps:f.BPS,shares:f.TOTAL_SHARE,
    order:orderFlow(a)};
});
const names=Object.fromEntries(twins.map(([,h,n])=>[h,n+'H']));
Object.assign(names,{'00388':'香港交易所','01299':'友邦保险','02328':'中国财险','HSI':'恒生指数'});
const hkSeries=Object.entries(names).map(([code,name])=>{
  const all=hkDaily(code); assert.equal(all.at(-1)[0],date);
  return {code,name,daily:all.slice(-250),monthly:hkMonth(code),...stats(all)};
});
const official=read(hk,'perf.raw').data.map(row=>{
  const d=row.tradeDate.replace(/(\d{4})(\d\d)(\d\d)/,'$1-$2-$3');
  return [d,row.close,row.tradingValue,row.peg];
});
assert.equal(official.at(-1)[0],date);
const index={code:'931024',name:'中证港股通非银（港元）',daily:official.slice(-250),
  monthly:monthly(official),...stats(official)};
const funds=[['513750','广发港股通非银ETF'],['513190','华夏港股通金融ETF'],['000300','沪深300']].map(([code,name])=>{
  const all=cnDaily(code);
  assert.equal(all.at(-1)[0],date);
  const order=orderFlow(code);
  return {code,name,daily:all.slice(-250),monthly:monthly(all),order,...stats(all),
    amount:all.slice(-20).reduce((a,r)=>a+r[2],0)/20/1e8,
    low60:Math.min(...all.slice(-60).map(r=>r[3])),
    high60:Math.max(...all.slice(-60).map(r=>r[4]))};
});
const fundText=fs.readFileSync(path.join(hk,'fund.html'),'utf8').replaceAll('\\"','"');
const fundDaily=JSON.parse(fundText.match(/"recentDaily":(\[\{.*?\}\])/s)[1])
  .map(r=>({...r,date:new Date(r.tradeAt+8*3600000).toISOString().slice(0,10)}))
  .filter(r=>r.date<=date).sort((a,b)=>a.date.localeCompare(b.date));
assert.equal(fundDaily.at(-1).date,date);
const histories = twins.map(([,h])=>new Map(hkDaily(h).map(r=>[r[0],r[1]])));
const pb = [...histories[0].keys()].filter(d=>histories.every(m=>m.has(d)) && fxAt(d)).map(d=>{
  const multiples=twins.map(([,h],i)=>{
    // Exclude releases dated on the observation day, since some are after close.
    const f=fundamentals.get(h).find(r=>r.NOTICE_DATE?.slice(0,10)<d && r.BPS>0);
    return histories[i].get(d)*fxAt(d)/f.BPS;
  });
  return [d,multiples.reduce((a,v)=>a+v,0)/multiples.length];
});
const pe=official.filter(r=>r[3]>0).map(r=>[r[0],r[3]]);
const windows = rows => [
  ['近三年','2023-11-11'],['近五年','2021-11-11'],['全部可得','0000']
].map(([name,from])=>{
  const sample=rows.filter(r=>r[0]>=from);
  const values=sample.map(r=>r[1]).sort((a,b)=>a-b), latest=sample.at(-1)[1];
  const q=[.2,.5,.8].map(p=>values[Math.ceil(values.length*p)-1]);
  return {name,start:sample[0][0],count:sample.length,latest,pct:100*values.filter(x=>x<=latest).length/values.length,q};
});
let weights=[];
try { weights=read(hk,'weights.json').slice(1); } catch {}
const result={date,fx:fxAt(date),companies,hkSeries,index,funds,fundDaily,pe,pb,
  valuations:{pe:windows(pe),pb:windows(pb)},weights};
fs.writeFileSync(path.join(root,'finance/sectors/data/hk-connect-nonbank-20261111.js'),
  'window.HK_CONNECT_NONBANK = '+JSON.stringify(result)+';\n');
console.log(JSON.stringify({companies,valuation:result.valuations,index:stats(official),
  funds:funds.map(({daily,monthly,order,...r})=>r),fundRows:fundDaily.length,
  fundLast:fundDaily.at(-1),weights:weights.slice(0,4)},null,2));
