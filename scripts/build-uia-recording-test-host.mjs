/**
 * Verifies tools/uia-recording-test-host/app.py (syntax) using uia-executor venv Python.
 * No .NET SDK required.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const stateDir = path.join(repoRoot, ".clibase");
const venvPython = path.join(
  stateDir,
  "python",
  "uia-executor",
  "Scripts",
  "python.exe",
);
const appPy = path.join(repoRoot, "tools", "uia-recording-test-host", "app.py");

if (!fs.existsSync(appPy)) {
  console.error(`Missing ${appPy}`);
  process.exit(1);
}

if (process.platform !== "win32") {
  console.log("uia-recording-test-host: Windows-only.");
  process.exit(0);
}

if (!fs.existsSync(venvPython)) {
  console.error(
    "UIA executor venv missing. Run: batcli install   (or: batcli uia-executor install)",
  );
  process.exit(1);
}

const r = spawnSync(venvPython, ["-m", "py_compile", appPy], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false,
});
const code = typeof r.status === "number" ? r.status : 1;
if (code !== 0) {
  process.exit(code);
}

console.log(`OK: ${appPy}`);
