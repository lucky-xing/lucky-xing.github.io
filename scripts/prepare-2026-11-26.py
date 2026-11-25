import json
from pathlib import Path
from statistics import mean
d='2026-11-26'
s='2026-11-25'
p=Path('reports/2026')
title='盘前财经策略日报｜11月26日：亚洲科技再受压，消费与油气仅作防御观察'
cutoff='北京时间2026-11-26 07:48，覆盖此前24小时，行情基准11/25。'
summary='创业板跌4.19%、韩股跌6.16%，美股盘中急跌后收窄。茅台、伊利、海油列低置信度观察，前期科技及银行样本退出，零主动交易。'
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
for code,name in [('600519','贵州茅台'),('600887','伊利股份'),('600938','中国海油')]:
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
for code,name in [('600519','贵州茅台'),('600887','伊利股份'),('600938','中国海油')]:
    a=data(code,'kline')
    x=a[-1]
    low,high=float(x[4]),float(x[3])
    lo=round(low+0.40*(high-low),2)
    hi=round(low+0.55*(high-low),2)
    unique_levels={float(j[3]):j[0] for j in a[-20:] if float(j[3])>hi}
    levels=sorted(unique_levels.items())[:2]
    assert len(levels)==2
    targets=[round(v-0.01,2) for v,_ in levels]
    plan_rows.append(f'**{name}**，11/25纸面区间{lo:.2f}–{hi:.2f}，参考失效{low:.2f}。首档{targets[0]:.2f}（{levels[0][1]}高{levels[0][0]:.2f}前），二档{targets[1]:.2f}（{levels[1][1]}高{levels[1][0]:.2f}前）。')
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

亚洲科技再次承压，美股尾盘修复仍未确认持续趋势。主动仓位0。茅台、伊利、中国海油仅作低置信度对照，等待行业与量价核验。

## 02｜昨日全球市场

11/25当地收盘，上证3476.47（−2.03%）、深成10086.36（−3.24%）、创业板2183.58（−4.19%）。恒指21966.01（−1.14%）、恒科跌约2.56%（点位待核）。日经57011.62（−2.78%），KOSPI4697.51（−6.16%）。道指50182.95（+0.33%）、标普7182.78（−0.25%）、纳指23585.80（−0.62%）、罗素2000 2704.06（+0.71%）。标普盘中一度跌3.2%，收盘幅度不能代表全天风险。

## 03｜资产温度计

AP确认美债收益率下降，2Y/10Y精确收盘待核。DXY、USD/CNY、黄金、WTI/Brent、VIX及BTC缺本期统一口径时点数据。11/24的Brent88.78仅为旧值，不填作11/25报价。

## 04｜核心市场主线

美股AI连续第二日回撤，盘中修复与亚洲跌势形成时序差异。AP报道通胀和贸易政策担忧仍在，需求增长与估值风险需同时评估。国内样本科技价格和资金转弱，部分消费及油气相对抗跌，尚缺新增订单与利润确认。

## 05｜受益板块

暂无足够外部验证的第一受益方向。消费防御待确认，茅台、伊利收涨且资金估算净流入，但未核海外食品和白酒行业同口径成交。动销与成本改善若持续，才经毛利及回款转成季度利润，已反映程度未知，置信度低，今天看行业广度与渠道数据，若需求走弱或折扣加深则撤销。

油气待确认，海油上涨且资金流入，中国石油下跌，内部不一致。缺11/25双油结算及海外能源行业验证，不将地缘消息直接视为利润增量。

板块估值与历史分位以白酒、乳品、上游采油分别观察，适用经常性PE/自由现金流收益率及中周期EV/EBITDA。缺行业加权成份和3/5/10年同口径序列，同日估值待核。

## 06｜风险板块

高波动算力硬件（中等）。日韩、创业板和纳指下跌，沪电跌5.52%、亨通跌6.30%、东山跌3.99%，对应资金估算流出。短期估值收缩先反映，若资本开支缩减再经采购排产影响季度利润，未核新增订单损失。前期跌幅已较大，反弹也可能剧烈。看行业广度、客户指引及同刻量，若订单稳定且多市场修复则降级。

银行防御分化（中低）。农行小涨但资金估算流出，工行下跌且流出。持仓偏好改变不直接等于银行盈利恶化，需跟踪净息差和信用成本，海外同行量能缺失。今天观察是否持续，若资金回流则风险缓解。

## 07｜A股主板重点标的

重新比较22只11/25腾讯日线和东方财富资金。沪电−5.52%、流出3.22亿，农行+0.38%但流出1.09亿，工行−0.22%且流出3.02亿，均退出。以下为新入池首期的低置信度观察，未达主动交易标准。

|标的|收盘/涨幅|成交量/额|换手/前5日均量倍数|ATR14 元|主力估计净额|最近5日参考低/高（元）|
|---|---|---|---|---|---|---|
{ROWS}

1. 贵州茅台，高端白酒龙头，位于酿造、品牌与经销渠道环节。动销、批价和库存改善才能传至季度现金流，增量金额未核。估值需结合经常性利润与回款，需求走弱和渠道折扣为风险。11/25涨1.02%、资金估算流入3.55亿，定位为消费防御观察。
2. 伊利股份，全国性乳品加工品牌，连接原奶采购和终端渠道。原奶成本、销量、促销决定利润，季度兑现，未核增量盈利。需求和价格竞争为风险。11/25涨1.76%、资金估算流入0.64亿，定位为食品行业对照。
3. 中国海油，上游油气勘探开采企业，实现油价、产量、单桶成本和资本开支影响季度现金流。双油价格及公司新披露未核，无法量化受益。油价回吐和成本上升为风险。11/25涨0.71%、资金估算流入1.01亿，定位为油气对照。

价格和量来自腾讯前复权历史，资金来自东方财富成交分类估算。成交额换手待核，ATR14采用TR简单平均，TR为日高低差、高低与前收差三项绝对值最大值。均量剔除当日。

## 08｜交易策略

三股均仓位0，仅为不触发买单的纸面复核。区间按11/25日振幅40%–55%，失效位用当天低点，这是统一诊断假设。目标取前20日区间上方最近两档不同历史高点前0.01元，列明日期。历史高点不是预测，50%/50%仅为计算分段路径。

{PLANS}

R=B−S，风险率R/B，空间=(T−B)/B，毛比=(T−B)/R。费滑点往返假设0.20%乘B，净比=(T−B−成本)/(R+成本)。加权用两目标均价。单目标二元门槛=(R+成本)/(T−S)，不是预测胜率，不替代分批路径回测。脚本复核。

同序三股先验证行业广度和前5日同刻累计量。小幅高开看回踩，明显高开至历史压力附近或极端跳空暂停。跌破参考低位且不能收回、资金转弱或逻辑失效则撤销。实际分批仓位与持有期待定。首个真实压力前上沿净比未达2:1或量能催化不足时保持观察。T+1及跳空可能导致计划外损失。

## 09｜今日情景推演

若海外尾盘修复传到本地，观察上涨广度与成交是否同步改善。若只有权重反弹，维持条件观察。若科技继续放量走弱，降低风险敞口。

## 10｜今日交易清单

主动交易无。茅台、伊利、海油条件观察。上期三股退出重点名单，消费两股的相关性需合并考虑。

## 11｜开盘后验证

9:45与10:00比较前5个完整交易日同刻累计量，当前分钟历史待核。核实公告、停牌、风险警示和除权口径，再按实际价格重算。

## 12｜市场叙事追踪

跟踪通胀、贸易政策和科技资本开支，验证消费动销与原料成本是否改善，油气等双油价格确认。

## 13｜30秒速读版

{DIGEST}

## 昨日推荐复盘

11/25沪电−5.52%、农行+0.38%、工行−0.22%，为相邻前复权收盘计算的日涨跌。上期无执行成交，不计算策略收益。

## 数据与信息来源

[AP美股](https://apnews.com/article/94fdb0ecb060ec65c0b02879ce0d2d09)、[亚太收盘](https://m.cngold.org/stock/xw10903509.html)、[亚洲行情转述](https://dealcan.ca/article/df5588aa-1f05-43d8-a4ce-3a2dabaf7454)、[腾讯历史](https://gu.qq.com/)、[东方财富资金](https://quote.eastmoney.com/)。原始数据和计算按11/26归档。

## 数据边界

北京时间11/26 07:48截止。跨资产、外盘行业量能、最新公告估值、成交额换手及分钟量有缺口，候选限22只样本，纸面情景不触发交易。
'''.replace('{PLANS}','\n'.join(plan_rows)).replace('{ROWS}','\n'.join(rows)).replace('{DIGEST}',summary)
assert [line[3:5] for line in body.splitlines() if line.startswith('## ')][:13]==[f'{i:02}' for i in range(1,14)]
(p/f'{d}.md').write_text(f'# {title}\n\n{cutoff}\n\n{body}',encoding='utf8')
Path(f'finance/daily/data/{d}.json').write_text(json.dumps(dict(date=d,edition='每日财经',title=title,summary=summary,digest=summary,cutoff=cutoff,body=body),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
with Path('reports/publish_log.md').open('a',encoding='utf8') as f:
    f.write(f'\n- {d}：盘前补刊，三股条件观察，零主动交易。https://lucky-xing.github.io/finance/daily/{d}.html\n')
