from pathlib import Path
import json,re,datetime
d='2026-11-10'; day='2026-11-09'; p=Path('reports/2026')
def load(n): return json.loads((p/f'{d}-{n}.json').read_text(encoding='utf8'))
def bars(s):
 a=load(s+'-fallback')['data'][s]; return a.get('qfqday') or a['day']
def market(s):
 a=bars(s); x=a[-1]; assert x[0]==day
 return float(x[2]),100*(float(x[2])/float(a[-2][2])-1),float(x[5])
try: flows={(x['code'],x['kind']):x.get('latest') for x in load('eastmoney-evidence')}
except FileNotFoundError: flows={}
def flow(s):
 f=(flows.get((s[2:],'funds')) or '').split(',')
 return f'{float(f[1])/1e8:+.2f}' if f[0]==day else '缺失'
quotes={}
q=p/f'{d}-quotes.txt'
if q.exists():
 for sym,v in re.findall(r'v_(\w+)="([^"]+)"',q.read_text(encoding='utf8')):
  f=v.split('~')
  if len(f)>46 and f[30].startswith('20261109') and abs(float(f[3])-market(sym)[0])<0.0001:
   quotes[sym]=f
pool=['|代码|收盘（元）|日涨跌|较10/30涨跌|相对沪指（百分点）|成交量（手）|东方财富主力净额（亿元）|','|---|---|---|---|---|---|---|']
for item in load('market-evidence')[:22]:
 s=item['symbol']; c,g,v=market(s)
 prev=next(float(z[2]) for z in bars(s) if z[0]=='2026-10-30')
 pool.append(f'|{s[2:]}|{c:.2f}|{g:+.2f}%|{100*(c/prev-1):+.2f}%|{g-market("sh000001")[1]:+.2f}|{v:,.0f}|{flow(s)}|')
stats=['|标的|收盘/涨跌|成交量（手）|成交额（亿元）|换手率|前5日均量（手）/倍数|ATR14（元）|主力净额（亿元）|PE/PB|','|---|---|---|---|---|---|---|---|---|']
levels=[]; calc=[]
rat=['|标的/基准|基准价|每股风险/比例|一档收益/比例|二档收益/比例|毛比一档/二档/加权|净比一档/二档/加权|二元门槛一档/二档|','|---|---|---|---|---|---|---|---|']
for s,n in [('sh601398','工商银行'),('sz002463','沪电股份'),('sh600487','亨通光电')]:
 a=bars(s);c,g,v=market(s); x=a[-1]; f=quotes.get(s)
 avg=sum(float(y[5]) for y in a[-6:-1])/5
 atr=sum(max(float(y[3])-float(y[4]),abs(float(y[3])-float(z[2])),abs(float(y[4])-float(z[2]))) for z,y in zip(a[-15:-1],a[-14:]))/14
 kline=(flows.get((s[2:],'kline')) or '').split(',')
 assert kline[0]==day and abs(float(kline[2])-c)<0.011
 amount=f'{float(kline[6])/1e8:.2f}'
 turnover=kline[10]+'%'
 stats.append(f'|{n}|{c:.2f}/{g:+.2f}%|{v:,.0f}|{amount}|{turnover}|{avg:,.0f}/{v/avg:.2f}×|{atr:.2f}|{flow(s)}|{f[39]+"/"+f[46] if f else "缺失"}|')
 low=float(x[4]); high=float(x[3]); stop=round(low-.01,2)
 l=round(low+(high-low)*.40,2); u=round(low+(high-low)*.55,2)
 # Nearest printed highs from recent bars, not extrapolated resistance
 highs={float(y[3]):y[0] for y in a if float(y[3])>u}
 if len(highs)<2:
  levels.append(f'- **{n}**：11/9低点{low:.2f}元为支撑参考；样本中未验证两道历史压力，停止量化复核。'); continue
 t1,t2=sorted(highs)[:2]
 levels.append(f'- **{n}**：11/9低点{low:.2f}元为支撑参考；{highs[t1]}高点{t1:.3f}元、{highs[t2]}高点{t2:.3f}元为两道历史压力参考。纸面区间{l:.2f}–{u:.2f}元，价格失效{stop:.2f}元；两档各50%。')
 for name,b in [('中值',(l+u)/2),('上沿',u)]:
  r=b-stop; g1=t1-b; g2=t2-b; k=b*.002; G=[g1,g2,(g1+g2)/2]
  gross=[g/r for g in G]; net=[(g-k)/(r+k) for g in G]
  wins=[f'{100/(1+z):.2f}%' if z>0 else '不可达' for z in net[:2]]
  rr=lambda t:' / '.join(f'{z:.2f}:1' for z in t)
  rat.append(f'|{n}{name}|{b:.3f}|{r:.3f}/{r/b:.2%}|{g1:.3f}/{g1/b:.2%}|{g2:.3f}/{g2/b:.2%}|{rr(gross)}|{rr(net)}|{" / ".join(wins)}|')
  calc.append(dict(symbol=s,case=name,B=b,S=stop,T1=t1,T2=t2,risk=r,gross=gross,net=net,cost=k))
cut=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%H:%M')
title='每日盘前策略日报｜11月10日：美股反弹与油价下跌，晚间关注美国CPI'
digest='隔夜标普涨2.35%，布伦特跌5.85%，美国2年期收益率升至4.56%。今日验证科技修复广度及航油成本，晚间关注美国CPI。工行、沪电、亨通均为条件观察。'
body=(p/f'{d}.md').read_text(encoding='utf-8-sig')
body=body[body.index('## 01'):].rstrip()+'\n'
for k,v in dict(STATS='\n'.join(stats),POOL='\n'.join(pool),LEVELS='\n'.join(levels),RAT='\n'.join(rat),DIGEST=digest,CUT=cut,VIX='11/6官方收盘未核；11/5 CBOE收盘28.18（前一日）',BTC='截止时点报价未核').items():body=body.replace('{'+k+'}',v)
assert [int(x[3:5]) for x in body.splitlines() if re.match(r'^## \d\d',x)]==list(range(1,14))
(p/f'{d}.md').write_text(f'# {title}\n\n信息截止：北京时间 {d} {cut}。\n\n'+body,encoding='utf8')
(p/f'{d}-trade-calculations.json').write_text(json.dumps(calc,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
Path(f'finance/daily/data/{d}.json').write_text(json.dumps(dict(date=d,edition='每日财经',title=title,summary=digest,cutoff=f'{d} {cut}（北京时间）；补发，覆盖此前24小时；行情基准11/9',digest=digest,body=body),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(cut, len(calc))
