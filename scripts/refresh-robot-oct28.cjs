// Dated refresh preserves the prior data and does not roll an old trade forward.
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');process.chdir(root);
let source=fs.readFileSync('scripts/build-robot-data.cjs','utf8');
source=source.replace("cache=path.join(root,'.cache/robot'),asOf='2026-10-21'","cache=path.join(root,'.cache/robot/2026-10-28'),asOf='2026-10-28'")
.replace("reportDate:'2026-10-22'","reportDate:'2026-10-28'").replaceAll('2025-10-21','2025-10-28')
.replace('value:.8384','value:.8895').replace('value:.8694','value:.9231').replace('data/robot-20261021.js','data/robot-20261028.js');
vm.runInNewContext(source,{require,__dirname:path.join(root,'scripts'),console:{log(){}},process});
const ctx={window:{}},old={window:{}};vm.runInNewContext(fs.readFileSync('finance/sectors/data/robot-20261028.js','utf8'),ctx);vm.runInNewContext(fs.readFileSync('finance/sectors/data/robot-20261021.js','utf8'),old);
const D=ctx.window.ROBOT_RESEARCH;
D.reportDate='2026-10-29';
// This is the lower, conservative case alongside unchanged-profit / price-only sensitivity.
D.previousModels=old.window.ROBOT_RESEARCH.models.map(m=>{const s=D.securities.find(s=>s.code===m.code);return{code:m.code,weighted:m.values.reduce((t,v,i)=>t+(v/s.rawClose-1)*m.prob[i],0)}});
D.changes=D.securities.map(s=>{const o=old.window.ROBOT_RESEARCH.securities.find(x=>x.code===s.code);return{code:s.code,name:s.name,oldClose:o.rawClose,close:s.rawClose,ret:(s.rawClose/o.rawClose-1)*100,oldPe:o.valuation?.pe,pe:s.valuation?.pe,oldCorePe:o.valuation?.corePe,corePe:s.valuation?.corePe}});
D.postdatedWarning={code:'300115',date:'2026-10-29',note:'接口已出现Q3，公告标注10/29；截至10/28估值继续H1，不提前混用。',row:D.securities.find(s=>s.code==='300115').financeRows[0]};
D.models=[{code:'300124',profits:[42,58,72],pes:[20,27,30],prob:[.3,.5,.2]},{code:'002472',profits:[10,12.5,15],pes:[18,25,30],prob:[.3,.5,.2]},{code:'002050',profits:[34,43,53],pes:[22,30,34],prob:[.3,.5,.2]},{code:'688017',profits:[1.2,2,3.5],pes:[65,90,120],prob:[.3,.5,.2]}];
for(const m of D.models){const s=D.securities.find(s=>s.code===m.code);m.values=m.profits.map((p,i)=>p*1e8*m.pes[i]/s.valuation.shares);m.weighted=m.values.reduce((t,v,i)=>t+(v/s.rawClose-1)*m.prob[i],0)}
Object.assign(D.plans.find(p=>p.code==='300124'),{lo:42,hi:45,stop:38,t1:58,t2:72,basis:'未来12月正常化扣非58亿×27倍/27.11亿股≈57.76元；72亿×27倍≈71.71元。42—45为估值等待区，38为风险预算，非已确认技术支撑。'});
Object.assign(D.plans.find(p=>p.code==='002472'),{lo:29,hi:31,stop:26,t1:37,t2:48,basis:'未来12月扣非12.5亿×25倍/8.50亿股≈36.76元；15亿×27倍≈47.65元。29—31为等待区，26为风险预算；中点第一盈亏比不合格。'});
Object.assign(D.plans.find(p=>p.code==='002050'),{lo:23,hi:25,stop:20,t1:31,t2:43,basis:'未来12月扣非43亿×30倍/42.08亿股≈30.66元；53亿×34倍≈42.82元。23—25为等待区，20为风险预算；中点第一盈亏比不合格。'});
const calc=(e,s,t,c)=>({ret:(t-e)/e-c,loss:(e-s)/e+c,rr:((t-e)/e-c)/((e-s)/e+c)});
for(const p of D.plans){p.entry=(p.lo+p.hi)/2;p.mid=[p.t1,p.t2].map(t=>calc(p.entry,p.stop,t,p.cost));p.ends=[p.lo,p.hi].map(e=>[p.t1,p.t2].map(t=>calc(e,p.stop,t,p.cost)));p.status='未触发；新财报后重新评审，不能按旧计划成交'}
fs.writeFileSync('finance/sectors/data/robot-20261028.js','window.ROBOT_RESEARCH='+JSON.stringify(D)+';\n');
console.log(JSON.stringify({asOf:D.asOf,changes:D.changes,stats:D.securities.map(s=>({code:s.code,stats:s.stats,valuation:s.valuation,flow:s.flowWindows})),basket:D.basket.stats,breadth:D.basket.daily.at(-1).above60,models:D.models,plans:D.plans.map(p=>({code:p.code,lo:p.lo,hi:p.hi,stop:p.stop,t1:p.t1,t2:p.t2,rr:p.mid.map(r=>r.rr)}))},null,2));
