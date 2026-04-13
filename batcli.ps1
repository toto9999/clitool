$cmdPath = Join-Path $PSScriptRoot "batcli.cmd"
if (-not (Test-Path -LiteralPath $cmdPath)) {
  throw "Missing batcli.cmd at $cmdPath"
}
& $cmdPath @args
exit $LASTEXITCODE
