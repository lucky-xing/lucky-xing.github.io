import concurrent.futures,json,urllib.request,pathlib
root=pathlib.Path('reports/2026'); date='2026-10-30'
syms=['sh600519','sh603019','sz001309','sz002463','sz002636','sz000823','sh600276','sh601398','sh600938','sh601857','sz000858','sh600487','sz000636','sz002050','sh000001','sz399001','sz399006']
def fetch(sym):
 u=f'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={sym},day,2026-08-01,2026-10-29,80,qfq'
 try:
  raw=urllib.request.urlopen(u,timeout=15).read().decode(); q=json.loads(raw)
  (root/f'{date}-{sym}-fallback.json').write_text(raw,encoding='utf8')
  d=q.get('data',{}).get(sym,{}); r=d.get('qfqday',d.get('day',[]));return {'symbol':sym,'source':u,'latest':r[-1] if r else None,'rows':len(r)}
 except Exception as e:return {'symbol':sym,'source':u,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex: results=list(ex.map(fetch,syms))
(root/f'{date}-market-evidence.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(results,ensure_ascii=False,indent=2))
