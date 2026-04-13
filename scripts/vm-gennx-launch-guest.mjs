#!/usr/bin/env node
/**
 * Hyper-V 게스트에서 GenNX.exe 실행 (PowerShell Direct 또는 WinRM).
 * 호스트의 로컬 경로가 아니라 게스트 OS 내 경로를 사용합니다.
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
const ps1 = path.join(repoRoot, "scripts", "vm-gennx-launch-guest.ps1");
const guestSessionMjs = path.join(repoRoot, "scripts", "vm-guest-session.mjs");

const DEFAULT_GUEST_GENNX_EXE =
  "C:\\Users\\dd\\Desktop\\x64_Release_D260330_T1123_N224_r_b7_MR\\GenNX.exe";

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
        `  $null = Get-VM -Name '${String(vmName).replace(/'/g, "''")}' -ErrorAction Stop`,
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
  const mjs = path.join(repoRoot, "scripts", "vm-gennx-launch-guest.mjs");
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
  let guestGennxExe = "";
  let skipEnsureVm = false;
  let skipEnsureSession = false;
  let internalElevated = false;
  let noAutoElevate = false;
  /** "interactive" (default): schtasks as profile user. "direct": Start-Process in PS Direct only. */
  let launchMode = "";

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
    if ((a === "--exe-path" || a === "--exe_path") && filtered[i + 1]) {
      guestGennxExe = String(filtered[(i += 1)]).trim();
      continue;
    }
    if (a === "--skip-ensure-vm" || a === "--skip_ensure_vm") {
      skipEnsureVm = true;
      continue;
    }
    if (a === "--skip-ensure-session" || a === "--skip_ensure_session") {
      skipEnsureSession = true;
      continue;
    }
    if (a === "--no-auto-elevate" || a === "--no_auto_elevate") {
      noAutoElevate = true;
      continue;
    }
    if (a === "--direct") {
      launchMode = "direct";
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/vm-gennx-launch-guest.mjs [options]
  --vm_profile_key K   workspace/vm-profiles.yaml (guest_winrm_host, hyper_v_vm_name, guest_gennx_launch_exe, ...)
  --exe-path P           GenNX.exe path ON THE GUEST (not host)
  --direct               Start-Process only in PowerShell Direct (often no visible UI; debugging)
  (default)              Interactive: schtasks as profile user (same as vmconnect user for visible window)
  --guest-winrm-host H   (with --skip-ensure-vm)
  --vm-name N
  --skip-ensure-vm
  --skip-ensure-session  do not auto-ensure the visible guest login session first
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
    guestGennxExe,
    skipEnsureVm,
    skipEnsureSession,
    internalElevated,
    noAutoElevate,
    launchMode,
  };
}

function main() {
  if (process.platform !== "win32") {
    console.error("vm-gennx-launch-guest: Windows host only.");
    process.exit(1);
  }

  if (!fs.existsSync(ps1)) {
    console.error(`Missing ${ps1}`);
    process.exit(1);
  }

  const argv = parseArgs(process.argv.slice(2));
  let guestWinRmHost = argv.guestWinRmHost || process.env.CLIBASE_VM_GENNX_VERIFY_GUEST_HOST?.trim() || "";
  let vmName = argv.vmName || process.env.CLIBASE_VM_HYPERV_NAME?.trim() || "";
  let guestGennxExe = argv.guestGennxExe || process.env.CLIBASE_VM_GUEST_GENNX_LAUNCH_EXE?.trim() || "";

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
    if (!guestGennxExe && typeof prof.guest_gennx_launch_exe === "string") {
      guestGennxExe = prof.guest_gennx_launch_exe.trim();
    }
    if (!guestGennxExe && typeof prof.guest_gennx_exe === "string") {
      guestGennxExe = prof.guest_gennx_exe.trim();
    }
  }

  if (!guestGennxExe) {
    guestGennxExe = DEFAULT_GUEST_GENNX_EXE;
  }

  applyCredentialDefaults(prof, argv.vmProfileKey || "");

  process.env.CLIBASE_VM_GUEST_GENNX_LAUNCH_EXE = guestGennxExe;
  const modeFromEnv = process.env.CLIBASE_VM_GENNX_LAUNCH_MODE?.trim();
  const effectiveLaunchMode = argv.launchMode === "direct" ? "direct" : modeFromEnv || "interactive";
  process.env.CLIBASE_VM_GENNX_LAUNCH_MODE = effectiveLaunchMode;
  if (guestWinRmHost) {
    process.env.CLIBASE_VM_GENNX_VERIFY_GUEST_HOST = guestWinRmHost;
  }
  if (vmName) {
    process.env.CLIBASE_VM_HYPERV_NAME = vmName;
  }

  const proofDir = path.join(repoRoot, ".clibase", "artifacts", "vm-gennx-launch-guest");
  fs.mkdirSync(proofDir, { recursive: true });
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const baseName = `guest-launch-${stamp}`;
  const hostProofPng = path.join(proofDir, `${baseName}.png`);
  process.env.CLIBASE_VM_HOST_PROOF_PNG = hostProofPng;
  process.env.CLIBASE_VM_HOST_ATTESTATION_JSON = path.join(proofDir, `${baseName}.attestation.json`);
  process.env.CLIBASE_VM_GUEST_PROOF_PNG =
    process.env.CLIBASE_VM_GUEST_PROOF_PNG?.trim() || "C:\\Windows\\Temp\\clibase-gennx-launch-proof.png";

  if (argv.skipEnsureVm && !guestWinRmHost) {
    console.error(
      "With --skip-ensure-vm, set guest address: --guest-winrm-host or CLIBASE_VM_GENNX_VERIFY_GUEST_HOST or vm-profiles guest_winrm_host.",
    );
    process.exit(1);
  }

  let effectiveSkipEnsureVm = argv.skipEnsureVm;
  const canManageHyperV = canHyperVManageSync(vmName || "GenNX-VM");

  if (!effectiveSkipEnsureVm && guestWinRmHost && !canManageHyperV) {
    console.log("vm-gennx-launch-guest: Hyper-V unavailable in this shell, falling back to WinRM-only guest launch.");
    effectiveSkipEnsureVm = true;
  }

  if (!effectiveSkipEnsureVm && !argv.internalElevated && !canManageHyperV) {
    console.log("vm-gennx-launch-guest: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
    if (argv.noAutoElevate) {
      console.error("Automatic UAC elevation disabled (--no-auto-elevate). Re-run from an elevated shell or omit the flag.");
      process.exit(1);
    }
    console.log("Re-launching with UAC elevation (one prompt)...");
    const r = relaunchElevatedUac();
    process.exit(typeof r.status === "number" ? r.status : 1);
  }

  if (effectiveLaunchMode !== "direct" && !argv.skipEnsureSession) {
    if (!fs.existsSync(guestSessionMjs)) {
      console.error(`Missing ${guestSessionMjs}`);
      process.exit(1);
    }
    const sessionArgs = ["ensure-visible"];
    if (argv.vmProfileKey) {
      sessionArgs.push("--vm_profile_key", argv.vmProfileKey);
    }
    if (guestWinRmHost) {
      sessionArgs.push("--guest-winrm-host", guestWinRmHost);
    }
    if (vmName) {
      sessionArgs.push("--vm-name", vmName);
    }
    if (effectiveSkipEnsureVm) {
      sessionArgs.push("--skip-ensure-vm");
    }
    if (argv.noAutoElevate) {
      sessionArgs.push("--no-auto-elevate");
    }
    const ensured = spawnSync(process.execPath, [guestSessionMjs, ...sessionArgs], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    if (ensured.error) {
      console.error(ensured.error.message);
      process.exit(1);
    }
    if (typeof ensured.status === "number" && ensured.status !== 0) {
      process.exit(ensured.status);
    }
  }

  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1];
  if (guestWinRmHost) {
    psArgs.push("-GuestWinRmHost", guestWinRmHost);
  }
  if (vmName) {
    psArgs.push("-VmName", vmName);
  }
  psArgs.push("-GuestGennxExe", guestGennxExe);
  if (effectiveSkipEnsureVm) {
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
