import { ChildProcess, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { recordRuntimeLog } from "../runtime-control/runtime-logging.cjs";
import { applyHostReferenceWindowConstraintWindows } from "./windows-host-window-constraint.cjs";
import {
  resolveUiaPeekExecutable,
  resolveUiaPeekHostExecutable,
} from "./uiapeek-resolve.cjs";

interface UiaMacroServiceOptions {
  /** Durable workspace data root (e.g. repo/workspace). */
  workspaceRoot: string;
  /** Repository root containing cli-host/ (not workspace/). */
  repoRoot: string;
  /** UiaPeek.exe candidates (vendor/, userData cache) checked before PATH discovery. */
  preferredUiaPeekHostPaths?: string[];
}

interface UiaAdapterConfig {
  provider_key: string;
  executable_path: string;
  python_executable: string;
  default_timeout_ms: number;
}

export type UiaCoordinateSpace = "screen" | "client" | "host_reference";
export type UiaPlacementMode = "external_os_window" | "host_panel_fill";

/** Contract for normalizing recorded/replay coordinates vs a declared host panel size (future HWND fill). */
export interface UiaHostReferenceFrame {
  width_px: number;
  height_px: number;
  coordinate_space: UiaCoordinateSpace;
  placement_mode: UiaPlacementMode;
}

interface UiaTargetRecord {
  target_key: string;
  target_name: string;
  exe_path: string;
  args: string[];
  working_dir: string;
  startup_wait_ms: number;
  created_at: string;
  updated_at: string;
  /** When set, FlaUI steps connect via pywinauto title_re (helps PyInstaller/bootstrap PID mismatch). */
  uia_window_title?: string;
  host_reference_frame?: UiaHostReferenceFrame;
}

interface UiaMacroStepRecord {
  step_key: string;
  action_name: string;
  selector: string;
  value: string;
  timeout_ms: number | null;
  continue_on_error: boolean;
  extra_args: string[];
}

interface UiaMacroRecord {
  macro_key: string;
  macro_name: string;
  target_key: string;
  description: string;
  shared_tags: string[];
  steps: UiaMacroStepRecord[];
  created_at: string;
  updated_at: string;
}

interface UiaMacroStoreShape {
  version: number;
  uia_adapter: UiaAdapterConfig;
  targets: UiaTargetRecord[];
  macros: UiaMacroRecord[];
}

interface TargetRuntimeEntry {
  process: ChildProcess | null;
  launched_at: string | null;
  exit_code: number | null;
  exited_at: string | null;
}

interface SaveTargetPayload {
  target_key: string;
  target_name: string;
  exe_path: string;
  args: string[];
  working_dir: string;
  startup_wait_ms: number;
  uia_window_title?: string;
  host_reference_frame?: UiaHostReferenceFrame | null;
}

interface SaveMacroPayload {
  macro_key: string;
  macro_name: string;
  target_key: string;
  description: string;
  shared_tags: string[];
  steps: unknown[];
}

interface RunMacroPayload {
  macro_key: string;
  target_key?: string;
  ensure_target_running: boolean;
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function waitFor(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return fallback;
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

function sanitizeHostReferenceFrame(raw: UiaHostReferenceFrame): UiaHostReferenceFrame {
  const w = Math.max(Math.round(Number(raw.width_px)) || 0, 1);
  const h = Math.max(Math.round(Number(raw.height_px)) || 0, 1);
  const cs = normalizeString(raw.coordinate_space as unknown as string).toLowerCase();
  const coordinate_space: UiaCoordinateSpace =
    cs === "screen" || cs === "client" || cs === "host_reference" ? cs : "host_reference";
  const pm = normalizeString(raw.placement_mode as unknown as string).toLowerCase();
  const placement_mode: UiaPlacementMode =
    pm === "host_panel_fill" || pm === "external_os_window" ? pm : "external_os_window";
  return { width_px: w, height_px: h, coordinate_space, placement_mode };
}

function normalizeHostReferenceFrame(raw: unknown): UiaHostReferenceFrame | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const w = normalizeNumber(o.width_px, 0);
  const h = normalizeNumber(o.height_px, 0);
  if (w < 1 || h < 1) {
    return undefined;
  }
  return sanitizeHostReferenceFrame({
    width_px: w,
    height_px: h,
    coordinate_space: (normalizeString(o.coordinate_space) || "host_reference") as UiaCoordinateSpace,
    placement_mode: (normalizeString(o.placement_mode) || "external_os_window") as UiaPlacementMode,
  });
}

function validateReadableKey(keyValue: string, requiredPrefix: string) {
  const normalized = keyValue.trim();
  if (!normalized) {
    throw new Error(`Missing required key: ${requiredPrefix}`);
  }

  if (!normalized.startsWith(requiredPrefix)) {
    throw new Error(`Key ${normalized} must start with ${requiredPrefix}.`);
  }

  if (!/^[a-z0-9-]+$/.test(normalized)) {
    throw new Error(`Key ${normalized} must use lowercase readable characters and hyphen.`);
  }

  return normalized;
}

function buildDefaultStore() {
  return {
    version: 1,
    uia_adapter: {
      provider_key: "flaui_python",
      executable_path: "",
      python_executable: "",
      default_timeout_ms: 5000,
    },
    targets: [],
    macros: [],
  } satisfies UiaMacroStoreShape;
}

function normalizeStep(step: unknown, stepIndex: number) {
  const stepObject = (step ?? {}) as Record<string, unknown>;
  const fallbackStepKey = `step-${String(stepIndex + 1).padStart(2, "0")}`;
  const stepKey = validateReadableKey(
    normalizeString(stepObject.step_key) || fallbackStepKey,
    "step-",
  );
  const actionName = normalizeString(stepObject.action_name);

  if (!actionName) {
    throw new Error(`Macro step ${stepKey} requires action_name.`);
  }

  return {
    step_key: stepKey,
    action_name: actionName,
    selector: normalizeString(stepObject.selector),
    value: typeof stepObject.value === "string" ? stepObject.value : "",
    timeout_ms:
      stepObject.timeout_ms === null
        ? null
        : normalizeNumber(stepObject.timeout_ms, 0) || null,
    continue_on_error: normalizeBoolean(stepObject.continue_on_error, false),
    extra_args: normalizeStringArray(stepObject.extra_args),
  } satisfies UiaMacroStepRecord;
}

function normalizeStore(rawValue: unknown, storePath: string) {
  const defaultStore = buildDefaultStore();
  const source = (rawValue ?? {}) as Record<string, unknown>;

  const targets = Array.isArray(source.targets)
    ? source.targets.map((entry, index) => {
        const target = (entry ?? {}) as Record<string, unknown>;
        const fallbackTargetKey = `target-${String(index + 1).padStart(2, "0")}`;
        const targetKey = validateReadableKey(
          normalizeString(target.target_key) || fallbackTargetKey,
          "target-",
        );
        const now = new Date().toISOString();
        const hostFrame = normalizeHostReferenceFrame(target.host_reference_frame);
        const uiaWindowTitle = normalizeString(target.uia_window_title);
        return {
          target_key: targetKey,
          target_name: normalizeString(target.target_name) || targetKey,
          exe_path: normalizeString(target.exe_path),
          args: normalizeStringArray(target.args),
          working_dir: normalizeString(target.working_dir),
          startup_wait_ms: Math.max(normalizeNumber(target.startup_wait_ms, 1200), 0),
          created_at: normalizeString(target.created_at) || now,
          updated_at: normalizeString(target.updated_at) || now,
          ...(uiaWindowTitle ? { uia_window_title: uiaWindowTitle } : {}),
          ...(hostFrame ? { host_reference_frame: hostFrame } : {}),
        } satisfies UiaTargetRecord;
      })
    : [];

  const macros = Array.isArray(source.macros)
    ? source.macros.map((entry, index) => {
        const macro = (entry ?? {}) as Record<string, unknown>;
        const fallbackMacroKey = `macro-${String(index + 1).padStart(2, "0")}`;
        const macroKey = validateReadableKey(
          normalizeString(macro.macro_key) || fallbackMacroKey,
          "macro-",
        );
        const now = new Date().toISOString();
        const macroSteps = Array.isArray(macro.steps)
          ? macro.steps.map((step, stepIndex) => normalizeStep(step, stepIndex))
          : [];

        return {
          macro_key: macroKey,
          macro_name: normalizeString(macro.macro_name) || macroKey,
          target_key: normalizeString(macro.target_key),
          description: normalizeString(macro.description),
          shared_tags: normalizeStringArray(macro.shared_tags),
          steps: macroSteps,
          created_at: normalizeString(macro.created_at) || now,
          updated_at: normalizeString(macro.updated_at) || now,
        } satisfies UiaMacroRecord;
      })
    : [];

  const adapterObject = (source.uia_adapter ?? {}) as Record<string, unknown>;
  const nextStore = {
    version: Math.max(normalizeNumber(source.version, 1), 1),
    uia_adapter: {
      provider_key: normalizeString(adapterObject.provider_key) || defaultStore.uia_adapter.provider_key,
      executable_path: normalizeString(adapterObject.executable_path),
      python_executable: normalizeString(adapterObject.python_executable),
      default_timeout_ms: Math.max(
        normalizeNumber(adapterObject.default_timeout_ms, defaultStore.uia_adapter.default_timeout_ms),
        500,
      ),
    },
    targets,
    macros,
  } satisfies UiaMacroStoreShape;

  ensureDir(path.dirname(storePath));
  fs.writeFileSync(storePath, YAML.stringify(nextStore), "utf8");
  return nextStore;
}

function parseYamlObject(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return buildDefaultStore();
  }

  const rawText = fs.readFileSync(filePath, "utf8");
  if (!rawText.trim()) {
    return buildDefaultStore();
  }

  try {
    return YAML.parse(rawText);
  } catch (error) {
    throw new Error(
      `Unable to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildTargetRuntimeState(
  targetKey: string,
  targetName: string,
  runtimeEntry: TargetRuntimeEntry | undefined,
) {
  const runningProcess = runtimeEntry?.process;
  const isRunning =
    Boolean(runningProcess) &&
    runningProcess?.exitCode === null &&
    !runningProcess?.killed;

  return {
    target_key: targetKey,
    target_name: targetName,
    is_running: isRunning,
    pid: isRunning ? runningProcess?.pid ?? null : null,
    launched_at: runtimeEntry?.launched_at ?? null,
    exit_code: runtimeEntry?.exit_code ?? null,
    exited_at: runtimeEntry?.exited_at ?? null,
  };
}

export function createUiaMacroService(options: UiaMacroServiceOptions) {
  const storePath = path.join(options.workspaceRoot, "uia-macros.yaml");
  const targetRuntimeByKey = new Map<string, TargetRuntimeEntry>();

  const readStore = () => normalizeStore(parseYamlObject(storePath), storePath);

  const writeStore = (nextStore: UiaMacroStoreShape) => {
    ensureDir(path.dirname(storePath));
    fs.writeFileSync(storePath, YAML.stringify(nextStore), "utf8");
  };

  const getTargetRecord = (store: UiaMacroStoreShape, targetKey: string) =>
    store.targets.find((entry) => entry.target_key === targetKey) ?? null;

  const getTargetState = (store: UiaMacroStoreShape, targetKey: string) => {
    const targetRecord = getTargetRecord(store, targetKey);
    if (!targetRecord) {
      throw new Error(`Unknown target_key: ${targetKey}`);
    }

    return buildTargetRuntimeState(
      targetRecord.target_key,
      targetRecord.target_name,
      targetRuntimeByKey.get(targetRecord.target_key),
    );
  };

  const launchTarget = async (
    store: UiaMacroStoreShape,
    targetKey: string,
    overrides?: {
      exe_path?: string;
      args?: string[];
      working_dir?: string;
      startup_wait_ms?: number;
    },
  ) => {
    const targetRecord = getTargetRecord(store, targetKey);
    if (!targetRecord) {
      throw new Error(`Unknown target_key: ${targetKey}`);
    }

    const existingRuntime = targetRuntimeByKey.get(targetRecord.target_key);
    if (existingRuntime?.process && existingRuntime.process.exitCode === null && !existingRuntime.process.killed) {
      return {
        ...buildTargetRuntimeState(
          targetRecord.target_key,
          targetRecord.target_name,
          existingRuntime,
        ),
        reused_existing_process: true,
      };
    }

    const executablePath = normalizeString(overrides?.exe_path) || targetRecord.exe_path;
    if (!executablePath) {
      throw new Error(`Target ${targetRecord.target_key} has no exe_path.`);
    }

    const launchArgs = overrides?.args?.length ? overrides.args : targetRecord.args;
    const workingDirectory =
      normalizeString(overrides?.working_dir) ||
      targetRecord.working_dir ||
      path.dirname(executablePath) ||
      process.cwd();
    const startupWaitMs =
      overrides?.startup_wait_ms ?? targetRecord.startup_wait_ms;

    const childProcess = spawn(executablePath, launchArgs, {
      cwd: workingDirectory,
      detached: false,
      windowsHide: false,
      stdio: "ignore",
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finishResolve = () => {
        if (settled) {
          return;
        }
        settled = true;
        childProcess.off("error", handleError);
        resolve();
      };

      const handleError = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };

      childProcess.once("error", handleError);
      setTimeout(finishResolve, 100);
    });

    const launchedAt = new Date().toISOString();
    const nextRuntime: TargetRuntimeEntry = {
      process: childProcess,
      launched_at: launchedAt,
      exit_code: null,
      exited_at: null,
    };
    targetRuntimeByKey.set(targetRecord.target_key, nextRuntime);

    childProcess.on("exit", (code) => {
      const runtimeEntry = targetRuntimeByKey.get(targetRecord.target_key);
      if (!runtimeEntry) {
        return;
      }

      runtimeEntry.exit_code = typeof code === "number" ? code : null;
      runtimeEntry.exited_at = new Date().toISOString();
      runtimeEntry.process = null;
    });

    if (startupWaitMs > 0) {
      await waitFor(Math.min(startupWaitMs, 8000));
    }

    let hostWindowConstraint: { ok: boolean; detail?: string } | undefined;
    const hostFrame = targetRecord.host_reference_frame;
    const childPid = childProcess.pid;

    if (
      process.platform === "win32" &&
      hostFrame &&
      hostFrame.placement_mode === "external_os_window" &&
      hostFrame.width_px > 0 &&
      hostFrame.height_px > 0 &&
      childPid
    ) {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt > 0) {
          await waitFor(500);
        }

        hostWindowConstraint = applyHostReferenceWindowConstraintWindows(
          childPid,
          hostFrame.width_px,
          hostFrame.height_px,
        );

        if (hostWindowConstraint.ok) {
          break;
        }
      }

      if (hostWindowConstraint) {
        recordRuntimeLog(
          hostWindowConstraint.ok ? "info" : "warn",
          "uia host_reference window constraint",
          {
            target_key: targetRecord.target_key,
            pid: String(childPid),
            ok: String(hostWindowConstraint.ok),
            detail: hostWindowConstraint.detail ?? "",
          },
        );
      }
    }

    recordRuntimeLog("info", "uia target launched", {
      target_key: targetRecord.target_key,
      exe_path: executablePath,
      pid: childProcess.pid,
    });

    return {
      ...buildTargetRuntimeState(
        targetRecord.target_key,
        targetRecord.target_name,
        targetRuntimeByKey.get(targetRecord.target_key),
      ),
      reused_existing_process: false,
      exe_path: executablePath,
      args: launchArgs,
      working_dir: workingDirectory,
      ...(hostWindowConstraint ? { host_window_constraint: hostWindowConstraint } : {}),
    };
  };

  const stopTarget = (store: UiaMacroStoreShape, targetKey: string) => {
    const targetRecord = getTargetRecord(store, targetKey);
    if (!targetRecord) {
      throw new Error(`Unknown target_key: ${targetKey}`);
    }

    const runtimeEntry = targetRuntimeByKey.get(targetRecord.target_key);
    const runningProcess = runtimeEntry?.process;
    const isRunning =
      Boolean(runningProcess) &&
      runningProcess?.exitCode === null &&
      !runningProcess?.killed;

    if (!isRunning || !runtimeEntry) {
      return {
        ...buildTargetRuntimeState(
          targetRecord.target_key,
          targetRecord.target_name,
          runtimeEntry,
        ),
        stop_requested: false,
      };
    }

    runningProcess?.kill();

    recordRuntimeLog("info", "uia target stop requested", {
      target_key: targetRecord.target_key,
      pid: runningProcess?.pid ?? null,
    });

    return {
      ...buildTargetRuntimeState(
        targetRecord.target_key,
        targetRecord.target_name,
        runtimeEntry,
      ),
      stop_requested: true,
    };
  };

  const runUiaPeekStep = (
    adapterConfig: UiaAdapterConfig,
    stepRecord: UiaMacroStepRecord,
    targetState: ReturnType<typeof buildTargetRuntimeState>,
  ) => {
    const { executable: executablePath } = resolveUiaPeekExecutable(adapterConfig);
    const timeoutMs = stepRecord.timeout_ms ?? adapterConfig.default_timeout_ms;
    const providerAction = stepRecord.action_name.replace(/^uiapeek\./, "").trim();

    if (!providerAction) {
      throw new Error(`Step ${stepRecord.step_key} has invalid action_name.`);
    }

    const commandArgs = ["--action", providerAction];

    if (stepRecord.selector) {
      commandArgs.push("--selector", stepRecord.selector);
    }

    if (stepRecord.value) {
      commandArgs.push("--value", stepRecord.value);
    }

    if (targetState.pid) {
      commandArgs.push("--pid", String(targetState.pid));
    }

    commandArgs.push("--timeout-ms", String(timeoutMs));

    if (stepRecord.extra_args.length > 0) {
      commandArgs.push(...stepRecord.extra_args);
    }

    const commandResult = spawnSync(executablePath, commandArgs, {
      encoding: "utf8",
      windowsHide: true,
      timeout: Math.max(timeoutMs + 800, 1000),
      shell: false,
    });

    if (commandResult.error) {
      const err = commandResult.error;
      const isMissing =
        ("code" in err && err.code === "ENOENT") ||
        (typeof err.message === "string" && err.message.includes("ENOENT"));
      const hint = isMissing
        ? " Install UiaPeek or set PATH / CLIBASE_UIAPEEK_EXE / uia_adapter.executable_path."
        : "";
      throw new Error(
        `UiaPeek execution failed for ${stepRecord.step_key}: ${err.message}${hint}`,
      );
    }

    return {
      exit_code: typeof commandResult.status === "number" ? commandResult.status : null,
      stdout: (commandResult.stdout ?? "").toString().trim(),
      stderr: (commandResult.stderr ?? "").toString().trim(),
      ok: commandResult.status === 0,
      command: executablePath,
      args: commandArgs,
    };
  };

  function resolvePythonExecutable(adapterConfig: UiaAdapterConfig) {
    const fromEnv = process.env.CLIBASE_PYTHON?.trim();
    if (fromEnv) {
      return fromEnv;
    }

    const manual = adapterConfig.python_executable.trim();
    if (manual) {
      return manual;
    }

    if (process.platform === "win32") {
      const venvPython = path.join(
        options.repoRoot,
        ".clibase",
        "python",
        "uia-executor",
        "Scripts",
        "python.exe",
      );
      if (fs.existsSync(venvPython)) {
        return venvPython;
      }
    }

    return "python";
  }

  const runFlauiPythonStep = (
    repoRoot: string,
    adapterConfig: UiaAdapterConfig,
    stepRecord: UiaMacroStepRecord,
    targetState: ReturnType<typeof buildTargetRuntimeState>,
    targetRecord: UiaTargetRecord,
  ) => {
    if (process.platform !== "win32") {
      throw new Error(`Step ${stepRecord.step_key}: flaui.* steps require Windows.`);
    }

    const scriptPath = path.join(repoRoot, "cli-host", "uia-executor", "run_step.py");
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Python UIA executor not found at ${scriptPath}`);
    }

    const subAction = stepRecord.action_name.replace(/^flaui\./, "").trim();
    if (!subAction) {
      throw new Error(`Step ${stepRecord.step_key} has invalid flaui action_name.`);
    }

    const timeoutMs = stepRecord.timeout_ms ?? adapterConfig.default_timeout_ms;
    const windowTitle = normalizeString(targetRecord.uia_window_title ?? "");
    if (!windowTitle && !targetState.pid) {
      throw new Error(
        `Step ${stepRecord.step_key} requires a running target pid or target uia_window_title.`,
      );
    }

    const payload = JSON.stringify({
      action: subAction,
      selector: stepRecord.selector,
      value: stepRecord.value,
      pid: targetState.pid,
      window_title: windowTitle,
      timeout_ms: timeoutMs,
    });

    const pythonExe = resolvePythonExecutable(adapterConfig);
    const commandResult = spawnSync(pythonExe, [scriptPath], {
      cwd: repoRoot,
      encoding: "utf8",
      input: payload,
      windowsHide: true,
      // Allow pywinauto/UIA to use full step timeout; Node must not kill the child first.
      timeout: Math.max(timeoutMs + 15000, 10000),
      shell: false,
    });

    if (commandResult.error) {
      throw new Error(
        `FlaUI-class Python step failed for ${stepRecord.step_key}: ${commandResult.error.message}`,
      );
    }

    const stdout = (commandResult.stdout ?? "").toString().trim();
    let ok = commandResult.status === 0;
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout) as { ok?: boolean };
        if (typeof parsed.ok === "boolean") {
          ok = parsed.ok;
        }
      } catch {
        // ignore non-json
      }
    }

    return {
      exit_code: typeof commandResult.status === "number" ? commandResult.status : null,
      stdout,
      stderr: (commandResult.stderr ?? "").toString().trim(),
      ok,
      command: pythonExe,
      args: [scriptPath],
    };
  };

  const runMacro = async (store: UiaMacroStoreShape, payload: RunMacroPayload) => {
    const macroRecord =
      store.macros.find((entry) => entry.macro_key === payload.macro_key) ?? null;
    if (!macroRecord) {
      throw new Error(`Unknown macro_key: ${payload.macro_key}`);
    }

    const targetKey = payload.target_key || macroRecord.target_key;
    if (!targetKey) {
      throw new Error(`Macro ${macroRecord.macro_key} has no target_key.`);
    }

    const targetRecord = getTargetRecord(store, targetKey);
    if (!targetRecord) {
      throw new Error(`Unknown target_key: ${targetKey}`);
    }

    if (payload.ensure_target_running) {
      await launchTarget(store, targetKey);
    }

    const stepResults: Array<Record<string, unknown>> = [];
    let status: "success" | "error" = "success";
    const runStartedAt = new Date().toISOString();
    const runtimeState = getTargetState(store, targetKey);

    for (const stepRecord of macroRecord.steps) {
      const stepStarted = Date.now();
      try {
        if (stepRecord.action_name === "wait.ms") {
          const waitMs = Math.max(stepRecord.timeout_ms ?? 0, 0);
          await waitFor(waitMs);
          stepResults.push({
            step_key: stepRecord.step_key,
            action_name: stepRecord.action_name,
            ok: true,
            duration_ms: Date.now() - stepStarted,
            exit_code: 0,
            stdout: "",
            stderr: "",
          });
          continue;
        }

        if (stepRecord.action_name === "target.launch") {
          const launchResult = await launchTarget(store, targetKey);
          stepResults.push({
            step_key: stepRecord.step_key,
            action_name: stepRecord.action_name,
            ok: true,
            duration_ms: Date.now() - stepStarted,
            exit_code: 0,
            stdout: YAML.stringify(launchResult).trim(),
            stderr: "",
          });
          continue;
        }

        if (stepRecord.action_name === "target.stop") {
          const stopResult = stopTarget(store, targetKey);
          stepResults.push({
            step_key: stepRecord.step_key,
            action_name: stepRecord.action_name,
            ok: true,
            duration_ms: Date.now() - stepStarted,
            exit_code: 0,
            stdout: YAML.stringify(stopResult).trim(),
            stderr: "",
          });
          continue;
        }

        if (stepRecord.action_name.startsWith("flaui.")) {
          const providerResult = runFlauiPythonStep(
            options.repoRoot,
            store.uia_adapter,
            stepRecord,
            runtimeState,
            targetRecord,
          );
          stepResults.push({
            step_key: stepRecord.step_key,
            action_name: stepRecord.action_name,
            ok: providerResult.ok,
            duration_ms: Date.now() - stepStarted,
            exit_code: providerResult.exit_code,
            stdout: providerResult.stdout,
            stderr: providerResult.stderr,
            command: providerResult.command,
            args: providerResult.args,
          });

          if (!providerResult.ok) {
            status = "error";
            if (!stepRecord.continue_on_error) {
              break;
            }
          }
          continue;
        }

        if (stepRecord.action_name.startsWith("uiapeek.")) {
          const providerResult = runUiaPeekStep(
            store.uia_adapter,
            stepRecord,
            runtimeState,
          );
          stepResults.push({
            step_key: stepRecord.step_key,
            action_name: stepRecord.action_name,
            ok: providerResult.ok,
            duration_ms: Date.now() - stepStarted,
            exit_code: providerResult.exit_code,
            stdout: providerResult.stdout,
            stderr: providerResult.stderr,
            command: providerResult.command,
            args: providerResult.args,
          });

          if (!providerResult.ok) {
            status = "error";
            if (!stepRecord.continue_on_error) {
              break;
            }
          }
          continue;
        }

        throw new Error(`Unsupported macro action: ${stepRecord.action_name}`);
      } catch (error) {
        status = "error";
        stepResults.push({
          step_key: stepRecord.step_key,
          action_name: stepRecord.action_name,
          ok: false,
          duration_ms: Date.now() - stepStarted,
          exit_code: null,
          stdout: "",
          stderr: "",
          error_code: "STEP_EXECUTION_FAILED",
          error_message: error instanceof Error ? error.message : String(error),
        });
        if (!stepRecord.continue_on_error) {
          break;
        }
      }
    }

    const runFinishedAt = new Date().toISOString();
    return {
      macro_key: macroRecord.macro_key,
      macro_name: macroRecord.macro_name,
      target_key: targetRecord.target_key,
      target_name: targetRecord.target_name,
      status,
      started_at: runStartedAt,
      finished_at: runFinishedAt,
      step_count: macroRecord.steps.length,
      succeeded_step_count: stepResults.filter((entry) => entry.ok === true).length,
      failed_step_count: stepResults.filter((entry) => entry.ok === false).length,
      step_results: stepResults,
    };
  };

  return {
    getRegistry: () => {
      const store = readStore();
      const runningTargets = store.targets.map((entry) =>
        buildTargetRuntimeState(
          entry.target_key,
          entry.target_name,
          targetRuntimeByKey.get(entry.target_key),
        ),
      );

      const uiapeekResolved = resolveUiaPeekExecutable(store.uia_adapter);
      const uiapeekHostResolved = resolveUiaPeekHostExecutable(store.uia_adapter, {
        preferredHostExePaths: options.preferredUiaPeekHostPaths,
      });

      return {
        store_path: storePath,
        version: store.version,
        uia_adapter: store.uia_adapter,
        targets: store.targets,
        macros: store.macros,
        running_targets: runningTargets,
        uiapeek_resolution: {
          resolved_executable: uiapeekResolved.executable,
          resolution_source: uiapeekResolved.source,
        },
        uiapeek_host_resolution: {
          resolved_executable: uiapeekHostResolved.executable,
          resolution_source: uiapeekHostResolved.source,
        },
      };
    },
    saveTarget: (payload: SaveTargetPayload) => {
      const store = readStore();
      const targetKey = validateReadableKey(payload.target_key, "target-");
      const timestamp = new Date().toISOString();
      const existingIndex = store.targets.findIndex((entry) => entry.target_key === targetKey);
      const existingTarget = existingIndex >= 0 ? store.targets[existingIndex] : null;

      let hostFrame: UiaHostReferenceFrame | undefined = existingTarget?.host_reference_frame;
      if (payload.host_reference_frame !== undefined) {
        if (payload.host_reference_frame === null) {
          hostFrame = undefined;
        } else {
          hostFrame = sanitizeHostReferenceFrame(payload.host_reference_frame);
        }
      }

      const uiaWindowTitle = normalizeString(
        payload.uia_window_title !== undefined
          ? payload.uia_window_title
          : (existingTarget?.uia_window_title ?? ""),
      );
      const nextTarget = {
        target_key: targetKey,
        target_name: normalizeString(payload.target_name) || targetKey,
        exe_path: normalizeString(payload.exe_path),
        args: payload.args,
        working_dir: normalizeString(payload.working_dir),
        startup_wait_ms: Math.max(payload.startup_wait_ms, 0),
        created_at: existingTarget?.created_at ?? timestamp,
        updated_at: timestamp,
        ...(uiaWindowTitle ? { uia_window_title: uiaWindowTitle } : {}),
        ...(hostFrame ? { host_reference_frame: hostFrame } : {}),
      } satisfies UiaTargetRecord;

      if (existingIndex >= 0) {
        store.targets[existingIndex] = nextTarget;
      } else {
        store.targets.push(nextTarget);
      }

      writeStore(store);

      recordRuntimeLog("info", "uia target saved", {
        target_key: targetKey,
        has_exe_path: nextTarget.exe_path ? "true" : "false",
      });

      return {
        saved_target: nextTarget,
        target_state: buildTargetRuntimeState(
          nextTarget.target_key,
          nextTarget.target_name,
          targetRuntimeByKey.get(nextTarget.target_key),
        ),
      };
    },
    launchTarget: async (
      targetKey: string,
      overrides?: {
        exe_path?: string;
        args?: string[];
        working_dir?: string;
        startup_wait_ms?: number;
      },
    ) => {
      const store = readStore();
      return launchTarget(store, targetKey, overrides);
    },
    stopTarget: (targetKey: string) => {
      const store = readStore();
      return stopTarget(store, targetKey);
    },
    getTargetState: (targetKey: string) => {
      const store = readStore();
      return getTargetState(store, targetKey);
    },
    saveMacro: (payload: SaveMacroPayload) => {
      const store = readStore();
      const macroKey = validateReadableKey(payload.macro_key, "macro-");
      const targetKey = validateReadableKey(payload.target_key, "target-");
      const targetRecord = getTargetRecord(store, targetKey);
      if (!targetRecord) {
        throw new Error(`Unknown target_key: ${targetKey}`);
      }

      if (!payload.steps.length) {
        throw new Error("Macro requires at least one step.");
      }

      const normalizedSteps = payload.steps.map((step, index) => normalizeStep(step, index));
      const timestamp = new Date().toISOString();
      const existingIndex = store.macros.findIndex((entry) => entry.macro_key === macroKey);
      const existingMacro = existingIndex >= 0 ? store.macros[existingIndex] : null;
      const nextMacro = {
        macro_key: macroKey,
        macro_name: normalizeString(payload.macro_name) || macroKey,
        target_key: targetKey,
        description: normalizeString(payload.description),
        shared_tags: payload.shared_tags,
        steps: normalizedSteps,
        created_at: existingMacro?.created_at ?? timestamp,
        updated_at: timestamp,
      } satisfies UiaMacroRecord;

      if (existingIndex >= 0) {
        store.macros[existingIndex] = nextMacro;
      } else {
        store.macros.push(nextMacro);
      }

      writeStore(store);

      recordRuntimeLog("info", "uia macro saved", {
        macro_key: macroKey,
        target_key: targetKey,
        step_count: nextMacro.steps.length,
      });

      return {
        saved_macro: nextMacro,
      };
    },
    listMacros: (targetKey = "") => {
      const store = readStore();
      const normalizedTargetKey = normalizeString(targetKey);
      const macros = normalizedTargetKey
        ? store.macros.filter((entry) => entry.target_key === normalizedTargetKey)
        : store.macros;

      return {
        target_key: normalizedTargetKey || null,
        macros,
        macro_count: macros.length,
      };
    },
    deleteMacro: (macroKey: string) => {
      const store = readStore();
      const normalizedMacroKey = validateReadableKey(macroKey, "macro-");
      const existingIndex = store.macros.findIndex((entry) => entry.macro_key === normalizedMacroKey);
      if (existingIndex < 0) {
        throw new Error(`Unknown macro_key: ${normalizedMacroKey}`);
      }

      const deletedMacro = store.macros[existingIndex];
      store.macros.splice(existingIndex, 1);
      writeStore(store);

      recordRuntimeLog("info", "uia macro deleted", {
        macro_key: normalizedMacroKey,
      });

      return {
        deleted_macro: deletedMacro,
        macro_count: store.macros.length,
      };
    },
    runMacro: async (payload: RunMacroPayload) => {
      const store = readStore();
      const result = await runMacro(store, payload);

      recordRuntimeLog("info", "uia macro run completed", {
        macro_key: result.macro_key,
        target_key: result.target_key,
        status: result.status,
        step_count: result.step_count,
      });

      return result;
    },
    updateAdapterConfig: (payload: {
      executable_path: string;
      default_timeout_ms: number;
      python_executable?: string;
      provider_key?: string;
    }) => {
      const store = readStore();
      store.uia_adapter.executable_path = normalizeString(payload.executable_path);
      store.uia_adapter.default_timeout_ms = Math.max(payload.default_timeout_ms, 500);
      if (payload.python_executable !== undefined) {
        store.uia_adapter.python_executable = normalizeString(payload.python_executable);
      }
      if (payload.provider_key !== undefined && normalizeString(payload.provider_key)) {
        store.uia_adapter.provider_key = normalizeString(payload.provider_key);
      }
      writeStore(store);

      return {
        uia_adapter: store.uia_adapter,
      };
    },
    shutdown: () => {
      for (const [targetKey, runtimeEntry] of targetRuntimeByKey.entries()) {
        if (runtimeEntry.process && runtimeEntry.process.exitCode === null && !runtimeEntry.process.killed) {
          runtimeEntry.process.kill();
          recordRuntimeLog("info", "uia target stopped during shutdown", {
            target_key: targetKey,
            pid: runtimeEntry.process.pid ?? null,
          });
        }
      }
      targetRuntimeByKey.clear();
    },
  };
}
