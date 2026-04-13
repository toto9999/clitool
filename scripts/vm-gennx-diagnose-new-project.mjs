#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const INTERNAL_ELEVATED = "--clibase-internal-hyperv-elevated";
const ps1 = path.join(repoRoot, "scripts", "vm-gennx-diagnose-new-project.ps1");
const guestSessionMjs = path.join(repoRoot, "scripts", "vm-guest-session.mjs");

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
    { windowsHide: true, encoding: "utf8", shell: false },
  );
  return r.status === 0;
}

function relaunchElevatedUac() {
  const shell = powershellExe();
  const mjs = path.join(repoRoot, "scripts", "vm-gennx-diagnose-new-project.mjs");
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

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === INTERNAL_ELEVATED) {
      internalElevated = true;
      continue;
    }
    if ((a === "--vm_profile_key" || a === "--vm-profile-key") && argv[i + 1]) {
      vmProfileKey = String(argv[(i += 1)]).trim();
      continue;
    }
    if ((a === "--guest-winrm-host" || a === "--guest_winrm_host") && argv[i + 1]) {
      guestWinRmHost = String(argv[(i += 1)]).trim();
      continue;
    }
    if ((a === "--vm-name" || a === "--vm_name") && argv[i + 1]) {
      vmName = String(argv[(i += 1)]).trim();
      continue;
    }
    if ((a === "--exe-path" || a === "--exe_path") && argv[i + 1]) {
      guestGennxExe = String(argv[(i += 1)]).trim();
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
    if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/vm-gennx-diagnose-new-project.mjs [options]
  --vm_profile_key K
  --guest-winrm-host H
  --vm-name N
  --exe-path P
  --skip-ensure-vm
  --skip-ensure-session
  --no-auto-elevate`);
      process.exit(0);
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }

  return { vmProfileKey, guestWinRmHost, vmName, guestGennxExe, skipEnsureVm, skipEnsureSession, internalElevated, noAutoElevate };
}

function main() {
  if (process.platform !== "win32") {
    console.error("vm-gennx-diagnose-new-project: Windows host only.");
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
    if (!guestGennxExe && typeof prof.guest_gennx_exe === "string") {
      guestGennxExe = prof.guest_gennx_exe.trim();
    }
  }

  if (!guestGennxExe) {
    guestGennxExe = "C:\\Program Files\\MIDAS\\MODS NX\\MIDAS GEN NX\\GenNX.exe";
  }

  applyCredentialDefaults(prof, argv.vmProfileKey || "");
  if (guestWinRmHost) {
    process.env.CLIBASE_VM_GENNX_VERIFY_GUEST_HOST = guestWinRmHost;
  }
  if (vmName) {
    process.env.CLIBASE_VM_HYPERV_NAME = vmName;
  }
  process.env.CLIBASE_VM_GUEST_GENNX_LAUNCH_EXE = guestGennxExe;

  let effectiveSkipEnsureVm = argv.skipEnsureVm;
  const canManageHyperV = canHyperVManageSync(vmName || "GenNX-VM");
  if (!effectiveSkipEnsureVm && guestWinRmHost && !canManageHyperV) {
    console.log("vm-gennx-diagnose-new-project: Hyper-V unavailable in this shell, falling back to WinRM-only diagnosis.");
    effectiveSkipEnsureVm = true;
  }

  if (!effectiveSkipEnsureVm && !argv.internalElevated && !canManageHyperV) {
    if (argv.noAutoElevate) {
      console.error("vm-gennx-diagnose-new-project: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
      console.error("Automatic UAC elevation disabled (--no-auto-elevate). Re-run from an elevated shell or omit the flag.");
      process.exit(1);
    }
    console.log("vm-gennx-diagnose-new-project: Hyper-V cmdlets unavailable (need Administrator or Hyper-V Administrators).");
    console.log("Re-launching with UAC elevation (one prompt)...");
    const r = relaunchElevatedUac();
    process.exit(typeof r.status === "number" ? r.status : 1);
  }

  if (!argv.skipEnsureSession) {
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

  const artifactDir = path.join(
    repoRoot,
    ".clibase",
    "artifacts",
    "vm-guest-diagnose-gennx-new-project",
    `${argv.vmProfileKey || "default"}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(artifactDir, { recursive: true });
  const hostResultJson = path.join(artifactDir, "result.json");
  const hostScreenshotPng = path.join(artifactDir, "screen.png");
  const guestResultJson = "C:\\Windows\\Temp\\clibase-midas-new-project-result.json";
  const guestScreenshotPng = "C:\\Windows\\Temp\\clibase-midas-new-project-screen.png";

  const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1];
  if (guestWinRmHost) {
    psArgs.push("-GuestWinRmHost", guestWinRmHost);
  }
  if (vmName) {
    psArgs.push("-VmName", vmName);
  }
  psArgs.push("-GuestGennxExe", guestGennxExe);
  psArgs.push("-GuestResultJson", guestResultJson);
  psArgs.push("-GuestScreenshotPng", guestScreenshotPng);
  psArgs.push("-HostResultJson", hostResultJson);
  psArgs.push("-HostScreenshotPng", hostScreenshotPng);
  if (effectiveSkipEnsureVm) {
    psArgs.push("-SkipEnsureVm");
  }

  const r = spawnSync(powershellExe(), psArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  process.exit(typeof r.status === "number" ? r.status : 1);
}

main();
