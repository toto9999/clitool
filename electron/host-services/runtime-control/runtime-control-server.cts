import fs from "node:fs";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { BrowserWindow } from "electron";
import YAML from "yaml";
import {
  buildDurableScopeKey,
  createDurableLogStore,
} from "./durable-log-store.cjs";
import type { createRuntimeRegistry } from "../runtime-registry/runtime-registry.cjs";
import type { createTerminalService } from "../terminal/terminal-service.cjs";
import type { createUiaMacroService, UiaHostReferenceFrame } from "../uia-macro/uia-macro-service.cjs";
import type { createUiapeekRecordingBridge } from "../uia-macro/uiapeek-recording-bridge.cjs";
import type { createWorkspaceStore } from "../workspace/workspace-store.cjs";
import { getRuntimeLogsTail, recordRuntimeLog } from "./runtime-logging.cjs";

type RuntimeControlSharedModule = {
  defaultRuntimeScope: string;
  getRuntimeControlEndpoint: (scope?: string) => string;
};

const runtimeControlShared = require("../../../shared/runtime-control.cjs") as RuntimeControlSharedModule;

interface RuntimeActionRequest {
  action_key: string;
  action_name: string;
  payload?: Record<string, unknown>;
  requested_at: string;
  trace_key?: string;
  actor_type?: string;
  actor_key?: string;
}

interface RuntimeActionResponse {
  status: "success" | "error";
  action_key: string;
  action_name: string;
  responded_at: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

interface RuntimeControlServerOptions {
  appMode: "development" | "production";
  getMainWindow: () => BrowserWindow | null;
  getWorkspaceStore: () => ReturnType<typeof createWorkspaceStore> | null;
  getRuntimeRegistry: () => ReturnType<typeof createRuntimeRegistry> | null;
  getDurableLogStore: () => ReturnType<typeof createDurableLogStore> | null;
  getTerminalService: () => ReturnType<typeof createTerminalService> | null;
  getUiaMacroService: () => ReturnType<typeof createUiaMacroService> | null;
  getUiapeekRecordingBridge: () => ReturnType<
    typeof createUiapeekRecordingBridge
  > | null;
  ensureUiapeekRecordingBridge: () => Promise<
    ReturnType<typeof createUiapeekRecordingBridge>
  >;
  defaultUiapeekHubUrl: string;
  syncPrimaryBrowserSurface?: () => Promise<void>;
}

function getStringPayload(
  payload: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function getRawScalarPayload(
  payload: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }

  return "";
}

function getNumericPayload(
  payload: Record<string, unknown>,
  fallback: number,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  return fallback;
}

function getOptionalNumericPayload(
  payload: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    if (!(key in payload)) {
      continue;
    }

    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  return null;
}

function getBooleanPayload(
  payload: Record<string, unknown>,
  fallback: boolean,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = payload[key];
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
  }

  return fallback;
}

function getOptionalBooleanPayload(
  payload: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    if (!(key in payload)) {
      continue;
    }

    const value = payload[key];
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
  }

  return null;
}

function getHostReferenceFramePayload(
  payload: Record<string, unknown>,
): UiaHostReferenceFrame | null | undefined {
  if ("host_reference_frame" in payload) {
    const raw = payload.host_reference_frame;
    if (raw === null) {
      return null;
    }
    if (raw === undefined) {
      return undefined;
    }
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      const w = typeof o.width_px === "number" ? o.width_px : Number(o.width_px);
      const h = typeof o.height_px === "number" ? o.height_px : Number(o.height_px);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
        return undefined;
      }
      const coordinateSpaceRaw =
        typeof o.coordinate_space === "string" ? o.coordinate_space.trim() : "";
      const placementRaw = typeof o.placement_mode === "string" ? o.placement_mode.trim() : "";
      const coordinate_space: UiaHostReferenceFrame["coordinate_space"] =
        coordinateSpaceRaw === "screen" || coordinateSpaceRaw === "client" || coordinateSpaceRaw === "host_reference"
          ? coordinateSpaceRaw
          : "host_reference";
      const placement_mode: UiaHostReferenceFrame["placement_mode"] =
        placementRaw === "host_panel_fill" || placementRaw === "external_os_window"
          ? placementRaw
          : "external_os_window";
      const out: UiaHostReferenceFrame = {
        width_px: Math.round(w),
        height_px: Math.round(h),
        coordinate_space,
        placement_mode,
      };
      return out;
    }
    return undefined;
  }

  const flatW = getOptionalNumericPayload(payload, "host_reference_width_px", "host-reference-width-px");
  const flatH = getOptionalNumericPayload(payload, "host_reference_height_px", "host-reference-height-px");
  if (flatW === null || flatH === null || flatW < 1 || flatH < 1) {
    return undefined;
  }
  const coordinateSpaceRaw = getStringPayload(payload, "host_reference_coordinate_space", "host-reference-coordinate-space");
  const placementRaw = getStringPayload(payload, "host_reference_placement_mode", "host-reference-placement-mode");
  const coordinate_space: UiaHostReferenceFrame["coordinate_space"] =
    coordinateSpaceRaw === "screen" || coordinateSpaceRaw === "client" || coordinateSpaceRaw === "host_reference"
      ? coordinateSpaceRaw
      : "host_reference";
  const placement_mode: UiaHostReferenceFrame["placement_mode"] =
    placementRaw === "host_panel_fill" || placementRaw === "external_os_window"
      ? placementRaw
      : "external_os_window";
  return {
    width_px: Math.round(flatW),
    height_px: Math.round(flatH),
    coordinate_space,
    placement_mode,
  };
}

function getStringArrayPayload(
  payload: Record<string, unknown>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function parseUiaMacroStepsPayload(payload: Record<string, unknown>) {
  if (Array.isArray(payload.steps)) {
    return payload.steps;
  }

  const stepsFilePath = getStringPayload(payload, "steps_file", "steps-file");
  if (stepsFilePath) {
    if (!fs.existsSync(stepsFilePath)) {
      throw new Error(`steps_file not found: ${stepsFilePath}`);
    }

    const rawText = fs.readFileSync(stepsFilePath, "utf8");
    if (!rawText.trim()) {
      throw new Error(`steps_file is empty: ${stepsFilePath}`);
    }

    const parsed = YAML.parse(rawText);
    if (!Array.isArray(parsed)) {
      throw new Error("steps_file must parse to an array of macro steps.");
    }

    return parsed;
  }

  const stepsYaml = getStringPayload(payload, "steps_yaml", "steps-yaml");
  if (stepsYaml) {
    const parsed = YAML.parse(stepsYaml);
    if (!Array.isArray(parsed)) {
      throw new Error("steps_yaml must parse to an array of macro steps.");
    }

    return parsed;
  }

  const stepsJson = getStringPayload(payload, "steps_json", "steps-json");
  if (Array.isArray(payload.steps_json)) {
    return payload.steps_json;
  }
  if (Array.isArray(payload["steps-json"])) {
    return payload["steps-json"];
  }
  if (stepsJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stepsJson);
    } catch (error) {
      throw new Error(
        `steps_json parse failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error("steps_json must parse to an array of macro steps.");
    }

    return parsed;
  }

  return [];
}

function normalizeBrowserDockPositionPayload(
  value: string,
): "left" | "right" | "top" | "bottom" | "" {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "left" ||
    normalized === "right" ||
    normalized === "top" ||
    normalized === "bottom"
  ) {
    return normalized;
  }

  return "";
}

function getDefaultScreenshotPath() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const fileName = [
    "shot",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("-") + ".png";

  return path.join(process.cwd(), ".clibase", "artifacts", "screenshots", fileName);
}

function normalizeOutputPath(outputPath?: unknown) {
  if (typeof outputPath !== "string" || outputPath.trim().length === 0) {
    return getDefaultScreenshotPath();
  }

  return path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);
}

async function ensureWindowReady(mainWindow: BrowserWindow) {
  if (mainWindow.webContents.isLoading()) {
    await once(mainWindow.webContents, "did-finish-load");
  }

  mainWindow.show();
  mainWindow.focus();
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function getActionContext(
  request: RuntimeActionRequest,
  payload: Record<string, unknown>,
  options: RuntimeControlServerOptions,
) {
  const runtimeState = options.getRuntimeRegistry()?.getWorkspaceRuntimeState();
  const projectKey =
    getStringPayload(payload, "project_key", "project-key") ||
    runtimeState?.active_project_key ||
    "";
  const tabKey =
    getStringPayload(payload, "tab_key", "tab-key") ||
    runtimeState?.active_tab_key ||
    "";

  return {
    traceKey: request.trace_key?.trim() || `trace-${request.action_key}`,
    actorType: request.actor_type?.trim() || "global-cli",
    actorKey: request.actor_key?.trim() || "batcli",
    projectKey,
    tabKey,
    scopeKey: buildDurableScopeKey(projectKey, tabKey),
  };
}

async function handleRuntimeAction(
  request: RuntimeActionRequest,
  options: RuntimeControlServerOptions,
): Promise<RuntimeActionResponse> {
  const { action_name: actionName, action_key: actionKey } = request;
  const payload = request.payload ?? {};
  const durableLogStore = options.getDurableLogStore();
  const actionContext = getActionContext(request, payload, options);

  durableLogStore?.appendActionRecord(actionContext.scopeKey, {
    action_key: actionKey,
    trace_key: actionContext.traceKey,
    record_type: "requested",
    action_name: actionName,
    actor_type: actionContext.actorType,
    actor_key: actionContext.actorKey,
    target_kind: "host-service",
    target_key: actionName,
    status: "accepted",
    created_at: request.requested_at,
  });

  durableLogStore?.appendAuditRecord(actionContext.scopeKey, {
    audit_key: durableLogStore.createAuditKey(),
    trace_key: actionContext.traceKey,
    audit_kind: "policy-decision",
    actor_key: actionContext.actorKey,
    policy_key: "policy-control-plane-standard",
    outcome: "allowed",
    action_name: actionName,
    created_at: request.requested_at,
  });

  recordRuntimeLog("info", "runtime action requested", {
    action_key: actionKey,
    action_name: actionName,
  });

  const respondSuccess = (result: unknown) => {
    const response: RuntimeActionResponse = {
      status: "success",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      result,
    };

    durableLogStore?.appendActionRecord(actionContext.scopeKey, {
      action_key: actionKey,
      trace_key: actionContext.traceKey,
      record_type: "completed",
      action_name: actionName,
      actor_type: actionContext.actorType,
      actor_key: actionContext.actorKey,
      target_kind: "host-service",
      target_key: actionName,
      status: "success",
      created_at: response.responded_at,
    });

    return response;
  };

  const respondError = (code: string, message: string) => {
    const response: RuntimeActionResponse = {
      status: "error",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      error: {
        code,
        message,
      },
    };

    durableLogStore?.appendActionRecord(actionContext.scopeKey, {
      action_key: actionKey,
      trace_key: actionContext.traceKey,
      record_type: "completed",
      action_name: actionName,
      actor_type: actionContext.actorType,
      actor_key: actionContext.actorKey,
      target_kind: "host-service",
      target_key: actionName,
      status: "error",
      created_at: response.responded_at,
      error_code: code,
      error_message: message,
    });

    return response;
  };

  if (actionName === "app.ping") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const result = {
      app_mode: options.appMode,
      platform: process.platform,
      pid: process.pid,
      window_count: BrowserWindow.getAllWindows().length,
      control_endpoint: runtimeControlShared.getRuntimeControlEndpoint(),
      active_project_key: runtimeRegistry?.getWorkspaceRuntimeState().active_project_key ?? null,
      active_tab_key: runtimeRegistry?.getWorkspaceRuntimeState().active_tab_key ?? null,
      active_terminal_key: runtimeRegistry?.getWorkspaceRuntimeState().active_terminal_key ?? null,
    };

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
    });

    return respondSuccess(result);
  }

  if (actionName === "app.logs.tail") {
    const limit = getNumericPayload(payload, 20, "limit");

    const result = {
      entries: getRuntimeLogsTail(limit),
      returned_count: getRuntimeLogsTail(limit).length,
    };

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      returned_count: result.returned_count,
    });

    return respondSuccess(result);
  }

  if (actionName === "workspace.get-state") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();

    if (!workspaceStore || !runtimeRegistry) {
      return respondError(
        "WORKSPACE_NOT_READY",
        "Workspace services are not ready yet.",
      );
    }

    const result = {
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    };

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      active_project_key: result.workspace.active_project_key,
      browser_count: result.workspace.browser_count,
    });

    return respondSuccess(result);
  }

  if (actionName === "project.open" || actionName === "project.switch") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();
    const requestedProjectKey = getStringPayload(payload, "project_key", "project-key");
    const requestedTabKey = getStringPayload(payload, "tab_key", "tab-key") || undefined;

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "PROJECT_SERVICES_NOT_READY",
        "Project switch services are not ready yet.",
      );
    }

    if (!requestedProjectKey) {
      return respondError(
        "INVALID_PROJECT_KEY",
        "The project.open action requires a --project_key value.",
      );
    }

    let snapshot;
    try {
      snapshot = workspaceStore.switchProject(requestedProjectKey, requestedTabKey);
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);

      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "PROJECT_SWITCH_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    durableLogStore?.appendEventRecord(actionContext.scopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "project.switched",
      source_kind: "host-service",
      source_key: requestedProjectKey,
      payload_schema_key: "payload-project-switch-v1",
      payload: {
        project_key: snapshot.active_project_key,
        tab_key: snapshot.active_tab_key,
        active_browser_key: snapshot.active_browser_key,
        active_terminal_key: snapshot.active_terminal_key,
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      active_project_key: snapshot.active_project_key,
      active_tab_key: snapshot.active_tab_key,
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (actionName === "tab.activate") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();
    const requestedTabKey = getStringPayload(payload, "tab_key", "tab-key");

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "TAB_SERVICES_NOT_READY",
        "Tab switch services are not ready yet.",
      );
    }

    if (!requestedTabKey) {
      return respondError(
        "INVALID_TAB_KEY",
        "The tab.activate action requires a --tab_key value.",
      );
    }

    let snapshot;
    try {
      snapshot = workspaceStore.switchTab(requestedTabKey);
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);
      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "TAB_ACTIVATE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    durableLogStore?.appendEventRecord(actionContext.scopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "tab.activated",
      source_kind: "host-service",
      source_key: snapshot.active_tab_key,
      payload_schema_key: "payload-tab-activate-v1",
      payload: {
        project_key: snapshot.active_project_key,
        tab_key: snapshot.active_tab_key,
        active_browser_key: snapshot.active_browser_key,
        active_terminal_key: snapshot.active_terminal_key,
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      active_project_key: snapshot.active_project_key,
      active_tab_key: snapshot.active_tab_key,
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (actionName === "tab.next") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "TAB_SERVICES_NOT_READY",
        "Tab switch services are not ready yet.",
      );
    }

    let snapshot;
    try {
      snapshot = workspaceStore.activateNextTab();
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);
      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "TAB_NEXT_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    durableLogStore?.appendEventRecord(actionContext.scopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "tab.activated",
      source_kind: "host-service",
      source_key: snapshot.active_tab_key,
      payload_schema_key: "payload-tab-activate-v1",
      payload: {
        project_key: snapshot.active_project_key,
        tab_key: snapshot.active_tab_key,
        active_browser_key: snapshot.active_browser_key,
        active_terminal_key: snapshot.active_terminal_key,
        navigation_mode: "next-tab",
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      active_project_key: snapshot.active_project_key,
      active_tab_key: snapshot.active_tab_key,
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (actionName === "tab.previous") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "TAB_SERVICES_NOT_READY",
        "Tab switch services are not ready yet.",
      );
    }

    let snapshot;
    try {
      snapshot = workspaceStore.activatePreviousTab();
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);
      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "TAB_PREVIOUS_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    durableLogStore?.appendEventRecord(actionContext.scopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "tab.activated",
      source_kind: "host-service",
      source_key: snapshot.active_tab_key,
      payload_schema_key: "payload-tab-activate-v1",
      payload: {
        project_key: snapshot.active_project_key,
        tab_key: snapshot.active_tab_key,
        active_browser_key: snapshot.active_browser_key,
        active_terminal_key: snapshot.active_terminal_key,
        navigation_mode: "previous-tab",
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      active_project_key: snapshot.active_project_key,
      active_tab_key: snapshot.active_tab_key,
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (actionName === "tab.detach") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();
    const requestedTabKey = getStringPayload(payload, "tab_key", "tab-key");

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "TAB_SERVICES_NOT_READY",
        "Tab detach services are not ready yet.",
      );
    }

    if (!requestedTabKey) {
      return respondError(
        "INVALID_TAB_KEY",
        "The tab.detach action requires a --tab_key value.",
      );
    }

    let snapshot;
    try {
      snapshot = workspaceStore.detachTab(requestedTabKey);
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);
      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "TAB_DETACH_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    durableLogStore?.appendEventRecord(actionContext.scopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "tab.detached",
      source_kind: "host-service",
      source_key: requestedTabKey,
      payload_schema_key: "payload-tab-detach-v1",
      payload: {
        project_key: snapshot.active_project_key,
        tab_key: requestedTabKey,
        window_records: snapshot.window_records,
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      tab_key: requestedTabKey,
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (actionName === "tab.redock") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();
    const requestedTabKey = getStringPayload(payload, "tab_key", "tab-key");

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "TAB_SERVICES_NOT_READY",
        "Tab redock services are not ready yet.",
      );
    }

    if (!requestedTabKey) {
      return respondError(
        "INVALID_TAB_KEY",
        "The tab.redock action requires a --tab_key value.",
      );
    }

    let snapshot;
    try {
      snapshot = workspaceStore.redockTab(requestedTabKey);
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);
      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "TAB_REDOCK_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    durableLogStore?.appendEventRecord(actionContext.scopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "tab.redocked",
      source_kind: "host-service",
      source_key: requestedTabKey,
      payload_schema_key: "payload-tab-redock-v1",
      payload: {
        project_key: snapshot.active_project_key,
        tab_key: requestedTabKey,
        window_records: snapshot.window_records,
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      tab_key: requestedTabKey,
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (actionName === "tab.reorder") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();
    const requestedTabOrder = getStringArrayPayload(payload, "tab_order", "tab-order");

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "TAB_SERVICES_NOT_READY",
        "Tab reorder services are not ready yet.",
      );
    }

    if (requestedTabOrder.length === 0) {
      return respondError(
        "INVALID_TAB_ORDER",
        "The tab.reorder action requires a --tab_order comma-separated value.",
      );
    }

    let snapshot;
    try {
      snapshot = workspaceStore.reorderTabs(requestedTabOrder);
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);
      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "TAB_REORDER_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    durableLogStore?.appendEventRecord(actionContext.scopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "tabs.reordered",
      source_kind: "host-service",
      source_key: snapshot.active_project_key,
      payload_schema_key: "payload-tab-reorder-v1",
      payload: {
        project_key: snapshot.active_project_key,
        tab_order: snapshot.active_project.tab_order,
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      tab_order: snapshot.active_project.tab_order.join(", "),
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (actionName === "layout.window-state.update") {
    const workspaceStore = options.getWorkspaceStore();
    const runtimeRegistry = options.getRuntimeRegistry();
    const terminalService = options.getTerminalService();
    const requestedWindowKey = getStringPayload(payload, "window_key", "window-key");
    const requestedShellSplitRatio = getNumericPayload(
      payload,
      Number.NaN,
      "shell_split_ratio",
      "shell-split-ratio",
    );
    const requestedShellStackSplitRatio = getNumericPayload(
      payload,
      Number.NaN,
      "shell_stack_split_ratio",
      "shell-stack-split-ratio",
    );
    const requestedBrowserDockPosition = getStringPayload(
      payload,
      "browser_dock_position",
      "browser-dock-position",
    );
    const requestedBrowserCollapsed = getOptionalBooleanPayload(
      payload,
      "browser_collapsed",
      "browser-collapsed",
    );
    const normalizedBrowserDockPosition = requestedBrowserDockPosition
      ? normalizeBrowserDockPositionPayload(requestedBrowserDockPosition)
      : "";

    if (!workspaceStore || !runtimeRegistry || !terminalService) {
      return respondError(
        "LAYOUT_SERVICES_NOT_READY",
        "Layout update services are not ready yet.",
      );
    }

    if (
      !Number.isFinite(requestedShellSplitRatio) &&
      !Number.isFinite(requestedShellStackSplitRatio) &&
      !normalizedBrowserDockPosition &&
      requestedBrowserCollapsed === null
    ) {
      return respondError(
        "INVALID_LAYOUT_STATE",
        "The layout.window-state.update action requires --shell_split_ratio, --shell_stack_split_ratio, --browser_dock_position, or --browser_collapsed.",
      );
    }

    const targetWindowKey =
      requestedWindowKey || workspaceStore.getSnapshot().main_window_key;

    let snapshot;
    try {
      snapshot = workspaceStore.updateWindowLayoutState(targetWindowKey, {
        shell_split_ratio: Number.isFinite(requestedShellSplitRatio)
          ? requestedShellSplitRatio
          : undefined,
        shell_stack_split_ratio: Number.isFinite(requestedShellStackSplitRatio)
          ? requestedShellStackSplitRatio
          : undefined,
        browser_dock_position: normalizedBrowserDockPosition || undefined,
        browser_collapsed:
          requestedBrowserCollapsed === null
            ? undefined
            : requestedBrowserCollapsed,
      });
      runtimeRegistry.replaceSnapshot(snapshot);
      terminalService.syncSnapshot(snapshot);
      await options.syncPrimaryBrowserSurface?.();
    } catch (error) {
      return respondError(
        "LAYOUT_UPDATE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    const targetWindowRecord =
      snapshot.window_records.find((entry) => entry.window_key === targetWindowKey) ?? null;
    const eventScopeKey = buildDurableScopeKey(
      snapshot.active_project_key,
      targetWindowRecord?.active_tab_key,
    );

    durableLogStore?.appendEventRecord(eventScopeKey, {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: actionContext.traceKey,
      event_name: "layout.window-state.updated",
      source_kind: "host-service",
      source_key: targetWindowKey,
      payload_schema_key: "payload-layout-window-state-update-v1",
      payload: {
        project_key: snapshot.active_project_key,
        window_key: targetWindowKey,
        active_tab_key: targetWindowRecord?.active_tab_key ?? null,
        layout_state: targetWindowRecord?.layout_state ?? null,
      },
      created_at: new Date().toISOString(),
    });

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      window_key: targetWindowKey,
      shell_split_ratio: targetWindowRecord?.layout_state?.shell_split_ratio ?? null,
      shell_stack_split_ratio:
        targetWindowRecord?.layout_state?.shell_stack_split_ratio ?? null,
      browser_dock_position:
        targetWindowRecord?.layout_state?.browser_dock_position ?? null,
      browser_collapsed:
        targetWindowRecord?.layout_state?.browser_collapsed ?? null,
    });

    return respondSuccess({
      workspace: workspaceStore.getStateSummary(targetWindowKey),
      runtime_registry: runtimeRegistry.getWorkspaceRuntimeState(),
    });
  }

  if (
    actionName === "browser.capture-screenshot" ||
    actionName === "browser.automation.capture-screenshot"
  ) {
    const mainWindow = options.getMainWindow();

    if (!mainWindow) {
      recordRuntimeLog("warn", "runtime action rejected: no active window", {
        action_key: actionKey,
        action_name: actionName,
      });

      return respondError(
        "NO_ACTIVE_WINDOW",
        "No active BrowserWindow is available for screenshot capture.",
      );
    }

    const outputPath = normalizeOutputPath(payload.output_path ?? payload.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    await ensureWindowReady(mainWindow);

    const capturedImage = await mainWindow.webContents.capturePage();
    const imageBuffer = capturedImage.toPNG();
    fs.writeFileSync(outputPath, imageBuffer);

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      output_path: outputPath,
      size_bytes: imageBuffer.length,
    });

    return respondSuccess({
      output_path: outputPath,
      size_bytes: imageBuffer.length,
      window_title: mainWindow.getTitle() || "clibase",
    });
  }

  if (actionName === "browser.get-state") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    let result;

    try {
      result = runtimeRegistry.getBrowserState(requestedBrowserKey);
    } catch (error) {
      return respondError(
        "BROWSER_LOOKUP_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: result.browser_key,
      current_url: result.current_url,
    });

    return respondSuccess(result);
  }

  if (
    actionName === "browser.navigate" ||
    actionName === "browser.automation.navigate"
  ) {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    const targetUrl = getStringPayload(payload, "url");

    if (!targetUrl) {
      return respondError(
        "INVALID_URL",
        "The browser.navigate action requires a --url value.",
      );
    }

    let result;

    try {
      result = await runtimeRegistry.navigateBrowser(
        requestedBrowserKey,
        targetUrl,
      );
    } catch (error) {
      return respondError(
        "BROWSER_NAVIGATION_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: result.browser_key,
      current_url: result.current_url,
    });

    return respondSuccess(result);
  }

  if (actionName === "browser.navigate.back") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    let result;

    try {
      result = await runtimeRegistry.goBackBrowser(requestedBrowserKey);
    } catch (error) {
      return respondError(
        "BROWSER_NAVIGATE_BACK_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: result.browser_key,
      current_url: result.current_url,
    });

    return respondSuccess(result);
  }

  if (actionName === "browser.navigate.forward") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    let result;

    try {
      result = await runtimeRegistry.goForwardBrowser(requestedBrowserKey);
    } catch (error) {
      return respondError(
        "BROWSER_NAVIGATE_FORWARD_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: result.browser_key,
      current_url: result.current_url,
    });

    return respondSuccess(result);
  }

  if (actionName === "browser.navigate.reload") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    let result;

    try {
      result = await runtimeRegistry.reloadBrowser(requestedBrowserKey);
    } catch (error) {
      return respondError(
        "BROWSER_RELOAD_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: result.browser_key,
      current_url: result.current_url,
    });

    return respondSuccess(result);
  }

  if (actionName === "browser.automation.click") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    const selector = getStringPayload(payload, "selector");

    if (!selector) {
      return respondError(
        "INVALID_SELECTOR",
        "The browser.automation.click action requires a --selector value.",
      );
    }

    let clickResult;

    try {
      clickResult = await runtimeRegistry.clickBrowser(
        requestedBrowserKey,
        selector,
      );
    } catch (error) {
      return respondError(
        "BROWSER_CLICK_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!clickResult.ok) {
      recordRuntimeLog("warn", "runtime action rejected: browser click failed", {
        action_key: actionKey,
        action_name: actionName,
        browser_key: clickResult.browser_key,
        selector,
        reason: clickResult.reason,
      });

      return respondError(
        clickResult.reason,
        `Unable to click selector: ${selector}`,
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: clickResult.browser_key,
      selector,
      tag_name: clickResult.tag_name,
    });

    return respondSuccess({
      selector,
      ...clickResult,
    });
  }

  if (actionName === "browser.automation.fill") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    const selector = getStringPayload(payload, "selector");
    const value = getRawScalarPayload(payload, "value", "text");

    if (!selector) {
      return respondError(
        "INVALID_SELECTOR",
        "The browser.automation.fill action requires a --selector value.",
      );
    }

    let fillResult;

    try {
      fillResult = await runtimeRegistry.fillBrowser(
        requestedBrowserKey,
        selector,
        value,
      );
    } catch (error) {
      return respondError(
        "BROWSER_FILL_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!fillResult.ok) {
      recordRuntimeLog("warn", "runtime action rejected: browser fill failed", {
        action_key: actionKey,
        action_name: actionName,
        browser_key: fillResult.browser_key,
        selector,
        reason: fillResult.reason,
      });

      return respondError(
        fillResult.reason,
        `Unable to fill selector: ${selector}`,
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: fillResult.browser_key,
      selector,
      tag_name: fillResult.tag_name,
      value_length: fillResult.value_length,
    });

    return respondSuccess({
      selector,
      ...fillResult,
    });
  }

  if (actionName === "browser.automation.extract-text") {
    const runtimeRegistry = options.getRuntimeRegistry();
    const requestedBrowserKey = getStringPayload(
      payload,
      "browser_key",
      "browser-key",
    );

    if (!runtimeRegistry) {
      return respondError(
        "RUNTIME_REGISTRY_NOT_READY",
        "The runtime registry is not ready yet.",
      );
    }

    const selector = getStringPayload(payload, "selector");

    let extractResult;

    try {
      extractResult = await runtimeRegistry.extractTextFromBrowser(
        requestedBrowserKey,
        selector || undefined,
      );
    } catch (error) {
      return respondError(
        "BROWSER_EXTRACT_TEXT_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!extractResult.ok) {
      recordRuntimeLog("warn", "runtime action rejected: browser extract failed", {
        action_key: actionKey,
        action_name: actionName,
        browser_key: extractResult.browser_key,
        selector: selector || "body",
        reason: extractResult.reason,
      });

      return respondError(
        extractResult.reason,
        `Unable to extract text for selector: ${selector || "body"}`,
      );
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      browser_key: extractResult.browser_key,
      selector: extractResult.selector,
      text_length: extractResult.text_length,
    });

    return respondSuccess(extractResult);
  }

  if (actionName === "terminal.get-state") {
    const terminalService = options.getTerminalService();
    const requestedTerminalKey = getStringPayload(
      payload,
      "terminal_key",
      "terminal-key",
    );

    if (!terminalService) {
      return respondError(
        "TERMINAL_SERVICE_NOT_READY",
        "The terminal service is not ready yet.",
      );
    }

    try {
      return respondSuccess(terminalService.getTerminalState(requestedTerminalKey));
    } catch (error) {
      return respondError(
        "TERMINAL_LOOKUP_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "terminal.create") {
    const terminalService = options.getTerminalService();
    const requestedTerminalKey = getStringPayload(
      payload,
      "terminal_key",
      "terminal-key",
    );

    if (!terminalService) {
      return respondError(
        "TERMINAL_SERVICE_NOT_READY",
        "The terminal service is not ready yet.",
      );
    }

    try {
      return respondSuccess(await terminalService.createTerminal(requestedTerminalKey));
    } catch (error) {
      return respondError(
        "TERMINAL_CREATE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "terminal.write") {
    const terminalService = options.getTerminalService();
    const requestedTerminalKey = getStringPayload(
      payload,
      "terminal_key",
      "terminal-key",
    );
    const text = getRawScalarPayload(payload, "text", "value", "command");
    const appendNewline = getBooleanPayload(payload, true, "append_newline", "append-newline");

    if (!terminalService) {
      return respondError(
        "TERMINAL_SERVICE_NOT_READY",
        "The terminal service is not ready yet.",
      );
    }

    if (!text) {
      return respondError(
        "INVALID_TERMINAL_TEXT",
        "The terminal.write action requires a --text value.",
      );
    }

    try {
      return respondSuccess(
        await terminalService.writeTerminal(requestedTerminalKey, text, appendNewline),
      );
    } catch (error) {
      return respondError(
        "TERMINAL_WRITE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "terminal.resize") {
    const terminalService = options.getTerminalService();
    const requestedTerminalKey = getStringPayload(
      payload,
      "terminal_key",
      "terminal-key",
    );
    const cols = getNumericPayload(payload, 120, "cols");
    const rows = getNumericPayload(payload, 32, "rows");

    if (!terminalService) {
      return respondError(
        "TERMINAL_SERVICE_NOT_READY",
        "The terminal service is not ready yet.",
      );
    }

    try {
      return respondSuccess(terminalService.resizeTerminal(requestedTerminalKey, cols, rows));
    } catch (error) {
      return respondError(
        "TERMINAL_RESIZE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "terminal.kill") {
    const terminalService = options.getTerminalService();
    const requestedTerminalKey = getStringPayload(
      payload,
      "terminal_key",
      "terminal-key",
    );

    if (!terminalService) {
      return respondError(
        "TERMINAL_SERVICE_NOT_READY",
        "The terminal service is not ready yet.",
      );
    }

    try {
      return respondSuccess(terminalService.killTerminal(requestedTerminalKey));
    } catch (error) {
      return respondError(
        "TERMINAL_KILL_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "terminal.logs.tail") {
    const terminalService = options.getTerminalService();
    const requestedTerminalKey = getStringPayload(
      payload,
      "terminal_key",
      "terminal-key",
    );
    const limit = getNumericPayload(payload, 20, "limit");

    if (!terminalService) {
      return respondError(
        "TERMINAL_SERVICE_NOT_READY",
        "The terminal service is not ready yet.",
      );
    }

    try {
      return respondSuccess(terminalService.getTerminalLogsTail(requestedTerminalKey, limit));
    } catch (error) {
      return respondError(
        "TERMINAL_LOG_TAIL_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.registry.get") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    try {
      return respondSuccess(uiaMacroService.getRegistry());
    } catch (error) {
      return respondError(
        "UIA_REGISTRY_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.adapter.update") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const executablePath = getStringPayload(
      payload,
      "executable_path",
      "executable-path",
    );
    const defaultTimeoutMs = getNumericPayload(
      payload,
      5000,
      "default_timeout_ms",
      "default-timeout-ms",
    );
    const updatePayload: {
      executable_path: string;
      default_timeout_ms: number;
      python_executable?: string;
      provider_key?: string;
    } = {
      executable_path: executablePath,
      default_timeout_ms: defaultTimeoutMs,
    };

    if (payload && typeof payload === "object" && "python_executable" in payload) {
      updatePayload.python_executable = getStringPayload(
        payload,
        "python_executable",
        "python-executable",
      );
    }

    if (payload && typeof payload === "object" && "provider_key" in payload) {
      const providerKey = getStringPayload(payload, "provider_key", "provider-key");
      if (providerKey) {
        updatePayload.provider_key = providerKey;
      }
    }

    try {
      return respondSuccess(uiaMacroService.updateAdapterConfig(updatePayload));
    } catch (error) {
      return respondError(
        "UIA_ADAPTER_UPDATE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.target.save") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const targetKey = getStringPayload(payload, "target_key", "target-key");
    if (!targetKey) {
      return respondError(
        "INVALID_TARGET_KEY",
        "The uia.target.save action requires a --target_key value.",
      );
    }

    const targetName = getStringPayload(payload, "target_name", "target-name");
    const exePath = getStringPayload(payload, "exe_path", "exe-path");
    const args = getStringArrayPayload(payload, "args");
    const workingDir = getStringPayload(payload, "working_dir", "working-dir");
    const startupWaitMs = getNumericPayload(
      payload,
      1200,
      "startup_wait_ms",
      "startup-wait-ms",
    );

    const hostReferenceFrame = getHostReferenceFramePayload(payload);

    try {
      return respondSuccess(
        uiaMacroService.saveTarget({
          target_key: targetKey,
          target_name: targetName,
          exe_path: exePath,
          args,
          working_dir: workingDir,
          startup_wait_ms: startupWaitMs,
          host_reference_frame: hostReferenceFrame,
        }),
      );
    } catch (error) {
      return respondError(
        "UIA_TARGET_SAVE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.target.launch") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const targetKey = getStringPayload(payload, "target_key", "target-key");
    if (!targetKey) {
      return respondError(
        "INVALID_TARGET_KEY",
        "The uia.target.launch action requires a --target_key value.",
      );
    }

    const exePath = getStringPayload(payload, "exe_path", "exe-path");
    const args = getStringArrayPayload(payload, "args");
    const workingDir = getStringPayload(payload, "working_dir", "working-dir");
    const startupWaitMs = getOptionalNumericPayload(
      payload,
      "startup_wait_ms",
      "startup-wait-ms",
    );
    const overrides =
      exePath || args.length > 0 || workingDir || startupWaitMs !== null
        ? {
            exe_path: exePath || undefined,
            args: args.length > 0 ? args : undefined,
            working_dir: workingDir || undefined,
            startup_wait_ms: startupWaitMs ?? undefined,
          }
        : undefined;

    try {
      return respondSuccess(await uiaMacroService.launchTarget(targetKey, overrides));
    } catch (error) {
      return respondError(
        "UIA_TARGET_LAUNCH_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.target.stop") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const targetKey = getStringPayload(payload, "target_key", "target-key");
    if (!targetKey) {
      return respondError(
        "INVALID_TARGET_KEY",
        "The uia.target.stop action requires a --target_key value.",
      );
    }

    try {
      return respondSuccess(uiaMacroService.stopTarget(targetKey));
    } catch (error) {
      return respondError(
        "UIA_TARGET_STOP_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.target.state") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const targetKey = getStringPayload(payload, "target_key", "target-key");
    if (!targetKey) {
      return respondError(
        "INVALID_TARGET_KEY",
        "The uia.target.state action requires a --target_key value.",
      );
    }

    try {
      return respondSuccess(uiaMacroService.getTargetState(targetKey));
    } catch (error) {
      return respondError(
        "UIA_TARGET_STATE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.macro.save") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const macroKey = getStringPayload(payload, "macro_key", "macro-key");
    const targetKey = getStringPayload(payload, "target_key", "target-key");
    if (!macroKey) {
      return respondError(
        "INVALID_MACRO_KEY",
        "The uia.macro.save action requires a --macro_key value.",
      );
    }
    if (!targetKey) {
      return respondError(
        "INVALID_TARGET_KEY",
        "The uia.macro.save action requires a --target_key value.",
      );
    }

    const macroName = getStringPayload(payload, "macro_name", "macro-name");
    const description = getStringPayload(payload, "description");
    const sharedTags = getStringArrayPayload(
      payload,
      "shared_tags",
      "shared-tags",
      "tags",
    );
    let steps: unknown[] = [];

    try {
      steps = parseUiaMacroStepsPayload(payload);
    } catch (error) {
      return respondError(
        "UIA_MACRO_STEPS_INVALID",
        error instanceof Error ? error.message : String(error),
      );
    }

    try {
      return respondSuccess(
        uiaMacroService.saveMacro({
          macro_key: macroKey,
          macro_name: macroName,
          target_key: targetKey,
          description,
          shared_tags: sharedTags,
          steps,
        }),
      );
    } catch (error) {
      return respondError(
        "UIA_MACRO_SAVE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.macro.list") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const targetKey = getStringPayload(payload, "target_key", "target-key");
    try {
      return respondSuccess(uiaMacroService.listMacros(targetKey));
    } catch (error) {
      return respondError(
        "UIA_MACRO_LIST_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.macro.delete") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const macroKey = getStringPayload(payload, "macro_key", "macro-key");
    if (!macroKey) {
      return respondError(
        "INVALID_MACRO_KEY",
        "The uia.macro.delete action requires a --macro_key value.",
      );
    }

    try {
      return respondSuccess(uiaMacroService.deleteMacro(macroKey));
    } catch (error) {
      return respondError(
        "UIA_MACRO_DELETE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.macro.run") {
    const uiaMacroService = options.getUiaMacroService();
    if (!uiaMacroService) {
      return respondError(
        "UIA_SERVICE_NOT_READY",
        "The UIA macro service is not ready yet.",
      );
    }

    const macroKey = getStringPayload(payload, "macro_key", "macro-key");
    if (!macroKey) {
      return respondError(
        "INVALID_MACRO_KEY",
        "The uia.macro.run action requires a --macro_key value.",
      );
    }

    const targetKey = getStringPayload(payload, "target_key", "target-key");
    const ensureTargetRunning = getBooleanPayload(
      payload,
      true,
      "ensure_target_running",
      "ensure-target-running",
    );

    try {
      return respondSuccess(
        await uiaMacroService.runMacro({
          macro_key: macroKey,
          target_key: targetKey,
          ensure_target_running: ensureTargetRunning,
        }),
      );
    } catch (error) {
      return respondError(
        "UIA_MACRO_RUN_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.recording.start") {
    const bridge = await options.ensureUiapeekRecordingBridge();
    try {
      return respondSuccess(await bridge.start());
    } catch (error) {
      return respondError(
        "UIA_RECORDING_START_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.recording.stop") {
    const bridge = options.getUiapeekRecordingBridge();
    if (!bridge) {
      return respondSuccess({
        hub_url: options.defaultUiapeekHubUrl,
        connection_state: "Disconnected",
        session_id: null,
        is_recording: false,
      });
    }

    try {
      return respondSuccess(await bridge.stop());
    } catch (error) {
      return respondError(
        "UIA_RECORDING_STOP_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (actionName === "uia.recording.state") {
    const bridge = options.getUiapeekRecordingBridge();
    if (!bridge) {
      return respondSuccess({
        hub_url: options.defaultUiapeekHubUrl,
        connection_state: "Disconnected",
        session_id: null,
        is_recording: false,
      });
    }

    try {
      return respondSuccess(bridge.getState());
    } catch (error) {
      return respondError(
        "UIA_RECORDING_STATE_FAILED",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  recordRuntimeLog("warn", "runtime action rejected: unknown action", {
    action_key: actionKey,
    action_name: actionName,
  });

  return respondError(
    "UNKNOWN_ACTION",
    `Unknown runtime action: ${actionName}`,
  );
}

export function createRuntimeControlServer(options: RuntimeControlServerOptions) {
  const endpoint = runtimeControlShared.getRuntimeControlEndpoint();

  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");

    let buffer = "";
    let handled = false;

    socket.on("data", async (chunk) => {
      buffer += chunk;

      if (handled || !buffer.includes("\n")) {
        return;
      }

      handled = true;
      const rawRequest = buffer.slice(0, buffer.indexOf("\n")).trim();

      try {
        const parsed = JSON.parse(rawRequest) as RuntimeActionRequest;
        const response = await handleRuntimeAction(parsed, options);
        socket.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        recordRuntimeLog("error", "runtime action crashed", {
          error_message: message,
        });

        const fallbackResponse: RuntimeActionResponse = {
          status: "error",
          action_key: "act-runtime-error",
          action_name: "runtime.control.error",
          responded_at: new Date().toISOString(),
          error: {
            code: "RUNTIME_CONTROL_FAILURE",
            message,
          },
        };

        socket.write(`${JSON.stringify(fallbackResponse)}\n`);
      } finally {
        socket.end();
      }
    });
  });

  server.on("error", (error) => {
    recordRuntimeLog("error", "runtime control server error", {
      error_message: error.message,
    });
  });

  if (process.platform !== "win32" && fs.existsSync(endpoint)) {
    fs.unlinkSync(endpoint);
  }

  server.listen(endpoint, () => {
    recordRuntimeLog("info", "runtime control server listening", {
      endpoint,
    });
  });

  const closeServer = () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        if (process.platform !== "win32" && fs.existsSync(endpoint)) {
          fs.unlinkSync(endpoint);
        }

        resolve();
      });
    });

  return {
    endpoint,
    closeServer,
  };
}
