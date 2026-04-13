/**
 * Builds tools/uia-recording-test-host/dist/UiaRecordingTestHost.exe via PyInstaller (onefile, no console).
 * Requires uia-executor venv (batcli uia-executor install).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const stateDir = path.join(repoRoot, ".clibase");
const venvPython = path.join(stateDir, "python", "uia-executor", "Scripts", "python.exe");
const hostDir = path.join(repoRoot, "tools", "uia-recording-test-host");
const appPy = path.join(hostDir, "app.py");
const distDir = path.join(hostDir, "dist");
const workDir = path.join(hostDir, "build-exe-work");

if (process.platform !== "win32") {
  console.log("uia-test-host build-exe: Windows-only.");
  process.exit(0);
}

if (!fs.existsSync(appPy)) {
  console.error(`Missing ${appPy}`);
  process.exit(1);
}

if (!fs.existsSync(venvPython)) {
  console.error("UIA executor venv missing. Run: batcli uia-executor install");
  process.exit(1);
}

function run(title, args) {
  console.log(`\n--- ${title} ---`);
  const r = spawnSync(venvPython, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  const code = typeof r.status === "number" ? r.status : 1;
  if (code !== 0) {
    process.exit(code);
  }
}

run("pip install pyinstaller", ["-m", "pip", "install", "--quiet", "pyinstaller>=6.0"]);

fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(workDir, { recursive: true });

const exeName = "UiaRecordingTestHost";
run("PyInstaller", [
  "-m",
  "PyInstaller",
  "--onefile",
  "--windowed",
  "--noconfirm",
  "--clean",
  "--name",
  exeName,
  "--distpath",
  distDir,
  "--workpath",
  workDir,
  "--specpath",
  hostDir,
  appPy,
]);

const outExe = path.join(distDir, `${exeName}.exe`);
if (!fs.existsSync(outExe)) {
  console.error(`Expected output missing: ${outExe}`);
  process.exit(1);
}

console.log(`\nOK: ${outExe}`);
console.log("Run: batcli smoke verification --cli-auto-exe");
