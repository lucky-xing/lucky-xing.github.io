(() => {
  const d=window.HK_CONNECT_NONBANK;
  const f=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—';
  const percent=x=>f(x)+'%';
  const byCode=code=>[d.index,...d.hkSeries,...d.funds].find(s=>s.code===code);
  const put=(id,html)=>document.getElementById(id).innerHTML=html;
  const table=(id,rows)=>put(id,rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join(''));
  const sum=(rows,n,field)=>rows.length>=n ? rows.slice(-n).reduce((s,r)=>s+field(r),0) : NaN;
  const colors=['#55d9c8','#ffd08a','#aaa9ff','#f7a4c0'];
  function chart(id, series, unit, source) {
    const days=[...new Set(series.flatMap(s=>s.rows.map(r=>r[0])))].sort();
    const values=series.flatMap(s=>s.rows.map(r=>r[1]));
    const min=Math.min(...values),max=Math.max(...values),pad=(max-min||1)*.08;
    const x=i=>70+795*i/(days.length-1);
    const y=v=>25+225*(max+pad-v)/(max-min+2*pad);
    const positions=new Map(days.map((date,i)=>[date,x(i)]));
    const grid=Array.from({length:5},(_,i)=>{
      const val=min+(max-min)*i/4;
      return '<line x1="70" x2="865" y1="'+y(val)+'" y2="'+y(val)+'" stroke="#ffffff24"/><text x="62" y="'+(y(val)+4)+'" text-anchor="end">'+f(val)+'</text>';
    });
    const ticks=[0,1,2,3].map(i=>{
      const idx=Math.round(i*(days.length-1)/3);
      return '<text x="'+x(idx)+'" y="281" text-anchor="'+['start','middle','middle','end'][i]+'">'+days[idx]+'</text>';
    });
    const lines=series.map((s,i)=>'<polyline fill="none" stroke="'+colors[i]+'" stroke-width="2" points="'+s.rows.map(([day,v])=>positions.get(day)+','+y(v)).join(' ')+'"/>');
    const legend=series.map((s,i)=>'<span style="color:'+colors[i]+'">● '+s.name+'</span>').join('');
    put(id,'<div class="legend">'+legend+'</div><svg role="img" aria-label="'+unit+'" viewBox="0 0 900 300">'+grid.join('')+ticks.join('')+lines.join('')+'</svg><p class="caption">'+days[0]+' 至 '+days.at(-1)+' · '+unit+'。'+source+'。窄屏可横向滑动。</p>');
  }
  function normalized(id,codes,frequency) {
    const group=codes.map(byCode), month=frequency==='monthly';
    const maps=group.map(s=>new Map(s[frequency].map(r=>[month?r[0].slice(0,7):r[0],r[1]])));
    const dates=[...maps[0].keys()].filter(k=>maps.every(m=>m.has(k)));
    chart(id,group.map((s,i)=>({name:s.name,rows:dates.map(k=>[k,100*maps[i].get(k)/maps[i].get(dates[0])])})),
      (month?'月频，11月为未完月':'日频')+'，共同起点100，价格走势','中证指数、腾讯港股、东方财富ETF/A股');
  }
  normalized('hk-daily',['931024','HSI'],'daily');
  normalized('hk-month',['931024','HSI'],'monthly');
  normalized('hk-etf',['513750','513190','000300'],'daily');
  normalized('hk-etf-month',['513750','513190','000300'],'monthly');
  normalized('hk-companies',['02318','02601','01299','00388'],'daily');
  const hsi=new Map(byCode('HSI').daily.map(r=>[r[0],r[1]]));
  const aligned=d.index.daily.filter(r=>hsi.has(r[0]));
  const ratio=aligned[0][1]/hsi.get(aligned[0][0]);
  chart('hk-relative',[{name:'931024 / 恒生指数',rows:aligned.map(r=>[r[0],100*r[1]/hsi.get(r[0])/ratio])}],
    '港元价格相对强弱，起点100','中证指数及腾讯');
  const cumulative=(rows,field)=>{let total=0;return rows.map(r=>[r.date||r[0],(total+=field(r))]);};
  const units=d.fundDaily.slice(-60);
  chart('hk-units',[{name:'513750流通份额',rows:units.map(r=>[r.date,r.shares/1e8])}],'基金份额，亿份','ETF.run日份额整理');
  chart('hk-subscription',[{name:'513750累计净申赎估算',rows:cumulative(units,r=>r.netSubscriptionAmount/1e8)}],
    '近60日累计，亿元','ETF.run按份额变化及当日净值估算');
  chart('hk-turnover',[{name:'931024成分股成交',rows:d.index.daily.map(r=>[r[0],r[2]])}],
    '港元指数成分成交，亿港元','中证指数');
  chart('hk-order',[{name:'513750累计大单净额',rows:cumulative(byCode('513750').order,r=>r[1])}],
    '累计成交分类净额，亿元','东方财富大单和超大单代理');
  const valuationRows=[];
  const metrics=[['pe','931024接口估值（PE参考）'],['pb','六股H股等权PB']];
  for (const [key,label] of metrics) {
    d.valuations[key].forEach((w,i)=>{
      valuationRows.push([label,w.name,w.start,w.count,f(w.latest,3),percent(w.pct),...w.q.map(x=>f(x,3))]);
      const sample=d[key].filter(r=>r[0]>=w.start);
      const bands=w.q.map((v,j)=>({name:['20分位','中位数','80分位'][j]+' '+f(v,3),rows:sample.map(r=>[r[0],v])}));
      chart('hk-'+key+'-'+i,[{name:label,rows:sample},...bands],w.name+' · 日频估值，倍',
        key==='pe'?'中证指数行情接口 peg 字段':'港股收盘、已披露每股净资产、Frankfurter HKD/CNY');
    });
  }
  table('hk-valuations',valuationRows);
  table('hk-weights',d.weights.slice().sort((a,b)=>b[9]-a[9]).slice(0,10)
    .map(r=>[r[4],r[5],percent(r[9])]));
  table('hk-ah',d.companies.map(c=>[c.name,c.a+' / '+c.h,f(c.ap),f(c.hp),f(c.cap,0),
    f(c.ape)+' / '+f(c.hpe),f(c.apb)+' / '+f(c.hpb),percent(c.discount),
    f(c.profit)+' / '+percent(c.yoy),percent(c.roe)]));
  table('hk-market',[d.index,...d.hkSeries.filter(s=>s.code!=='03988'),...d.funds]
    .map(s=>[s.name,f(s.close,3),...s.ret.map(percent),f(s.ma20,3),f(s.ma60,3)]));
  table('hk-flow', [5,20,60].map(n=>[n+'日',d.fundDaily.at(-n).date,d.date,
    f(sum(d.fundDaily,n,r=>r.netSubscriptionShares)/1e8,3),
    f(sum(d.fundDaily,n,r=>r.netSubscriptionAmount)/1e8,3),
    f(sum(byCode('513750').order,n,r=>r[1]),3)]));
  table('hk-a-flow',d.companies.map(c=>[c.name+' '+c.a,...[5,20,60].map(n=>f(sum(c.order,n,r=>r[1])))]));
  const plans=[
    ['513750','513750 广发港股通非银ETF',1.31,1.34,1.25,1.49,1.62,.002],
    ['02601','02601 中国太保H',24,25,22.5,30,35,.006],
    ['06886','06886 华泰证券H',13,13.6,12.1,16.2,18.4,.006],
    ['601601','601601 中国太保A',27.8,29,25.9,34.5,38.5,.003],
    ['00388','00388 香港交易所',340,350,320,408,450,.006]
  ];
  table('hk-plans',plans.map(([code,name,low,high,stop,t1,t2,cost])=>{
    const close=byCode(code)?.close ?? d.companies.find(s=>s.a===code).ap;
    const mid=(low+high)/2;
    const loss=e=>1-stop/e+cost;
    const gain=(e,t)=>t/e-1-cost;
    const rr=e=>[t1,t2].map(t=>f(gain(e,t)/loss(e))).join(' / ');
    return [name,close,low+'–'+high,stop,t1+' / '+t2,
      [t1,t2].map(t=>percent(100*gain(mid,t))).join(' / '),percent(100*loss(mid)),
      rr(mid),rr(low)+' ｜ '+rr(high)];
  }));
})();
