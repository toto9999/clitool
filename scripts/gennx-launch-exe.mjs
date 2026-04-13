/**
 * Launch GenNX.exe from a build folder (local or VM session path).
 *
 * Usage:
 *   batcli vm gennx launch
 *   batcli vm gennx launch --folder "C:\Users\dd\Desktop\x64_Release_D260330_T1123_N224_r_b7_MR"
 *   batcli vm gennx launch --exe-path "C:\...\GenNX.exe"
 *
 * Env: CLIBASE_GENNX_LAUNCH_FOLDER overrides default folder; CLIBASE_GENNX_EXE overrides full exe path.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_FOLDER =
  "C:\\Users\\dd\\Desktop\\x64_Release_D260330_T1123_N224_r_b7_MR";
const DEFAULT_EXE_NAME = "GenNX.exe";

function parseArgs(argv) {
  let exePath = "";
  let folder = "";

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if ((a === "--exe-path" || a === "--exe_path") && argv[i + 1]) {
      exePath = String(argv[(i += 1)]).trim();
      continue;
    }
    if ((a === "--folder" || a === "--dir") && argv[i + 1]) {
      folder = String(argv[(i += 1)]).trim();
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: batcli vm gennx launch [--exe-path PATH] [--folder DIR]

Default folder: ${DEFAULT_FOLDER}
Override folder: CLIBASE_GENNX_LAUNCH_FOLDER
Override exe:     CLIBASE_GENNX_EXE`);
      process.exit(0);
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }

  return { exePath, folder };
}

function resolveExe({ exePath, folder }) {
  const fromEnvExe = process.env.CLIBASE_GENNX_EXE?.trim();
  if (fromEnvExe) {
    return path.resolve(fromEnvExe);
  }
  if (exePath) {
    return path.resolve(exePath);
  }
  const fromEnvFolder = process.env.CLIBASE_GENNX_LAUNCH_FOLDER?.trim();
  const dir = folder || fromEnvFolder || DEFAULT_FOLDER;
  return path.join(path.resolve(dir), DEFAULT_EXE_NAME);
}

function main() {
  if (process.platform !== "win32") {
    console.error("gennx-launch-exe: Windows only.");
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  const resolved = resolveExe(opts);

  if (!fs.existsSync(resolved)) {
    console.error(`GenNX.exe not found:\n  ${resolved}\nSet --folder, --exe-path, or CLIBASE_GENNX_EXE.`);
    process.exit(1);
  }

  const cwd = path.dirname(resolved);
  console.log(`Launching: ${resolved}\ncwd: ${cwd}`);

  const child = spawn(resolved, [], {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: false,
    shell: false,
  });
  child.unref();

  if (!child.pid) {
    console.error("Failed to start GenNX.exe");
    process.exit(1);
  }

  console.log(`Started pid=${child.pid}`);
  process.exit(0);
}

main();
