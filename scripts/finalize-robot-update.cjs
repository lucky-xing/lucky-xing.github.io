// Apply verified late-evening facts after the report builder, keeping source edits reviewable.
const fs=require('fs');
const file='finance/sectors/robotics-2026-10.html';let h=fs.readFileSync(file,'utf8');
h=h.replace('<title>机器人板块深度研究与交易策略｜2026-10-28</title>','<title>机器人板块更新与交易策略｜2026-10-29</title>')
.replace('更新基准2026-10-28晚间','更新日2026-10-29凌晨；消息核对至10/29凌晨，统一市场基准2026-10-28')
.replace('长盈数据日期冲突','长盈三季报，公告10/29')
.replace('接口已出现Q3，但公告标注10/29，董事会落款10/28。','公告日期10/29、董事会落款10/28；现已跨日，纳入凌晨更新。')
.replace('截至本次10/28基准，估值表暂保留H1、单列风险，不把后标日期信息冒充已确认当日披露。','纳入最新Q3并重算TTM；28日收盘尚未反映这份后续消息，不用它解释此前上涨。')
.replace(/<p class="warning">长盈：[\s\S]*?<\/p>/,'<p class="warning">长盈：<a href="https://static.cninfo.com.cn/finalpage/2026-10-29/1225634374.PDF">10/29三季报原件</a>显示前三季收入164.53亿、+21.78%，归母−0.663亿、扣非−0.819亿，Q3扣非约−0.959亿。经营现金4.96亿改善，但无法消除制造、汇兑和费用压力；累计利润从H1正值转负。已在10/29凌晨更新纳入Q3，28日收盘未反映此信息。TTM仍微利，对应约629倍归母PE、878倍扣非PE，不能当常态估值锚。继续观察，不给买点。</p>')
.replace('天弘规模仍引用','华夏9/30前十：汇川9.01%、三花8.75%、科大讯飞7.83%、大族激光7.21%、中控5.54%、恒立5.30%、拓普4.42%、绿的3.84%、大华3.29%、双环2.83%，前五家机器人研究相关公司合计28.85%；软件/信息服务行业占净值17.11%，ETF含非人形暴露。天弘规模仍引用')
.replace('用旧6/30汇川8.98%权重演算','用最新9/30汇川9.01%权重演算').replace('汇川穿透约6.80%；这只是旧权重示例','汇川穿透约6.80%；这仍是报告期权重示例')
.replace('长盈公告日冲突、','长盈三季报尚待下一交易日定价、');
h=h.replace('2026-10-28 收盘与晚间公告更新','2026-10-29 凌晨更新 · 行情截至10/28')
.replace('三花/双环第一盈亏比低于2的中点方案禁用，即使价格到区间也不能直接买。','所有标的实际成交价的第一盈亏比都须≥2；汇川按当前目标/止损及成本须≤44.53元，区间上沿45元不合格；双环须≤29.57元、三花须≤23.59元才可能达到门槛，其中点方案禁用。即使价格达到门槛，也须其余确认条件同时成立。')
.replace('本次保守模型已没有现价正期望的四股候选','本次保守模型中四个估值样本均无现价正期望')
.replace('当前买卖价差无历史盘口证据','天弘当日NAV0.9231来自<a href="https://fund.eastmoney.com/ETFN_dwjz.html">天天基金10/28净值表</a>，为第三方聚合；华夏0.8895为管理人官方数据。当前买卖价差无历史盘口证据');
fs.writeFileSync(file,h);
let j=fs.readFileSync('finance/sectors/robotics-update-charts.js','utf8').replace("['300115',[3.5,0.5,2.5,1,1.5]]","['300115',[3.5,0.5,2,0.5,1.5]]")
.replace('当日NAV未核实，执行前须复核','第三方当日NAV，执行前向管理人复核');
fs.writeFileSync('finance/sectors/robotics-update-charts.js',j);
for(const f of ['finance.html','finance/sectors/index.html']){let t=fs.readFileSync(f,'utf8');t=t.replaceAll('2026-10-22','2026-10-29');if(f.includes('sectors'))t=t.replace('盈利分化、趋势与资金尚未同时确认，不立即追买。','新增三季报与10/21—10/28变化对照，重算等待价及盈亏比；市场修复，盈利与现金分化，不追上涨。');fs.writeFileSync(f,t)}
