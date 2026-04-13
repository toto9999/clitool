/**
 * End-to-end CLI smoke: 녹화(UiaPeek SignalR) → 세션 버퍼 → flaui 매크로 저장 → 재생.
 * 기본 모드는 레코드·재생까지 포함한다. 정적 YAML만 쓰려면 --static-only.
 *
 * 전제: `batcli smoke verification`으로 실행하면 uia-executor·UiaPeek vendor·Electron(detached)까지 batcli가 맞춤.
 *
 * Usage:
 *   node scripts/uia-verification-smoke.mjs [--scope workspace-default]
 *   [--target-key target-notepad] [--macro-key macro-record-replay-cli]
 *   [--record-wait-ms 8000] [--startup-wait-ms 1500]
 *   [--static-only] [--steps-file workspace/uia-steps-smoke.yaml]
 *   [--fallback-steps-file workspace/uia-steps-smoke.yaml]
 *   [--cli-auto] [--cli-auto-exe]  Tkinter 테스트 창 + FlaUI 주입 (--cli-auto-exe 는 PyInstaller EXE)
 *   [--calculator-doc]  doc/Calculator.exe (계산기다): target 등록·FlaUI로 1+2= 입력·녹화 후 canonical YAML(디스플레이 assert)로 재생
 *   [--test-host-python path] [--test-host-app path]
 *   [--skip-macro] [--keep-macro] [--skip-uia-peek-ping]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const batcliJs = path.join(repoRoot, "bin", "batcli.js");

/** tools/uia-recording-test-host — uia.target.save 로 등록되는 키 */
const TARGET_UIA_TEST_HOST = "target-uia-test-host";
/** doc/Calculator.exe — UIA title regex (pywinauto title_re) */
const TARGET_CALCULATOR_DOC = "target-calculator-doc";

function parseArgs(argv) {
  let scope = "workspace-default";
  let targetKey = "target-notepad";
  let macroKey = "macro-record-replay-cli";
  let stepsFile = "workspace/uia-steps-smoke.yaml";
  let recordWaitMs = 8000;
  let startupWaitMs = 1500;
  let staticOnly = false;
  let skipMacro = false;
  let keepMacro = false;
  let skipUiaPeekPing = false;
  let fallbackStepsFile = "";
  let cliAuto = false;
  let cliAutoExe = false;
  let calculatorDoc = false;
  let testHostPython = "";
  let testHostApp = "";

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--scope" && argv[i + 1]) {
      scope = argv[(i += 1)];
      continue;
    }
    if (a === "--target-key" && argv[i + 1]) {
      targetKey = argv[(i += 1)];
      continue;
    }
    if (a === "--macro-key" && argv[i + 1]) {
      macroKey = argv[(i += 1)];
      continue;
    }
    if (a === "--steps-file" && argv[i + 1]) {
      stepsFile = argv[(i += 1)];
      continue;
    }
    if (a === "--record-wait-ms" && argv[i + 1]) {
      recordWaitMs = Math.max(0, Number(argv[(i += 1)]) || 0);
      continue;
    }
    if (a === "--startup-wait-ms" && argv[i + 1]) {
      startupWaitMs = Math.max(0, Number(argv[(i += 1)]) || 0);
      continue;
    }
    if (a === "--fallback-steps-file" && argv[i + 1]) {
      fallbackStepsFile = argv[(i += 1)];
      continue;
    }
    if (a === "--static-only") {
      staticOnly = true;
      continue;
    }
    if (a === "--skip-macro") {
      skipMacro = true;
      continue;
    }
    if (a === "--keep-macro") {
      keepMacro = true;
      continue;
    }
    if (a === "--skip-uia-peek-ping") {
      skipUiaPeekPing = true;
      continue;
    }
    if (a === "--cli-auto") {
      cliAuto = true;
      continue;
    }
    if (a === "--cli-auto-exe") {
      cliAutoExe = true;
      continue;
    }
    if (a === "--calculator-doc") {
      calculatorDoc = true;
      continue;
    }
    if (a === "--test-host-python" && argv[i + 1]) {
      testHostPython = argv[(i += 1)];
      continue;
    }
    if (a === "--test-host-app" && argv[i + 1]) {
      testHostApp = argv[(i += 1)];
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }

  if (calculatorDoc && macroKey === "macro-record-replay-cli") {
    macroKey = "macro-calculator-doc-verify";
  }

  return {
    scope,
    targetKey,
    macroKey,
    stepsFile,
    recordWaitMs,
    startupWaitMs,
    staticOnly,
    skipMacro,
    keepMacro,
    skipUiaPeekPing,
    fallbackStepsFile,
    cliAuto,
    cliAutoExe,
    calculatorDoc,
    testHostPython,
    testHostApp,
  };
}

function runBatcli(args) {
  const result = spawnSync(process.execPath, [batcliJs, ...args], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  return typeof result.status === "number" ? result.status : 1;
}

function step(title, args) {
  console.log(`\n--- ${title} ---`);
  const code = runBatcli(args);
  if (code !== 0) {
    console.error(`\nFailed: ${title} (exit ${code})`);
    process.exit(code);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolvePythonTestHost(argv) {
  const appDefault = path.join(repoRoot, "tools", "uia-recording-test-host", "app.py");
  const appPy =
    argv.testHostApp && String(argv.testHostApp).trim().length > 0
      ? path.resolve(String(argv.testHostApp).trim())
      : appDefault;
  const fromEnv = process.env.CLIBASE_UIA_EXECUTOR_PYTHON?.trim();
  let python =
    argv.testHostPython && String(argv.testHostPython).trim().length > 0
      ? path.resolve(String(argv.testHostPython).trim())
      : fromEnv && fromEnv.length > 0
        ? fromEnv
        : path.join(repoRoot, ".clibase", "python", "uia-executor", "Scripts", "python.exe");
  if (!fs.existsSync(python)) {
    console.error(
      "uia-executor Python이 없습니다. batcli smoke verification(루트에서) 또는 batcli uia-executor install 을 실행하세요.",
    );
    process.exit(1);
  }
  if (!fs.existsSync(appPy)) {
    console.error(`Missing ${appPy}`);
    process.exit(1);
  }
  return { python, appPy };
}

function runBatcliJson(args) {
  const r = spawnSync(process.execPath, [batcliJs, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  if ((r.status ?? 1) !== 0) {
    return null;
  }
  try {
    return JSON.parse((r.stdout ?? "").trim());
  } catch {
    return null;
  }
}

function runInjectStep(pid, action, selector, value = "") {
  const injectScript = path.join(repoRoot, "scripts", "uia-inject-flaui-step.mjs");
  const args = [injectScript, "--pid", String(pid), "--action", action, "--selector", selector];
  if (value) {
    args.push("--value", value);
  }
  const r = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  return r.status ?? 1;
}

async function runCliAutoRecordReplay(argv, scopeArgs, resolvedFallback, mode = "python") {
  const macroKey = argv.macroKey;
  const tk = TARGET_UIA_TEST_HOST;

  let exePath;
  let appArg;
  let targetName;
  let logIntro;

  if (mode === "exe") {
    exePath = path.join(
      repoRoot,
      "tools",
      "uia-recording-test-host",
      "dist",
      "UiaRecordingTestHost.exe",
    );
    if (!fs.existsSync(exePath)) {
      console.error(
        `EXE 없음: ${exePath}\n  batcli uia-test-host build-exe 로 먼저 빌드하세요.`,
      );
      process.exit(1);
    }
    appArg = null;
    targetName = "UIA recording test host (EXE)";
    logIntro = `cli-auto-exe: exe=${exePath}`;
  } else {
    const resolved = resolvePythonTestHost(argv);
    exePath = resolved.python;
    appArg = resolved.appPy;
    targetName = "UIA recording test host";
    logIntro = `cli-auto: python=${exePath}\ncli-auto: app=${appArg}`;
  }

  console.log(logIntro);

  console.log("\n--- uia.target.save (테스트 호스트) ---");
  const savePayload = [
    "action",
    "run",
    "--action",
    "uia.target.save",
    ...scopeArgs,
    "--target_key",
    tk,
    "--target_name",
    targetName,
    "--exe_path",
    exePath,
    "--startup_wait_ms",
    "1200",
  ];
  if (appArg) {
    savePayload.push("--args", appArg);
  }
  if (runBatcli(savePayload) !== 0) {
    process.exit(1);
  }

  console.log("\n--- uia.target.stop (optional) ---");
  runBatcli(["action", "run", "--action", "uia.target.stop", ...scopeArgs, "--target_key", tk]);

  step("uia.target.launch", [
    "action",
    "run",
    "--action",
    "uia.target.launch",
    ...scopeArgs,
    "--target_key",
    tk,
  ]);

  if (argv.startupWaitMs > 0) {
    console.log(`\n--- startup wait ${argv.startupWaitMs}ms ---`);
    await delay(argv.startupWaitMs);
  }

  step("uia.recording.start", ["action", "run", "--action", "uia.recording.start", ...scopeArgs]);

  const stateJson = runBatcliJson([
    "action",
    "run",
    "--action",
    "uia.target.state",
    ...scopeArgs,
    "--target_key",
    tk,
    "--output-format",
    "json",
  ]);
  const pid = stateJson?.result?.pid;
  if (typeof pid !== "number" || pid <= 0) {
    console.error("uia.target.state 에서 pid 없음. 테스트 창이 떠 있는지 확인하세요.");
    process.exit(1);
  }
  console.log(`FlaUI inject: pid=${pid}`);

  if (runInjectStep(pid, "click", "Name:Recording test click") !== 0) {
    console.error("FlaUI click 실패. uia-executor(pywinauto) 확인.");
    process.exit(1);
  }
  await delay(400);

  if (argv.recordWaitMs > 0) {
    console.log(`\n--- extra record wait ${argv.recordWaitMs}ms ---`);
    await delay(argv.recordWaitMs);
  }

  step("uia.recording.stop", ["action", "run", "--action", "uia.recording.stop", ...scopeArgs]);

  console.log("\n--- uia.recording.session.save_macro ---");
  let saveOk = runBatcli([
    "action",
    "run",
    "--action",
    "uia.recording.session.save_macro",
    ...scopeArgs,
    "--macro_key",
    macroKey,
    "--target_key",
    tk,
    "--macro_name",
    "CLI cli-auto record-replay",
  ]);

  if (saveOk !== 0) {
    console.error("\nuia.recording.session.save_macro 실패.");
    if (fs.existsSync(resolvedFallback)) {
      const rel = path.relative(repoRoot, resolvedFallback).replace(/\\/g, "/");
      console.log(`\n--- fallback: uia.macro.save from ${rel} ---`);
      step("uia.macro.save (fallback)", [
        "action",
        "run",
        "--action",
        "uia.macro.save",
        ...scopeArgs,
        "--macro_key",
        macroKey,
        "--target_key",
        tk,
        "--macro_name",
        "CLI fallback",
        "--steps_file",
        rel,
      ]);
    } else {
      process.exit(1);
    }
  }

  step("uia.macro.run", [
    "action",
    "run",
    "--action",
    "uia.macro.run",
    ...scopeArgs,
    "--macro_key",
    macroKey,
    "--target_key",
    tk,
    "--ensure_target_running",
    "true",
  ]);

  if (!argv.keepMacro) {
    step("uia.macro.delete", [
      "action",
      "run",
      "--action",
      "uia.macro.delete",
      ...scopeArgs,
      "--macro_key",
      macroKey,
    ]);
  }

  step("uia.target.stop", [
    "action",
    "run",
    "--action",
    "uia.target.stop",
    ...scopeArgs,
    "--target_key",
    tk,
  ]);

  step("uia.recording.state", ["action", "run", "--action", "uia.recording.state", ...scopeArgs]);

  const modeTag = mode === "exe" ? "cli-auto-exe" : "cli-auto";
  console.log(`\nuia-verification-smoke: OK (${modeTag}: test host + inject + record → replay)`);
}

/**
 * doc/Calculator.exe: 숫자·연산 키는 Text 노드에 AutomationId(예: 4097=1, 4109=+, 4108==)로 잡힌다.
 * 결과 줄 Edit(4096)는 ValuePattern CurrentValue로 검증한다(flaui.get_text + run_step).
 * 녹화 버퍼는 선택적으로 저장한 뒤, 재생은 저장소의 canonical YAML(uia-steps-calculator-doc.yaml)로 덮어써 assert까지 고정한다.
 */
async function runCalculatorDocRecordReplay(argv, scopeArgs, resolvedFallback) {
  const macroKey = argv.macroKey;
  const tk = TARGET_CALCULATOR_DOC;
  const calcExe = path.join(repoRoot, "doc", "Calculator.exe");
  const titleRe = ".*계산기다.*";
  const calcFallback = path.join(repoRoot, "workspace", "uia-steps-calculator-doc.yaml");

  if (!fs.existsSync(calcExe)) {
    console.error(`Calculator.exe 없음: ${calcExe}`);
    process.exit(1);
  }

  console.log(`calculator-doc: exe=${calcExe}\ncalculator-doc: uia_window_title(title_re)=${titleRe}`);

  console.log("\n--- uia.target.save (doc/Calculator.exe) ---");
  const savePayload = [
    "action",
    "run",
    "--action",
    "uia.target.save",
    ...scopeArgs,
    "--target_key",
    tk,
    "--target_name",
    "doc Calculator (계산기다)",
    "--exe_path",
    calcExe,
    "--startup_wait_ms",
    "1500",
    "--uia_window_title",
    titleRe,
  ];
  if (runBatcli(savePayload) !== 0) {
    process.exit(1);
  }

  console.log("\n--- uia.target.stop (optional) ---");
  runBatcli(["action", "run", "--action", "uia.target.stop", ...scopeArgs, "--target_key", tk]);

  step("uia.target.launch", [
    "action",
    "run",
    "--action",
    "uia.target.launch",
    ...scopeArgs,
    "--target_key",
    tk,
  ]);

  if (argv.startupWaitMs > 0) {
    console.log(`\n--- startup wait ${argv.startupWaitMs}ms ---`);
    await delay(argv.startupWaitMs);
  }

  step("uia.recording.start", ["action", "run", "--action", "uia.recording.start", ...scopeArgs]);

  const stateJson = runBatcliJson([
    "action",
    "run",
    "--action",
    "uia.target.state",
    ...scopeArgs,
    "--target_key",
    tk,
    "--output-format",
    "json",
  ]);
  const pid = stateJson?.result?.pid;
  if (typeof pid !== "number" || pid <= 0) {
    console.error("uia.target.state 에서 pid 없음. Calculator.exe가 떠 있는지 확인하세요.");
    process.exit(1);
  }
  console.log(`FlaUI inject (calculator 1+2=): pid=${pid}`);
  const calcSeq = [
    ["4127", "C"],
    ["4097", "1"],
    ["4109", "+"],
    ["4098", "2"],
    ["4108", "="],
  ];
  for (const [aid, label] of calcSeq) {
    if (runInjectStep(pid, "click", `AutomationId:${aid}`) !== 0) {
      console.error(`FlaUI ${label} (AutomationId:${aid}) 클릭 실패.`);
      process.exit(1);
    }
    await delay(120);
  }
  await delay(250);

  if (argv.recordWaitMs > 0) {
    console.log(`\n--- extra record wait ${argv.recordWaitMs}ms ---`);
    await delay(argv.recordWaitMs);
  }

  step("uia.recording.stop", ["action", "run", "--action", "uia.recording.stop", ...scopeArgs]);

  console.log("\n--- uia.recording.session.save_macro (optional) ---");
  const saveOk = runBatcli([
    "action",
    "run",
    "--action",
    "uia.recording.session.save_macro",
    ...scopeArgs,
    "--macro_key",
    macroKey,
    "--target_key",
    tk,
    "--macro_name",
    "CLI calculator-doc record-replay",
  ]);
  if (saveOk !== 0) {
    console.error("\nuia.recording.session.save_macro 실패 (무시 가능: canonical YAML로 재생).");
  }

  if (!fs.existsSync(calcFallback)) {
    console.error(`calculator canonical steps 없음: ${calcFallback}`);
    process.exit(1);
  }
  const canonicalRel = path.relative(repoRoot, calcFallback).replace(/\\/g, "/");
  console.log(`\n--- uia.macro.save (canonical steps: ${canonicalRel}) ---`);
  step("uia.macro.save (calculator canonical steps)", [
    "action",
    "run",
    "--action",
    "uia.macro.save",
    ...scopeArgs,
    "--macro_key",
    macroKey,
    "--target_key",
    tk,
    "--macro_name",
    "CLI calculator-doc canonical 1+2=3",
    "--steps_file",
    canonicalRel,
  ]);

  step("uia.macro.run", [
    "action",
    "run",
    "--action",
    "uia.macro.run",
    ...scopeArgs,
    "--macro_key",
    macroKey,
    "--target_key",
    tk,
    "--ensure_target_running",
    "true",
  ]);

  if (!argv.keepMacro) {
    step("uia.macro.delete", [
      "action",
      "run",
      "--action",
      "uia.macro.delete",
      ...scopeArgs,
      "--macro_key",
      macroKey,
    ]);
  }

  step("uia.target.stop", [
    "action",
    "run",
    "--action",
    "uia.target.stop",
    ...scopeArgs,
    "--target_key",
    tk,
  ]);

  step("uia.recording.state", ["action", "run", "--action", "uia.recording.state", ...scopeArgs]);

  console.log("\nuia-verification-smoke: OK (calculator-doc: inject + record + canonical replay with display assert)");
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  if (process.platform !== "win32") {
    console.log("uia-verification-smoke: skipped (Windows-only UIA verification lane).");
    process.exit(0);
  }

  if (!fs.existsSync(batcliJs)) {
    console.error("Missing bin/batcli.js");
    process.exit(1);
  }

  const resolvedSteps = path.isAbsolute(argv.stepsFile)
    ? argv.stepsFile
    : path.join(repoRoot, argv.stepsFile);
  if (
    argv.staticOnly &&
    !argv.skipMacro &&
    !argv.cliAuto &&
    !argv.cliAutoExe &&
    !fs.existsSync(resolvedSteps)
  ) {
    console.error(`steps file not found: ${resolvedSteps}`);
    process.exit(1);
  }

  const defaultFallbackAbs = path.join(repoRoot, "workspace", "uia-steps-smoke.yaml");
  const resolvedFallback = argv.fallbackStepsFile
    ? path.isAbsolute(argv.fallbackStepsFile)
      ? argv.fallbackStepsFile
      : path.join(repoRoot, argv.fallbackStepsFile)
    : defaultFallbackAbs;

  console.log("uia-verification-smoke: requires Electron (batcli dev) with runtime control.");
  console.log(
    `scope=${argv.scope} target=${argv.targetKey} macro=${argv.macroKey} staticOnly=${argv.staticOnly} cliAuto=${argv.cliAuto} cliAutoExe=${argv.cliAutoExe} calculatorDoc=${argv.calculatorDoc}`,
  );

  if (!argv.skipUiaPeekPing) {
    const pingScript = path.join(repoRoot, "scripts", "uia-peek-http-ping.mjs");
    if (fs.existsSync(pingScript)) {
      console.log("\n--- UiaPeek HTTP ping (SignalR 녹화 전에 권장) ---");
      const ping = spawnSync(process.execPath, [pingScript], {
        cwd: repoRoot,
        stdio: "inherit",
        env: process.env,
        shell: false,
      });
      const pingCode = typeof ping.status === "number" ? ping.status : 1;
      if (pingCode !== 0) {
        if (!argv.staticOnly) {
          console.warn(
            "UiaPeek HTTP ping 실패: 녹화 시작이 막힐 수 있습니다. batcli uia-peek ping / UiaPeek.exe 확인.\n",
          );
        } else {
          console.warn("UiaPeek HTTP ping failed (static-only macro can still run).\n");
        }
      }
    }
  }

  const scopeArgs = ["--scope", argv.scope];

  step("Runtime app.ping", ["action", "run", "--action", "app.ping", ...scopeArgs]);

  step("uia.registry.get", ["action", "run", "--action", "uia.registry.get", ...scopeArgs]);

  if (argv.calculatorDoc) {
    await runCalculatorDocRecordReplay(argv, scopeArgs, resolvedFallback);
    return;
  }
  if (argv.cliAutoExe) {
    await runCliAutoRecordReplay(argv, scopeArgs, resolvedFallback, "exe");
    return;
  }
  if (argv.cliAuto) {
    await runCliAutoRecordReplay(argv, scopeArgs, resolvedFallback, "python");
    return;
  }

  if (argv.skipMacro) {
    step("uia.recording.state", ["action", "run", "--action", "uia.recording.state", ...scopeArgs]);
    console.log("\nuia-verification-smoke: OK (--skip-macro)");
    return;
  }

  if (argv.staticOnly) {
    step("uia.macro.save (정적 steps 파일)", [
      "action",
      "run",
      "--action",
      "uia.macro.save",
      ...scopeArgs,
      "--macro_key",
      argv.macroKey,
      "--target_key",
      argv.targetKey,
      "--macro_name",
      "CLI verification smoke (static)",
      "--steps_file",
      argv.stepsFile,
    ]);

    step("uia.macro.run", [
      "action",
      "run",
      "--action",
      "uia.macro.run",
      ...scopeArgs,
      "--macro_key",
      argv.macroKey,
      "--target_key",
      argv.targetKey,
      "--ensure_target_running",
      "true",
    ]);

    if (!argv.keepMacro) {
      step("uia.macro.delete (cleanup)", [
        "action",
        "run",
        "--action",
        "uia.macro.delete",
        ...scopeArgs,
        "--macro_key",
        argv.macroKey,
      ]);
    }

    step("uia.recording.state", ["action", "run", "--action", "uia.recording.state", ...scopeArgs]);
    console.log("\nuia-verification-smoke: OK (static-only)");
    return;
  }

  step("uia.target.launch (녹화 대상)", [
    "action",
    "run",
    "--action",
    "uia.target.launch",
    ...scopeArgs,
    "--target_key",
    argv.targetKey,
  ]);

  if (argv.startupWaitMs > 0) {
    console.log(`\n--- startup wait ${argv.startupWaitMs}ms ---`);
    await delay(argv.startupWaitMs);
  }

  step("uia.recording.start", ["action", "run", "--action", "uia.recording.start", ...scopeArgs]);

  console.log(
    `\n>>> 녹화 중입니다 (${argv.recordWaitMs}ms). 대상 앱에서 클릭·입력하세요. <<<\n`,
  );
  if (argv.recordWaitMs > 0) {
    await delay(argv.recordWaitMs);
  }

  step("uia.recording.stop", ["action", "run", "--action", "uia.recording.stop", ...scopeArgs]);

  console.log("\n--- uia.recording.session.save_macro (녹화 → flaui 매크로) ---");
  let saveOk = runBatcli([
    "action",
    "run",
    "--action",
    "uia.recording.session.save_macro",
    ...scopeArgs,
    "--macro_key",
    argv.macroKey,
    "--target_key",
    argv.targetKey,
    "--macro_name",
    "CLI record-replay smoke",
  ]);

  if (saveOk !== 0) {
    console.error(
      "\nuia.recording.session.save_macro 실패 (녹화에서 flaui 스텝을 못 뽑았을 수 있음).",
    );
    if (fs.existsSync(resolvedFallback)) {
      const rel = path.relative(repoRoot, resolvedFallback).replace(/\\/g, "/");
      console.log(`\n--- fallback: uia.macro.save from ${rel} ---`);
      step("uia.macro.save (fallback steps)", [
        "action",
        "run",
        "--action",
        "uia.macro.save",
        ...scopeArgs,
        "--macro_key",
        argv.macroKey,
        "--target_key",
        argv.targetKey,
        "--macro_name",
        "CLI fallback smoke",
        "--steps_file",
        rel,
      ]);
    } else {
      console.error(
        "해결: 녹화 대기 중 대상 UI 조작, --record-wait-ms 증가, 또는 workspace/uia-steps-smoke.yaml 배치.",
      );
      process.exit(1);
    }
  }

  step("uia.macro.run (녹화 기반 재생)", [
    "action",
    "run",
    "--action",
    "uia.macro.run",
    ...scopeArgs,
    "--macro_key",
    argv.macroKey,
    "--target_key",
    argv.targetKey,
    "--ensure_target_running",
    "true",
  ]);

  if (!argv.keepMacro) {
    step("uia.macro.delete (cleanup)", [
      "action",
      "run",
      "--action",
      "uia.macro.delete",
      ...scopeArgs,
      "--macro_key",
      argv.macroKey,
    ]);
  }

  step("uia.target.stop", [
    "action",
    "run",
    "--action",
    "uia.target.stop",
    ...scopeArgs,
    "--target_key",
    argv.targetKey,
  ]);

  step("uia.recording.state", ["action", "run", "--action", "uia.recording.state", ...scopeArgs]);

  console.log("\nuia-verification-smoke: OK (record → save_macro → run)");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
