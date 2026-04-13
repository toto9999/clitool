/**
 * Host-side launcher: scripts/vm-gennx-verify-guest.ps1 (Hyper-V + PowerShell Direct / WinRM).
 *
 * - Loads workspace/vm-profiles.yaml for vm-gennx-lab: guest_winrm_host, credentials, paths.
 * - Applies guest_local_user / guest_local_password unless CLIBASE_VM_WINRM_* / CLIBASE_VM_GUEST_* already set.
 * - Lab fallback: .\\dd / dddd when profile vm-gennx-lab and no env (matches typical GenNX-VM local account).
 * - If Hyper-V cmdlets are unavailable (non-elevated host), re-launches self via UAC once (--clibase-internal-hyperv-elevated).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const ps1 = path.join(repoRoot, "scripts", "vm-gennx-verify-guest.ps1");
const INTERNAL_ELEVATED = "--clibase-internal-hyperv-elevated";

function powershellExe() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
}

function loadProfile(vmProfileKey) {
  const p = path.join(repoRoot, "workspace", "vm-profiles.yaml");
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const doc = YAML.parse(fs.readFileSync(p, "utf8"));
    const rows = Array.isArray(doc?.vm_profiles) ? doc.vm_profiles : [];
    return rows.find((r) => r && r.vm_profile_key === vmProfileKey) ?? null;
  } catch {
    return null;
  }
}

function envNonEmpty(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

/**
 * guest_local_user / guest_local_password from profile, then lab dd/dddd for vm-gennx-lab.
 */
function buildGuestClibaseRootsCsv(prof, primaryFromProfile) {
  const roots = [];
  const add = (p) => {
    if (typeof p === "string" && p.trim()) {
      roots.push(p.trim().replace(/\//g, "\\"));
    }
  };
  add(primaryFromProfile);
  if (prof && Array.isArray(prof.guest_clibase_search_roots)) {
    for (const r of prof.guest_clibase_search_roots) {
      add(r);
    }
  }
  add("C:\\Users\\dd\\Desktop\\clibase");
  add("C:\\Users\\dd\\MIDAS\\code\\clibase");
  add("C:\\MIDAS\\code\\clibase");
  return [...new Set(roots)].join(";");
}

function applyCredentialDefaults(prof, vmProfileKey) {
  const hasUser = envNonEmpty("CLIBASE_VM_WINRM_USER") || envNonEmpty("CLIBASE_VM_GUEST_USER");
  const hasPass =
    envNonEmpty("CLIBASE_VM_WINRM_PASSWORD") || envNonEmpty("CLIBASE_VM_GUEST_PASSWORD");

  const fromProfU = prof && (prof.guest_local_user ?? prof.guest_username);
  const fromProfP = prof && (prof.guest_local_password ?? prof.guest_password);

  if (!hasUser && typeof fromProfU === "string" && fromProfU.trim()) {
    let u = fromProfU.trim();
    if (!u.includes("\\")) {
      u = `.\\${u}`;
    }
    process.env.CLIBASE_VM_WINRM_USER = u;
  }

  if (!hasPass && fromProfP !== undefined && fromProfP !== null && String(fromProfP).length > 0) {
    process.env.CLIBASE_VM_WINRM_PASSWORD = String(fromProfP);
  }

  const labKey = vmProfileKey === "vm-gennx-lab" || prof?.vm_profile_key === "vm-gennx-lab";
  if (labKey) {
    if (!envNonEmpty("CLIBASE_VM_WINRM_USER") && !envNonEmpty("CLIBASE_VM_GUEST_USER")) {
      process.env.CLIBASE_VM_WINRM_USER = ".\\dd";
    }
    if (!envNonEmpty("CLIBASE_VM_WINRM_PASSWORD") && !envNonEmpty("CLIBASE_VM_GUEST_PASSWORD")) {
      process.env.CLIBASE_VM_WINRM_PASSWORD = "dddd";
    }
  }
}

function canHyperVManageSync() {
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
        "  $null = Get-VM -Name 'GenNX-VM' -ErrorAction Stop",
        "  exit 0",
        "} catch {",
        "  exit 1",
        "}",
      ].join("; "),
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  return r.status === 0;
}

function relaunchElevatedUac() {
  const shell = powershellExe();
  const mjs = path.join(repoRoot, "scripts", "vm-gennx-verify-guest.mjs");
  const forward = [...process.argv.slice(2).filter((a) => a !== INTERNAL_ELEVATED), INTERNAL_ELEVATED];
  const nodeExe = process.execPath.replace(/'/g, "''");
  const mjsEsc = mjs.replace(/'/g, "''");
  const repoEsc = repoRoot.replace(/'/g, "''");
  const argParts = [`'${mjsEsc}'`, ...forward.map((a) => `'${String(a).replace(/'/g, "''")}'`)].join(",");
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `try {`,
    `  Set-Location -LiteralPath '${repoEsc}'`,
    `  $p = Start-Process -FilePath '${nodeExe}' -ArgumentList @(${argParts}) -WorkingDirectory '${repoEsc}' -Verb RunAs -PassThru -Wait`,
    `  if ($null -eq $p) { exit 1 }`,
    `  exit $p.ExitCode`,
    `} catch {`,
    `  if ($_.Exception.Message -match 'canceled by the user') {`,
    `    Write-Host 'UAC elevation was canceled by the user.'`,
    `    exit 2`,
    `  }`,
    `  throw`,
    `}`,
  ].join("; ");

  return spawnSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
}

function parseArgs(argv) {
  let vmProfileKey = "";
  let guestWinRmHost = "";
  let vmName = "";
  let guestRepoRoot = "";
  let skipEnsureVm = false;
  let internalElevated = false;
  let noAutoElevate = false;

  const raw = [...argv];
  const filtered = [];
  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i];
    if (a === INTERNAL_ELEVATED) {
      internalElevated = true;
      continue;
    }
    filtered.push(a);
  }

  for (let i = 0; i < filtered.length; i += 1) {
    const a = filtered[i];
    if ((a === "--vm_profile_key" || a === "--vm-profile-key") && filtered[i + 1]) {
      vmProfileKey = String(filtered[(i += 1)]).trim();
      continue;
    }
    if ((a === "--guest-winrm-host" || a === "--guest_winrm_host") && filtered[i + 1]) {
      guestWinRmHost = String(filtered[(i += 1)]).trim();
      continue;
    }
    if ((a === "--vm-name" || a === "--vm_name") && filtered[i + 1]) {
      vmName = String(filtered[(i += 1)]).trim();
      continue;
    }
    if ((a === "--guest-repo-root" || a === "--guest_repo_root") && filtered[i + 1]) {
      guestRepoRoot = String(filtered[(i += 1)]).trim();
      continue;
    }
    if (a === "--skip-ensure-vm" || a === "--skip_ensure_vm") {
      skipEnsureVm = true;
      continue;
    }
    if (a === "--no-auto-elevate" || a === "--no_auto_elevate") {
      noAutoElevate = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/vm-gennx-verify-guest.mjs [options]
  --vm_profile_key K   workspace/vm-profiles.yaml (guest_winrm_host, guest_local_user/password, ...)
  --guest-winrm-host H (required with --skip-ensure-vm for WinRM-only)
  --vm-name N
  --guest-repo-root P
  --skip-ensure-vm
  --no-auto-elevate      Fail fast instead of waiting on a UAC relaunch

Credentials: CLIBASE_VM_WINRM_USER / CLIBASE_VM_WINRM_PASSWORD or profile guest_local_* (vm-gennx-lab defaults: .\\dd and dddd if unset).

Hyper-V: if Get-VM fails, one UAC elevation is attempted automatically.`);
      process.exit(0);
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }

  return {
    vmProfileKey,
    guestWinRmHost,
    vmName,
    guestRepoRoot,
    skipEnsureVm,
    internalElevated,
    noAutoElevate,
  };
}

function main() {
  if (process.platform !== "win32") {
    console.error("vm-gennx-verify-guest: Windows host only.");
    process.exit(1);
  }

  if (!fs.existsSync(ps1)) {
    console.error(`Missing ${ps1}`);
    process.exit(1);
  }

  const argv = parseArgs(process.argv.slice(2));
  let guestWinRmHost = argv.guestWinRmHost || process.env.CLIBASE_VM_GENNX_VERIFY_GUEST_HOST?.trim() || "";
  let vmName = argv.vmName || process.env.CLIBASE_VM_HYPERV_NAME?.trim() || "";
  let guestRepoRoot = argv.guestRepoRoot || process.env.CLIBASE_VM_GENNX_CLIBASE_ROOT?.trim() || "";

  let prof = null;
  if (argv.vmProfileKey) {
    prof = loadProfile(argv.vmProfileKey);
    if (!prof) {
      console.error(`vm_profile_key not found in workspace/vm-profiles.yaml: ${argv.vmProfileKey}`);
      process.exit(1);
    }
    if (!guestWinRmHost && typeof prof.guest_winrm_host === "string") {
      guestWinRmHost = prof.guest_winrm_host.trim();
    }
    if (!vmName && typeof prof.hyper_v_vm_name === "string") {
      vmName = prof.hyper_v_vm_name.trim();
    }
    if (!guestRepoRoot && typeof prof.guest_clibase_root === "string") {
      guestRepoRoot = prof.guest_clibase_root.trim();
    }
  }

  applyCredentialDefaults(prof, argv.vmProfileKey || "");

  process.env.CLIBASE_VM_GUEST_CLIBASE_ROOTS_CSV = buildGuestClibaseRootsCsv(prof, guestRepoRoot);

  if (argv.skipEnsureVm && !guestWinRmHost) {
    console.error(
      "With --skip-ensure-vm, set guest address: --guest-winrm-host or CLIBASE_VM_GENNX_VERIFY_GUEST_HOST or vm-profiles guest_winrm_host.",
    );
    process.exit(1);
  }

  if (!argv.skipEnsureVm && !argv.internalElevated && !canHyperVManageSync()) {
    console.log("vm-gennx-verify-guest: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
    if (argv.noAutoElevate) {
      console.error("Automatic UAC elevation disabled (--no-auto-elevate). Re-run from an elevated shell or omit the flag.");
      process.exit(1);
    }
    console.log("Re-launching with UAC elevation (one prompt)...");
    const r = relaunchElevatedUac();
    process.exit(typeof r.status === "number" ? r.status : 1);
  }

  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1];
  if (guestWinRmHost) {
    psArgs.push("-GuestWinRmHost", guestWinRmHost);
  }
  if (vmName) {
    psArgs.push("-VmName", vmName);
  }
  if (guestRepoRoot) {
    psArgs.push("-GuestClibaseRoot", guestRepoRoot);
  }
  if (argv.skipEnsureVm) {
    psArgs.push("-SkipEnsureVm");
  }

  const shell = powershellExe();
  const r = spawnSync(shell, psArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });

  process.exit(typeof r.status === "number" ? r.status : 1);
}

main();
