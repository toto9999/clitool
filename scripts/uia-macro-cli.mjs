/**
 * Workspace UIA macros without Electron: uses the same logic as the runtime (dist-electron uia-macro-service).
 * Requires: npm run build:electron (batcli build includes it).
 *
 * Usage:
 *   node scripts/uia-macro-cli.mjs save --macro-key K --target-key T --steps-file path.yaml [--macro-name N]
 *   node scripts/uia-macro-cli.mjs run --macro-key K [--target-key T] [--ensure-target-running true]
 *   node scripts/uia-macro-cli.mjs delete --macro-key K
 *   node scripts/uia-macro-cli.mjs list [--target-key T]
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { ensureUiaMacroServiceArtifact, getUiaMacroServiceCjsPath } from "./ensure-electron-artifacts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const repoRoot = path.resolve(__dirname, "..");

function loadService() {
  if (!ensureUiaMacroServiceArtifact(repoRoot)) {
    process.exit(1);
  }
  const serviceCjs = getUiaMacroServiceCjsPath(repoRoot);
  return require(serviceCjs);
}

function getFlag(argv, ...keys) {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    for (const k of keys) {
      if (a === `--${k}` && argv[i + 1] !== undefined) {
        return String(argv[(i += 1)]).trim();
      }
    }
  }
  return "";
}

function getBoolFlag(argv, key, defaultValue) {
  const v = getFlag(argv, key);
  if (!v) {
    return defaultValue;
  }
  return v.toLowerCase() === "true" || v === "1";
}

function readStepsFromFile(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`steps file not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const parsed = YAML.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && Array.isArray(parsed.steps)) {
    return parsed.steps;
  }
  throw new Error("steps file must be a YAML array of steps or { steps: [...] }");
}

function createSvc() {
  const { createUiaMacroService } = loadService();
  const vendorPeek = path.join(repoRoot, "vendor", "uia-peek", "UiaPeek.exe");
  const preferred = fs.existsSync(vendorPeek) ? [vendorPeek] : [];
  return createUiaMacroService({
    workspaceRoot: path.join(repoRoot, "workspace"),
    repoRoot,
    preferredUiaPeekHostPaths: preferred,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  const svc = createSvc();
  const shutdown = () => {
    try {
      svc.shutdown();
    } catch {
      // ignore
    }
  };
  process.on("exit", shutdown);

  if (cmd === "save") {
    const macroKey = getFlag(rest, "macro-key", "macro_key");
    const targetKey = getFlag(rest, "target-key", "target_key");
    const stepsFile = getFlag(rest, "steps-file", "steps_file");
    const macroName = getFlag(rest, "macro-name", "macro_name");
    const description = getFlag(rest, "description", "description");
    if (!macroKey || !targetKey || !stepsFile) {
      console.error(
        "Usage: batcli uia macro save --macro-key K --target-key T --steps-file path.yaml [--macro-name N]",
      );
      process.exit(2);
    }
    const steps = readStepsFromFile(stepsFile);
    const result = svc.saveMacro({
      macro_key: macroKey,
      macro_name: macroName || macroKey,
      target_key: targetKey,
      description: description || "",
      shared_tags: [],
      steps,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (cmd === "run") {
    const macroKey = getFlag(rest, "macro-key", "macro_key");
    const targetKey = getFlag(rest, "target-key", "target_key");
    const ensure = getBoolFlag(rest, "ensure-target-running", true);
    if (!macroKey) {
      console.error(
        "Usage: batcli uia macro run --macro-key K [--target-key T] [--ensure-target-running true]",
      );
      process.exit(2);
    }
    const payload = {
      macro_key: macroKey,
      ensure_target_running: ensure,
    };
    if (targetKey) {
      payload.target_key = targetKey;
    }
    const result = await svc.runMacro(payload);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === "error" ? 1 : 0);
  }

  if (cmd === "delete") {
    const macroKey = getFlag(rest, "macro-key", "macro_key");
    if (!macroKey) {
      console.error("Usage: batcli uia macro delete --macro-key K");
      process.exit(2);
    }
    const result = svc.deleteMacro(macroKey);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (cmd === "list") {
    const targetKey = getFlag(rest, "target-key", "target_key");
    const result = svc.listMacros(targetKey || "");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.error("Expected: save | run | delete | list");
  process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
