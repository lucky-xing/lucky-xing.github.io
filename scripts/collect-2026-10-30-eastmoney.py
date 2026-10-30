import concurrent.futures,json,pathlib,urllib.request
root=pathlib.Path('reports/2026');date='2026-10-30'
ids=['600519','603019','001309','002463','002636','000823','600276','601398','600938','601857','000858','600487','000636','002050']
def fetch(job):
 code,kind=job;sid=('1.' if code.startswith('6') else '0.')+code
 base='https://push2his.eastmoney.com/api/qt/stock/'
 if kind=='kline':u=base+'kline/get?secid='+sid+'&klt=101&fqt=0&lmt=80&end=20261029&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61'
 else:u=base+'fflow/daykline/get?secid='+sid+'&lmt=10&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63'
 try:
  raw=urllib.request.urlopen(u,timeout=8).read().decode();q=json.loads(raw);data=q.get('data') or {};r=data.get('klines',[])
  (root/f'{date}-{code}-eastmoney-{kind}.json').write_text(raw,encoding='utf8')
  return {'code':code,'kind':kind,'source':u,'latest':r[-1] if r else None,'rows':len(r)}
 except Exception as e:return {'code':code,'kind':kind,'source':u,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:result=list(ex.map(fetch,[(c,k) for c in ids for k in ['kline','funds']]))
(root/f'{date}-eastmoney-evidence.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
