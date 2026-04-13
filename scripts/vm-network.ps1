[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('diagnose', 'repair')]
  [string]$Action,

  [Parameter(Mandatory = $true)]
  [string]$VmName,

  [Parameter(Mandatory = $true)]
  [string]$SwitchName,

  [Parameter(Mandatory = $true)]
  [string]$HostGatewayIpv4,

  [Parameter(Mandatory = $true)]
  [int]$PrefixLength,

  [Parameter(Mandatory = $true)]
  [string]$SubnetPrefix,

  [Parameter(Mandatory = $true)]
  [string]$NatName,

  [Parameter(Mandatory = $true)]
  [string]$GuestIpv4,

  [string]$GuestWinRmHost = '',
  [string]$GuestUser = '',
  [string]$GuestPassword = '',
  [string]$OperatorUser = '',
  [string[]]$DnsServers = @('1.1.1.1', '8.8.8.8'),
  [int]$WinRmPort = 5985,
  [int]$SmbPort = 445,
  [int]$WaitSec = 180,
  [int]$PollMs = 500
)

$ErrorActionPreference = 'Stop'

if (-not $GuestWinRmHost) {
  $GuestWinRmHost = $GuestIpv4
}

if ($DnsServers.Count -eq 1 -and $DnsServers[0] -match ',') {
  $DnsServers = @($DnsServers[0].Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

if (-not $OperatorUser) {
  $OperatorUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
}

function Get-HyperVSnapshot {
  $result = [ordered]@{
    available = $false
    vm_name = $VmName
    vm_state = ''
    vm_status = ''
    vm_adapter_name = ''
    vm_adapter_switch_name = ''
    vm_adapter_vlan_mode = ''
    vm_adapter_untagged = $null
    vm_guest_ips = @()
    error_message = ''
  }

  try {
    Import-Module Hyper-V -ErrorAction Stop
    $vm = Get-VM -Name $VmName -ErrorAction Stop
    $result.available = $true
    $result.vm_state = $vm.State.ToString()
    $result.vm_status = [string]$vm.Status
    $adapter = @(Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop)[0]
    if ($adapter) {
      $result.vm_adapter_name = [string]$adapter.Name
      $result.vm_adapter_switch_name = [string]$adapter.SwitchName
      if ($adapter.IPAddresses) {
        $result.vm_guest_ips = @($adapter.IPAddresses | ForEach-Object { [string]$_ })
      }
      try {
        $vlan = Get-VMNetworkAdapterVlan -VMName $VmName -VMNetworkAdapterName $adapter.Name -ErrorAction Stop
        if ($vlan) {
          $result.vm_adapter_vlan_mode = [string]$vlan.OperationMode
          $result.vm_adapter_untagged = [bool]($vlan.OperationMode -eq 'Untagged')
        }
      } catch {}
    }
  } catch {
    $result.error_message = $_.Exception.Message
  }

  return [pscustomobject]$result
}

function Get-HostNetworkSnapshot {
  $ifAlias = 'vEthernet (' + $SwitchName + ')'
  $result = [ordered]@{
    switch_name = $SwitchName
    host_vnic_alias = $ifAlias
    host_gateway_ipv4 = $HostGatewayIpv4
    prefix_length = [int]$PrefixLength
    subnet_prefix = $SubnetPrefix
    nat_name = $NatName
    switch_exists = $false
    host_adapter_present = $false
    host_gateway_present = $false
    nat_present = $false
    nat_prefix = ''
    error_message = ''
  }

  try {
    $adapter = Get-NetAdapter -Name $ifAlias -ErrorAction SilentlyContinue
    if ($adapter) {
      $result.host_adapter_present = $true
      $result.switch_exists = $true
    }
    $desired = Get-NetIPAddress -InterfaceAlias $ifAlias -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -eq $HostGatewayIpv4 -and [int]$_.PrefixLength -eq [int]$PrefixLength } |
      Select-Object -First 1
    if ($desired) {
      $result.host_gateway_present = $true
    }
    try {
      $nat = Get-NetNat -Name $NatName -ErrorAction Stop
      if ($nat) {
        $result.nat_present = $true
        $result.nat_prefix = [string]$nat.InternalIPInterfaceAddressPrefix
      }
    } catch {}
  } catch {
    $result.error_message = $_.Exception.Message
  }

  return [pscustomobject]$result
}

function Test-TcpPortQuick {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ComputerName,

    [Parameter(Mandatory = $true)]
    [int]$Port,

    [int]$TimeoutMs = 3000
  )

  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect($ComputerName, $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    if ($client) {
      try { $client.Close() } catch {}
    }
    return $false
  }
}

function Get-GuestReachabilitySnapshot {
  $result = [ordered]@{
    guest_ip = $GuestIpv4
    guest_winrm_host = $GuestWinRmHost
    ping_ok = $false
    winrm_port = [int]$WinRmPort
    winrm_ok = $false
    smb_port = [int]$SmbPort
    smb_ok = $false
  }

  try {
    $result.ping_ok = [bool](Test-Connection -ComputerName $GuestWinRmHost -Count 1 -Quiet -TimeoutSeconds 2 -ErrorAction SilentlyContinue)
  } catch {}

  $result.winrm_ok = [bool](Test-TcpPortQuick -ComputerName $GuestWinRmHost -Port $WinRmPort -TimeoutMs 3000)
  $result.smb_ok = [bool](Test-TcpPortQuick -ComputerName $GuestWinRmHost -Port $SmbPort -TimeoutMs 3000)

  return [pscustomobject]$result
}

function Get-Diagnosis {
  [pscustomobject]@{
    action = 'diagnose'
    vm_name = $VmName
    host = Get-HostNetworkSnapshot
    hyperv = Get-HyperVSnapshot
    guest = Get-GuestReachabilitySnapshot
  }
}

function Ensure-HostNetwork {
  Import-Module Hyper-V -ErrorAction Stop

  $result = [ordered]@{
    switch_name = $SwitchName
    host_vnic_alias = ''
    host_gateway = $HostGatewayIpv4
    prefix_length = [int]$PrefixLength
    subnet_prefix = $SubnetPrefix
    nat_name = $NatName
    operator_user = $OperatorUser
    switch_created = $false
    host_ip_created = $false
    nat_created = $false
    nat_recreated = $false
    host_vlan_reset = $false
    host_isolation_reset = $false
    operator_group_added = $false
    operator_sign_out_required = $false
    operator_group_warning = ''
  }

  $groupName = 'Hyper-V Administrators'
  $members = @()
  try { $members = @(Get-LocalGroupMember -Group $groupName -ErrorAction Stop | ForEach-Object { [string]$_.Name }) } catch {}
  if ($OperatorUser -and -not ($members -contains $OperatorUser)) {
    try {
      Add-LocalGroupMember -Group $groupName -Member $OperatorUser -ErrorAction Stop
      $result.operator_group_added = $true
      $result.operator_sign_out_required = $true
    } catch {
      if ($_.Exception.Message -notmatch 'already' -and $_.Exception.Message -notmatch 'exists') {
        $result.operator_group_warning = 'Could not add the current operator to Hyper-V Administrators automatically.'
      }
    }
  }

  $sw = Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue
  if (-not $sw) {
    $sw = New-VMSwitch -Name $SwitchName -SwitchType Internal -ErrorAction Stop
    $result.switch_created = $true
  }

  $ifAlias = 'vEthernet (' + $SwitchName + ')'
  $result.host_vnic_alias = $ifAlias
  $adapter = $null
  for ($i = 0; $i -lt 30; $i++) {
    $adapter = Get-NetAdapter -Name $ifAlias -ErrorAction SilentlyContinue
    if ($adapter) { break }
    Start-Sleep -Seconds 1
  }
  if (-not $adapter) { throw ('Host vNIC not found: ' + $ifAlias) }

  $mgmtAdapter = Get-VMNetworkAdapter -ManagementOS -SwitchName $SwitchName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($mgmtAdapter) {
    try {
      Set-VMNetworkAdapterVlan -VMNetworkAdapter $mgmtAdapter -Untagged -ErrorAction Stop | Out-Null
      $result.host_vlan_reset = $true
    } catch {}
    try {
      Set-VMNetworkAdapterIsolation -VMNetworkAdapter $mgmtAdapter -IsolationMode None -AllowUntaggedTraffic $true -MultiTenantStack Off -ErrorAction Stop | Out-Null
      $result.host_isolation_reset = $true
    } catch {}
  }

  $currentIps = @(Get-NetIPAddress -InterfaceAlias $ifAlias -AddressFamily IPv4 -ErrorAction SilentlyContinue)
  foreach ($addr in $currentIps) {
    if ($addr.IPAddress -ne $HostGatewayIpv4 -or [int]$addr.PrefixLength -ne [int]$PrefixLength) {
      Remove-NetIPAddress -InterfaceIndex $addr.InterfaceIndex -IPAddress $addr.IPAddress -Confirm:$false -ErrorAction SilentlyContinue
    }
  }

  $desired = Get-NetIPAddress -InterfaceAlias $ifAlias -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $HostGatewayIpv4 -and [int]$_.PrefixLength -eq [int]$PrefixLength } |
    Select-Object -First 1
  if (-not $desired) {
    New-NetIPAddress -InterfaceAlias $ifAlias -IPAddress $HostGatewayIpv4 -PrefixLength $PrefixLength -ErrorAction Stop | Out-Null
    $result.host_ip_created = $true
  }

  $nat = Get-NetNat -Name $NatName -ErrorAction SilentlyContinue
  if ($nat -and [string]$nat.InternalIPInterfaceAddressPrefix -ne $SubnetPrefix) {
    Remove-NetNat -Name $NatName -Confirm:$false -ErrorAction Stop
    $nat = $null
    $result.nat_recreated = $true
  }
  if (-not $nat) {
    New-NetNat -Name $NatName -InternalIPInterfaceAddressPrefix $SubnetPrefix -ErrorAction Stop | Out-Null
    $result.nat_created = $true
  }

  return [pscustomobject]$result
}

function Ensure-VMRunning {
  Import-Module Hyper-V -ErrorAction Stop

  $started = $false
  $resumed = $false
  $vm0 = Get-VM -Name $VmName -ErrorAction Stop
  $alreadyRunningAtStart = ($vm0.State.ToString() -eq 'Running')
  $deadline = (Get-Date).AddSeconds($WaitSec)
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($true) {
    $vmCur = Get-VM -Name $VmName -ErrorAction Stop
    $state = $vmCur.State.ToString()
    if ($state -eq 'Running') { break }
    if ($state -eq 'Off') { Start-VM -Name $VmName | Out-Null; $started = $true }
    elseif ($state -eq 'Paused') { Resume-VM -Name $VmName | Out-Null; $resumed = $true }
    elseif ($state -eq 'Saved') { Start-VM -Name $VmName | Out-Null; $started = $true }
    elseif ($state -eq 'Starting' -or $state -eq 'Stopping') { }
    else { throw ('Cannot reach Running from VM state: ' + $state) }
    if ((Get-Date) -gt $deadline) { throw ('VM did not reach Running within ' + $WaitSec + ' s (last state: ' + $state + ')') }
    Start-Sleep -Milliseconds $PollMs
  }
  $vm = Get-VM -Name $VmName -ErrorAction Stop
  return [pscustomobject]@{
    vm_name = $vm.Name
    started = $started
    resumed = $resumed
    already_running_at_start = $alreadyRunningAtStart
    wait_ms = [int]$sw.ElapsedMilliseconds
    state = $vm.State.ToString()
    status = [string]$vm.Status
  }
}

function Ensure-GuestNetwork {
  Import-Module Hyper-V -ErrorAction Stop

  if (-not $GuestUser -or -not $GuestPassword) {
    throw 'Guest credentials are required for repair (guest_local_user / guest_local_password).'
  }

  $result = [ordered]@{
    vm_name = $VmName
    switch_name = $SwitchName
    guest_ip = $GuestIpv4
    prefix_length = [int]$PrefixLength
    gateway = $HostGatewayIpv4
    dns_servers = @($DnsServers)
    vm_adapter_added = $false
    vm_adapter_reconnected = $false
    vm_adapter_vlan_reset = $false
    vm_adapter_isolation_reset = $false
    guest = $null
  }

  $adapter = @(Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop)[0]
  if (-not $adapter) {
    Add-VMNetworkAdapter -VMName $VmName -SwitchName $SwitchName -Name 'Network Adapter' -ErrorAction Stop | Out-Null
    $result.vm_adapter_added = $true
    $adapter = @(Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop)[0]
  }
  if (-not $adapter) { throw 'Hyper-V VM has no network adapter after add attempt.' }

  if ([string]$adapter.SwitchName -ne $SwitchName) {
    Connect-VMNetworkAdapter -VMName $VmName -Name $adapter.Name -SwitchName $SwitchName -ErrorAction Stop
    $result.vm_adapter_reconnected = $true
  }

  try {
    Set-VMNetworkAdapterVlan -VMName $VmName -VMNetworkAdapterName $adapter.Name -Untagged -ErrorAction Stop | Out-Null
    $result.vm_adapter_vlan_reset = $true
  } catch {
    Set-VMNetworkAdapterVlan -VMName $VmName -Untagged -ErrorAction Stop | Out-Null
    $result.vm_adapter_vlan_reset = $true
  }

  try {
    Set-VMNetworkAdapterIsolation -VMNetworkAdapter $adapter -IsolationMode None -AllowUntaggedTraffic $true -MultiTenantStack Off -ErrorAction Stop | Out-Null
    $result.vm_adapter_isolation_reset = $true
  } catch {}

  $sec = ConvertTo-SecureString $GuestPassword -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential($GuestUser, $sec)
  $guest = Invoke-Command -VMName $VmName -Credential $cred -ScriptBlock {
    param($GuestIpv4, $PrefixLength, $HostGatewayIpv4, [string[]]$DnsServers)

    $adapter = Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
      Where-Object { $_.Status -ne 'Disabled' } |
      Sort-Object -Property ifIndex |
      Select-Object -First 1
    if (-not $adapter) {
      $adapter = Get-NetAdapter -ErrorAction SilentlyContinue |
        Where-Object { $_.Status -ne 'Disabled' -and $_.Name -notmatch 'Loopback' } |
        Sort-Object -Property ifIndex |
        Select-Object -First 1
    }
    if (-not $adapter) { throw 'No active guest network adapter found.' }

    $ifIndex = [int]$adapter.ifIndex
    try { Set-NetIPInterface -InterfaceIndex $ifIndex -Dhcp Disabled -AddressFamily IPv4 -ErrorAction SilentlyContinue | Out-Null } catch {}

    $existing = @(Get-NetIPAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -ne '127.0.0.1' })
    foreach ($addr in $existing) {
      try { Remove-NetIPAddress -InputObject $addr -Confirm:$false -ErrorAction SilentlyContinue } catch {}
    }

    $defaultRoutes = @(Get-NetRoute -InterfaceIndex $ifIndex -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue)
    foreach ($route in $defaultRoutes) {
      try { Remove-NetRoute -InputObject $route -Confirm:$false -ErrorAction SilentlyContinue } catch {}
    }

    Start-Sleep -Milliseconds 500

    $desired = Get-NetIPAddress -InterfaceIndex $ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -eq $GuestIpv4 -and [int]$_.PrefixLength -eq [int]$PrefixLength } |
      Select-Object -First 1
    if (-not $desired) {
      New-NetIPAddress -InterfaceIndex $ifIndex -IPAddress $GuestIpv4 -PrefixLength $PrefixLength -DefaultGateway $HostGatewayIpv4 -ErrorAction Stop | Out-Null
    }

    Set-DnsClientServerAddress -InterfaceIndex $ifIndex -ServerAddresses $DnsServers -ErrorAction Stop | Out-Null
    try { Set-NetConnectionProfile -InterfaceIndex $ifIndex -NetworkCategory Private -ErrorAction SilentlyContinue | Out-Null } catch {}
    try { Enable-PSRemoting -Force -SkipNetworkProfileCheck -ErrorAction SilentlyContinue | Out-Null } catch {}
    foreach ($group in @('Windows Remote Management', 'File and Printer Sharing')) {
      try { Enable-NetFirewallRule -DisplayGroup $group -ErrorAction SilentlyContinue | Out-Null } catch {}
    }
    foreach ($rule in @('FPS-SMB-In-TCP', 'FPS-SMB-In-UDP', 'FPS-NB_Datagram-In', 'FPS-NB_Name-In', 'FPS-NB_Session-In', 'FPS-ICMP4-ERQ-In', 'WINRM-HTTP-In-TCP')) {
      try { Get-NetFirewallRule -Name ($rule + '*') -ErrorAction SilentlyContinue | Enable-NetFirewallRule -ErrorAction SilentlyContinue | Out-Null } catch {}
    }
    try { winrm quickconfig -quiet | Out-Null } catch {}
    foreach ($netshArgs in @(
      @('advfirewall', 'firewall', 'delete', 'rule', 'name=clibase-WinRM-5985'),
      @('advfirewall', 'firewall', 'delete', 'rule', 'name=clibase-SMB-445'),
      @('advfirewall', 'firewall', 'delete', 'rule', 'name=clibase-ICMP4-Echo'),
      @('advfirewall', 'firewall', 'add', 'rule', 'name=clibase-WinRM-5985', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=5985', 'profile=any'),
      @('advfirewall', 'firewall', 'add', 'rule', 'name=clibase-SMB-445', 'dir=in', 'action=allow', 'protocol=TCP', 'localport=445', 'profile=any'),
      @('advfirewall', 'firewall', 'add', 'rule', 'name=clibase-ICMP4-Echo', 'dir=in', 'action=allow', 'protocol=icmpv4:8,any', 'profile=any')
    )) {
      try { & netsh.exe @netshArgs | Out-Null } catch {}
    }
    foreach ($svc in @('LanmanServer', 'LanmanWorkstation', 'WinRM')) {
      try {
        Set-Service -Name $svc -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name $svc -ErrorAction SilentlyContinue
      } catch {}
    }

    $pingGateway = [bool](Test-Connection -ComputerName $HostGatewayIpv4 -Count 1 -Quiet)
    $pingPublic = [bool](Test-Connection -ComputerName '8.8.8.8' -Count 1 -Quiet)
    $httpMsftconnect = 0
    try { $httpMsftconnect = (Invoke-WebRequest -UseBasicParsing -Uri 'http://www.msftconnecttest.com/connecttest.txt' -TimeoutSec 10).StatusCode } catch {}
    $winrmLocalhost = $false
    try { Test-WSMan -ComputerName 'localhost' -ErrorAction Stop | Out-Null; $winrmLocalhost = $true } catch {}
    $profile = Get-NetConnectionProfile -InterfaceIndex $ifIndex -ErrorAction SilentlyContinue | Select-Object -First 1
    [pscustomobject]@{
      interface_alias = [string]$adapter.Name
      interface_index = $ifIndex
      applied_ipv4 = $GuestIpv4
      prefix_length = [int]$PrefixLength
      gateway = $HostGatewayIpv4
      dns_servers = @($DnsServers)
      network_category = if ($profile) { [string]$profile.NetworkCategory } else { '' }
      ping_gateway = $pingGateway
      ping_8_8_8_8 = $pingPublic
      http_msftconnecttest = $httpMsftconnect
      winrm_localhost = $winrmLocalhost
    }
  } -ArgumentList $GuestIpv4, $PrefixLength, $HostGatewayIpv4, $DnsServers

  $result.guest = $guest
  return [pscustomobject]$result
}

try {
  if ($Action -eq 'diagnose') {
    Get-Diagnosis | ConvertTo-Json -Compress -Depth 12
    exit 0
  }

  $hostPrepare = Ensure-HostNetwork
  $vmEnsureRunning = Ensure-VMRunning
  $guestPrepare = Ensure-GuestNetwork
  $diagnosis = Get-Diagnosis

  [pscustomobject]@{
    action = 'repair'
    vm_name = $VmName
    host_prepare = $hostPrepare
    vm_ensure_running = $vmEnsureRunning
    guest_prepare = $guestPrepare
    diagnosis = $diagnosis
  } | ConvertTo-Json -Compress -Depth 12
  exit 0
} catch {
  [pscustomobject]@{
    action = $Action
    vm_name = $VmName
    error_message = $_.Exception.Message
    exception_type = $_.Exception.GetType().FullName
    script_stack_trace = $_.ScriptStackTrace
  } | ConvertTo-Json -Compress -Depth 8
  exit 1
}
