$ErrorActionPreference='Continue'
$PSNativeCommandUseErrorActionPreference=$false
$spaceCache=Join-Path $PSScriptRoot '../.cache/space'
@('sh600118','sh600879','sz001270','sh688270','sh688375','sz002025','sz300342','sh688523','sh000300') | ForEach-Object -Parallel {
 $ErrorActionPreference='Continue'; $PSNativeCommandUseErrorActionPreference=$false
 $symbol=$_; $code=$symbol.Substring(2)
 foreach($freq in @('day','month')) {
  $dest=Join-Path $using:spaceCache ($code+'-tencent-'+$freq+'.json')
  $url="https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=$symbol,$freq,2022-01-01,2026-10-21,1250,qfq"
  & curl.exe -sS --fail --max-time 10 $url -o $dest
  Write-Output ($symbol+' '+$freq+' exit '+$LASTEXITCODE)
 }
} -ThrottleLimit 3
