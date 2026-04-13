#requires -Version 5.1
<#
  CLI: 게스트의 대화형 사용자 세션에서 PrimaryScreen 캡처(schtasks + Register-ScheduledTask).
  PowerShell Direct 세션이 아니라 프로필의 로컬 계정(예: dd) 데스크톱에서 실행되므로 vmconnect로 본 화면과 동일한 경우가 많음.
#>
param(
  [string]$GuestWinRmHost = "",
  [string]$VmName = "",
  [switch]$SkipEnsureVm
)

$ErrorActionPreference = "Stop"

Write-Host "vm-gennx-capture-guest: scheduling interactive desktop capture on guest..."

if (-not $VmName) {
  $VmName = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HYPERV_NAME")
}
if (-not $VmName) {
  $VmName = "GenNX-VM"
}

$guestPng = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GUEST_INTERACTIVE_PNG")
if (-not $guestPng) {
  $guestPng = "C:\Windows\Temp\clibase-interactive-guest-screen.png"
}

$hostOutPng = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HOST_CAPTURE_PNG")

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
  throw "Guest credentials required (env or vm-profiles guest_local_* / vm-gennx-lab defaults via launcher)."
}

$sec = ConvertTo-SecureString $p -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential ($u, $sec)

if ($usePowerShellDirect) {
  try {
    Import-Module Hyper-V -ErrorAction Stop
  }
  catch {
    Write-Error "Hyper-V module: $($_.Exception.Message)"
  }

  $deadline = (Get-Date).AddSeconds(300)
  $vm = Get-VM -Name $VmName -ErrorAction Stop
  while ($vm.State.ToString() -ne "Running") {
    if ((Get-Date) -gt $deadline) {
      Write-Error "Timeout: VM '$VmName' did not reach Running."
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
    }
    catch { }
    Start-Sleep -Seconds 5
  }
  if (-not $directOk) {
    throw "PowerShell Direct to '$VmName' failed after 420s."
  }
  Write-Host "PowerShell Direct OK."
}
else {
  $winRmWaitSec = 420
  $pollSec = 5
  $deadlineWinRm = (Get-Date).AddSeconds($winRmWaitSec)
  $reachable = $false
  Write-Host "Probing WinRM ${GuestWinRmHost}:5985..."
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

$capScriptUtf8 = @'
$ErrorActionPreference = "Stop"
$OutPath = 'GUEST_PNG_PLACEHOLDER'
Remove-Item -LiteralPath $OutPath -Force -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
$bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Get-Item -LiteralPath $OutPath | Select-Object FullName, Length
'@

$escapedPng = $guestPng -replace "'", "''"
$capScriptUtf8 = $capScriptUtf8.Replace("GUEST_PNG_PLACEHOLDER", $escapedPng)

$sess = $null
try {
  Write-Host "Opening PSSession to guest..."
  if ($usePowerShellDirect) {
    $sess = New-PSSession -VMName $VmName -Credential $cred -ErrorAction Stop
  }
  else {
    $sess = New-PSSession -ComputerName $GuestWinRmHost -Credential $cred -ErrorAction Stop
  }

  $guestScriptPath = "C:\Windows\Temp\clibase-interactive-cap.ps1"
  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($capScriptUtf8))

  Write-Host "Deploying capture script to guest temp..."
  Invoke-Command -Session $sess -ScriptBlock {
    param($B64, $DestPs1)
    $raw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($B64))
    Set-Content -LiteralPath $DestPs1 -Value $raw -Encoding UTF8
  } -ArgumentList $b64, $guestScriptPath

  Write-Host "Running schtasks on guest (one-shot, interactive user desktop)..."
  $result = Invoke-Command -Session $sess -ScriptBlock {
    param($CredUser, $CredPass, $CapPath, $PngPath)

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

    $ru = Resolve-TaskUser -Raw $CredUser
    $taskName = "ClibaseGuestCap_" + ([Guid]::NewGuid().ToString("N").Substring(0, 12))
    $sch = Join-Path $env:SystemRoot "System32\schtasks.exe"
    $runAt = (Get-Date).AddMinutes(1)
    $st = $runAt.ToString("HH:mm")
    $sd = $runAt.ToString("MM/dd/yyyy")
    $taskTr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$CapPath`""

    function Invoke-SchtasksCreateRun {
      param([string]$TaskName, [string]$Tr, [string]$St, [string]$Sd, [string]$RunUser, [string]$RunPass)
      $argLine = "/Create /TN `"$TaskName`" /TR `"$Tr`" /SC ONCE /ST $St /SD $Sd /RU `"$RunUser`" /RP `"$RunPass`" /F"
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $sch
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
      $psi2.FileName = $sch
      $psi2.Arguments = $argRun
      $psi2.UseShellExecute = $false
      $psi2.CreateNoWindow = $true
      $p2 = [System.Diagnostics.Process]::Start($psi2)
      $p2.WaitForExit()
    }

    function Invoke-RegisterScheduledTaskRun {
      param([string]$TaskName, [string]$Cap, [string]$RunUser, [string]$RunPass)
      $sta = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Cap`""
      $stt = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddSeconds(20))
      $sets = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
      Register-ScheduledTask -TaskName $TaskName -Action $sta -Trigger $stt -User $RunUser -Password $RunPass -Settings $sets -Force | Out-Null
      Start-ScheduledTask -TaskName $TaskName
    }

    try {
      Invoke-SchtasksCreateRun -TaskName $taskName -Tr $taskTr -St $st -Sd $sd -RunUser $ru -RunPass $CredPass
    }
    catch {
      try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
      }
      catch { }
      Invoke-RegisterScheduledTaskRun -TaskName $taskName -Cap $CapPath -RunUser $ru -RunPass $CredPass
    }
    $deadline = (Get-Date).AddSeconds(120)
    $ok = $false
    while ((Get-Date) -lt $deadline) {
      if (Test-Path -LiteralPath $PngPath) {
        $len = (Get-Item -LiteralPath $PngPath).Length
        if ($len -gt 200) {
          $ok = $true
          break
        }
      }
      Start-Sleep -Seconds 2
    }
    $psiDel = New-Object System.Diagnostics.ProcessStartInfo
    $psiDel.FileName = $sch
    $psiDel.Arguments = "/Delete /TN `"$taskName`" /F"
    $psiDel.UseShellExecute = $false
    $psiDel.CreateNoWindow = $true
    try {
      $pd = [System.Diagnostics.Process]::Start($psiDel)
      $pd.WaitForExit()
    }
    catch { }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    if (-not $ok) {
      throw "Timeout: PNG not produced at $PngPath (user $ru must be logged on with a visible interactive session on the guest)."
    }
    $fi = Get-Item -LiteralPath $PngPath
    [pscustomobject]@{
      TaskUser  = $ru
      PngPath   = $fi.FullName
      SizeBytes = $fi.Length
      TaskName  = $taskName
    }
  } -ArgumentList $u, $p, $guestScriptPath, $guestPng

  Write-Host ("Guest interactive capture: {0} bytes, task user {1}" -f $result.SizeBytes, $result.TaskUser)

  if ($hostOutPng) {
    $parent = [System.IO.Path]::GetDirectoryName($hostOutPng)
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $proofJsonPath = [System.IO.Path]::ChangeExtension($hostOutPng, ".proof.json")
    try {
      ($result | ConvertTo-Json -Depth 6 -Compress) | Set-Content -LiteralPath $proofJsonPath -Encoding utf8
      Write-Host ("Proof record (JSON): {0}" -f $proofJsonPath)
    }
    catch {
      Write-Host ("Could not write proof JSON: {0}" -f $_.Exception.Message)
    }

    Copy-Item -FromSession $sess -Path $guestPng -Destination $hostOutPng -Force -ErrorAction Stop
    Write-Host ("VM capture on host: {0}" -f $hostOutPng)
  }

  Write-Host "vm-gennx-capture-guest: OK"
}
catch {
  Write-Host "vm-gennx-capture-guest failed: $($_.Exception.Message)"
  throw
}
finally {
  if ($sess) {
    Remove-PSSession -Session $sess -ErrorAction SilentlyContinue
  }
}
