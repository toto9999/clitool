#!/usr/bin/env node
/**
 * Guest visible-session status/automation wrapper.
 *
 * Operator contract:
 *   batcli vm guest session status --vm_profile_key vm-gennx-lab
 *   batcli vm guest session ensure-visible --vm_profile_key vm-gennx-lab
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
const ps1 = path.join(repoRoot, "scripts", "vm-guest-session.ps1");
const INTERNAL_ELEVATED = "--clibase-internal-hyperv-elevated";

function powershellExe() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
}

function envNonEmpty(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
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

function applyCredentialDefaults(profile, vmProfileKey) {
  const hasUser = envNonEmpty("CLIBASE_VM_WINRM_USER") || envNonEmpty("CLIBASE_VM_GUEST_USER");
  const hasPass =
    envNonEmpty("CLIBASE_VM_WINRM_PASSWORD") || envNonEmpty("CLIBASE_VM_GUEST_PASSWORD");

  const fromProfileUser = profile && (profile.guest_local_user ?? profile.guest_username);
  const fromProfilePassword = profile && (profile.guest_local_password ?? profile.guest_password);

  if (!hasUser && typeof fromProfileUser === "string" && fromProfileUser.trim()) {
    let user = fromProfileUser.trim();
    if (!user.includes("\\")) {
      user = `.\\${user}`;
    }
    process.env.CLIBASE_VM_WINRM_USER = user;
  }

  if (
    !hasPass &&
    fromProfilePassword !== undefined &&
    fromProfilePassword !== null &&
    String(fromProfilePassword).length > 0
  ) {
    process.env.CLIBASE_VM_WINRM_PASSWORD = String(fromProfilePassword);
  }

  const labKey = vmProfileKey === "vm-gennx-lab" || profile?.vm_profile_key === "vm-gennx-lab";
  if (labKey) {
    if (!envNonEmpty("CLIBASE_VM_WINRM_USER") && !envNonEmpty("CLIBASE_VM_GUEST_USER")) {
      process.env.CLIBASE_VM_WINRM_USER = ".\\dd";
    }
    if (!envNonEmpty("CLIBASE_VM_WINRM_PASSWORD") && !envNonEmpty("CLIBASE_VM_GUEST_PASSWORD")) {
      process.env.CLIBASE_VM_WINRM_PASSWORD = "dddd";
    }
  }
}

function canHyperVManageSync(vmName = "GenNX-VM") {
  const shell = powershellExe();
  const result = spawnSync(
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
  return result.status === 0;
}

function relaunchElevatedUac() {
  const shell = powershellExe();
  const mjs = path.join(repoRoot, "scripts", "vm-guest-session.mjs");
  const forward = [...process.argv.slice(2).filter((arg) => arg !== INTERNAL_ELEVATED), INTERNAL_ELEVATED];
  const nodeExe = process.execPath.replace(/'/g, "''");
  const mjsEsc = mjs.replace(/'/g, "''");
  const repoEsc = repoRoot.replace(/'/g, "''");
  const argParts = [`'${mjsEsc}'`, ...forward.map((arg) => `'${String(arg).replace(/'/g, "''")}'`)].join(",");
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

function parseArgs(argv) {
  const sub = String(argv[0] ?? "").trim().toLowerCase();
  let vmProfileKey = "";
  let guestWinRmHost = "";
  let vmName = "";
  let skipEnsureVm = false;
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
    if ((arg === "--guest-winrm-host" || arg === "--guest_winrm_host") && filtered[index + 1]) {
      guestWinRmHost = String(filtered[(index += 1)]).trim();
      continue;
    }
    if ((arg === "--vm-name" || arg === "--vm_name") && filtered[index + 1]) {
      vmName = String(filtered[(index += 1)]).trim();
      continue;
    }
    if (arg === "--skip-ensure-vm" || arg === "--skip_ensure_vm") {
      skipEnsureVm = true;
      continue;
    }
    if (arg === "--no-auto-elevate" || arg === "--no_auto_elevate") {
      noAutoElevate = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, sub, vmProfileKey, guestWinRmHost, vmName, skipEnsureVm, noAutoElevate, internalElevated };
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(2);
  }

  return { help: false, sub, vmProfileKey, guestWinRmHost, vmName, skipEnsureVm, noAutoElevate, internalElevated };
}

function printUsage() {
  console.log(`Usage: node scripts/vm-guest-session.mjs <status|ensure-visible> [options]
  --vm_profile_key K   workspace/vm-profiles.yaml
  --guest-winrm-host H (with --skip-ensure-vm or for explicit WinRM host)
  --vm-name N
  --skip-ensure-vm     use WinRM only and skip Hyper-V VM-state control
  --no-auto-elevate    fail fast instead of waiting on a UAC relaunch

Examples:
  batcli vm guest session status --vm_profile_key vm-gennx-lab
  batcli vm guest session ensure-visible --vm_profile_key vm-gennx-lab

The command uses the profiled guest_local_user / guest_local_password to query or
configure AutoAdminLogon for the visible desktop session.`);
}

function main() {
  if (process.platform !== "win32") {
    console.error("vm-guest-session: Windows host only.");
    process.exit(1);
  }

  if (!fs.existsSync(ps1)) {
    console.error(`Missing ${ps1}`);
    process.exit(1);
  }

  const argv = parseArgs(process.argv.slice(2));
  if (argv.help || !["status", "ensure-visible"].includes(argv.sub)) {
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

  let guestWinRmHost =
    argv.guestWinRmHost ||
    (typeof profile?.guest_winrm_host === "string" ? profile.guest_winrm_host.trim() : "") ||
    process.env.CLIBASE_VM_GENNX_VERIFY_GUEST_HOST?.trim() ||
    "";
  let vmName =
    argv.vmName ||
    (typeof profile?.hyper_v_vm_name === "string" ? profile.hyper_v_vm_name.trim() : "") ||
    process.env.CLIBASE_VM_HYPERV_NAME?.trim() ||
    "";

  applyCredentialDefaults(profile, argv.vmProfileKey || "");
  if (guestWinRmHost) {
    process.env.CLIBASE_VM_GENNX_VERIFY_GUEST_HOST = guestWinRmHost;
  }
  if (vmName) {
    process.env.CLIBASE_VM_HYPERV_NAME = vmName;
  }

  let effectiveSkipEnsureVm = argv.skipEnsureVm;
  const canManageHyperV = vmName ? canHyperVManageSync(vmName) : false;
  if (!effectiveSkipEnsureVm && guestWinRmHost && vmName && !canManageHyperV) {
    console.log("vm-guest-session: Hyper-V unavailable in this shell, falling back to WinRM-only session control.");
    effectiveSkipEnsureVm = true;
  }

  if (!effectiveSkipEnsureVm && !argv.internalElevated && vmName && !canManageHyperV) {
    if (argv.noAutoElevate) {
      console.error("vm-guest-session: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
      console.error("Automatic UAC elevation disabled (--no-auto-elevate). Re-run from an elevated shell or omit the flag.");
      process.exit(1);
    }
    console.log("vm-guest-session: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
    console.log("Re-launching with UAC elevation (one prompt)...");
    const relaunched = relaunchElevatedUac();
    process.exit(typeof relaunched.status === "number" ? relaunched.status : 1);
  }

  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Action", argv.sub];
  if (guestWinRmHost) {
    psArgs.push("-GuestWinRmHost", guestWinRmHost);
  }
  if (vmName) {
    psArgs.push("-VmName", vmName);
  }
  if (effectiveSkipEnsureVm) {
    psArgs.push("-SkipEnsureVm");
  }

  const shell = powershellExe();
  const result = spawnSync(shell, psArgs, {
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

main();
