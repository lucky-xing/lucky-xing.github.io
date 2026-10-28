param([string]$AsOf='2026-10-21',[switch]$Refresh)
$ErrorActionPreference='Continue'
$PSNativeCommandUseErrorActionPreference=$false
$robotSubdir=if($AsOf -eq '2026-10-21'){'../.cache/robot'}else{'../.cache/robot/'+$AsOf}
$robotCache=Join-Path $PSScriptRoot $robotSubdir
New-Item -ItemType Directory -Force -Path $robotCache | Out-Null
$robotJobs=foreach($code in @('300124','002050','601689','002472','688017','603728','002747','300115','159770','562500','000300')){
 $market=if($code.StartsWith('6') -or $code.StartsWith('5') -or $code -eq '000300'){'1'}else{'0'}
 $sym=if($market -eq '1'){'sh'+$code}else{'sz'+$code}
 foreach($period in @('day','month')){[pscustomobject]@{Code=$code;Kind=$period;Url="https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=$sym,$period,2022-01-01,$AsOf,1250,qfq"}}
 [pscustomobject]@{Code=$code;Kind='prices';Url="https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=$market.$code&klt=101&fqt=1&lmt=1000&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"}
 [pscustomobject]@{Code=$code;Kind='flow';Url="https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=100&klt=101&secid=$market.$code&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56"}
 if($code -notin @('159770','562500','000300')){
 $filter=[uri]::EscapeDataString('(SECURITY_CODE="'+$code+'")')
 [pscustomobject]@{Code=$code;Kind='finance';Url="https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=SECURITY_CODE,REPORT_DATE,TOTAL_SHARE,BPS,PARENTNETPROFIT,KCFJCXSYJLR,TOTALOPERATEREVE,NETCASH_OPERATE_PK,ROEJQ,XSMLL,XSJLL,ZCFZL,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,KCFJCXSYJLRTZ&filter=$filter&pageSize=8&sortColumns=REPORT_DATE&sortTypes=-1"}
 }
}
$robotJobs | ForEach-Object -Parallel {
 $job=$_;$dest=Join-Path $using:robotCache ($job.Code+'-'+$job.Kind+'.json')
 if((-not $using:Refresh) -and (Test-Path -LiteralPath $dest)){try{$cached=Get-Content -Raw -LiteralPath $dest | ConvertFrom-Json;if($cached.data -or $cached.result){Write-Output ($job.Code+' '+$job.Kind+' CACHED');return}}catch{}}
 & curl.exe -sS --fail --max-time 10 --retry 1 --retry-all-errors $job.Url -o $dest
 Write-Output ($job.Code+' '+$job.Kind+' exit='+$LASTEXITCODE)
} -ThrottleLimit 8
