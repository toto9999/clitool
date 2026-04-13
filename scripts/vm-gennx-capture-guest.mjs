#!/usr/bin/env node
/**
 * batcli vm gennx capture-guest — 게스트 대화형 세션에서 화면 PNG 캡처(호스트로 복사).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const INTERNAL_ELEVATED = "--clibase-internal-hyperv-elevated";
const ps1 = path.join(repoRoot, "scripts", "vm-gennx-capture-guest.ps1");

function powershellExe() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
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
    return rows.find((r) => r && r.vm_profile_key === vmProfileKey) ?? null;
  } catch {
    return null;
  }
}

function applyCredentialDefaults(prof, vmProfileKey) {
  const hasUser =
    envNonEmpty("CLIBASE_VM_WINRM_USER") || envNonEmpty("CLIBASE_VM_GUEST_USER");
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
  const mjs = path.join(repoRoot, "scripts", "vm-gennx-capture-guest.mjs");
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
    if (a === "--skip-ensure-vm" || a === "--skip_ensure_vm") {
      skipEnsureVm = true;
      continue;
    }
    if (a === "--no-auto-elevate" || a === "--no_auto_elevate") {
      noAutoElevate = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/vm-gennx-capture-guest.mjs [options]
  --vm_profile_key K   workspace/vm-profiles.yaml
  --guest-winrm-host H (with --skip-ensure-vm)
  --vm-name N
  --skip-ensure-vm
  --no-auto-elevate    Fail fast instead of waiting on a UAC relaunch

Runs a one-shot scheduled task on the guest as the profile user (interactive desktop).
Requires that user to be logged on with a visible session (console or RDP).

Credentials: CLIBASE_VM_WINRM_USER / CLIBASE_VM_WINRM_PASSWORD or profile guest_local_* (vm-gennx-lab: .\\dd / dddd if unset).`);
      process.exit(0);
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }

  return { vmProfileKey, guestWinRmHost, vmName, skipEnsureVm, internalElevated, noAutoElevate };
}

function main() {
  if (process.platform !== "win32") {
    console.error("vm-gennx-capture-guest: Windows host only.");
    process.exit(1);
  }

  if (!fs.existsSync(ps1)) {
    console.error(`Missing ${ps1}`);
    process.exit(1);
  }

  const argv = parseArgs(process.argv.slice(2));
  let guestWinRmHost = argv.guestWinRmHost || process.env.CLIBASE_VM_GENNX_VERIFY_GUEST_HOST?.trim() || "";
  let vmName = argv.vmName || process.env.CLIBASE_VM_HYPERV_NAME?.trim() || "";

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
  }

  applyCredentialDefaults(prof, argv.vmProfileKey || "");

  const proofDir = path.join(repoRoot, ".clibase", "artifacts", "vm-gennx-capture-guest");
  fs.mkdirSync(proofDir, { recursive: true });
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const hostCapturePng = path.join(proofDir, `guest-desktop-${stamp}.png`);
  process.env.CLIBASE_VM_HOST_CAPTURE_PNG = hostCapturePng;
  process.env.CLIBASE_VM_GUEST_INTERACTIVE_PNG =
    process.env.CLIBASE_VM_GUEST_INTERACTIVE_PNG?.trim() || "C:\\Windows\\Temp\\clibase-interactive-guest-screen.png";

  if (argv.skipEnsureVm && !guestWinRmHost) {
    console.error(
      "With --skip-ensure-vm, set guest address: --guest-winrm-host or CLIBASE_VM_GENNX_VERIFY_GUEST_HOST or vm-profiles guest_winrm_host.",
    );
    process.exit(1);
  }

  if (!argv.skipEnsureVm && !argv.internalElevated && !canHyperVManageSync()) {
    console.log("vm-gennx-capture-guest: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
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
