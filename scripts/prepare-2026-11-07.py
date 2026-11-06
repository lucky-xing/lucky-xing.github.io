from pathlib import Path
import json,re,datetime
d='2026-11-07'; day='2026-11-06'; p=Path('reports/2026')
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
  if len(f)>46 and f[30].startswith('20261106') and abs(float(f[3])-market(sym)[0])<0.0001:
   quotes[sym]=f
pool=['|代码|收盘（元）|日涨跌|相对沪指（百分点）|成交量（手）|东方财富主力净额（亿元）|','|---|---|---|---|---|---|']
for item in load('market-evidence')[:22]:
 s=item['symbol']; c,g,v=market(s)
 pool.append(f'|{s[2:]}|{c:.2f}|{g:+.2f}%|{g-market("sh000001")[1]:+.2f}|{v:,.0f}|{flow(s)}|')
stats=['|标的|收盘/涨跌|成交量（手）|成交额（亿元）|换手率|前5日均量（手）/倍数|ATR14（元）|主力净额（亿元）|PE/PB|','|---|---|---|---|---|---|---|---|---|']
levels=[]; calc=[]
rat=['|标的/基准|基准价|每股风险/比例|一档收益/比例|二档收益/比例|毛比一档/二档/加权|净比一档/二档/加权|二元门槛一档/二档|','|---|---|---|---|---|---|---|---|']
for s,n in [('sh601398','工商银行'),('sh600887','伊利股份'),('sh600276','恒瑞医药')]:
 a=bars(s);c,g,v=market(s); x=a[-1]; f=quotes.get(s)
 avg=sum(float(y[5]) for y in a[-6:-1])/5
 atr=sum(max(float(y[3])-float(y[4]),abs(float(y[3])-float(z[2])),abs(float(y[4])-float(z[2]))) for z,y in zip(a[-15:-1],a[-14:]))/14
 amount=f'{int(f[35].split("/")[2])/1e8:.2f}' if f else '缺失'
 stats.append(f'|{n}|{c:.2f}/{g:+.2f}%|{v:,.0f}|{amount}|{f[38]+"%" if f else "缺失"}|{avg:,.0f}/{v/avg:.2f}×|{atr:.2f}|{flow(s)}|{f[39]+"/"+f[46] if f else "缺失"}|')
 low=float(x[4]); high=float(x[3]); stop=round(low-.01,2)
 l=round(low+(high-low)*.40,2); u=round(low+(high-low)*.55,2)
 # Nearest printed highs from recent bars, not extrapolated resistance
 highs={float(y[3]):y[0] for y in a if float(y[3])>u}
 if len(highs)<2:
  levels.append(f'- **{n}**：11/6低点{low:.2f}元为支撑参考；样本中未验证两道历史压力，停止量化复核。'); continue
 t1,t2=sorted(highs)[:2]
 levels.append(f'- **{n}**：11/6低点{low:.2f}元为支撑参考；{highs[t1]}高点{t1:.2f}元、{highs[t2]}高点{t2:.2f}元为两道历史压力参考。纸面区间{l:.2f}–{u:.2f}元，价格失效{stop:.2f}元；两档各50%。')
 for name,b in [('中值',(l+u)/2),('上沿',u)]:
  r=b-stop; g1=t1-b; g2=t2-b; k=b*.002; G=[g1,g2,(g1+g2)/2]
  gross=[g/r for g in G]; net=[(g-k)/(r+k) for g in G]
  wins=[f'{100/(1+z):.2f}%' if z>0 else '不可达' for z in net[:2]]
  rr=lambda t:' / '.join(f'{z:.2f}:1' for z in t)
  rat.append(f'|{n}{name}|{b:.3f}|{r:.3f}/{r/b:.2%}|{g1:.3f}/{g1/b:.2%}|{g2:.3f}/{g2/b:.2%}|{rr(gross)}|{rr(net)}|{" / ".join(wins)}|')
  calc.append(dict(symbol=s,case=name,B=b,S=stop,T1=t1,T2=t2,risk=r,gross=gross,net=net,cost=k))
cut=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime('%H:%M')
title='每日盘前策略日报｜11月7日：美股科技反弹，亚太修复仍待验证'
digest='周五日韩股市均跌约6%，A股创业板跌3.96%，随后纳指反弹1.09%。美国10月新增非农16.5万人，10年美债收益率回升至约4.86%。周六休市，工商银行、伊利股份、恒瑞医药列入复核，零可执行买单。'
body="""## 01｜今日结论

周五亚洲市场先经历科技抛售，随后美国科技股反弹。两地交易时段错开，周一要验证的是反弹能否扩散到亚洲和A股的成交广度。休市期间零可执行买单。银行、乳业、创新药个股仅作为相对强度观察样本。

## 02｜昨日全球市场

|市场|11/6当地收盘|
|---|---|
|A股|上证 3649.18（−1.10%）；深成指 11175.78（−2.57%）；创业板 2465.23（−3.96%）|
|港股|恒指 24481.86（−1.27%）；恒生科技 4078.23（−1.83%）|
|日本|日经225 57434.77（−5.96%）；东证 3707.99（−5.90%）|
|韩国|KOSPI 5059.69（−6.02%），盘中触发熔断；KOSDAQ精确收盘待核|
|美国|道指 51285.73（−0.46%）；标普500 7376.86（+0.31%）；纳指 24579.42（+1.09%）；罗素2000 2754.11（+0.89%）|

A股按东方财富全市场口径成交约1.67万亿元，较周四少4635亿元，超过4700只个股下跌。指数收盘高于早盘低点，广度和成交仍不足以确认企稳。

## 03｜资产温度计

|资产|11/6当地交易日口径|
|---|---|
|美债2Y / 10Y|2Y收盘待核；10Y约4.86%，前值约4.84%（AP）|
|DXY / USD/CNY|当日同口径收盘待核，未以离岸汇率替代|
|黄金|11/6正式结算未核，未用盘中值替代|
|WTI / Brent|12月WTI 90.83美元/桶（约+0.34%）；次年1月Brent 98.32美元/桶（前值98.29），均为媒体转述结算|
|VIX|{VIX}|
|BTC|{BTC}|

## 04｜核心市场主线

1. **宏观事实**：美国劳工统计局公布10月新增非农16.5万人；10年期美债收益率随后的市场报价高于周四。推断：就业韧性有利于需求预期，但收益率上行对高估值股票形成约束。尚不能据此推断下一次利率决定。
2. **产业事实**：英伟达周五涨2.8%，此前两日分别跌3.2%与9.3%；日韩半导体相关权重在亚洲时段承压，恒生科技也下跌。推断：美国反弹降低单边下跌压力；资金流和新的服务器、光模块订单未核实。
3. **地缘与商品**：原油周五微涨、Brent周度跌逾13%。市场在重新估算冲突与供应中断概率，周度油价回落尚未等同于实际运费、保险费和到岸采购价下降。
4. **公司证据**：恒瑞三季报显示前三季营收同比增5.26%、归母净利润增20.38%。这是利润基线，和本轮美债利率或科技情绪没有直接传导。

## 05｜受益板块

- **油价回落对航空成本的潜在缓冲（中低置信、观察）**。直接证据是Brent周度下跌，周五微升形成反向提醒。若航油采购价同步回落，经过库存、套保和采购周期，国内航司单位成本可能在数周至一季改善。美港航司同日成交与资金、国内实际采购价未核，已反映程度无法量化。油价反弹、人民币走弱、客公里收益下降均可抵消。下个交易日对照国际航油裂解价差、汇率和航司相对沪深300的量价。
- **银行、乳业的相对防御（低置信、待确认）**。周五A股缩量下跌时，工行和伊利逆势收涨，海外尚未取得同口径板块成交和资金来确认共振。若资金继续偏好盈利波动较低的资产，可能有数日相对收益；这不是利率直接提升净息差或消费提速的证据。周一看上涨家数、同刻量；中期看银行净息差、乳品折扣和原奶成本。周五相对强势已有部分价格体现。

## 06｜风险板块

- **高估值算力硬件及光通信（中等置信）**。日韩科技股承压，港科走弱；A股样本中亨通光电跌6.43%、长飞光纤跌8.69%。从海外资本开支预期到国内光器件和PCB利润，中间还需验证项目进度、订单、交货与毛利。高利率放大估值弹性。英伟达隔夜反弹构成反向证据，短线风险已部分定价，订单下修未证实。窗口为下周初至下一轮订单披露，验证日韩芯片、恒科及A股硬件板块广度、同刻量与新公告。
- **上游油气（中低置信）**。Brent周度回落压低短期实现油价预期，若持续数周才可能传至上游利润。周五油价微涨、中国石油涨1.28%及中国海油涨0.97%与周度油价方向不一致，故不据此判断行业即将普跌。监测远近月价差、运输中断和套保披露。

## 07｜A股主板重点标的

按11/6新筛22只沪深主板样本，优先比较行业内的相对强弱、成交和基本面。周六均休市，以下为下个交易日前的观察顺序。

1. **工商银行 601398｜新增观察，中低置信。** 大型商业银行，主营公司及个人银行和金融市场业务，处于信贷与结算中枢。风险偏好下滑时可能出现防御溢价，短线看相对强弱；利润看数季净息差、拨备和信贷成本。周五涨幅高于同池农行、招行。国内外收益率上行不可直接外推净息差改善，实际估值与量价见表。
2. **伊利股份 600887｜新增观察，低置信。** 全国性乳企，连接上游原奶采购、中游加工与下游零售。若原奶成本和促销同步温和，利润率可能在一至两个财季改善，本期无新增采购价或订单证据。周五相对强于同池白酒样本，需核验乳业同行广度；渠道库存、折扣和原奶反弹均可能逆转。
3. **恒瑞医药 600276｜连续第2期观察，中低置信。** 国内创新药研发与商业化企业，位于研发、临床与制剂销售环节。研发成果转化、获批及授权回款可能在数季体现；三季报利润增速支撑基础比较，授权里程碑不能视作经常性利润。周五逆市上涨但成交未较上日放大，暂未证明增量资金主动进场。警惕临床、支付价格和估值风险。

{STATS}

{POOL}

## 08｜交易策略

周六零计划仓位。以下区间是静态复核场景，**不可据此挂单**。三股同序，价格均来自或由截至11/6的前复权日线推导。现有历史样本高点用于确定最近两档历史压力参考，区间按11/6日内振幅的40%–55%构造，失效值为11/6低点下方一分钱，仅供衡量历史结构；周一需重新检查。

{LEVELS}

{RAT}

毛风险 R=B−S，风险比例 R/B，目标收益 T−B；按50/50加权。双边佣金、税费、滑点合计假设为入场价0.20%，净比=(目标收益−费用)/(风险+费用)。二元门槛=1/(1+净比)，只适用于全部止盈或全部止损的二元模型；并非预测胜率，也不代表分批路径。费用和跳空可能提高实际损失。

周一仅复核，不预设持仓。小幅高开等回踩和同刻量，明显高开超区间撤销复核场景，极端高开、逼近压力或盘口失真不参与。三只依次检查银行板块是否转弱、乳业是否出现孤立拉升、恒瑞是否跌回支撑且同类股走弱；任一逻辑或价格失效即撤销该观察场景。仅在最不利上沿、最近压力前净比至少2:1且量价齐备后，才重新拟定交易与持有计划。新买A股按T+1执行，隔夜跳空或跌停可能无法按止损价退出。

## 09｜今日情景推演

周一若日韩芯片和恒生科技同步回稳、A股硬件广度改善，才上调超跌修复；若只有少数权重拉升，保持观察；若亚洲继续放量下行或美债利率、美元齐升，优先控制高估值和跳空风险。以上均为条件，未赋予主观概率。

## 10｜今日交易清单

主动交易0；条件观察工商银行、伊利股份、恒瑞医药。三花、五粮液不参与；高波动光通信不追涨。周末任务是核对公司公告、交易状态、数据与价格结构。

## 11｜开盘后验证

下个有效交易日09:45、10:00比较个股和板块相对强度、涨跌家数及累计成交量，量能分母采用前五个有效交易日同一时刻累计量均值。当前同刻分母缺失，量能条件待验证。结合盘口和中途压力复算最不利入场净比。

## 12｜市场叙事追踪

- **AI订单与估值分离**：美国股价短线回弹已经出现，日韩和A股次日能否跟随尚未知。下一证据是云商资本开支和供应商实际订单。
- **就业韧性与贴现率**：关注收益率上行是否持续以及科技反弹的广度。强就业既可能支持需求，也可能抬高折现率。
- **油价与利润**：先验证实货、航油和运费，再调整航空成本与油气利润假设。

## 13｜30秒速读版

{DIGEST}

## 昨日推荐复盘

11/6一期均为观察，无统一成交触发价，不计算策略收益。11/6恒瑞股价+0.48%继续观察；五粮液−0.63%，弱于伊利及贵州茅台样本，退出；三花−3.47%，弱于上证和国内观察组，退出。上述均为行情表现。

## 数据与信息来源

[东方财富A股收盘](https://finance.eastmoney.com/a/202611063924818780.html)、[东方财富港股收盘](https://fund.eastmoney.com/a/202611063924832341.html)、[新华网日韩收盘](https://www.xinhuanet.com/fortune/20261106/45755809e6e34c498eb0720f94e57c0d/c.html)、[日经收盘点位](https://www.nbd.com.cn/articles/2026-11-06/4640616.html)、[AP美股收盘](https://apnews.com/article/806f71d95105bc7efbc760b194dd8cad)、[AP利率及科技股](https://apnews.com/article/bba6f0bf9035a6e6b1c4fef3e8230b89)、[美国劳工统计局](https://www.bls.gov/news.release/archives/empsit_11062026.htm)、[WTI](https://energynow.com/2026/11/oil-prices-plunge-13-in-one-week-as-u-s-election-results-raise-hopes-of-iran-peace-deal-wti-closes-below-91-brent-below-99/)、[Brent](https://bullquill.com/oil-weekly-brief-2026-11-06/)、[工商银行三季报](https://www.icbc-ltd.com/page/1289649066762665984.html)、[伊利上交所披露](https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=600887)、[CBOE历史](https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv)、[恒瑞三季报](https://static.cninfo.com.cn/finalpage/2026-10-28/1225629197.PDF)。腾讯日线、行情快照与东方财富资金查询按日期留档。资金为数据商大单分类估算。

## 数据边界

北京时间11/7 {CUT}截止，事件覆盖此前24小时，股票行情使用11/6完整交易日。日线以此前五个完整交易日计算均量，ATR14为最近14个真实波幅的简单平均，真实波幅取高低差及高、低与前收差绝对值的最大值。海外行业同口径资金、部分资产收盘及个股同刻量缺失。候选池是样本筛选，未证明全市场最优。周末观察场景不产生买卖信号。
"""
for k,v in dict(STATS='\n'.join(stats),POOL='\n'.join(pool),LEVELS='\n'.join(levels),RAT='\n'.join(rat),DIGEST=digest,CUT=cut,VIX='11/6官方收盘未核；11/5 CBOE收盘28.18（前一日）',BTC='截止时点报价未核').items():body=body.replace('{'+k+'}',v)
assert [int(x[3:5]) for x in body.splitlines() if re.match(r'^## \d\d',x)]==list(range(1,14))
(p/f'{d}.md').write_text(f'# {title}\n\n信息截止：北京时间 {d} {cut}。\n\n'+body,encoding='utf8')
(p/f'{d}-trade-calculations.json').write_text(json.dumps(calc,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
Path(f'finance/daily/data/{d}.json').write_text(json.dumps(dict(date=d,edition='每日财经',title=title,summary=digest,cutoff=f'{d} {cut}（北京时间）；此前24小时；行情基准11/6',digest=digest,body=body),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(cut, len(calc))
