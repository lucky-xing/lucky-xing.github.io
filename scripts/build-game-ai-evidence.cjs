// Public provider order-size estimates: these are NOT identified institutional trades.
const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'finance/sectors/data/game-ai-20261021.js'),'utf8'),ctx);const D=ctx.window.GAME_AI;
const flows=[];for(const s of D.securities.slice(0,8)){
 const url=`https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=100&klt=101&secid=${s.code.startsWith('6')?'1':'0'}.${s.code}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56`;
 const j=JSON.parse(cp.execFileSync('curl.exe',['-sS','--fail','--max-time','25',url],{encoding:'utf8',maxBuffer:4e6}));
 const daily=(j.data?.klines||[]).map(v=>{const [date,main,small,medium,large,extraLarge]=v.split(',');return{date,main:+main,small:+small,medium:+medium,large:+large,extraLarge:+extraLarge}}).filter(x=>x.date<=D.asOf);
 if(daily.length<60||daily.at(-1).date!==D.asOf)throw Error('Stale/short flow '+s.code);
 const windows=Object.fromEntries([5,20,60].map(n=>[n,{start:daily.at(-n).date,end:daily.at(-1).date,net:daily.slice(-n).reduce((t,x)=>t+x.main,0)}]));flows.push({code:s.code,name:s.name,daily:daily.slice(-60),windows,url});console.log(s.code,windows);
}
const common=flows[0].daily.map(x=>x.date);if(!flows.every(f=>JSON.stringify(f.daily.map(x=>x.date))===JSON.stringify(common)))throw Error('Unaligned flows');
const sector={name:'八股研究样本合计',daily:common.map((date,i)=>({date,main:flows.reduce((t,f)=>t+f.daily[i].main,0)})),windows:Object.fromEntries([5,20,60].map(n=>[n,{start:common.at(-n),end:D.asOf,net:flows.reduce((t,f)=>t+f.windows[n].net,0)}]))};
const out={asOf:D.asOf,generatedAt:new Date().toISOString(),definition:'东方财富大单+超大单净额估算，非交易所审计现金流，不能识别机构身份；八股非全行业',flows,sector};fs.writeFileSync(path.join(root,'finance/sectors/data/game-ai-evidence.js'),'window.GAME_AI_EVIDENCE='+JSON.stringify(out)+';\n');
