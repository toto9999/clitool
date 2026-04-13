#requires -Version 5.1
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('status', 'ensure-visible')]
  [string]$Action,

  [string]$GuestWinRmHost = "",
  [string]$VmName = "",
  [switch]$SkipEnsureVm,
  [int]$WaitSec = 300,
  [int]$PollSec = 5
)

$ErrorActionPreference = "Stop"

function Get-GuestCredential {
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
  return [pscustomobject]@{
    UserName = $u
    Password = $p
    Credential = New-Object System.Management.Automation.PSCredential ($u, $sec)
  }
}

function Get-SimpleUserName([string]$userName) {
  if (-not $userName) { return "" }
  $candidate = $userName.Trim()
  if ($candidate.Contains("\")) {
    return ($candidate.Split("\") | Select-Object -Last 1)
  }
  return $candidate
}

function Wait-ForPowerShellDirect([string]$vmName, $cred, [int]$timeoutSec) {
  Import-Module Hyper-V -ErrorAction Stop
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $vm = Get-VM -Name $vmName -ErrorAction Stop
  while ($vm.State.ToString() -ne "Running") {
    if ((Get-Date) -gt $deadline) {
      throw "Timeout: VM '$vmName' did not reach Running."
    }
    $state = $vm.State.ToString()
    if ($state -eq "Off" -or $state -eq "Saved") {
      Start-VM -Name $vmName | Out-Null
    }
    elseif ($state -eq "Paused") {
      Resume-VM -Name $vmName | Out-Null
    }
    Start-Sleep -Seconds 2
    $vm = Get-VM -Name $vmName -ErrorAction Stop
  }

  $directDeadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $directDeadline) {
    try {
      $ping = Invoke-Command -VMName $vmName -Credential $cred -ScriptBlock { "ps-direct-ok" } -ErrorAction Stop
      if ($ping -eq "ps-direct-ok") {
        return
      }
    } catch {}
    Start-Sleep -Seconds $PollSec
  }
  throw "PowerShell Direct to '$vmName' failed after $timeoutSec s."
}

function Wait-ForWinRM([string]$hostName, $cred, [int]$timeoutSec) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      Test-WSMan -ComputerName $hostName -Credential $cred -Authentication Default -ErrorAction Stop | Out-Null
      return
    } catch {}
    Start-Sleep -Seconds $PollSec
  }
  throw "WinRM on '$hostName' was not reachable within $timeoutSec s."
}

if (-not $VmName) {
  $VmName = [Environment]::GetEnvironmentVariable("CLIBASE_VM_HYPERV_NAME")
}
if (-not $VmName) {
  $VmName = "GenNX-VM"
}

if (-not $GuestWinRmHost) {
  $GuestWinRmHost = [Environment]::GetEnvironmentVariable("CLIBASE_VM_GENNX_VERIFY_GUEST_HOST")
}

$usePowerShellDirect = -not $SkipEnsureVm
if ($SkipEnsureVm -and -not $GuestWinRmHost) {
  throw "With -SkipEnsureVm set -GuestWinRmHost or CLIBASE_VM_GENNX_VERIFY_GUEST_HOST."
}

$guest = Get-GuestCredential
$targetSimpleUser = Get-SimpleUserName $guest.UserName

if (-not $targetSimpleUser) {
  throw "Could not resolve the guest local user from CLIBASE_VM_WINRM_USER / CLIBASE_VM_GUEST_USER."
}

if ($usePowerShellDirect) {
  Wait-ForPowerShellDirect -vmName $VmName -cred $guest.Credential -timeoutSec 420
} else {
  Wait-ForWinRM -hostName $GuestWinRmHost -cred $guest.Credential -timeoutSec 420
}

$session = $null
try {
  if ($usePowerShellDirect) {
    $session = New-PSSession -VMName $VmName -Credential $guest.Credential -ErrorAction Stop
  } else {
    $session = New-PSSession -ComputerName $GuestWinRmHost -Credential $guest.Credential -ErrorAction Stop
  }

  $statusScript = {
    param([string]$ExpectedUser)

    function Get-SimpleUserNameInner([string]$userName) {
      if (-not $userName) { return "" }
      $candidate = $userName.Trim()
      if ($candidate.Contains("\")) {
        return ($candidate.Split("\") | Select-Object -Last 1)
      }
      return $candidate
    }

    $explorer = @()
    try {
      $explorer = @(
        Get-Process explorer -IncludeUserName -ErrorAction SilentlyContinue |
          Select-Object ProcessName, Id, UserName, SessionId, MainWindowTitle
      )
    } catch {}

    $matchingExplorer = @(
      $explorer | Where-Object {
        (Get-SimpleUserNameInner ([string]$_.UserName)) -ieq $ExpectedUser
      }
    )

    $quserOutput = ""
    try {
      $quserOutput = (& quser 2>&1 | Out-String).Trim()
    } catch {
      $quserOutput = $_.Exception.Message
    }

    $winlogon = $null
    try {
      $winlogon = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -ErrorAction Stop
    } catch {}

    [pscustomobject]@{
      computer_name = $env:COMPUTERNAME
      expected_user = $ExpectedUser
      visible_user_logged_on = ($matchingExplorer.Count -gt 0)
      explorer_processes = @($explorer)
      matching_explorer_processes = @($matchingExplorer)
      quser_output = $quserOutput
      autologon = [pscustomobject]@{
        auto_admin_logon = if ($winlogon) { [string]$winlogon.AutoAdminLogon } else { "" }
        force_auto_logon = if ($winlogon) { [string]$winlogon.ForceAutoLogon } else { "" }
        default_user_name = if ($winlogon) { [string]$winlogon.DefaultUserName } else { "" }
        default_domain_name = if ($winlogon) { [string]$winlogon.DefaultDomainName } else { "" }
        default_password_present = if ($winlogon) { -not [string]::IsNullOrWhiteSpace([string]$winlogon.DefaultPassword) } else { $false }
      }
    }
  }

  $statusBefore = Invoke-Command -Session $session -ScriptBlock $statusScript -ArgumentList $targetSimpleUser

  if ($Action -eq "status") {
    [pscustomobject]@{
      action = "status"
      vm_name = $VmName
      guest_winrm_host = $GuestWinRmHost
      uses_powershell_direct = $usePowerShellDirect
      status = $statusBefore
    } | ConvertTo-Json -Compress -Depth 10
    exit 0
  }

  if ($statusBefore.visible_user_logged_on) {
    [pscustomobject]@{
      action = "ensure-visible"
      vm_name = $VmName
      guest_winrm_host = $GuestWinRmHost
      uses_powershell_direct = $usePowerShellDirect
      target_user = $targetSimpleUser
      session_already_visible = $true
      auto_logon_configured = $false
      restarted = $false
      ensured_visible = $true
      status_before = $statusBefore
      status_after = $statusBefore
    } | ConvertTo-Json -Compress -Depth 10
    exit 0
  }

  $configureAutoLogon = {
    param([string]$ExpectedUser, [string]$PlainPassword)
    $regPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
    $regNativePath = "HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

    function Set-WinlogonStringValue([string]$Name, [string]$Value) {
      $null = & reg.exe ADD $regNativePath /v $Name /t REG_SZ /d $Value /f
      if ($LASTEXITCODE -ne 0) {
        throw "Failed to set Winlogon value '$Name' via reg.exe."
      }
    }

    function Remove-WinlogonValueIfExists([string]$Name) {
      $null = & reg.exe QUERY $regNativePath /v $Name 2>$null
      if ($LASTEXITCODE -eq 0) {
        $null = & reg.exe DELETE $regNativePath /v $Name /f 2>$null
        if ($LASTEXITCODE -ne 0) {
          throw "Failed to remove Winlogon value '$Name' via reg.exe."
        }
      }
    }

    if (-not (Test-Path -LiteralPath $regPath)) {
      New-Item -Path $regPath -Force | Out-Null
    }
    Set-WinlogonStringValue -Name "AutoAdminLogon" -Value "1"
    Set-WinlogonStringValue -Name "ForceAutoLogon" -Value "1"
    Set-WinlogonStringValue -Name "DefaultUserName" -Value $ExpectedUser
    Set-WinlogonStringValue -Name "DefaultPassword" -Value $PlainPassword
    Set-WinlogonStringValue -Name "DefaultDomainName" -Value $env:COMPUTERNAME
    Remove-WinlogonValueIfExists -Name "AutoLogonCount"
    [pscustomobject]@{
      configured = $true
      default_user_name = $ExpectedUser
      default_domain_name = $env:COMPUTERNAME
      auto_admin_logon = "1"
      force_auto_logon = "1"
    }
  }

  $autoLogonConfig = Invoke-Command -Session $session -ScriptBlock $configureAutoLogon -ArgumentList $targetSimpleUser, $guest.Password

  try {
    Invoke-Command -Session $session -ScriptBlock { Restart-Computer -Force } -ErrorAction SilentlyContinue | Out-Null
  } catch {}

  try {
    Remove-PSSession -Session $session -ErrorAction SilentlyContinue
  } catch {}
  $session = $null

  Start-Sleep -Seconds 10
  if ($usePowerShellDirect) {
    Wait-ForPowerShellDirect -vmName $VmName -cred $guest.Credential -timeoutSec $WaitSec
  } else {
    Wait-ForWinRM -hostName $GuestWinRmHost -cred $guest.Credential -timeoutSec $WaitSec
  }

  if ($usePowerShellDirect) {
    $session = New-PSSession -VMName $VmName -Credential $guest.Credential -ErrorAction Stop
  } else {
    $session = New-PSSession -ComputerName $GuestWinRmHost -Credential $guest.Credential -ErrorAction Stop
  }

  $deadline = (Get-Date).AddSeconds($WaitSec)
  $statusAfter = $null
  while ((Get-Date) -lt $deadline) {
    $statusAfter = Invoke-Command -Session $session -ScriptBlock $statusScript -ArgumentList $targetSimpleUser
    if ($statusAfter.visible_user_logged_on) {
      break
    }
    Start-Sleep -Seconds $PollSec
  }

  if (-not $statusAfter) {
    $statusAfter = Invoke-Command -Session $session -ScriptBlock $statusScript -ArgumentList $targetSimpleUser
  }

  $ensured = [bool]$statusAfter.visible_user_logged_on
  [pscustomobject]@{
    action = "ensure-visible"
    vm_name = $VmName
    guest_winrm_host = $GuestWinRmHost
    uses_powershell_direct = $usePowerShellDirect
    target_user = $targetSimpleUser
    session_already_visible = $false
    auto_logon_configured = $autoLogonConfig
    restarted = $true
    ensured_visible = $ensured
    status_before = $statusBefore
    status_after = $statusAfter
  } | ConvertTo-Json -Compress -Depth 10

  if (-not $ensured) {
    exit 1
  }
  exit 0
} catch {
  [pscustomobject]@{
    action = $Action
    vm_name = $VmName
    guest_winrm_host = $GuestWinRmHost
    uses_powershell_direct = $usePowerShellDirect
    error_message = $_.Exception.Message
    exception_type = $_.Exception.GetType().FullName
    script_stack_trace = $_.ScriptStackTrace
  } | ConvertTo-Json -Compress -Depth 8
  exit 1
} finally {
  if ($session) {
    try {
      Remove-PSSession -Session $session -ErrorAction SilentlyContinue
    } catch {}
  }
}
