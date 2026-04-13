/**
 * Runs one FlaUI-class step via cli-host/uia-executor/run_step.py (stdin JSON).
 * Used during UiaPeek recording to generate deterministic UI events without a human.
 *
 * Usage:
 *   node scripts/uia-inject-flaui-step.mjs --pid 12345 --action click --selector "AutomationId:btn-uia-test-click"
 *   node scripts/uia-inject-flaui-step.mjs --pid 12345 --action set_text --selector "AutomationId:edit-uia-test-text" --value "hi"
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  let pid = 0;
  let action = "click";
  let selector = "";
  let value = "";
  let timeoutMs = 8000;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--pid" && argv[i + 1]) {
      pid = Number(argv[(i += 1)]);
      continue;
    }
    if (a === "--action" && argv[i + 1]) {
      action = argv[(i += 1)];
      continue;
    }
    if (a === "--selector" && argv[i + 1]) {
      selector = argv[(i += 1)];
      continue;
    }
    if (a === "--value" && argv[i + 1]) {
      value = argv[(i += 1)];
      continue;
    }
    if (a === "--timeout-ms" && argv[i + 1]) {
      timeoutMs = Number(argv[(i += 1)]) || 8000;
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }

  return { pid, action, selector, value, timeoutMs };
}

const argv = parseArgs(process.argv.slice(2));

if (process.platform !== "win32") {
  console.error("uia-inject-flaui-step: Windows only.");
  process.exit(1);
}

if (!Number.isFinite(argv.pid) || argv.pid <= 0) {
  console.error("Usage: --pid <positive integer> --action click|set_text|type --selector \"...\" [--value \"...\"]");
  process.exit(2);
}

if (!argv.selector.trim()) {
  console.error("--selector is required.");
  process.exit(2);
}

const venvPython = path.join(
  repoRoot,
  ".clibase",
  "python",
  "uia-executor",
  "Scripts",
  "python.exe",
);
const python = fs.existsSync(venvPython) ? venvPython : "python";
const scriptPath = path.join(repoRoot, "cli-host", "uia-executor", "run_step.py");

if (!fs.existsSync(scriptPath)) {
  console.error(`Missing ${scriptPath}`);
  process.exit(1);
}

const payload = JSON.stringify({
  action: argv.action,
  selector: argv.selector,
  value: argv.value,
  pid: argv.pid,
  timeout_ms: argv.timeoutMs,
});

const result = spawnSync(python, [scriptPath], {
  cwd: repoRoot,
  input: payload,
  encoding: "utf8",
  windowsHide: true,
  timeout: Math.max(argv.timeoutMs + 3000, 5000),
  shell: false,
});

const stdout = (result.stdout ?? "").toString();
const stderr = (result.stderr ?? "").toString();
if (stdout.trim()) {
  console.log(stdout.trim());
}
if (stderr.trim()) {
  console.error(stderr.trim());
}

const code = typeof result.status === "number" ? result.status : 1;
process.exit(code);
