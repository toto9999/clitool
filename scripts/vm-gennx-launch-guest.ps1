#requires -Version 5.1
<#
  기본: 게스트에서 schtasks(또는 Register-ScheduledTask)로 프로필 사용자의 대화형 세션에서 GenNX 실행
       (vmconnect/RDP로 로그온한 사용자와 동일한 계정이어야 창이 보이기 쉬움).
  --direct (CLIBASE_VM_GENNX_LAUNCH_MODE=direct): PowerShell Direct 세션에서만 Start-Process (화면에 안 보일 수 있음).
#>
param(
  [string]$GuestWinRmHost = "",
  [string]$VmName = "",
  [string]$GuestGennxExe = "",
  [switch]$SkipEnsureVm
)

$ErrorActionPreference = "Stop"

Write-Host "Launching GenNX on guest..."

if (-not $VmName) {
  $VmName = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HYPERV_NAME")
}
if (-not $VmName) {
  $VmName = "GenNX-VM"
}

if (-not $GuestGennxExe) {
  $GuestGennxExe = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GUEST_GENNX_LAUNCH_EXE")
}
if (-not $GuestGennxExe) {
  $GuestGennxExe = "C:\Users\dd\Desktop\x64_Release_D260330_T1123_N224_r_b7_MR\GenNX.exe"
}

$guestProofPng = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GUEST_PROOF_PNG")
if (-not $guestProofPng) {
  $guestProofPng = "C:\Windows\Temp\clibase-gennx-launch-proof.png"
}

$hostProofPng = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HOST_PROOF_PNG")
$hostAttestationJson = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HOST_ATTESTATION_JSON")

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

$sess = $null
try {
  if ($usePowerShellDirect) {
    $sess = New-PSSession -VMName $VmName -Credential $cred -ErrorAction Stop
  }
  else {
    $sess = New-PSSession -ComputerName $GuestWinRmHost -Credential $cred -ErrorAction Stop
  }

  $launchMode = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GENNX_LAUNCH_MODE")
  if (-not $launchMode) {
    $launchMode = "interactive"
  }

  $sbDirect = {
    param([string]$ExePath, [string]$ProofPng)
    $ErrorActionPreference = "Stop"
    $exeLeaf = [System.IO.Path]::GetFileName($ExePath)

    if (-not (Test-Path -LiteralPath $ExePath)) {
      throw "Guest: GenNX.exe not found: $ExePath"
    }
    $dir = [System.IO.Path]::GetDirectoryName($ExePath)
    Remove-Item -LiteralPath $ProofPng -Force -ErrorAction SilentlyContinue

    $q = $exeLeaf.Replace("'", "''")
    $pidsBefore = @(
      @(Get-CimInstance Win32_Process -Filter "Name='$q'" -ErrorAction SilentlyContinue |
          Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $ExePath) }) |
        ForEach-Object { [int]$_.ProcessId }
    ) | Sort-Object -Unique

    $launchAt = Get-Date
    $sp = Start-Process -FilePath $ExePath -WorkingDirectory $dir -WindowStyle Normal -PassThru -ErrorAction Stop
    Start-Sleep -Milliseconds 500

    $cim = $null
    $waitDeadline = (Get-Date).AddSeconds(90)
    while ((Get-Date) -lt $waitDeadline) {
      $candidates = @(Get-CimInstance Win32_Process -Filter "Name='$q'" -ErrorAction SilentlyContinue |
          Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $ExePath) })
      $hits = New-Object System.Collections.ArrayList
      foreach ($c in $candidates) {
        $procId = [int]$c.ProcessId
        if ($pidsBefore.Count -gt 0) {
          if ($procId -notin $pidsBefore) {
            [void]$hits.Add($c)
          }
        }
        else {
          try {
            if (-not $c.CreationDate) {
              continue
            }
            $cd = [System.Management.ManagementDateTimeConverter]::ToDateTime($c.CreationDate)
            if ($cd -ge $launchAt.AddSeconds(-10)) {
              [void]$hits.Add($c)
            }
          }
          catch { }
        }
      }
      if ($hits.Count -gt 0) {
        $cim = @($hits) | Sort-Object -Property ProcessId -Descending | Select-Object -First 1
        break
      }
      Start-Sleep -Seconds 2
    }
    if (-not $cim) {
      $beforeTxt = if ($pidsBefore.Count -gt 0) { ($pidsBefore -join ", ") } else { "(none)" }
      throw "Guest: no NEW GenNX process after Start-Process within 90s. PIDs before launch: $beforeTxt."
    }

    $ui = $null
    try {
      $ui = Get-Process -Id $cim.ProcessId -ErrorAction Stop
    }
    catch { }

    $shotErr = $null
    $shotOk = $false
    try {
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
      $bmp = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $g.Dispose()
      $bmp.Save($ProofPng, [System.Drawing.Imaging.ImageFormat]::Png)
      $bmp.Dispose()
      $shotOk = (Test-Path -LiteralPath $ProofPng)
    }
    catch {
      $shotErr = $_.Exception.Message
    }

    [pscustomobject]@{
      LaunchMethod          = "direct_powershell_session"
      TaskUser              = ""
      ProcessId             = [int]$cim.ProcessId
      ExecutablePath        = $cim.ExecutablePath
      PidsBeforeLaunch      = @($pidsBefore)
      PassThruProcessId     = [int]$sp.Id
      MainWindowTitle       = if ($ui) { $ui.MainWindowTitle } else { "" }
      Responding            = if ($ui) { $ui.Responding } else { $false }
      ScreenshotOnGuest     = $shotOk
      ScreenshotGuestPath   = $ProofPng
      ScreenshotError       = $shotErr
      Verification          = "new_process_only_not_stale_pid"
    }
  }

  $sbInteractive = {
    param([string]$ExePath, [string]$CredUser, [string]$CredPass)
    $ErrorActionPreference = "Stop"
    $exeLeaf = [System.IO.Path]::GetFileName($ExePath)

    if (-not (Test-Path -LiteralPath $ExePath)) {
      throw "Guest: GenNX.exe not found: $ExePath"
    }
    $dir = [System.IO.Path]::GetDirectoryName($ExePath)

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
      param([string]$TaskName, [string]$Ps1Path, [string]$RunUser, [string]$RunPass)
      $sta = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$Ps1Path`""
      $stt = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddSeconds(25))
      $sets = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
      $principal = New-ScheduledTaskPrincipal -UserId $RunUser -LogonType Interactive -RunLevel Highest
      Register-ScheduledTask -TaskName $TaskName -Action $sta -Trigger $stt -Principal $principal -Settings $sets -Force | Out-Null
      Start-ScheduledTask -TaskName $TaskName
    }

    $q = $exeLeaf.Replace("'", "''")
    $pidsBefore = @(
      @(Get-CimInstance Win32_Process -Filter "Name='$q'" -ErrorAction SilentlyContinue |
          Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $ExePath) }) |
        ForEach-Object { [int]$_.ProcessId }
    ) | Sort-Object -Unique

    $ru = Resolve-TaskUser -Raw $CredUser
    $launchPs1 = "C:\Windows\Temp\clibase-launch-gennx-once.ps1"
    $dsl = $dir.Replace("'", "''")
    $esl = $ExePath.Replace("'", "''")
    $body = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '$dsl'
Start-Process -FilePath '$esl' -WorkingDirectory '$dsl' -WindowStyle Normal
"@
    Set-Content -LiteralPath $launchPs1 -Value $body -Encoding UTF8

    $sch = Join-Path $env:SystemRoot "System32\schtasks.exe"
    $taskName = "ClibaseGennxLaunch_" + ([Guid]::NewGuid().ToString("N").Substring(0, 12))
    $runAt = (Get-Date).AddMinutes(1)
    $st = $runAt.ToString("HH:mm")
    $sd = $runAt.ToString("yyyy/MM/dd")
    $taskTr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$launchPs1`""

    try {
      try {
        Invoke-RegisterScheduledTaskIx -TaskName $taskName -Ps1Path $launchPs1 -RunUser $ru -RunPass $CredPass
      }
      catch {
        try {
          Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        }
        catch { }
        Invoke-SchtasksCreateRunIx -TaskName $taskName -Tr $taskTr -St $st -Sd $sd -RunUser $ru -RunPass $CredPass -SchExe $sch
      }

      $launchAt = Get-Date
      $cim = $null
      $waitDeadline = (Get-Date).AddSeconds(120)
      while ((Get-Date) -lt $waitDeadline) {
        $candidates = @(Get-CimInstance Win32_Process -Filter "Name='$q'" -ErrorAction SilentlyContinue |
            Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $ExePath) })
        $hits = New-Object System.Collections.ArrayList
        foreach ($c in $candidates) {
          $procId = [int]$c.ProcessId
          if ($pidsBefore.Count -gt 0) {
            if ($procId -notin $pidsBefore) {
              [void]$hits.Add($c)
            }
          }
          else {
            try {
              if (-not $c.CreationDate) {
                continue
              }
              $cd = [System.Management.ManagementDateTimeConverter]::ToDateTime($c.CreationDate)
              if ($cd -ge $launchAt.AddSeconds(-15)) {
                [void]$hits.Add($c)
              }
            }
            catch { }
          }
        }
        if ($hits.Count -gt 0) {
          $cim = @($hits) | Sort-Object -Property ProcessId -Descending | Select-Object -First 1
          break
        }
        Start-Sleep -Seconds 2
      }

      if (-not $cim) {
        $beforeTxt = if ($pidsBefore.Count -gt 0) { ($pidsBefore -join ", ") } else { "(none)" }
        throw "Guest: no NEW GenNX PID after interactive task within 120s. PIDs before: $beforeTxt. Log on to the guest as $ru (vmconnect/RDP) so the task can run in that session."
      }

      $ui = $null
      try {
        $ui = Get-Process -Id $cim.ProcessId -ErrorAction Stop
      }
      catch { }

      [pscustomobject]@{
        LaunchMethod        = "interactive_schtasks"
        TaskUser            = $ru
        TaskName            = $taskName
        ProcessId           = [int]$cim.ProcessId
        ExecutablePath      = $cim.ExecutablePath
        PidsBeforeLaunch    = @($pidsBefore)
        PassThruProcessId   = 0
        MainWindowTitle     = if ($ui) { $ui.MainWindowTitle } else { "" }
        Responding          = if ($ui) { $ui.Responding } else { $false }
        ScreenshotOnGuest   = $false
        ScreenshotGuestPath = ""
        ScreenshotError     = $null
        Verification        = "interactive_schtasks_new_pid"
      }
    }
    finally {
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
      Remove-Item -LiteralPath $launchPs1 -Force -ErrorAction SilentlyContinue
    }
  }

  if ($launchMode -eq "direct") {
    Write-Host "Launch mode: direct (Start-Process in remote automation session only)."
    $result = Invoke-Command -Session $sess -ScriptBlock $sbDirect -ArgumentList $GuestGennxExe, $guestProofPng
  }
  else {
    Write-Host "Launch mode: interactive (scheduled task as $u; log on to guest as this user for visible UI)."
    $result = Invoke-Command -Session $sess -ScriptBlock $sbInteractive -ArgumentList $GuestGennxExe, $u, $p
  }

  if ($result.LaunchMethod -eq "interactive_schtasks") {
    Write-Host ("Started via interactive task as {0}. If GenNX window is missing, log on to the VM as that user first." -f $result.TaskUser)
  }
  else {
    Write-Host ("Remote Win32: new PID after Start-Process: PID={0} Exe={1}" -f $result.ProcessId, $result.ExecutablePath)
  }
  if ($result.PidsBeforeLaunch -and $result.PidsBeforeLaunch.Count -gt 0) {
    Write-Host ("  PIDs before launch: {0}" -f ($result.PidsBeforeLaunch -join ", "))
  }
  if ($result.MainWindowTitle) {
    Write-Host ("  MainWindowTitle: {0}" -f $result.MainWindowTitle)
  }

  $attestationPath = $hostAttestationJson
  if (-not $attestationPath -and $hostProofPng) {
    $attestationPath = [System.IO.Path]::ChangeExtension($hostProofPng, ".attestation.json")
  }

  $limDirect = "direct: PowerShell Direct is often non-interactive (session 0)."
  $limIx = "interactive: Task runs as TaskUser; visible UI requires that user to be logged on (vmconnect/RDP) with an interactive session."
  $lim = if ($result.LaunchMethod -eq "interactive_schtasks") { $limIx } else { $limDirect }

  if ($hostProofPng -or $attestationPath) {
    $parent = $null
    if ($attestationPath) {
      $parent = [System.IO.Path]::GetDirectoryName($attestationPath)
    }
    elseif ($hostProofPng) {
      $parent = [System.IO.Path]::GetDirectoryName($hostProofPng)
    }
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
      New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    if ($attestationPath) {
      try {
        $envelope = [ordered]@{
          attestation_schema = "clibase.vm_gennx.launch_guest.v2"
          what_this_file_is  = "Win32 metadata after launch; interactive mode targets the profile user's session via Task Scheduler."
          limitation         = $lim
          payload            = $result
        }
        ($envelope | ConvertTo-Json -Depth 10 -Compress) | Set-Content -LiteralPath $attestationPath -Encoding utf8
        Write-Host ("Attestation JSON: {0}" -f $attestationPath)
      }
      catch {
        Write-Host ("Could not write attestation JSON: {0}" -f $_.Exception.Message)
      }
    }
    $copied = $false
    if ($hostProofPng -and ($launchMode -eq "direct")) {
      try {
        $existsOnGuest = Invoke-Command -Session $sess -ScriptBlock {
          param($gp)
          Test-Path -LiteralPath $gp
        } -ArgumentList $guestProofPng
        if ($existsOnGuest) {
          Copy-Item -FromSession $sess -Path $guestProofPng -Destination $hostProofPng -Force -ErrorAction Stop
          $copied = $true
        }
      }
      catch {
        Write-Host ("Optional guest PNG copy failed: {0}" -f $_.Exception.Message)
      }
      if ($copied) {
        Write-Host ("Optional remote screen grab on host: {0}" -f $hostProofPng)
      }
    }
  }

  if (($launchMode -eq "direct") -and (-not $result.ScreenshotOnGuest) -and $result.ScreenshotError) {
    Write-Host ("Guest screen capture note: {0}" -f $result.ScreenshotError)
  }

  Write-Host "vm-gennx-launch-guest: OK"
}
finally {
  if ($sess) {
    Remove-PSSession -Session $sess -ErrorAction SilentlyContinue
  }
}
