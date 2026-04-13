#requires -Version 5.1
<#
.SYNOPSIS
  Hyper-V에서 GenNX VM을 Running으로 맞춘 뒤, 게스트에서
  `node bin/batcli.js uia gennx verify`를 실행합니다.

  Hyper-V 관리 호스트에서는 Invoke-Command -VMName (PowerShell Direct, VMBus)을 사용합니다.
  -SkipEnsureVm 이면 WinRM(-ComputerName)만 사용합니다.

  필수: 게스트 Windows 관리자 계정
  CLIBASE_VM_WINRM_USER / CLIBASE_VM_WINRM_PASSWORD
  (별칭: CLIBASE_VM_GUEST_USER / CLIBASE_VM_GUEST_PASSWORD)
#>
param(
  [string]$GuestWinRmHost = "",
  [string]$VmName = "",
  [string]$GuestClibaseRoot = "",
  [switch]$SkipEnsureVm
)

$ErrorActionPreference = "Stop"

Write-Host "Remote FlaUI may miss interactive desktop; if needed use vmconnect/RDP and: node bin/batcli.js uia gennx verify"

if (-not $VmName) {
  $VmName = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HYPERV_NAME")
}
if (-not $VmName) {
  $VmName = "GenNX-VM"
}

if (-not $GuestClibaseRoot) {
  $GuestClibaseRoot = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GENNX_CLIBASE_ROOT")
}
if (-not $GuestClibaseRoot) {
  $GuestClibaseRoot = "C:\MIDAS\code\clibase"
}

$rootsCsv = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GUEST_CLIBASE_ROOTS_CSV")
if (-not $rootsCsv) {
  $rootsCsv = $GuestClibaseRoot
}

if (-not $GuestWinRmHost) {
  $GuestWinRmHost = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GENNX_VERIFY_GUEST_HOST")
}

$usePowerShellDirect = -not $SkipEnsureVm

if ($SkipEnsureVm -and -not $GuestWinRmHost) {
  Write-Error "With -SkipEnsureVm set -GuestWinRmHost or CLIBASE_VM_GENNX_VERIFY_GUEST_HOST."
}

$u = [Environment]::GetEnvironmentVariable("CLIBASE_VM_WINRM_USER")
if (-not $u) {
  $u = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GUEST_USER")
}
$p = [Environment]::GetEnvironmentVariable("CLIBASE_VM_WINRM_PASSWORD")
if (-not $p) {
  $p = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GUEST_PASSWORD")
}

if (-not $u -or -not $p) {
  throw @"
Guest credentials required. Set env or workspace/vm-profiles.yaml guest_local_user / guest_local_password (vm-gennx-lab defaults applied by vm-gennx-verify-guest.mjs).
  CLIBASE_VM_WINRM_USER / CLIBASE_VM_WINRM_PASSWORD (aliases: CLIBASE_VM_GUEST_*)
"@
}

$sec = ConvertTo-SecureString $p -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential ($u, $sec)

if ($usePowerShellDirect) {
  try {
    Import-Module Hyper-V -ErrorAction Stop
  }
  catch {
    Write-Error "Hyper-V module: $($_.Exception.Message). Install RSAT Hyper-V tools or use -SkipEnsureVm."
  }

  $deadline = (Get-Date).AddSeconds(300)
  $vm = Get-VM -Name $VmName -ErrorAction Stop
  while ($vm.State.ToString() -ne "Running") {
    if ((Get-Date) -gt $deadline) {
      Write-Error "Timeout: VM '$VmName' did not reach Running (last: $($vm.State))."
    }
    $st = $vm.State.ToString()
    if ($st -eq "Off") {
      Start-VM -Name $VmName
    }
    elseif ($st -eq "Paused") {
      Resume-VM -Name $VmName
    }
    elseif ($st -eq "Saved") {
      Start-VM -Name $VmName
    }
    Start-Sleep -Seconds 2
    $vm = Get-VM -Name $VmName
  }
  Write-Host "Hyper-V VM '$VmName' is Running."

  Write-Host "Waiting for PowerShell Direct (guest OS boot)..."
  $directDeadline = (Get-Date).AddSeconds(420)
  $directOk = $false
  while ((Get-Date) -lt $directDeadline) {
    try {
      $ping = Invoke-Command -VMName $VmName -Credential $cred -ScriptBlock { "ps-direct-ok" } -ErrorAction Stop
      if ($ping -eq "ps-direct-ok") {
        $directOk = $true
        break
      }
    }
    catch {
      # guest still booting or wrong password once
    }
    Start-Sleep -Seconds 5
  }
  if (-not $directOk) {
    throw "PowerShell Direct to '$VmName' failed after 420s. Check guest password, account is admin, Integration Services, vmconnect console."
  }
  Write-Host "PowerShell Direct OK."
}
else {
  $winRmWaitSec = 420
  $pollSec = 5
  $deadlineWinRm = (Get-Date).AddSeconds($winRmWaitSec)
  $reachable = $false
  Write-Host "Probing WinRM ${GuestWinRmHost}:5985 (up to $winRmWaitSec s)..."
  $iter = 0
  while ((Get-Date) -lt $deadlineWinRm) {
    try {
      $tnc = Test-NetConnection -ComputerName $GuestWinRmHost -Port 5985 -WarningAction SilentlyContinue -ErrorAction Stop
      if ($tnc.TcpTestSucceeded) {
        $reachable = $true
        break
      }
    }
    catch { }
    $iter += 1
    if ($iter % 6 -eq 0) {
      $left = [int](($deadlineWinRm - (Get-Date)).TotalSeconds)
      if ($left -lt 0) {
        $left = 0
      }
      Write-Host "  ... WinRM (${left}s left)"
    }
    Start-Sleep -Seconds $pollSec
  }
  if (-not $reachable) {
    throw "TCP 5985 not reachable on $GuestWinRmHost."
  }
  Write-Host "WinRM OK."
}

$scriptBlock = {
  param([string]$RootsCsv)
  $ErrorActionPreference = "Stop"
  $roots = ($RootsCsv -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $picked = $null
  foreach ($r in $roots) {
    $bat = Join-Path $r 'bin\batcli.js'
    if (Test-Path -LiteralPath $bat) {
      $picked = $r
      break
    }
  }
  if (-not $picked) {
    throw "Guest: no clibase repo with bin\batcli.js. Tried: $($roots -join '; ')"
  }
  Set-Location -LiteralPath $picked
  $env:CLIBASE_VM_VERIFY_ON_GUEST = "1"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Guest: node not on PATH."
  }
  $proc = Start-Process -FilePath "node" -ArgumentList @("bin\batcli.js", "uia", "gennx", "verify") -WorkingDirectory $picked -Wait -PassThru -NoNewWindow
  if ($proc.ExitCode -ne 0) {
    throw "Guest batcli uia gennx verify exit $($proc.ExitCode)"
  }
}

try {
  if ($usePowerShellDirect) {
    Invoke-Command -VMName $VmName -Credential $cred -ScriptBlock $scriptBlock -ArgumentList $rootsCsv
  }
  else {
    Invoke-Command -ComputerName $GuestWinRmHost -Credential $cred -ScriptBlock $scriptBlock -ArgumentList $rootsCsv
  }
}
catch {
  Write-Host "Invoke-Command failed: $($_.Exception.Message)"
  throw
}

Write-Host "vm-gennx-verify-guest: OK"
