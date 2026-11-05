(() => {
  const {date, rows}=window.SEMICONDUCTOR_EQUIPMENT;
  const byCode=code=>rows.find(s=>s.code===code);
  const stocks=['002371','688012','688072','688120','688082','688361','300604'].map(byCode);
  const funds=['159516','159327'].map(byCode);
  const benchmark=byCode('000300');
  const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'—';
  const yi=x=>fmt(x/1e8);
  const pct=x=>fmt(x)+'%';
  const put=(id,html)=>document.getElementById(id).innerHTML=html;
  const table=(id,rs)=>put(id,rs.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join(''));
  const title=s=>s.name+' '+s.code;
  const colors=['#55d9c8','#ffd08a','#aaa9ff','#f7a4c0'];
  function chart(id, entries, label, source) {
    const dates=[...new Set(entries.flatMap(e=>e.points.map(p=>p[0])))].sort();
    const values=entries.flatMap(e=>e.points.map(p=>p[1]));
    const min=Math.min(...values),max=Math.max(...values);
    const pad=(max-min||1)*.08,lo=min-pad,hi=max+pad;
    const positions=new Map(dates.map((d,i)=>[d,68+i/(dates.length-1)*796]));
    const y=v=>22+(hi-v)/(hi-lo)*234;
    const grid=Array.from({length:5},(_,i)=>{
      const v=lo+(hi-lo)*i/4;
      return '<line x1="68" x2="864" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#ffffff28"/><text x="60" y="'+(y(v)+4)+'" text-anchor="end">'+fmt(v,1)+'</text>';
    });
    const ticks=[0,1,2,3].map(i=>{
      const d=dates[Math.round(i*(dates.length-1)/3)];
      return '<text x="'+positions.get(d)+'" y="287" text-anchor="'+['start','middle','middle','end'][i]+'">'+d+'</text>';
    });
    const lines=entries.map((e,i)=>'<polyline fill="none" stroke="'+colors[i]+'" stroke-width="2.4" points="'+e.points.map(([d,v])=>positions.get(d)+','+y(v)).join(' ')+'"/>');
    const legend=entries.map((e,i)=>'<span style="color:'+colors[i]+'">● '+e.name+'</span>').join('');
    put(id,'<div class="legend">'+legend+'</div><svg role="img" aria-label="'+label+'" viewBox="0 0 900 305">'+grid.join('')+ticks.join('')+lines.join('')+'</svg><p class="caption">'+dates[0]+' 至 '+dates.at(-1)+' · '+label+'。'+source+'。窄屏可横向滑动。</p>');
  }
  function price(id, group, key) {
    const month=key==='monthly';
    const dateKey=x=>month?x.date.slice(0,7):x.date;
    const maps=group.map(s=>new Map(s[key].map(x=>[dateKey(x),x])));
    const common=[...maps[0].keys()].filter(d=>maps.every(m=>m.has(d)));
    chart(id,group.map((s,i)=>({name:title(s),points:common.map(d=>{
      const x=maps[i].get(d);
      return [month?(d===date.slice(0,7)?date:d):d,100*x.close/maps[i].get(common[0]).close];
    })})),(month?'月频，最后一点为本月截至11/05':'日频')+'，共同起点100，前复权价格','东方财富日线、腾讯月线');
  }
  price('semi-day',[...funds,benchmark],'daily');
  price('semi-month',[...funds,benchmark],'monthly');
  price('semi-core',[...stocks.slice(0,3),benchmark],'daily');
  price('semi-core-month',[...stocks.slice(0,3),benchmark],'monthly');
  const benchMap=new Map(benchmark.daily.map(x=>[x.date,x.close]));
  chart('semi-relative',funds.map(s=>{
    const xs=s.daily.filter(x=>benchMap.has(x.date));
    const base=xs[0].close/benchMap.get(xs[0].date);
    return {name:title(s)+' / 沪深300',points:xs.map(x=>[x.date,100*x.close/benchMap.get(x.date)/base])};
  }),'日频相对强弱，共同起点100','东方财富前复权价格');
  chart('semi-turnover',funds.map(s=>({name:title(s),points:s.daily.filter(x=>x.amount>0).map(x=>[x.date,x.amount/1e8])})),
    '日成交额，亿元','东方财富');
  const flowSeries=s=>{
    let sum=0;
    return {name:title(s),points:s.flows.map(x=>[x.date,(sum+=x.net)/1e8])};
  };
  chart('semi-flow-stock',stocks.slice(0,3).map(flowSeries),'日频累计大单净额，亿元','东方财富大单和超大单估算，窗口起始前归零');
  chart('semi-flow-etf',funds.map(flowSeries),'日频累计大单净额，亿元','东方财富成交订单分类估算，一级市场申赎另列');
  const sampleDates=stocks[0].daily.map(x=>x.date).filter(d=>stocks.every(s=>s.daily.findIndex(x=>x.date===d)>=59));
  const breadth=sampleDates.map(d=>[d,stocks.filter(s=>{
    const i=s.daily.findIndex(x=>x.date===d);
    return s.daily[i].close>s.daily.slice(i-59,i+1).reduce((a,x)=>a+x.close,0)/60;
  }).length]);
  chart('semi-breadth',[{name:'七股样本高于各自MA60的家数',points:breadth}],'日频，家数','东方财富前复权日线计算');
  const pe=(s,key)=>s.cap/(s.annual[key]+s.current[key]-s.prior[key]);
  const ratio=x=>x>0?fmt(x,1):'不适用';
  table('semi-finance',stocks.map(s=>{
    const f=s.current;
    return [title(s),fmt(s.close),yi(s.cap),ratio(pe(s,'PARENTNETPROFIT')),ratio(pe(s,'KCFJCXSYJLR')),
      fmt(s.close/f.BPS),yi(f.TOTALOPERATEREVE)+' / '+pct(f.TOTALOPERATEREVETZ),
      yi(f.PARENTNETPROFIT),yi(f.KCFJCXSYJLR)+' / '+pct(f.KCFJCXSYJLRTZ),
      pct(f.XSMLL)+' / '+pct(f.PARENTNETPROFIT/f.TOTALOPERATEREVE*100),pct(f.ROEJQ),yi(f.NETCASH_OPERATE_PK),pct(f.ZCFZL)];
  }));
  table('semi-market',[...stocks,...funds,benchmark].map(s=>[title(s),fmt(s.close,3),...s.stats.ret.map(pct),
    fmt(s.stats.ret[2]-benchmark.stats.ret[2])+' pp',fmt(s.stats.ma20,3),fmt(s.stats.ma60,3),yi(s.stats.amount20)]));
  const sum=(s,n)=>s.flows.length>=n&&s.flows.at(-1)?.date===date?s.flows.slice(-n).reduce((a,x)=>a+x.net,0):NaN;
  table('semi-flows',[...stocks,...funds].map(s=>[title(s),...[5,20,60].map(n=>yi(sum(s,n))),s.flows.at(-1)?.date??'—'])
    .concat([['七股合计',...[5,20,60].map(n=>yi(stocks.reduce((a,s)=>a+sum(s,n),0))),date]]));
  const models=[
    ['002371',[60,85,110],[35,50,60]],
    ['688012',[19,30,43],[45,65,80]],
    ['688072',[11,18,28],[45,65,80]],
    ['300604',[16,25,34],[28,40,50]]
  ];
  table('semi-scenarios',models.map(([code,profit,multiple])=>{
    const s=byCode(code), shares=s.cap/s.close;
    const values=profit.map((p,i)=>p*1e8*multiple[i]/shares);
    const returns=values.map(v=>100*(v/s.close-1));
    return [title(s),...values.map((v,i)=>profit[i]+'亿 × '+multiple[i]+'倍 → '+fmt(v)+'元 / '+pct(returns[i])),
      pct(returns.reduce((a,v,i)=>a+v*[.3,.5,.2][i],0))];
  }));
  const plans=[
    ['002371',465,480,430,584,720,.003],
    ['300604',148,153,136,154,210,.003],
    ['159516',.460,.485,.413,.614,.799,.002],
    ['159327',.739,.780,.665,.987,1.280,.002]
  ];
  const calc=(e,stop,target,cost)=>[(target/e-1-cost)*100,(1-stop/e+cost)*100];
  table('semi-plans',plans.map(([code,lo,hi,stop,t1,t2,cost])=>{
    const s=byCode(code),mid=(lo+hi)/2;
    const reward=(entry,target)=>{const [r,l]=calc(entry,stop,target,cost);return r/l;};
    const [gain1,loss]=calc(mid,stop,t1,cost);
    const [gain2]=calc(mid,stop,t2,cost);
    return [title(s),s.close,lo+'–'+hi,stop,t1+' / '+t2,pct(gain1)+' / '+pct(gain2),pct(loss),
      fmt(reward(mid,t1))+' / '+fmt(reward(mid,t2)),
      [lo,hi].map(e=>fmt(reward(e,t1))+' / '+fmt(reward(e,t2))).join('；'),
      reward(mid,t1)<2?'观察，首目标盈亏比不足2':'等待，当前未触发'];
  }));

  const valuation=window.SEMICONDUCTOR_EQUIPMENT_VALUATION;
  if (!valuation || valuation.cutoff!==date) return;
  const metrics=[['pe',1,'等权PE（TTM）'],['pb',2,'等权PB（TTM）']];
  const valuationRows=[];
  valuation.windows.forEach((period,index)=>{
    const sample=valuation.rows.filter(([d])=>d>=period.start && d<=period.end);
    for (const [key,column,label] of metrics) {
      const summary=period[key];
      valuationRows.push([period.label,period.start+' 至 '+period.end,period.count,label,
        fmt(summary.current),pct(summary.percentile),...summary.levels.map(v=>fmt(v))]);
      const bands=summary.levels.map((level,i)=>({
        name:['20分位','历史中位数','80分位'][i]+' '+fmt(level)+'倍',
        points:sample.map(([d])=>[d,level])
      }));
      chart('semi-valuation-'+key+'-'+index,[
        {name:'931743 '+label,points:sample.map(row=>[row[0],row[column]])},
        ...bands
      ],period.label+' · 日频估值，倍','ETF.run等权序列，分位线按各窗口全样本计算');
    }
  });
  table('semi-valuation-percentiles',valuationRows);
})();
