/**
 * 녹화·재생 스모크용 대상 EXE가 빌드되어 있는지 확인합니다.
 * UiaPeek/Electron 없이 실행 가능합니다.
 *
 * Usage:
 *   batcli uia-test-host verify-exe
 *   npm run uia:verify-test-host-exe
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const exePath = path.join(
  repoRoot,
  "tools",
  "uia-recording-test-host",
  "dist",
  "UiaRecordingTestHost.exe",
);

const MIN_BYTES = 512 * 1024;

if (process.platform !== "win32") {
  console.log("uia-test-host verify-exe: skipped (Windows-only).");
  process.exit(0);
}

if (!fs.existsSync(exePath)) {
  console.error(
    `Missing: ${exePath}\n  Run: batcli uia-test-host build-exe`,
  );
  process.exit(1);
}

const st = fs.statSync(exePath);
if (!st.isFile() || st.size < MIN_BYTES) {
  console.error(
    `Invalid or too small: ${exePath} (${st.size} bytes; expected >= ${MIN_BYTES})`,
  );
  process.exit(1);
}

console.log(`OK: ${exePath} (${st.size} bytes)`);
process.exit(0);
