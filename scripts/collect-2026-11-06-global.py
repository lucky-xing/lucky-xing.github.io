import urllib.request,re,concurrent.futures,pathlib,json,datetime
p=pathlib.Path('reports/2026')
u={'breakfast':'https://finance.eastmoney.com/a/202611053923871240.html','global':'https://finance.eastmoney.com/a/202611063923941036.html','btc':'https://api.coinbase.com/v2/prices/BTC-USD/spot','vix':'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv','qt':'https://qt.gtimg.cn/q=sh600276,sz000858,sz002050'}
def f(k):
 try:
  b=urllib.request.urlopen(urllib.request.Request(u[k],headers={'User-Agent':'Mozilla/5.0'}),timeout=8).read();s=b.decode('gb18030' if k=='qt' else 'utf8',errors='replace')
  if k in ['breakfast','global']:
   s=re.sub(r'<[^>]+>',' ',s);s=re.sub(r'\s+',' ',s);out={}
   for key in ['美债收益率','纽约尾盘','美元指数','COMEX','WTI','布伦特','16:30','3000亿元']:
    ix=[m.start() for m in re.finditer(key,s)];out[key]=[s[max(i-18,0):i+135] for i in ix[-3:]]
   s=json.dumps(out,ensure_ascii=False)
  elif k=='vix':s='\n'.join(s.splitlines()[-5:])
  (p/f'2026-11-06-{k}-source.txt').write_text(s+'\n',encoding='utf8')
  print(k,s)
 except Exception as e:print(k,e)
with concurrent.futures.ThreadPoolExecutor() as ex:list(ex.map(f,u))
print(datetime.datetime.now().astimezone().isoformat())
