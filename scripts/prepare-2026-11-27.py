import json
from pathlib import Path
from statistics import mean
d='2026-11-27'
s='2026-11-26'
p=Path('reports/2026')
title='盘前财经策略日报｜11月27日：美股休市，油气走强但资金验证不足'
cutoff='北京时间2026-11-27 07:48，覆盖此前24小时，行情基准11/26。'
summary='美股感恩节休市，亚太局部修复。海油、石油、沪电列条件观察，最新油气资金缺失，零主动买入。'
def data(code,kind):
    if kind=='funds':
        f=p/f'{d}-{code}-eastmoney-funds.json'
        if not f.exists():return []
        raw=json.loads(f.read_text(encoding='utf8'))
        return [r.split(',') for r in (raw.get('data') or {}).get('klines',[]) if r[:10]<=s]
    sym=('sh' if code.startswith('6') else 'sz')+code
    raw=json.loads((p/f'{d}-{sym}-fallback.json').read_text(encoding='utf8'))['data'][sym]
    a=raw.get('qfqday') or raw.get('day')
    return [[x[0],x[1],x[2],x[3],x[4],x[5]] for x in a if x[0]<=s]
rows=[]
for code,name in [('600938','中国海油'),('601857','中国石油'),('002463','沪电股份')]:
    a=data(code,'kline')
    f=data(code,'funds')
    x=a[-1]
    assert x[0]==s and len(a)>=15
    atr=mean(max(float(j[3])-float(j[4]),abs(float(j[3])-float(i[2])),abs(float(j[4])-float(i[2]))) for i,j in zip(a[-15:-1],a[-14:]))
    low=min(a[-5:],key=lambda j:float(j[4]))
    high=max(a[-5:],key=lambda j:float(j[3]))
    flow=f'{float(f[-1][1])/1e8:+.2f}亿' if f and f[-1][0]==s else '待核'
    rows.append(f'|{name} {code}|{x[2]} / {(float(x[2])/float(a[-2][2])-1)*100:+.2f}%|{x[5]}手 / 待核|待核 / {float(x[5])/mean(float(j[5]) for j in a[-6:-1]):.2f}×|{atr:.2f}|{flow}|{low[0][5:]}低{low[4]} / {high[0][5:]}高{high[3]}|')
plan_rows=[]
calculations=[]
for code,name in [('600938','中国海油'),('601857','中国石油'),('002463','沪电股份')]:
    a=data(code,'kline')
    x=a[-1]
    low,high=float(x[4]),float(x[3])
    lo=round(low+0.40*(high-low),2)
    hi=round(low+0.55*(high-low),2)
    unique_levels={float(j[3]):j[0] for j in a[-20:] if float(j[3])>hi}
    levels=sorted(unique_levels.items())[:2]
    assert len(levels)==2
    targets=[round(v-0.01,2) for v,_ in levels]
    plan_rows.append(f'**{name}**，11/26纸面区间{lo:.2f}–{hi:.2f}，参考失效{low:.2f}。首档{targets[0]:.2f}（{levels[0][1]}高{levels[0][0]:.2f}前），二档{targets[1]:.2f}（{levels[1][1]}高{levels[1][0]:.2f}前）。')
    plan_rows.append('|基准|风险/风险率|首档空间/毛比/净比|二档空间/毛比/净比|加权毛比/净比|首/二档二元门槛|\n|---|---|---|---|---|---|')
    for label,buy in [('中值',(lo+hi)/2),('上沿',hi)]:
        risk=buy-low
        fee=buy*.002
        gain=[v-buy for v in targets]
        net=[(v-fee)/(risk+fee) for v in gain]
        weighted=mean(gain)
        plan_rows.append(f'|{label} {buy:.3f}|{risk:.3f}/{risk/buy:.2%}|{gain[0]/buy:.2%}/{gain[0]/risk:.2f}:1/{net[0]:.2f}:1|{gain[1]/buy:.2%}/{gain[1]/risk:.2f}:1/{net[1]:.2f}:1|{weighted/risk:.2f}:1/{(weighted-fee)/(risk+fee):.2f}:1|{(risk+fee)/(targets[0]-low):.2%}/{(risk+fee)/(targets[1]-low):.2%}|')
        calculations.append(dict(code=code,base=buy,stop=low,targets=targets,risk=risk,fee=fee,net_rr=net))
    plan_rows.append('')
(p/f'{d}-trade-calculations.json').write_text(json.dumps(calculations,ensure_ascii=False,indent=2),encoding='utf8')
body='''## 01｜今日结论

美国感恩节休市，海外新成交验证减少。国内油气走强和部分科技修复仅列观察，主动仓位0，不能用休市前价格当成新交易信号。

## 02｜昨日全球市场

11/26当地收盘，上证3476.88（+0.01%）、深成10084.04（−0.02%）、创业板2189.82（+0.29%）。恒指22226.88（+1.19%），恒科精确点位待核。日经57499.16（+0.86%），KOSPI4711.21（+0.29%）。美股休市，最近11/25道指50182.95、标普7182.78、纳指23585.80，对应当日+0.33%、−0.25%、−0.62%，并非26日涨跌。

## 03｜资产温度计

美国2Y/10Y现券休市，最新11/25精确报价待核。DXY、USD/CNY、黄金、WTI/Brent、VIX、BTC截止前统一报价仍有缺口。Reuters转载报道周三油价上涨，不能替代周四具体结算。

## 04｜核心市场主线

AP报道全球股票局部修复，美股休市使验证窗口缩短。Reuters转载报道炼厂遇袭与供给风险推升周三油价，国内石油、海油周四上涨，但当日资金接口未成功返回。原油价格预期经实现售价影响季度上游现金流，一体化炼化业务可能受成本反向影响。

## 05｜受益板块

上游油气（中低、观察）。地缘供给消息与国内海油+3.35%、石油+3.74%方向一致，但缺周四双油结算、海外能源新成交及本地当日资金验证，暂不列第一高确定性方向。季度受益取决于均价、产量、成本与税费，股价已部分反映供给预期。反向风险为谈判缓和及需求走弱，今天验证双油、上游行业广度和资金。

PCB待确认。沪电+2.01%、资金估算流入1.52亿，但美国休市无法增加行业外部验证。订单、排产与产品结构才决定利润，时间窗跨季度。今天看行业同刻量和客户指引。

估值与历史分位按采油中周期EV/EBITDA与现金流收益率、PCB经常性PE观察。缺行业加权成份、一次性损益及3/5/10年序列，同日估值待核。

## 06｜风险板块

燃油成本敏感环节（中低）。供给担忧若推升实现油价，可通过航油采购影响季度利润，套保、附加费和客座率可能抵消。缺当日航空行业成交验证，已计价程度未知，今天看油价与运输板块相对强度，若油价回吐则降低风险。

高波动科技（中低）。海外此前AI连续回撤，国内曙光−2.58%、三花−2.85%，与沪电上涨形成分化。估值波动先于订单变化，未核新增盈利损失。行业宽度改善及订单稳定可缓解。

## 07｜A股主板重点标的

按11/26腾讯完整日线重筛22只，东方财富资金缺项明确保留。茅台−0.40%、伊利−0.45%退出。海油连续第2期，石油和沪电重新入池首期，均中低置信度观察。000823涨7.51%只作强度对照，不因涨幅追买。

|标的|收盘/涨幅|成交量/额|换手/前5日均量倍数|ATR14 元|主力估计净额|最近5日参考低/高（元）|
|---|---|---|---|---|---|---|
{ROWS}

1. 中国海油，上游油气勘探开发生产商，实现售价、产量与单桶成本经季度销售决定现金流。地缘事件尚不能量化为每股收益，油价回吐和资本开支是风险。11/26涨3.35%，当日资金缺失，今日定位为上游对照。
2. 中国石油，一体化勘探开采、炼化与销售企业，上游与中下游对油价的敏感方向不同，季度应拆分分析。新增订单及利润金额未核，原油和炼化价差构成风险。11/26涨3.74%，当日资金缺失，定位为业务结构对照。
3. 沪电股份，高阶PCB制造商，处于芯片与服务器整机之间的互连制造环节。采购经交付和产品组合改善转成季度利润，扩产、客户集中、应收是风险。11/26涨2.01%、资金估算流入1.52亿，定位为科技局部修复观察。

腾讯前复权价格、全天量和ATR，资金为东方财富成交分类估算。成交额与换手待核。ATR14取TR简单平均，TR为高低差及高低与前收差绝对值最大值，均量剔除当日。

## 08｜交易策略

三股仓位0，以下为不触发买单的纸面诊断。区间取11/26振幅40%–55%，失效位用当日低点，仅为计算假设。目标取前20日区间上方最近两档不同历史高点前0.01元，历史高点不是预测，分档50%/50%。

{PLANS}

R=B−S，风险率R/B，空间=(T−B)/B，毛比=(T−B)/R。费滑点合计0.20%乘B，净比=(T−B−成本)/(R+成本)。加权用两目标均价，二元单档门槛=(R+成本)/(T−S)，不是预测胜率，不替代路径回测，脚本复核。

同序核实板块、同刻量和公告。小幅高开看回踩，明显高开到压力附近或极端跳空暂停，跌破参考低位且不能收回或逻辑失效则撤销。实际分批仓位及持有期待定。首个真实压力前净比不足2:1或数据核验不足，保持观察。A股T+1与跳空影响退出。

## 09｜今日情景推演

若原油和上游强度同时延续，保留观察。若仅个股冲高而资金不确认，降低置信度。若科技广度扩散，再核查沪电相对强度。

## 10｜今日交易清单

主动交易无。海油、石油、沪电条件观察。两只油气相关性较高，不能视为行业分散。

## 11｜开盘后验证

9:45与10:00比前5个完整交易日同刻累计量，分钟数据待核。检查公告、交易状态和复权口径，同步观察双油与PCB广度。

## 12｜市场叙事追踪

关注供给消息是否转成实物短缺、美国节后科技成交和国内政策生效后的实际交易变化。

## 13｜30秒速读版

{DIGEST}

## 昨日推荐复盘

11/26茅台−0.40%、伊利−0.45%、海油+3.35%。上期仅纸面诊断，无实盘成交，不计算策略收益。

## 数据与信息来源

[AP市场](https://apnews.com/article/320cd8c9c286a7773797bf2f478ef314)、[Reuters油价转载](https://www.brecorder.com/news/40450754/oil-prices-rise-over-1pc)、[亚太收盘](https://m.cngold.org/stock/xw10906330.html)、[腾讯](https://gu.qq.com/)、[东方财富](https://quote.eastmoney.com/)。原始与计算按11/27归档。

## 数据边界

北京时间11/27 07:48截止。跨资产、资金部分字段、海外行业量能、公告估值和分钟数据缺失，筛选限22只样本。
'''.replace('{PLANS}','\n'.join(plan_rows)).replace('{ROWS}','\n'.join(rows)).replace('{DIGEST}',summary)
assert [line[3:5] for line in body.splitlines() if line.startswith('## ')][:13]==[f'{i:02}' for i in range(1,14)]
(p/f'{d}.md').write_text(f'# {title}\n\n{cutoff}\n\n{body}',encoding='utf8')
Path(f'finance/daily/data/{d}.json').write_text(json.dumps(dict(date=d,edition='每日财经',title=title,summary=summary,digest=summary,cutoff=cutoff,body=body),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
with Path('reports/publish_log.md').open('a',encoding='utf8') as f:
    f.write(f'\n- {d}：盘前补刊，三股条件观察，零主动交易。https://lucky-xing.github.io/finance/daily/{d}.html\n')
