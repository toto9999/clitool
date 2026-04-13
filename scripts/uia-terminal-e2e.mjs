/**
 * Full terminal pipeline: ensure dist-electron → UiaPeek HTTP → SignalR capture → macro save → macro run → optional delete.
 *
 * Run from a logged-in Windows desktop (PowerShell / cmd / Windows Terminal).
 * SSH-only or agent-only sessions often cannot show GUI windows — you will see a warning.
 *
 * Usage:
 *   batcli uia pipeline e2e [--target-key …] [--skip-interactive] [--no-launch-target]
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { ensureUiaMacroServiceArtifact } from "./ensure-electron-artifacts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  let macroKey = "macro-e2e-pipeline";
  let targetKey = "target-uia-test-host";
  let captureMs = 8000;
  let outDir = path.join(repoRoot, ".clibase", "uia-terminal-record");
  let skipPeek = false;
  let cleanup = true;
  let skipInteractive = false;
  let launchTarget = true;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--macro-key" && argv[i + 1]) {
      macroKey = argv[(i += 1)];
      continue;
    }
    if (a === "--target-key" && argv[i + 1]) {
      targetKey = argv[(i += 1)];
      continue;
    }
    if (a === "--capture-ms" && argv[i + 1]) {
      captureMs = Math.max(0, Number(argv[(i += 1)]) || 0);
      continue;
    }
    if (a === "--out-dir" && argv[i + 1]) {
      outDir = path.resolve(argv[(i += 1)]);
      continue;
    }
    if (a === "--skip-uia-peek") {
      skipPeek = true;
      continue;
    }
    if (a === "--no-cleanup") {
      cleanup = false;
      continue;
    }
    if (a === "--skip-interactive") {
      skipInteractive = true;
      continue;
    }
    if (a === "--no-launch-target") {
      launchTarget = false;
      continue;
    }
  }

  return {
    macroKey,
    targetKey,
    captureMs,
    outDir,
    skipPeek,
    cleanup,
    skipInteractive,
    launchTarget,
  };
}

function loadWorkspaceStore() {
  const p = path.join(repoRoot, "workspace", "uia-macros.yaml");
  if (!fs.existsSync(p)) {
    return null;
  }
  return YAML.parse(fs.readFileSync(p, "utf8"));
}

function hasTarget(targetKey) {
  const doc = loadWorkspaceStore();
  const targets = Array.isArray(doc?.targets) ? doc.targets : [];
  return targets.some((t) => t && t.target_key === targetKey);
}

function getTargetExePath(targetKey) {
  const doc = loadWorkspaceStore();
  const targets = Array.isArray(doc?.targets) ? doc.targets : [];
  const t = targets.find((x) => x && x.target_key === targetKey);
  if (!t?.exe_path) {
    return "";
  }
  return String(t.exe_path).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function printVisibilityBanner(opts) {
  console.log(`
================================================================================
  화면에서 확인해야 하는 것 (로그인한 Windows 데스크톱에서 실행하세요)
================================================================================
  - 예시 EXE 창 (예: "Clibase UIA Recording Test" / 버튼 "Recording test click")
  - 녹화 구간: 그 창을 앞에 두고 버튼 등을 직접 클릭하면 이벤트가 수집됩니다.
  - 재생 구간: FlaUI가 같은 창에 클릭·입력을 재실행합니다 (창이 보여야 확인 가능).
  - Cursor/SSH 순수 헤드리스 터미널에서는 창이 안 보일 수 있습니다.
     → PowerShell 또는 cmd를 로컬 PC에서 직접 여세요.
================================================================================
`);
  const exe = getTargetExePath(opts.targetKey);
  if (exe && fs.existsSync(exe)) {
    console.log(`  등록된 대상 EXE: ${exe}`);
  } else if (exe) {
    console.log(`  등록된 대상 EXE 경로(파일 없음): ${exe}`);
  }
  if (!process.stdin.isTTY) {
    console.warn(
      "\n  [경고] stdin이 TTY가 아닙니다. GUI가 이 세션에 안 보일 수 있습니다.\n",
    );
  }
}

/**
 * @param {string} message
 * @param {{ skipInteractive: boolean }} opts
 */
async function waitForEnter(message, opts) {
  if (opts.skipInteractive) {
    console.log(`\n${message}\n(--skip-interactive: Enter 대기 생략)\n`);
    return;
  }
  if (!process.stdin.isTTY) {
    console.log(`\n${message}`);
    console.log("비대화형 터미널: 6초 후 녹화를 시작합니다. 창이 안 보이면 로컬 PowerShell에서 다시 실행하세요.\n");
    await new Promise((r) => setTimeout(r, 6000));
    return;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

function launchTargetExeVisible(exePath) {
  if (!exePath || !fs.existsSync(exePath)) {
    console.warn(`대상 EXE를 찾을 수 없어 자동 실행을 건너뜁니다: ${exePath || "(없음)"}`);
    return;
  }
  console.log(`\n--- 예시 EXE 실행 (화면에 창이 떠야 합니다) ---\n  ${exePath}\n`);
  const child = spawn(exePath, [], {
    cwd: path.dirname(exePath),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  if (child.pid) {
    console.log(`  pid=${child.pid} (이미 떠 있으면 창이 하나 더 뜰 수 있음)\n`);
  }
}

function runNode(scriptRelative, args) {
  const scriptPath = path.join(repoRoot, scriptRelative);
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage: batcli uia pipeline e2e [options]",
        "  --target-key K          default target-uia-test-host",
        "  --macro-key K           default macro-e2e-pipeline",
        "  --capture-ms N          recording window (default 8000)",
        "  --out-dir DIR",
        "  --skip-uia-peek",
        "  --no-cleanup            keep macro after run",
        "  --skip-interactive      no Enter prompts / no 6s delay in non-TTY",
        "  --no-launch-target      do not spawn the target exe before recording",
        "",
        "Run from a local Windows desktop terminal so the test window is visible.",
      ].join("\n"),
    );
    process.exit(0);
  }

  const opts = parseArgs(argv);

  printVisibilityBanner(opts);

  console.log("--- ensure dist-electron (uia-macro-service) ---");
  if (!ensureUiaMacroServiceArtifact(repoRoot)) {
    process.exit(1);
  }

  if (!hasTarget(opts.targetKey)) {
    console.error(
      `No target "${opts.targetKey}" in workspace/uia-macros.yaml. Register once, e.g. batcli action run --action uia.target.save --target_key ${opts.targetKey} …`,
    );
    process.exit(1);
  }

  if (!opts.skipPeek) {
    console.log("\n--- batcli uia-peek start (scripts/uia-peek-start.mjs) ---");
    const peek = runNode("scripts/uia-peek-start.mjs", []);
    if ((peek.status ?? 1) !== 0) {
      console.error(
        "\nUiaPeek did not become ready. If UiaPeek is already running, retry with --skip-uia-peek. See vendor/uia-peek/README.md",
      );
      process.exit(1);
    }
  }

  const exePath = getTargetExePath(opts.targetKey);
  if (opts.launchTarget && process.platform === "win32") {
    launchTargetExeVisible(exePath);
    await new Promise((r) => setTimeout(r, 1500));
  }

  await waitForEnter(
    [
      "녹화를 시작합니다. 위 EXE 창이 보이면 앞으로 가져온 뒤, 녹화 중에 버튼을 클릭하세요.",
      "준비되면 Enter… ",
    ].join("\n"),
    opts,
  );

  const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const recordScript = path.join(repoRoot, "scripts", "uia-terminal-record.ts");
  if (!fs.existsSync(tsxCli)) {
    console.error("Missing tsx. Run: npm install");
    process.exit(1);
  }

  console.log("\n--- uia record terminal capture (지금부터 UiaPeek가 이벤트를 수집합니다) ---");
  const cap = spawnSync(
    process.execPath,
    [tsxCli, recordScript, "capture", "--ms", String(opts.captureMs), "--out-dir", opts.outDir],
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
      shell: false,
    },
  );
  if ((cap.status ?? 1) !== 0) {
    process.exit(1);
  }

  const stepsFile = path.join(opts.outDir, "steps.yaml");
  if (!fs.existsSync(stepsFile)) {
    console.error(`Missing ${stepsFile}`);
    process.exit(1);
  }

  console.log("\n--- uia macro save ---");
  const save = runNode("scripts/uia-macro-cli.mjs", [
    "save",
    "--macro-key",
    opts.macroKey,
    "--target-key",
    opts.targetKey,
    "--steps-file",
    stepsFile,
    "--macro-name",
    "E2E pipeline",
  ]);
  if ((save.status ?? 1) !== 0) {
    process.exit(1);
  }

  await waitForEnter(
    [
      "이제 매크로 재생을 실행합니다. 예시 EXE 창이 보이는 상태에서 Enter 하면 FlaUI가 스텝을 재실행합니다.",
      "Enter… ",
    ].join("\n"),
    opts,
  );

  console.log("\n--- uia macro run (화면에서 클릭/동작을 확인하세요) ---");
  const run = runNode("scripts/uia-macro-cli.mjs", [
    "run",
    "--macro-key",
    opts.macroKey,
    "--ensure-target-running",
    "true",
  ]);
  if ((run.status ?? 1) !== 0) {
    process.exit(1);
  }

  if (opts.cleanup) {
    console.log("\n--- uia macro delete (cleanup) ---");
    runNode("scripts/uia-macro-cli.mjs", ["delete", "--macro-key", opts.macroKey]);
  }

  console.log("\nuia pipeline e2e: OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
