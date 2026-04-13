#!/usr/bin/env node
/**
 * Resolve GenNX guest exe path / probe candidate list without embedding in batcli.
 * Same precedence as intended for batcli vm guest diagnose-gennx-new-project / probe-gennx-env:
 *   1) --exe-path
 *   2) CLIBASE_VM_GENNX_EXE or CLIBASE_GUEST_GENNX_EXE
 *   3) workspace/vm-profiles.yaml vm_profiles[].guest_gennx_exe for --vm_profile_key
 *   4) workspace/uia-macros.yaml targets[].exe_path where target_key == profile.target_key
 *   5) default MODS NX path
 *
 * Optional: CLIBASE_VM_GENNX_PROCESS_NAME, CLIBASE_VM_GENNX_WINDOW_TITLE_PREFIX
 * Extra probe paths: CLIBASE_VM_GENNX_EXE_CANDIDATES (semicolon or pipe separated)
 *
 * Usage: node scripts/vm-gennx-resolve-config.mjs [--vm_profile_key vm-gennx-01] [--exe-path "C:\\..."]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const repoRoot = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.join(repoRoot, "workspace");
const vmProfilesPath = path.join(workspaceRoot, "vm-profiles.yaml");
const uiaMacrosPath = path.join(workspaceRoot, "uia-macros.yaml");

function normalizeExe(p) {
  return String(p ?? "")
    .trim()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\//g, "\\");
}

function parseArgs(argv) {
  let vmProfileKey = "";
  let exePathFlag = "";
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if ((a === "--vm_profile_key" || a === "--vm-profile-key") && argv[i + 1]) {
      vmProfileKey = String(argv[(i += 1)]).trim();
      continue;
    }
    if ((a === "--exe-path" || a === "--exe_path") && argv[i + 1]) {
      exePathFlag = String(argv[(i += 1)]).trim();
      continue;
    }
  }
  return { vmProfileKey, exePathFlag };
}

function loadYaml(p) {
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return YAML.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function getProfile(doc, key) {
  const rows = Array.isArray(doc?.vm_profiles) ? doc.vm_profiles : [];
  return rows.find((r) => r && r.vm_profile_key === key) ?? null;
}

function getTargetExe(doc, targetKey) {
  if (!targetKey || !doc || !Array.isArray(doc.targets)) {
    return "";
  }
  const t = doc.targets.find((x) => x && x.target_key === targetKey);
  if (!t?.exe_path) {
    return "";
  }
  return normalizeExe(t.exe_path);
}

function main() {
  const argv = process.argv.slice(2);
  const { vmProfileKey, exePathFlag } = parseArgs(argv);

  const defaultMods = "C:\\Program Files\\MIDAS\\MODS NX\\MIDAS GEN NX\\GenNX.exe";
  const envExe =
    (typeof process.env.CLIBASE_VM_GENNX_EXE === "string" && process.env.CLIBASE_VM_GENNX_EXE.trim()) ||
    (typeof process.env.CLIBASE_GUEST_GENNX_EXE === "string" && process.env.CLIBASE_GUEST_GENNX_EXE.trim()) ||
    "";

  const vmDoc = loadYaml(vmProfilesPath);
  const uiaDoc = loadYaml(uiaMacrosPath);
  const profile = vmProfileKey ? getProfile(vmDoc, vmProfileKey) : null;
  const profileExe = profile && typeof profile.guest_gennx_exe === "string" ? profile.guest_gennx_exe.trim() : "";

  const tk = profile && typeof profile.target_key === "string" ? profile.target_key.trim() : "";
  const fromTarget = tk && uiaDoc ? getTargetExe(uiaDoc, tk) : "";

  const flagExe = exePathFlag;
  const exePath = normalizeExe(flagExe || envExe || profileExe || fromTarget || defaultMods);

  const productProcessName =
    (typeof process.env.CLIBASE_VM_GENNX_PROCESS_NAME === "string" &&
      process.env.CLIBASE_VM_GENNX_PROCESS_NAME.trim()) ||
    "GenNX";
  const windowTitlePrefix =
    (typeof process.env.CLIBASE_VM_GENNX_WINDOW_TITLE_PREFIX === "string" &&
      process.env.CLIBASE_VM_GENNX_WINDOW_TITLE_PREFIX.trim()) ||
    "MIDAS GEN NX";

  const envExtra =
    typeof process.env.CLIBASE_VM_GENNX_EXE_CANDIDATES === "string"
      ? process.env.CLIBASE_VM_GENNX_EXE_CANDIDATES.split(/[;|]/)
          .map((s) => normalizeExe(s))
          .filter(Boolean)
      : [];

  const builtinExtras = [
    defaultMods,
    "C:\\Program Files\\MIDAS\\Gen\\970\\x64_Release_D260330_T1123_N224_r_b7_MR\\GenNX.exe",
  ];

  const probeCandidates = [];
  const seen = new Set();
  for (const p of [exePath, fromTarget, profileExe, envExe, ...envExtra, ...builtinExtras]) {
    const n = normalizeExe(p);
    if (!n || seen.has(n)) {
      continue;
    }
    seen.add(n);
    probeCandidates.push(n);
  }

  let primaryFrom = "default_mods_nx";
  if (flagExe) {
    primaryFrom = "flag_exe_path";
  } else if (envExe) {
    primaryFrom = "env_CLIBASE_VM_GENNX_EXE_or_CLIBASE_GUEST_GENNX_EXE";
  } else if (profileExe) {
    primaryFrom = "vm_profile_guest_gennx_exe";
  } else if (fromTarget) {
    primaryFrom = "uia_macros_target_exe_path";
  }

  const out = {
    exe_path: exePath,
    product_process_name: productProcessName,
    window_title_prefix: windowTitlePrefix,
    probe_candidates: probeCandidates,
    resolution: {
      primary_from: primaryFrom,
      vm_profile_key: vmProfileKey || null,
      vm_profile_guest_gennx_exe: profileExe || null,
      uia_target_key: tk || null,
      uia_target_exe_path: fromTarget || null,
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
