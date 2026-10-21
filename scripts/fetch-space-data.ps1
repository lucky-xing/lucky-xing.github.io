$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false
$spaceCache = Join-Path $PSScriptRoot '../.cache/space'
New-Item -ItemType Directory -Force -Path $spaceCache | Out-Null
$spaceCodes = @('600118','600879','001270','688270','688375','002025','300342','688523','159218','563230','000300')
$spaceJobs = foreach ($spaceCode in $spaceCodes) {
  $spaceMarket = if ($spaceCode.StartsWith('6') -or $spaceCode.StartsWith('5') -or $spaceCode -eq '000300') {'1'} else {'0'}
  [pscustomobject]@{Code=$spaceCode;Kind='prices';Url="https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=$spaceMarket.$spaceCode&klt=101&fqt=1&lmt=1000&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"}
  if ($spaceCode -notin @('159218','563230','000300')) {
    $spaceFilter = [uri]::EscapeDataString('(SECURITY_CODE="'+$spaceCode+'")')
    [pscustomobject]@{Code=$spaceCode;Kind='finance';Url="https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=SECURITY_CODE,REPORT_DATE,TOTAL_SHARE,BPS,PARENTNETPROFIT,KCFJCXSYJLR,TOTALOPERATEREVE,NETCASH_OPERATE_PK,ROEJQ,XSMLL,XSJLL,ZCFZL,TOTALOPERATEREVETZ,PARENTNETPROFITTZ,KCFJCXSYJLRTZ&filter=$spaceFilter&pageSize=8&sortColumns=REPORT_DATE&sortTypes=-1"}
    [pscustomobject]@{Code=$spaceCode;Kind='flow';Url="https://push2his.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=100&klt=101&secid=$spaceMarket.$spaceCode&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56"}
  } elseif ($spaceCode -ne '000300') {
    [pscustomobject]@{Code=$spaceCode;Kind='nav';Url="https://api.fund.eastmoney.com/f10/lsjz?fundCode=$spaceCode&pageIndex=1&pageSize=5&startDate=2026-10-19&endDate=2026-10-21"}
  }
}
$spaceJobs | ForEach-Object -Parallel {
  $ErrorActionPreference = 'Continue'
  $PSNativeCommandUseErrorActionPreference = $false
  $job = $_
  $dest = Join-Path $using:spaceCache ($job.Code+'-'+$job.Kind+'.json')
  if (Test-Path -LiteralPath $dest) { try { $cached = Get-Content -Raw -LiteralPath $dest | ConvertFrom-Json; if ($cached.data -or $cached.result -or $cached.Data) { Write-Output ($job.Code+' '+$job.Kind+' CACHED'); return } } catch {} }
  & curl.exe -sS --fail --max-time 10 --retry 1 --retry-all-errors $job.Url -o $dest
  if ($LASTEXITCODE -eq 0) { Write-Output ($job.Code+' '+$job.Kind+' OK') } else { Write-Output ($job.Code+' '+$job.Kind+' FAILED') }
} -ThrottleLimit 4
