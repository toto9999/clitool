#requires -Version 5.1
param(
  [string]$GuestWinRmHost = "",
  [string]$VmName = "",
  [string]$GuestGennxExe = "",
  [string]$ProductProcessName = "GenNX",
  [string]$WindowTitlePrefix = "MIDAS GEN NX",
  [string]$GuestResultJson = "",
  [string]$GuestScreenshotPng = "",
  [string]$HostResultJson = "",
  [string]$HostScreenshotPng = "",
  [switch]$SkipEnsureVm
)

$ErrorActionPreference = "Stop"

Write-Host "vm-gennx-diagnose-new-project: starting guest visible diagnosis..."

if (-not $VmName) {
  $VmName = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HYPERV_NAME")
}
if (-not $VmName) {
  $VmName = "GenNX-VM"
}

if (-not $GuestWinRmHost) {
  $GuestWinRmHost = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GENNX_VERIFY_GUEST_HOST")
}

if (-not $GuestGennxExe) {
  $GuestGennxExe = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GUEST_GENNX_LAUNCH_EXE")
}
if (-not $GuestGennxExe) {
  $GuestGennxExe = "C:\Users\dd\Desktop\x64_Release_D260330_T1123_N224_r_b7_MR\GenNX.exe"
}

if (-not $GuestResultJson) {
  $GuestResultJson = "C:\Windows\Temp\clibase-midas-new-project-result.json"
}
if (-not $GuestScreenshotPng) {
  $GuestScreenshotPng = "C:\Windows\Temp\clibase-midas-new-project-screen.png"
}

$usePowerShellDirect = -not $SkipEnsureVm

if ($SkipEnsureVm -and -not $GuestWinRmHost) {
  throw "With -SkipEnsureVm set -GuestWinRmHost or CLIBASE_VM_GENNX_VERIFY_GUEST_HOST."
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
  throw "Guest credentials required (env or vm-profiles guest_local_* / launcher defaults)."
}

$sec = ConvertTo-SecureString $p -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential ($u, $sec)

function Ensure-HostDir {
  param([string]$Path)
  if (-not $Path) { return }
  $parent = [System.IO.Path]::GetDirectoryName($Path)
  if ($parent) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
}

if ($usePowerShellDirect) {
  Import-Module Hyper-V -ErrorAction Stop

  $deadline = (Get-Date).AddSeconds(300)
  $vm = Get-VM -Name $VmName -ErrorAction Stop
  while ($vm.State.ToString() -ne "Running") {
    if ((Get-Date) -gt $deadline) {
      throw "Timeout: VM '$VmName' did not reach Running."
    }
    $state = $vm.State.ToString()
    if ($state -eq "Off" -or $state -eq "Saved") {
      Start-VM -Name $VmName | Out-Null
    } elseif ($state -eq "Paused") {
      Resume-VM -Name $VmName | Out-Null
    }
    Start-Sleep -Seconds 2
    $vm = Get-VM -Name $VmName -ErrorAction Stop
  }
  Write-Host "Hyper-V VM '$VmName' is Running."

  Write-Host "Waiting for PowerShell Direct..."
  $directDeadline = (Get-Date).AddSeconds(420)
  $directOk = $false
  while ((Get-Date) -lt $directDeadline) {
    try {
      $ping = Invoke-Command -VMName $VmName -Credential $cred -ScriptBlock { "ps-direct-ok" } -ErrorAction Stop
      if ($ping -eq "ps-direct-ok") {
        $directOk = $true
        break
      }
    } catch {}
    Start-Sleep -Seconds 5
  }
  if (-not $directOk) {
    throw "PowerShell Direct to '$VmName' failed after 420s."
  }
  Write-Host "PowerShell Direct OK."
} else {
  $deadlineWinRm = (Get-Date).AddSeconds(420)
  $reachable = $false
  Write-Host "Probing WinRM ${GuestWinRmHost}:5985..."
  while ((Get-Date) -lt $deadlineWinRm) {
    try {
      $tnc = Test-NetConnection -ComputerName $GuestWinRmHost -Port 5985 -WarningAction SilentlyContinue -ErrorAction Stop
      if ($tnc.TcpTestSucceeded) {
        $reachable = $true
        break
      }
    } catch {}
    Start-Sleep -Seconds 5
  }
  if (-not $reachable) {
    throw "TCP 5985 not reachable on $GuestWinRmHost."
  }
  Write-Host "WinRM OK."
}

$toolPath = Join-Path $PSScriptRoot "..\tools\vm-guest-diagnostics\Invoke-MidasNewProjectDiagnosis.ps1"
if (-not (Test-Path -LiteralPath $toolPath)) {
  throw "Missing diagnosis tool: $toolPath"
}

$diagnoseScriptUtf8 = Get-Content -LiteralPath $toolPath -Raw -Encoding UTF8
$sess = $null
try {
  if ($usePowerShellDirect) {
    $sess = New-PSSession -VMName $VmName -Credential $cred -ErrorAction Stop
  } else {
    $sess = New-PSSession -ComputerName $GuestWinRmHost -Credential $cred -ErrorAction Stop
  }

  $guestScriptPath = "C:\Windows\Temp\clibase-diagnose-new-project.ps1"
  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($diagnoseScriptUtf8))

  Write-Host "Deploying diagnosis scripts to guest temp..."
  Invoke-Command -Session $sess -ScriptBlock {
    param($B64, $DestPs1, $ResultJson, $ScreenshotPng)
    $raw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($B64))
    Set-Content -LiteralPath $DestPs1 -Value $raw -Encoding UTF8
    Remove-Item -LiteralPath $ResultJson -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ScreenshotPng -Force -ErrorAction SilentlyContinue
  } -ArgumentList $b64, $guestScriptPath, $GuestResultJson, $GuestScreenshotPng

  Write-Host "Running diagnosis on guest interactive desktop..."
  $result = Invoke-Command -Session $sess -ScriptBlock {
    param($CredUser, $CredPass, $DiagnosePs1, $ExePath, $ProcName, $TitlePrefix, $ResultJson, $ScreenshotPng)

    function Resolve-TaskUser {
      param([string]$Raw)
      if ($Raw -match '^\.\\(.+)$') {
        return "$env:COMPUTERNAME\$($matches[1])"
      }
      if ($Raw -match '^(.+)\\(.+)$') {
        return $Raw
      }
      return "$env:COMPUTERNAME\$Raw"
    }

    function Invoke-SchtasksCreateRunIx {
      param([string]$TaskName, [string]$Tr, [string]$St, [string]$Sd, [string]$RunUser, [string]$RunPass, [string]$SchExe)
      $argLine = "/Create /TN `"$TaskName`" /TR `"$Tr`" /SC ONCE /ST $St /SD $Sd /RU `"$RunUser`" /RP `"$RunPass`" /RL HIGHEST /IT /F"
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $SchExe
      $psi.Arguments = $argLine
      $psi.UseShellExecute = $false
      $psi.CreateNoWindow = $true
      $p = [System.Diagnostics.Process]::Start($psi)
      $p.WaitForExit()
      if ($p.ExitCode -ne 0) {
        throw "schtasks /Create failed exit $($p.ExitCode)"
      }
      $argRun = "/Run /TN `"$TaskName`""
      $psi2 = New-Object System.Diagnostics.ProcessStartInfo
      $psi2.FileName = $SchExe
      $psi2.Arguments = $argRun
      $psi2.UseShellExecute = $false
      $psi2.CreateNoWindow = $true
      $p2 = [System.Diagnostics.Process]::Start($psi2)
      $p2.WaitForExit()
    }

    function Invoke-RegisterScheduledTaskIx {
      param([string]$TaskName, [string]$PsArgument, [string]$RunUser, [string]$RunPass)
      $sta = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $PsArgument
      $stt = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddSeconds(20))
      $sets = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 8)
      $principal = New-ScheduledTaskPrincipal -UserId $RunUser -LogonType Interactive -RunLevel Highest
      Register-ScheduledTask -TaskName $TaskName -Action $sta -Trigger $stt -Principal $principal -Settings $sets -Force | Out-Null
      Start-ScheduledTask -TaskName $TaskName
    }

    $ru = Resolve-TaskUser -Raw $CredUser
    $taskName = "ClibaseDiagNewProject_" + ([Guid]::NewGuid().ToString("N").Substring(0, 12))
    $sch = Join-Path $env:SystemRoot "System32\schtasks.exe"
    $runAt = (Get-Date).AddMinutes(1)
    $st = $runAt.ToString("HH:mm")
    $sd = $runAt.ToString("yyyy/MM/dd")
    $taskArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$DiagnosePs1`" -ExePath `"$ExePath`" -ProductProcessName `"$ProcName`" -WindowTitlePrefix `"$TitlePrefix`" -ResultPath `"$ResultJson`" -ScreenshotPath `"$ScreenshotPng`""
    $taskTr = "powershell.exe $taskArgs"

    try {
      try {
        Invoke-RegisterScheduledTaskIx -TaskName $taskName -PsArgument $taskArgs -RunUser $ru -RunPass $CredPass
      } catch {
        try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}
        Invoke-SchtasksCreateRunIx -TaskName $taskName -Tr $taskTr -St $st -Sd $sd -RunUser $ru -RunPass $CredPass -SchExe $sch
      }

      $deadline = (Get-Date).AddSeconds(180)
      $ok = $false
      while ((Get-Date) -lt $deadline) {
        if (Test-Path -LiteralPath $ResultJson) {
          $len = (Get-Item -LiteralPath $ResultJson).Length
          if ($len -gt 40) {
            $ok = $true
            break
          }
        }
        Start-Sleep -Seconds 2
      }
      if (-not $ok) {
        throw "Timeout: diagnosis result not produced at $ResultJson (user $ru must be logged on with a visible interactive session on the guest)."
      }
      [pscustomobject]@{
        TaskUser = $ru
        TaskName = $taskName
        ResultJson = $ResultJson
        ScreenshotPng = $ScreenshotPng
        ResultBytes = (Get-Item -LiteralPath $ResultJson).Length
        ScreenshotExists = (Test-Path -LiteralPath $ScreenshotPng)
      }
    } finally {
      $psiDel = New-Object System.Diagnostics.ProcessStartInfo
      $psiDel.FileName = $sch
      $psiDel.Arguments = "/Delete /TN `"$taskName`" /F"
      $psiDel.UseShellExecute = $false
      $psiDel.CreateNoWindow = $true
      try {
        $pd = [System.Diagnostics.Process]::Start($psiDel)
        $pd.WaitForExit()
      } catch {}
      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    }
  } -ArgumentList $u, $p, $guestScriptPath, $GuestGennxExe, $ProductProcessName, $WindowTitlePrefix, $GuestResultJson, $GuestScreenshotPng

  Ensure-HostDir $HostResultJson
  Ensure-HostDir $HostScreenshotPng
  if ($HostResultJson) {
    Copy-Item -FromSession $sess -Path $GuestResultJson -Destination $HostResultJson -Force -ErrorAction Stop
  }
  if ($HostScreenshotPng) {
    try {
      Copy-Item -FromSession $sess -Path $GuestScreenshotPng -Destination $HostScreenshotPng -Force -ErrorAction Stop
    } catch {
      Write-Host ("Optional screenshot copy failed: {0}" -f $_.Exception.Message)
    }
  }
  if ($HostResultJson -and (Test-Path -LiteralPath $HostResultJson)) {
    Get-Content -LiteralPath $HostResultJson -Raw
  } else {
    $result | ConvertTo-Json -Depth 6 -Compress
  }
}
catch {
  Write-Host "vm-gennx-diagnose-new-project failed: $($_.Exception.Message)"
  throw
}
finally {
  if ($sess) {
    Remove-PSSession -Session $sess -ErrorAction SilentlyContinue
  }
}
