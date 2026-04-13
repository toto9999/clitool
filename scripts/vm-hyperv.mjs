#!/usr/bin/env node
/**
 * Hyper-V CLI helpers (Windows).
 *
 * Operator contract:
 *   batcli vm hyperv <list|start|connect|ensure-running|guest-ip> [vm-name] [--vm_profile_key K] [--no-auto-elevate]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const INTERNAL_ELEVATED = "--clibase-internal-hyperv-elevated";

function powershellExe() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function loadProfile(vmProfileKey) {
  const p = path.join(repoRoot, "workspace", "vm-profiles.yaml");
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const doc = YAML.parse(fs.readFileSync(p, "utf8"));
    const rows = Array.isArray(doc?.vm_profiles) ? doc.vm_profiles : [];
    return rows.find((row) => row && row.vm_profile_key === vmProfileKey) ?? null;
  } catch {
    return null;
  }
}

function canHyperVManageSync(vmName = "GenNX-VM") {
  const shell = powershellExe();
  const r = spawnSync(
    shell,
    [
      "-NoProfile",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        "try {",
        "  Import-Module Hyper-V -ErrorAction Stop",
        `  $null = Get-VM -Name '${esc(vmName)}' -ErrorAction Stop`,
        "  exit 0",
        "} catch {",
        "  exit 1",
        "}",
      ].join("; "),
    ],
    { windowsHide: true, encoding: "utf8", shell: false },
  );
  return r.status === 0;
}

function relaunchElevatedUac() {
  const shell = powershellExe();
  const scriptPath = path.join(repoRoot, "scripts", "vm-hyperv.mjs");
  const forward = [...process.argv.slice(2).filter((arg) => arg !== INTERNAL_ELEVATED), INTERNAL_ELEVATED];
  const nodeExe = process.execPath.replace(/'/g, "''");
  const scriptEsc = scriptPath.replace(/'/g, "''");
  const repoEsc = repoRoot.replace(/'/g, "''");
  const argParts = [`'${scriptEsc}'`, ...forward.map((arg) => `'${String(arg).replace(/'/g, "''")}'`)].join(",");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  Set-Location -LiteralPath '${repoEsc}'`,
    `  $p = Start-Process -FilePath '${nodeExe}' -ArgumentList @(${argParts}) -WorkingDirectory '${repoEsc}' -Verb RunAs -PassThru -Wait`,
    "  if ($null -eq $p) { exit 1 }",
    "  exit $p.ExitCode",
    "} catch {",
    "  if ($_.Exception.Message -match 'canceled by the user') {",
    "    Write-Host 'UAC elevation was canceled by the user.'",
    "    exit 2",
    "  }",
    "  throw",
    "}",
  ].join("; ");

  return spawnSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
}

function printUsage() {
  console.log(`Usage: node scripts/vm-hyperv.mjs <list|start|connect|ensure-running|guest-ip> [options] [vm-name]
  --vm_profile_key K   workspace/vm-profiles.yaml
  --vm-name N          explicit Hyper-V VM name (overrides profile/env)
  --no-auto-elevate    fail fast instead of waiting on a UAC relaunch

Examples:
  batcli vm hyperv ensure-running --vm_profile_key vm-gennx-lab
  batcli vm hyperv connect --vm_profile_key vm-gennx-lab
  batcli vm hyperv guest-ip --vm_profile_key vm-gennx-lab --no-auto-elevate

Default vm-name: profile hyper_v_vm_name, CLIBASE_VM_HYPERV_NAME, or GenNX-VM.`);
}

function parseArgs(argv) {
  const sub = String(argv[0] ?? "").trim().toLowerCase();
  let vmProfileKey = "";
  let vmName = "";
  let noAutoElevate = false;
  let internalElevated = false;

  const raw = [...argv.slice(1)];
  const filtered = [];
  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index];
    if (arg === INTERNAL_ELEVATED) {
      internalElevated = true;
      continue;
    }
    filtered.push(arg);
  }

  for (let index = 0; index < filtered.length; index += 1) {
    const arg = filtered[index];
    if ((arg === "--vm_profile_key" || arg === "--vm-profile-key") && filtered[index + 1]) {
      vmProfileKey = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--vm-name" || arg === "--vm_name") && filtered[index + 1]) {
      vmName = String(filtered[(index += 1)]).trim();
      continue;
    }
    if (arg === "--no-auto-elevate" || arg === "--no_auto_elevate") {
      noAutoElevate = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, sub, vmProfileKey, vmName, noAutoElevate, internalElevated };
    }
    if (!String(arg).startsWith("--") && !vmName) {
      vmName = String(arg).trim();
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }

  return { help: false, sub, vmProfileKey, vmName, noAutoElevate, internalElevated };
}

function resolveVmName(argvVmName, profile) {
  if (argvVmName) {
    return argvVmName;
  }
  if (profile && typeof profile.hyper_v_vm_name === "string" && profile.hyper_v_vm_name.trim()) {
    return profile.hyper_v_vm_name.trim();
  }
  if (typeof process.env.CLIBASE_VM_HYPERV_NAME === "string" && process.env.CLIBASE_VM_HYPERV_NAME.trim()) {
    return process.env.CLIBASE_VM_HYPERV_NAME.trim();
  }
  return "GenNX-VM";
}

function runPowerShell(command) {
  const shell = powershellExe();
  const result = spawnSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(typeof result.status === "number" ? result.status : 1);
}

function buildListCommand() {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Import-Module Hyper-V -ErrorAction Stop",
    "Get-VM | Sort-Object Name | Format-Table Name,State,Status -AutoSize",
  ].join("; ");
}

function buildStartCommand(vmName) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Import-Module Hyper-V -ErrorAction Stop",
    `Start-VM -Name '${esc(vmName)}' -ErrorAction SilentlyContinue | Out-Null`,
    `$vm = Get-VM -Name '${esc(vmName)}' -ErrorAction Stop`,
    "[pscustomobject]@{",
    "  vm_name = $vm.Name",
    "  state = $vm.State.ToString()",
    "  status = [string]$vm.Status",
    "} | ConvertTo-Json -Compress -Depth 4",
  ].join("; ");
}

function buildConnectCommand(vmName) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Import-Module Hyper-V -ErrorAction Stop",
    `$vm = Get-VM -Name '${esc(vmName)}' -ErrorAction Stop`,
    "$exe = Join-Path $env:SystemRoot 'System32\\vmconnect.exe'",
    "if (-not (Test-Path -LiteralPath $exe)) { throw 'vmconnect.exe missing under System32' }",
    "Start-Process -FilePath $exe -ArgumentList @('localhost', $vm.Name) -WindowStyle Normal | Out-Null",
    "[pscustomobject]@{",
    "  vm_name = $vm.Name",
    "  connected = $true",
    "} | ConvertTo-Json -Compress -Depth 4",
  ].join("; ");
}

function buildEnsureRunningCommand(vmName) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Import-Module Hyper-V -ErrorAction Stop",
    "$waitSec = 180",
    "$pollMs = 500",
    "$started = $false",
    "$resumed = $false",
    `$vm0 = Get-VM -Name '${esc(vmName)}' -ErrorAction Stop`,
    "$alreadyRunningAtStart = ($vm0.State.ToString() -eq 'Running')",
    "$deadline = (Get-Date).AddSeconds($waitSec)",
    "$sw = [Diagnostics.Stopwatch]::StartNew()",
    "while ($true) {",
    `  $vmCur = Get-VM -Name '${esc(vmName)}' -ErrorAction Stop`,
    "  $state = $vmCur.State.ToString()",
    "  if ($state -eq 'Running') { break }",
    `  if ($state -eq 'Off') { Start-VM -Name '${esc(vmName)}' | Out-Null; $started = $true }`,
    `  elseif ($state -eq 'Paused') { Resume-VM -Name '${esc(vmName)}' | Out-Null; $resumed = $true }`,
    `  elseif ($state -eq 'Saved') { Start-VM -Name '${esc(vmName)}' | Out-Null; $started = $true }`,
    "  elseif ($state -eq 'Starting' -or $state -eq 'Stopping') { }",
    "  else { throw ('Cannot reach Running from VM state: ' + $state) }",
    "  if ((Get-Date) -gt $deadline) { throw ('VM did not reach Running within ' + $waitSec + ' s (last state: ' + $state + ')') }",
    "  Start-Sleep -Milliseconds $pollMs",
    "}",
    `$vm = Get-VM -Name '${esc(vmName)}' -ErrorAction Stop`,
    "[pscustomobject]@{",
    "  vm_name = $vm.Name",
    "  started = $started",
    "  resumed = $resumed",
    "  already_running_at_start = $alreadyRunningAtStart",
    "  wait_ms = [int]$sw.ElapsedMilliseconds",
    "  state = $vm.State.ToString()",
    "  status = [string]$vm.Status",
    "  processor_count = [int]$vm.ProcessorCount",
    "  memory_assigned = [int64]$vm.MemoryAssigned",
    "} | ConvertTo-Json -Compress -Depth 5",
  ].join("; ");
}

function buildGuestIpCommand(vmName) {
  return [
    "$ErrorActionPreference = 'Stop'",
    "Import-Module Hyper-V -ErrorAction Stop",
    "$ips = New-Object System.Collections.Generic.List[string]",
    `Get-VMNetworkAdapter -VMName '${esc(vmName)}' -ErrorAction Stop | ForEach-Object {`,
    "  if ($_.IPAddresses) { foreach ($x in $_.IPAddresses) { [void]$ips.Add([string]$x) } }",
    "}",
    "[pscustomobject]@{",
    `  vm_name = '${esc(vmName)}'`,
    "  ip_addresses = @($ips.ToArray())",
    "} | ConvertTo-Json -Compress -Depth 4",
  ].join("; ");
}

function main() {
  if (process.platform !== "win32") {
    console.error("vm hyperv: Windows only.");
    process.exit(1);
  }

  const argv = parseArgs(process.argv.slice(2));
  if (argv.help || !argv.sub) {
    printUsage();
    process.exit(argv.help ? 0 : 2);
  }

  let profile = null;
  if (argv.vmProfileKey) {
    profile = loadProfile(argv.vmProfileKey);
    if (!profile) {
      console.error(`vm_profile_key not found in workspace/vm-profiles.yaml: ${argv.vmProfileKey}`);
      process.exit(1);
    }
  }

  const vmName = resolveVmName(argv.vmName, profile);

  if (!argv.internalElevated && !canHyperVManageSync(vmName)) {
    if (argv.noAutoElevate) {
      console.error("vm hyperv: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
      console.error("Automatic UAC elevation disabled (--no-auto-elevate). Re-run from an elevated shell or omit the flag.");
      process.exit(1);
    }
    console.log("vm hyperv: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
    console.log("Re-launching with UAC elevation (one prompt)...");
    const relaunched = relaunchElevatedUac();
    process.exit(typeof relaunched.status === "number" ? relaunched.status : 1);
  }

  if (argv.sub === "list") {
    runPowerShell(buildListCommand());
  }
  if (argv.sub === "start") {
    runPowerShell(buildStartCommand(vmName));
  }
  if (argv.sub === "connect") {
    runPowerShell(buildConnectCommand(vmName));
  }
  if (argv.sub === "ensure-running") {
    runPowerShell(buildEnsureRunningCommand(vmName));
  }
  if (argv.sub === "guest-ip") {
    runPowerShell(buildGuestIpCommand(vmName));
  }

  printUsage();
  process.exit(2);
}

main();
