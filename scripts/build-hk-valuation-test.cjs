const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),cache=path.join(root,'.cache/robot/hk-nonbank');
const read=f=>JSON.parse(fs.readFileSync(path.join(cache,f),'utf8'));
const cutoff='2026-11-11';
const universe=[['601318','02318','中国平安'],['601628','02628','中国人寿'],['601601','02601','中国太保'],['600030','06030','中信证券'],['601688','06886','华泰证券'],['601211','02611','国泰海通']];
const fx=Object.entries(read('fx.json').rates).map(([d,r])=>[d,r.CNY]).sort();
const fxAt=d=>fx.findLast(r=>r[0]<=d)?.[1];
function corr(x,y){assert.equal(x.length,y.length);const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;const a=avg(x),b=avg(y);return x.reduce((s,v,i)=>s+(v-a)*(y[i]-b),0)/Math.sqrt(x.reduce((s,v)=>s+(v-a)**2,0)*y.reduce((s,v)=>s+(v-b)**2,0));}
function ranks(a){return a.map(v=>1+a.filter(x=>x<v).length+(a.filter(x=>x===v).length-1)/2);}
const spearman=(x,y)=>corr(ranks(x),ranks(y));
assert.ok(Math.abs(corr([1,2,3],[2,4,6])-1)<1e-12);
assert.ok(Math.abs(spearman([1,2,2,4],[8,6,6,2])+1)<1e-12);
const stocks=universe.map(([a,h,name])=>{
  const reports=read(a+'-long.json').result.data;
  const daily=read(h+'-day.json').data['hk'+h].day.filter(r=>r[0]<=cutoff);
  const month=[...new Map(daily.map(r=>[r[0].slice(0,7),r])).values()].filter(r=>r[0].slice(0,7)<'2026-11');
  const rows=month.map(r=>{
    const date=r[0], published=reports.filter(f=>f.NOTICE_DATE?.slice(0,10)<date);
    const f=published[0]; if(!f)return null;
    const period=f.REPORT_DATE.slice(0,10), year=Number(period.slice(0,4));
    const annual=published.find(x=>x.REPORT_DATE.startsWith((year-1)+'-12-31'));
    const prior=published.find(x=>x.REPORT_DATE.startsWith((year-1)+period.slice(4)));
    const profit=period.endsWith('12-31')?f.PARENTNETPROFIT:annual&&prior?annual.PARENTNETPROFIT+f.PARENTNETPROFIT-prior.PARENTNETPROFIT:null;
    const price=Number(r[2])*fxAt(date),eps=profit/f.TOTAL_SHARE;
    if(!(profit>0&&f.BPS>0&&price>0))return null;
    return {date,price,pe:price/eps,pb:price/f.BPS,period,notice:f.NOTICE_DATE.slice(0,10)};
  }).filter(Boolean);
  return {a,h,name,rows};
});
// Dates and constituents are identical for the two metrics and all windows.
const dates=stocks[0].rows.map(r=>r.date).filter(d=>stocks.every(s=>s.rows.some(r=>r.date===d)));
const aligned=stocks.map(s=>({...s,rows:dates.map(d=>s.rows.find(r=>r.date===d))}));
const result=[];
for(const [label,start] of [['近三年','2023-11-11'],['近五年可得样本','2021-11-11']]){
 for(const s of aligned){
   const rows=s.rows.filter(r=>r.date>=start);
   const forward=months=>rows.map(r=>{const y=Number(r.date.slice(0,4)),m=Number(r.date.slice(5,7))-1+months;const target=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);const next=s.rows.find(x=>x.date.startsWith(target));return next?{...r,ret:next.price/r.price-1}:null;}).filter(Boolean);
   const row={window:label,name:s.name,start:rows[0].date,end:rows.at(-1).date,n:rows.length,
    levelPE:corr(rows.map(r=>r.pe),rows.map(r=>r.price)),levelPB:corr(rows.map(r=>r.pb),rows.map(r=>r.price))};
   for(const m of [3,6]){const f=forward(m);row['n'+m]=f.length;row['pe'+m]=spearman(f.map(r=>r.pe),f.map(r=>r.ret));row['pb'+m]=spearman(f.map(r=>r.pb),f.map(r=>r.ret));}
   result.push(row);
 }
}
const out={cutoff,lastCompleteMonth:dates.at(-1),method:'Month-end raw HK close converted to CNY; positive TTM EPS and BPS; prior-day published reports only; Pearson price-level correlation; Spearman valuation vs forward raw-price returns, no dividends/costs; overlapping horizons; fixed survivors, restated financials, accounting and merger breaks.',stocks:aligned,results:result};
for(const r of result)for(const k of ['levelPE','levelPB','pe3','pb3','pe6','pb6'])assert.ok(Number.isFinite(r[k])&&Math.abs(r[k])<=1+1e-10);
fs.writeFileSync(path.join(root,'finance/sectors/data/hk-nonbank-valuation-test.json'),JSON.stringify(out,null,2)+'\n');
const f=x=>x.toFixed(3);
const table='<div class="table-scroll"><table><thead><tr>'+['窗口','公司','起止月末','样本数','股价与PE r','股价与PB r','PE→3月 ρ','PB→3月 ρ','PE→6月 ρ','PB→6月 ρ','3/6月有效对数'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+result.map(r=>'<tr>'+[r.window,r.name,r.start+' 至 '+r.end,r.n,...['levelPE','levelPB','pe3','pb3','pe6','pb6'].map(k=>f(r[k])),r.n3+' / '+r.n6].map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
fs.writeFileSync(path.join(root,'scripts/hk-valuation-test-table.html'),table+'\n');
console.log(JSON.stringify(result,null,2));
