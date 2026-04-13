#!/usr/bin/env node
/**
 * VM network diagnose/repair CLI (Windows host + Hyper-V guest).
 *
 * Operator contract:
 *   batcli vm network diagnose|repair --vm_profile_key vm-gennx-lab [--no-auto-elevate]
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
const INTERNAL_RESULT_FILE = "--clibase-internal-result-file";
const ps1 = path.join(repoRoot, "scripts", "vm-network.ps1");

function powershellExe() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

function envNonEmpty(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
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
  const scriptPath = path.join(repoRoot, "scripts", "vm-network.mjs");
  const relayDir = path.join(repoRoot, ".clibase", "artifacts", "vm-network-uac");
  fs.mkdirSync(relayDir, { recursive: true });
  const resultFile = path.join(
    relayDir,
    `relay-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.json`,
  );
  const rawForward = process.argv.slice(2);
  const forward = [];
  for (let index = 0; index < rawForward.length; index += 1) {
    const arg = rawForward[index];
    if (arg === INTERNAL_ELEVATED) {
      continue;
    }
    if (arg === INTERNAL_RESULT_FILE) {
      index += 1;
      continue;
    }
    forward.push(arg);
  }
  forward.push(INTERNAL_ELEVATED, INTERNAL_RESULT_FILE, resultFile);
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

  const launched = spawnSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  if (fs.existsSync(resultFile)) {
    try {
      const relay = JSON.parse(fs.readFileSync(resultFile, "utf8"));
      if (typeof relay.stdout === "string" && relay.stdout.length > 0) {
        process.stdout.write(relay.stdout);
      }
      if (typeof relay.stderr === "string" && relay.stderr.length > 0) {
        process.stderr.write(relay.stderr);
      }
      if (typeof relay.error === "string" && relay.error.length > 0) {
        process.stderr.write(`${relay.error}\n`);
      }
      return { status: typeof relay.status === "number" ? relay.status : launched.status };
    } catch {
      return launched;
    }
  }

  return launched;
}

function printUsage() {
  console.log(`Usage: node scripts/vm-network.mjs <diagnose|repair> [options]
  --vm_profile_key K         workspace/vm-profiles.yaml
  --vm-name N                explicit Hyper-V VM name
  --switch-name N            explicit Hyper-V switch name
  --host-gateway-ipv4 A      host vEthernet gateway IPv4
  --guest-ipv4 A             guest static IPv4
  --guest-winrm-host A       guest WinRM host/IP
  --subnet-prefix CIDR       internal NAT prefix (for example 192.168.250.0/24)
  --nat-name N               host NetNat name
  --prefix-length N          guest/host prefix length
  --guest-user U             guest local credential for PowerShell Direct repair
  --guest-password P         guest local credential for PowerShell Direct repair
  --no-auto-elevate          fail fast instead of waiting on a UAC relaunch

Examples:
  batcli vm network diagnose --vm_profile_key vm-gennx-lab
  batcli vm network repair --vm_profile_key vm-gennx-lab
  batcli vm network repair --vm_profile_key vm-gennx-lab --no-auto-elevate`);
}

function parseArgs(argv) {
  const sub = String(argv[0] ?? "").trim().toLowerCase();
  let vmProfileKey = "";
  let vmName = "";
  let switchName = "";
  let hostGatewayIpv4 = "";
  let guestIpv4 = "";
  let guestWinRmHost = "";
  let subnetPrefix = "";
  let natName = "";
  let prefixLength = "";
  let guestUser = "";
  let guestPassword = "";
  let resultFile = "";
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
    if (arg === INTERNAL_RESULT_FILE && raw[index + 1]) {
      resultFile = String(raw[(index += 1)]).trim();
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
    if ((arg === "--switch-name" || arg === "--switch_name") && filtered[index + 1]) {
      switchName = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--host-gateway-ipv4" || arg === "--host_gateway_ipv4") && filtered[index + 1]) {
      hostGatewayIpv4 = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--guest-ipv4" || arg === "--guest_ipv4") && filtered[index + 1]) {
      guestIpv4 = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--guest-winrm-host" || arg === "--guest_winrm_host") && filtered[index + 1]) {
      guestWinRmHost = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--subnet-prefix" || arg === "--subnet_prefix") && filtered[index + 1]) {
      subnetPrefix = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--nat-name" || arg === "--nat_name") && filtered[index + 1]) {
      natName = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--prefix-length" || arg === "--prefix_length") && filtered[index + 1]) {
      prefixLength = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--guest-user" || arg === "--guest_user") && filtered[index + 1]) {
      guestUser = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--guest-password" || arg === "--guest_password") && filtered[index + 1]) {
      guestPassword = String(filtered[(index += 1)]).trim();
      continue;
    }
    if (arg === "--no-auto-elevate" || arg === "--no_auto_elevate") {
      noAutoElevate = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return {
        help: true,
        sub,
        vmProfileKey,
        vmName,
        switchName,
        hostGatewayIpv4,
        guestIpv4,
        guestWinRmHost,
        subnetPrefix,
        natName,
        prefixLength,
        guestUser,
        guestPassword,
        resultFile,
        noAutoElevate,
        internalElevated,
      };
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }

  return {
    help: false,
    sub,
    vmProfileKey,
    vmName,
    switchName,
    hostGatewayIpv4,
    guestIpv4,
    guestWinRmHost,
    subnetPrefix,
    natName,
    prefixLength,
    guestUser,
    guestPassword,
    resultFile,
    noAutoElevate,
    internalElevated,
  };
}

function normalizeGuestUser(user) {
  if (!user) {
    return "";
  }
  return user.includes("\\") ? user : `.\\${user}`;
}

function resolveRuntimeConfig(argv) {
  let profile = null;
  if (argv.vmProfileKey) {
    profile = loadProfile(argv.vmProfileKey);
    if (!profile) {
      console.error(`vm_profile_key not found in workspace/vm-profiles.yaml: ${argv.vmProfileKey}`);
      process.exit(1);
    }
  }

  const config = {
    sub: argv.sub,
    vmProfileKey: argv.vmProfileKey,
    vmName:
      argv.vmName ||
      (typeof profile?.hyper_v_vm_name === "string" ? profile.hyper_v_vm_name.trim() : "") ||
      (typeof process.env.CLIBASE_VM_HYPERV_NAME === "string" ? process.env.CLIBASE_VM_HYPERV_NAME.trim() : "") ||
      "GenNX-VM",
    switchName:
      argv.switchName ||
      (typeof profile?.hyperv_switch_name === "string" ? profile.hyperv_switch_name.trim() : "") ||
      "clibase-internal-nat",
    hostGatewayIpv4:
      argv.hostGatewayIpv4 ||
      (typeof profile?.hyperv_host_gateway_ipv4 === "string" ? profile.hyperv_host_gateway_ipv4.trim() : "") ||
      "192.168.250.1",
    guestIpv4:
      argv.guestIpv4 ||
      (typeof profile?.hyperv_guest_ipv4 === "string" ? profile.hyperv_guest_ipv4.trim() : "") ||
      (typeof profile?.guest_winrm_host === "string" ? profile.guest_winrm_host.trim() : "") ||
      "192.168.250.10",
    guestWinRmHost:
      argv.guestWinRmHost ||
      (typeof profile?.guest_winrm_host === "string" ? profile.guest_winrm_host.trim() : "") ||
      "",
    subnetPrefix:
      argv.subnetPrefix ||
      (typeof profile?.hyperv_subnet_prefix === "string" ? profile.hyperv_subnet_prefix.trim() : "") ||
      "192.168.250.0/24",
    natName:
      argv.natName ||
      (typeof profile?.hyperv_nat_name === "string" ? profile.hyperv_nat_name.trim() : "") ||
      "clibase-vm-nat",
    prefixLength: Number.parseInt(
      argv.prefixLength || String(profile?.hyperv_ipv4_prefix_length ?? "24"),
      10,
    ),
    guestUser:
      normalizeGuestUser(argv.guestUser) ||
      normalizeGuestUser(process.env.CLIBASE_VM_GUEST_USER || "") ||
      normalizeGuestUser(process.env.CLIBASE_VM_WINRM_USER || "") ||
      normalizeGuestUser(typeof profile?.guest_local_user === "string" ? profile.guest_local_user.trim() : "") ||
      ".\\dd",
    guestPassword:
      argv.guestPassword ||
      process.env.CLIBASE_VM_GUEST_PASSWORD ||
      process.env.CLIBASE_VM_WINRM_PASSWORD ||
      (typeof profile?.guest_local_password === "string" ? profile.guest_local_password : "") ||
      "dddd",
    dnsServers: Array.isArray(profile?.hyperv_dns_servers)
      ? profile.hyperv_dns_servers.map((value) => String(value).trim()).filter(Boolean)
      : ["1.1.1.1", "8.8.8.8"],
  };

  if (!config.guestWinRmHost) {
    config.guestWinRmHost = config.guestIpv4;
  }

  return config;
}

function main() {
  if (process.platform !== "win32") {
    console.error("vm network: Windows only.");
    process.exit(1);
  }

  if (!fs.existsSync(ps1)) {
    console.error(`Missing ${ps1}`);
    process.exit(1);
  }

  const argv = parseArgs(process.argv.slice(2));
  if (argv.help || !argv.sub || !["diagnose", "repair"].includes(argv.sub)) {
    printUsage();
    process.exit(argv.help ? 0 : 2);
  }

  const config = resolveRuntimeConfig(argv);

  if (argv.sub === "repair" && !argv.internalElevated && !canHyperVManageSync(config.vmName)) {
    if (argv.noAutoElevate) {
      console.error("vm network repair: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
      console.error("Automatic UAC elevation disabled (--no-auto-elevate). Re-run from an elevated shell or omit the flag.");
      process.exit(1);
    }
    console.log("vm network repair: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
    console.log("Re-launching with UAC elevation (one prompt)...");
    const relaunched = relaunchElevatedUac();
    process.exit(typeof relaunched.status === "number" ? relaunched.status : 1);
  }

  const psArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
    "-Action",
    config.sub,
    "-VmName",
    config.vmName,
    "-SwitchName",
    config.switchName,
    "-HostGatewayIpv4",
    config.hostGatewayIpv4,
    "-PrefixLength",
    String(config.prefixLength),
    "-SubnetPrefix",
    config.subnetPrefix,
    "-NatName",
    config.natName,
    "-GuestIpv4",
    config.guestIpv4,
    "-GuestWinRmHost",
    config.guestWinRmHost,
    "-GuestUser",
    config.guestUser,
    "-GuestPassword",
    config.guestPassword,
  ];

  if (config.dnsServers.length > 0) {
    psArgs.push("-DnsServers", config.dnsServers.join(","));
  }

  const shell = powershellExe();
  const captureOutput = Boolean(argv.resultFile);
  const result = spawnSync(shell, psArgs, {
    cwd: repoRoot,
    stdio: captureOutput ? "pipe" : "inherit",
    encoding: captureOutput ? "utf8" : undefined,
    env: process.env,
    shell: false,
  });

  if (captureOutput) {
    const payload = {
      status: typeof result.status === "number" ? result.status : 1,
      stdout: typeof result.stdout === "string" ? result.stdout : "",
      stderr: typeof result.stderr === "string" ? result.stderr : "",
      error: result.error ? result.error.message : "",
    };
    fs.writeFileSync(argv.resultFile, JSON.stringify(payload, null, 2), "utf8");
  }

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(typeof result.status === "number" ? result.status : 1);
}

main();
