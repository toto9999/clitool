/**
 * gennx_guest_runtime: GenNX exe + FlaUI steps against a live process (no Electron shell).
 * Loads dist-electron uia-macro-service like scripts/uia-macro-cli.mjs.
 *
 * Usage:
 *   batcli uia gennx verify
 *   node scripts/gennx-runtime-verify.mjs [--target-key target-gennx] [--steps-file workspace/uia-steps-gennx-click.yaml] [--macro-key macro-gennx-runtime-verify] [--no-cleanup]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { ensureUiaMacroServiceArtifact } from "./ensure-electron-artifacts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const batcliJs = path.join(repoRoot, "bin", "batcli.js");
const macroCli = path.join(repoRoot, "scripts", "uia-macro-cli.mjs");

function normalizeExe(p) {
  return String(p ?? "")
    .trim()
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\//g, "\\");
}

function parseArgs(argv) {
  let targetKey = "target-gennx";
  let stepsFile = "workspace/uia-steps-gennx-click.yaml";
  let macroKey = "macro-gennx-runtime-verify";
  let cleanup = true;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--target-key" && argv[i + 1]) {
      targetKey = String(argv[(i += 1)]).trim();
      continue;
    }
    if (a === "--steps-file" && argv[i + 1]) {
      stepsFile = String(argv[(i += 1)]).trim();
      continue;
    }
    if (a === "--macro-key" && argv[i + 1]) {
      macroKey = String(argv[(i += 1)]).trim();
      continue;
    }
    if (a === "--no-cleanup") {
      cleanup = false;
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/gennx-runtime-verify.mjs [options]
  --target-key K     default target-gennx
  --steps-file PATH  default workspace/uia-steps-gennx-click.yaml
  --macro-key K      default macro-gennx-runtime-verify
  --no-cleanup       keep macro after run

Requires: Windows interactive session, GenNX at workspace target exe_path (or CLIBASE_VM_GENNX_EXE), batcli uia-executor install, dist-electron uia-macro-service.`);
      process.exit(0);
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }

  return { targetKey, stepsFile, macroKey, cleanup };
}

function loadWorkspaceTargets() {
  const p = path.join(repoRoot, "workspace", "uia-macros.yaml");
  if (!fs.existsSync(p)) {
    return { path: p, doc: null };
  }
  try {
    return { path: p, doc: YAML.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return { path: p, doc: null };
  }
}

function getTargetExePath(doc, targetKey) {
  const targets = Array.isArray(doc?.targets) ? doc.targets : [];
  const t = targets.find((x) => x && x.target_key === targetKey);
  if (!t?.exe_path) {
    return "";
  }
  return normalizeExe(t.exe_path);
}

function runNode(scriptAbs, args) {
  return spawnSync(process.execPath, [scriptAbs, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
}

function ensureUiaExecutorViaBatcli() {
  if (!fs.existsSync(batcliJs)) {
    console.error(`Missing ${batcliJs}`);
    process.exit(1);
  }
  console.log("\n--- batcli uia-executor install ---\n");
  const r = spawnSync(process.execPath, [batcliJs, "uia-executor", "install"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if ((r.status ?? 1) !== 0) {
    console.error("uia-executor install failed.");
    process.exit(1);
  }
}

function main() {
  const argv = parseArgs(process.argv.slice(2));

  if (process.platform !== "win32") {
    console.error("gennx-runtime-verify: Windows only.");
    process.exit(1);
  }

  const envExe =
    (typeof process.env.CLIBASE_VM_GENNX_EXE === "string" && process.env.CLIBASE_VM_GENNX_EXE.trim()) ||
    (typeof process.env.CLIBASE_GUEST_GENNX_EXE === "string" && process.env.CLIBASE_GUEST_GENNX_EXE.trim()) ||
    "";

  const { doc } = loadWorkspaceTargets();
  const fromYaml = getTargetExePath(doc, argv.targetKey);
  const exePath = normalizeExe(envExe || fromYaml);

  if (!exePath) {
    console.error(
      `No exe_path for target "${argv.targetKey}" in workspace/uia-macros.yaml and no CLIBASE_VM_GENNX_EXE / CLIBASE_GUEST_GENNX_EXE.`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(exePath)) {
    console.error(
      `GenNX executable not found:\n  ${exePath}\nInstall GenNX or set CLIBASE_VM_GENNX_EXE to the guest exe. See batcli vm gennx resolve-config.`,
    );
    process.exit(1);
  }

  const stepsAbs = path.isAbsolute(argv.stepsFile) ? argv.stepsFile : path.join(repoRoot, argv.stepsFile);
  if (!fs.existsSync(stepsAbs)) {
    console.error(`Steps file not found: ${stepsAbs}`);
    process.exit(1);
  }

  ensureUiaExecutorViaBatcli();

  if (!ensureUiaMacroServiceArtifact(repoRoot)) {
    process.exit(1);
  }

  console.log(`\n--- gennx runtime verify ---`);
  if (process.env.CLIBASE_VM_VERIFY_ON_GUEST === "1") {
    console.log("(session: guest VM via WinRM — CLIBASE_VM_VERIFY_ON_GUEST=1)");
  }
  console.log(`exe_path=${exePath}`);
  console.log(`target_key=${argv.targetKey} macro_key=${argv.macroKey} steps=${path.relative(repoRoot, stepsAbs).replace(/\\/g, "/")}`);
  console.log(`Run from a logged-in interactive Windows desktop (VM console or RDP with visible UI if required).\n`);

  const relSteps = path.relative(repoRoot, stepsAbs).replace(/\\/g, "/");

  let code = runNode(macroCli, [
    "save",
    "--macro-key",
    argv.macroKey,
    "--target-key",
    argv.targetKey,
    "--steps-file",
    relSteps,
    "--macro-name",
    "GEN runtime verify",
  ]);
  if ((code.status ?? 1) !== 0) {
    process.exit(1);
  }

  code = runNode(macroCli, [
    "run",
    "--macro-key",
    argv.macroKey,
    "--target-key",
    argv.targetKey,
    "--ensure-target-running",
    "true",
  ]);
  if ((code.status ?? 1) !== 0) {
    if (argv.cleanup) {
      runNode(macroCli, ["delete", "--macro-key", argv.macroKey]);
    }
    process.exit(1);
  }

  if (argv.cleanup) {
    runNode(macroCli, ["delete", "--macro-key", argv.macroKey]);
  }

  console.log("\ngennx-runtime-verify: OK");
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
