import { app, BrowserWindow, ipcMain, screen, WebContents } from "electron";
import path from "node:path";
import YAML from "yaml";
import { createBrowserSurface } from "../host-services/browser/browser-surface.cjs";
import { createRuntimeRegistry } from "../host-services/runtime-registry/runtime-registry.cjs";
import { createRuntimeControlServer } from "../host-services/runtime-control/runtime-control-server.cjs";
import {
  buildDurableScopeKey,
  createDurableLogStore,
} from "../host-services/runtime-control/durable-log-store.cjs";
import { recordRuntimeLog } from "../host-services/runtime-control/runtime-logging.cjs";
import { createTerminalService } from "../host-services/terminal/terminal-service.cjs";
import {
  createUiaMacroService,
  type UiaHostReferenceFrame,
} from "../host-services/uia-macro/uia-macro-service.cjs";
import { createUiapeekRecordingBridge } from "../host-services/uia-macro/uiapeek-recording-bridge.cjs";
import {
  ensureUiaPeekHttpServer,
  pingUiaPeekHubUrl,
  shutdownUiaPeekHostIfSpawned,
} from "../host-services/uia-macro/uiapeek-http-launcher.cjs";
import {
  downloadUiaPeekWindowsToUserData,
  getUiaPeekUserDataExePath,
  getUiaPeekVendorExePath,
} from "../host-services/uia-macro/uiapeek-runtime-download.cjs";
import { resolveUiaPeekHostExecutable } from "../host-services/uia-macro/uiapeek-resolve.cjs";
import {
  createWorkspaceStore,
  type WorkspaceWindowRecord,
} from "../host-services/workspace/workspace-store.cjs";

const rendererDevUrl = "http://127.0.0.1:5173";
const forceDistRenderer = process.env.CLIBASE_FORCE_DIST_RENDERER === "1";
const isDevelopment = !app.isPackaged && !forceDistRenderer;
const shouldOpenDevtools = process.env.CLIBASE_OPEN_DEVTOOLS === "1";

type BrowserSurfaceController = ReturnType<typeof createBrowserSurface>;
type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
type RuntimeRegistry = ReturnType<typeof createRuntimeRegistry>;
type DurableLogStore = ReturnType<typeof createDurableLogStore>;
type TerminalService = ReturnType<typeof createTerminalService>;
type UiaMacroService = ReturnType<typeof createUiaMacroService>;
type UiapeekRecordingBridge = ReturnType<typeof createUiapeekRecordingBridge>;
type PersistedWindowBounds = NonNullable<WorkspaceWindowRecord["bounds"]>;

interface ManagedWindowEntry {
  windowKey: string;
  browserWindow: BrowserWindow;
  browserSurface: BrowserSurfaceController;
  windowMode: "docked-main-window" | "detached-window";
  skipRedockOnClose: boolean;
}

let mainWindow: BrowserWindow | null = null;
let runtimeControlServer: ReturnType<typeof createRuntimeControlServer> | null = null;
let workspaceStore: WorkspaceStore | null = null;
let runtimeRegistry: RuntimeRegistry | null = null;
let durableLogStore: DurableLogStore | null = null;
let terminalService: TerminalService | null = null;
let uiaMacroService: UiaMacroService | null = null;
let uiapeekRecordingBridge: UiapeekRecordingBridge | null = null;
const defaultUiapeekHubUrl =
  process.env.CLIBASE_UIAPEEK_HUB_URL?.trim() || "http://localhost:9955/hub/v4/g4/peek";
let isAppQuitting = false;

const managedWindows = new Map<string, ManagedWindowEntry>();
const windowKeyByWebContentsId = new Map<number, string>();
const MIN_WINDOW_WIDTH = 960;
const MIN_WINDOW_HEIGHT = 620;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDisplayKey(
  display: ReturnType<typeof screen.getPrimaryDisplay> | null | undefined,
) {
  if (!display) {
    return null;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  if (display.id === primaryDisplay.id) {
    return "display-primary";
  }

  const displays = screen.getAllDisplays();
  const matchingIndex = displays.findIndex((entry) => entry.id === display.id);
  if (matchingIndex >= 0) {
    return `display-${String(matchingIndex + 1).padStart(2, "0")}`;
  }

  return "display-secondary";
}

function getDefaultWindowBounds(
  windowMode: WorkspaceWindowRecord["window_mode"],
  targetDisplay: ReturnType<typeof screen.getPrimaryDisplay>,
): PersistedWindowBounds {
  const defaultWidth = windowMode === "detached-window" ? 1180 : 1440;
  const defaultHeight = windowMode === "detached-window" ? 820 : 920;
  const maxWidth = Math.max(MIN_WINDOW_WIDTH, targetDisplay.workArea.width);
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT, targetDisplay.workArea.height);
  const width = clampNumber(defaultWidth, MIN_WINDOW_WIDTH, maxWidth);
  const height = clampNumber(defaultHeight, MIN_WINDOW_HEIGHT, maxHeight);

  return {
    x: targetDisplay.workArea.x + Math.round((targetDisplay.workArea.width - width) / 2),
    y: targetDisplay.workArea.y + Math.round((targetDisplay.workArea.height - height) / 2),
    width,
    height,
  };
}

function resolveTargetDisplay(windowRecord: WorkspaceWindowRecord) {
  const displays = screen.getAllDisplays();
  if (!displays.length) {
    return null;
  }

  const displayFromKey =
    displays.find((entry) => getDisplayKey(entry) === windowRecord.display_key) ?? null;
  if (displayFromKey) {
    return displayFromKey;
  }

  if (windowRecord.bounds) {
    return screen.getDisplayMatching({
      x: windowRecord.bounds.x,
      y: windowRecord.bounds.y,
      width: windowRecord.bounds.width,
      height: windowRecord.bounds.height,
    });
  }

  return screen.getPrimaryDisplay();
}

function normalizeWindowPlacement(windowRecord: WorkspaceWindowRecord) {
  const targetDisplay = resolveTargetDisplay(windowRecord);
  if (!targetDisplay) {
    return null;
  }

  const fallbackBounds = getDefaultWindowBounds(windowRecord.window_mode, targetDisplay);
  const workArea = targetDisplay.workArea;
  const desiredWidth = clampNumber(
    windowRecord.bounds?.width ?? fallbackBounds.width,
    MIN_WINDOW_WIDTH,
    Math.max(MIN_WINDOW_WIDTH, workArea.width),
  );
  const desiredHeight = clampNumber(
    windowRecord.bounds?.height ?? fallbackBounds.height,
    MIN_WINDOW_HEIGHT,
    Math.max(MIN_WINDOW_HEIGHT, workArea.height),
  );
  const maxX = workArea.x + Math.max(workArea.width - desiredWidth, 0);
  const maxY = workArea.y + Math.max(workArea.height - desiredHeight, 0);
  const nextBounds: PersistedWindowBounds = windowRecord.bounds
    ? {
        x: clampNumber(windowRecord.bounds.x, workArea.x, maxX),
        y: clampNumber(windowRecord.bounds.y, workArea.y, maxY),
        width: desiredWidth,
        height: desiredHeight,
      }
    : {
        x: targetDisplay.workArea.x + Math.round((targetDisplay.workArea.width - desiredWidth) / 2),
        y: targetDisplay.workArea.y + Math.round((targetDisplay.workArea.height - desiredHeight) / 2),
        width: desiredWidth,
        height: desiredHeight,
      };
  const resolvedDisplay = screen.getDisplayMatching(nextBounds);

  return {
    display_key: getDisplayKey(resolvedDisplay),
    bounds: nextBounds,
  };
}

function placementMatchesRecord(
  windowRecord: WorkspaceWindowRecord,
  placement: {
    display_key: string | null;
    bounds: PersistedWindowBounds;
  },
) {
  return (
    windowRecord.display_key === placement.display_key &&
    windowRecord.bounds?.x === placement.bounds.x &&
    windowRecord.bounds?.y === placement.bounds.y &&
    windowRecord.bounds?.width === placement.bounds.width &&
    windowRecord.bounds?.height === placement.bounds.height
  );
}

function applyWindowPlacement(windowRecord: WorkspaceWindowRecord, browserWindow: BrowserWindow) {
  const normalizedPlacement = normalizeWindowPlacement(windowRecord);
  if (!normalizedPlacement) {
    return;
  }

  browserWindow.setBounds(normalizedPlacement.bounds);

  if (!workspaceStore || placementMatchesRecord(windowRecord, normalizedPlacement)) {
    return;
  }

  workspaceStore.updateWindowPlacement(windowRecord.window_key, normalizedPlacement);
}

function persistWindowPlacement(windowKey: string, browserWindow: BrowserWindow) {
  if (!workspaceStore || browserWindow.isDestroyed()) {
    return;
  }

  const bounds = browserWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  workspaceStore.updateWindowPlacement(windowKey, {
    display_key: getDisplayKey(display),
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  });
}

function getPreloadPath() {
  return path.join(__dirname, "../preload/preload.cjs");
}

function getRendererPath() {
  return path.join(__dirname, "../../dist/index.html");
}

function getWorkspaceSnapshot() {
  if (!workspaceStore) {
    throw new Error("Workspace store is not ready.");
  }

  return workspaceStore.getSnapshot();
}

function getWindowKeyForSender(sender?: WebContents | null) {
  if (!sender) {
    return getWorkspaceSnapshot().main_window_key;
  }

  return (
    windowKeyByWebContentsId.get(sender.id) ?? getWorkspaceSnapshot().main_window_key
  );
}

function getWorkspaceBridgeState(sender?: WebContents | null) {
  const windowKey = getWindowKeyForSender(sender);

  return {
    workspace: workspaceStore?.getStateSummary(windowKey) ?? null,
    runtime_registry: runtimeRegistry?.getWorkspaceRuntimeState() ?? null,
  };
}

function broadcastToWindows(channel: string, payload: unknown) {
  for (const entry of managedWindows.values()) {
    if (
      !entry.browserWindow.isDestroyed() &&
      !entry.browserWindow.webContents.isDestroyed()
    ) {
      entry.browserWindow.webContents.send(channel, payload);
    }
  }
}

function buildPreferredUiaPeekHostPaths(): string[] {
  return [
    getUiaPeekVendorExePath(process.cwd()),
    getUiaPeekUserDataExePath(app.getPath("userData")),
  ];
}

async function ensureUiapeekRecordingBridge() {
  if (!uiaMacroService) {
    throw new Error("UIA macro service is not ready.");
  }

  recordRuntimeLog("info", "uiapeek recording: resolve host and hub", {
    hub_url: defaultUiapeekHubUrl,
  });

  const registry = uiaMacroService.getRegistry();
  const preferred = buildPreferredUiaPeekHostPaths();
  let hostResolved = resolveUiaPeekHostExecutable(registry.uia_adapter, {
    preferredHostExePaths: preferred,
  });

  if (!hostResolved.executable && process.platform === "win32") {
    const offline = process.env.CLIBASE_UIAPEEK_OFFLINE_DOWNLOAD === "1";
    if (!offline) {
      recordRuntimeLog("info", "uiapeek recording: downloading UiaPeek.exe (first run)", {});
      await downloadUiaPeekWindowsToUserData(app.getPath("userData"));
      hostResolved = resolveUiaPeekHostExecutable(registry.uia_adapter, {
        preferredHostExePaths: preferred,
      });
    }
  }

  if (!hostResolved.executable) {
    throw new Error(
      "UiaPeek HTTP host (UiaPeek.exe) was not found. On Windows, allow the first-run download, place UiaPeek.exe under vendor/uia-peek/, or set CLIBASE_UIAPEEK_HOST_EXE. Air-gapped: copy UiaPeek.exe into vendor/uia-peek/ and set CLIBASE_UIAPEEK_OFFLINE_DOWNLOAD=1 to skip download attempts.",
    );
  }

  recordRuntimeLog("info", "uiapeek recording: ensure HTTP reachable", {
    host_exe: hostResolved.executable,
  });

  await ensureUiaPeekHttpServer({
    hubUrl: defaultUiapeekHubUrl,
    hostExePath: hostResolved.executable,
  });

  if (!uiapeekRecordingBridge) {
    uiapeekRecordingBridge = createUiapeekRecordingBridge({
      hubUrl: defaultUiapeekHubUrl,
      onEvent: (payload) => {
        broadcastToWindows("clibase:uia:recording-event", {
          received_at: new Date().toISOString(),
          payload,
        });
      },
    });
  }

  return uiapeekRecordingBridge;
}

function getUiapeekRecordingBridge() {
  return uiapeekRecordingBridge;
}

function broadcastWorkspaceState() {
  if (!workspaceStore) {
    return;
  }

  for (const entry of managedWindows.values()) {
    if (
      entry.browserWindow.isDestroyed() ||
      entry.browserWindow.webContents.isDestroyed()
    ) {
      continue;
    }

    entry.browserWindow.webContents.send("clibase:workspace-state-updated", {
      workspace: workspaceStore.getStateSummary(entry.windowKey),
      runtime_registry: runtimeRegistry?.getWorkspaceRuntimeState() ?? null,
    });
  }
}

function getWindowRecord(windowKey: string) {
  return getWorkspaceSnapshot().window_records.find((entry) => entry.window_key === windowKey) ?? null;
}

function getBrowserModuleForTab(tabKey: string) {
  return getWorkspaceSnapshot().browser_modules.find((entry) => entry.tab_key === tabKey) ?? null;
}

function getTabSummary(tabKey: string) {
  return getWorkspaceSnapshot().active_project_tabs.find((entry) => entry.tab_key === tabKey) ?? null;
}

function buildWindowTitle(windowRecord: WorkspaceWindowRecord) {
  const snapshot = getWorkspaceSnapshot();
  const projectName = snapshot.active_project.project_name;
  const activeTabName =
    getTabSummary(windowRecord.active_tab_key)?.tab_name ?? windowRecord.active_tab_key;

  return windowRecord.window_mode === "detached-window"
    ? `${projectName} · ${activeTabName}`
    : `${projectName} · Workbench`;
}

function emitBrowserEvent(eventName: string, payload: Record<string, unknown>) {
  if (!durableLogStore) {
    return;
  }

  const browserKey = typeof payload.browser_key === "string" ? payload.browser_key : undefined;
  const browserDefinition = runtimeRegistry?.getBrowserDefinition(browserKey);

  durableLogStore.appendEventRecord(
    buildDurableScopeKey(browserDefinition?.project_key, browserDefinition?.tab_key),
    {
      event_record_key: durableLogStore.createEventRecordKey(),
      trace_key: `trace-${browserDefinition?.project_key ?? "global"}-${browserKey ?? "browser"}`,
      event_name: eventName,
      source_kind: "host-service",
      source_key: browserKey ?? "browser-surface-main",
      payload_schema_key: "payload-browser-event-v1",
      payload,
      created_at: new Date().toISOString(),
    },
  );
}

async function loadWindowRenderer(window: BrowserWindow) {
  if (isDevelopment) {
    await window.loadURL(rendererDevUrl);
    if (shouldOpenDevtools) {
      window.webContents.openDevTools({ mode: "detach" });
    }
    return;
  }

  await window.loadFile(getRendererPath());
}

async function syncManagedWindow(entry: ManagedWindowEntry) {
  const windowRecord = getWindowRecord(entry.windowKey);
  if (
    !windowRecord ||
    entry.browserWindow.isDestroyed() ||
    entry.browserWindow.webContents.isDestroyed()
  ) {
    return;
  }

  const browserModule =
    getBrowserModuleForTab(windowRecord.active_tab_key) ??
    getBrowserModuleForTab(windowRecord.attached_tab_keys[0] ?? "");

  if (browserModule) {
    await entry.browserSurface.rebind(
      browserModule.browser_key,
      browserModule.resolved_home_url,
    );
    runtimeRegistry?.registerBrowserSurface(entry.browserSurface);
  }

  entry.browserSurface.updateLayoutState(windowRecord.layout_state);
  applyWindowPlacement(windowRecord, entry.browserWindow);

  entry.browserWindow.setTitle(buildWindowTitle(windowRecord));
}

async function createManagedWindow(windowRecord: WorkspaceWindowRecord) {
  const browserModule =
    getBrowserModuleForTab(windowRecord.active_tab_key) ??
    getBrowserModuleForTab(windowRecord.attached_tab_keys[0] ?? "");

  const browserWindow = new BrowserWindow({
    width: windowRecord.window_mode === "detached-window" ? 1180 : 1440,
    height: windowRecord.window_mode === "detached-window" ? 820 : 920,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#08111d",
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  applyWindowPlacement(windowRecord, browserWindow);

  const browserSurface = createBrowserSurface(browserWindow, {
    browserKey: browserModule?.browser_key,
    initialUrl: browserModule?.resolved_home_url,
    initialShellSplitRatio: windowRecord.layout_state?.shell_split_ratio,
    initialBrowserDockPosition: windowRecord.layout_state?.browser_dock_position,
    initialBrowserCollapsed: windowRecord.layout_state?.browser_collapsed,
    onBrowserEvent: emitBrowserEvent,
  });

  const entry: ManagedWindowEntry = {
    windowKey: windowRecord.window_key,
    browserWindow,
    browserSurface,
    windowMode: windowRecord.window_mode,
    skipRedockOnClose: false,
  };
  const browserWindowWebContentsId = browserWindow.webContents.id;

  managedWindows.set(windowRecord.window_key, entry);
  windowKeyByWebContentsId.set(browserWindowWebContentsId, windowRecord.window_key);
  runtimeRegistry?.registerBrowserSurface(browserSurface);

  if (windowRecord.window_mode === "docked-main-window") {
    mainWindow = browserWindow;
    recordRuntimeLog("info", "main window created", {
      app_mode: isDevelopment ? "development" : "production",
      window_key: windowRecord.window_key,
    });
  } else {
    recordRuntimeLog("info", "detached window created", {
      window_key: windowRecord.window_key,
      tab_key: windowRecord.active_tab_key,
    });
  }

  const persistBounds = () => {
    persistWindowPlacement(windowRecord.window_key, browserWindow);
  };

  browserWindow.on("moved", persistBounds);
  browserWindow.on("resize", persistBounds);

  browserWindow.on("focus", () => {
    if (!workspaceStore) {
      return;
    }

    const currentRecord = getWindowRecord(windowRecord.window_key);
    if (currentRecord?.active_tab_key) {
      void applyWorkspaceSnapshot(
        workspaceStore.switchTab(currentRecord.active_tab_key, currentRecord.window_key),
      );
    }
  });

  browserWindow.on("closed", () => {
    runtimeRegistry?.unregisterBrowserSurface(entry.browserSurface, "window-closed");
    windowKeyByWebContentsId.delete(browserWindowWebContentsId);
    managedWindows.delete(windowRecord.window_key);

    if (windowRecord.window_mode === "docked-main-window") {
      mainWindow = null;
      recordRuntimeLog("info", "main window closed");
      return;
    }

    recordRuntimeLog("info", "detached window closed", {
      window_key: windowRecord.window_key,
      tab_key: windowRecord.active_tab_key,
    });

    if (
      !entry.skipRedockOnClose &&
      !isAppQuitting &&
      workspaceStore &&
      runtimeRegistry &&
      terminalService
    ) {
      void (async () => {
        const nextSnapshot = workspaceStore.redockTab(windowRecord.active_tab_key);
        await applyWorkspaceSnapshot(nextSnapshot);
      })();
    }
  });

  await loadWindowRenderer(browserWindow);
  await syncManagedWindow(entry);
  return entry;
}

async function syncWindowAssignments() {
  if (!workspaceStore || !runtimeRegistry || !terminalService) {
    throw new Error("Workspace runtime services are not ready.");
  }

  const snapshot = workspaceStore.getSnapshot();
  const desiredWindowKeys = new Set(snapshot.window_records.map((entry) => entry.window_key));

  for (const windowRecord of snapshot.window_records) {
    const existing = managedWindows.get(windowRecord.window_key);
    if (existing) {
      await syncManagedWindow(existing);
      continue;
    }

    await createManagedWindow(windowRecord);
  }

  for (const [windowKey, entry] of managedWindows.entries()) {
    if (desiredWindowKeys.has(windowKey)) {
      continue;
    }

    if (entry.windowMode === "detached-window") {
      entry.skipRedockOnClose = true;
      entry.browserWindow.close();
    }
  }

  broadcastWorkspaceState();
}

async function applyWorkspaceSnapshot(nextSnapshot: ReturnType<WorkspaceStore["getSnapshot"]>) {
  if (!runtimeRegistry || !terminalService || !workspaceStore) {
    throw new Error("Workspace runtime services are not ready.");
  }

  runtimeRegistry.replaceSnapshot(nextSnapshot);
  terminalService.syncSnapshot(nextSnapshot);
  await syncWindowAssignments();
}

function parseTabOrderPayload(rawValue: unknown) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof rawValue !== "string") {
    return [];
  }

  return rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

app.whenReady().then(async () => {
  recordRuntimeLog("info", "electron app ready", {
    app_mode: isDevelopment ? "development" : "production",
  });

  workspaceStore = createWorkspaceStore({
    mode: isDevelopment ? "development" : "production",
    repoRoot: process.cwd(),
    userDataPath: app.getPath("userData"),
  });
  durableLogStore = createDurableLogStore({
    workspaceRoot: workspaceStore.getSnapshot().workspace_root,
  });
  runtimeRegistry = createRuntimeRegistry(workspaceStore.getSnapshot());
  terminalService = createTerminalService({
    snapshot: workspaceStore.getSnapshot(),
    durableLogStore,
    onTerminalOutput: (entry) => {
      broadcastToWindows("clibase:terminal-output", entry);
    },
    onTerminalStateChange: (state) => {
      broadcastToWindows("clibase:terminal-state", state);
    },
  });
  uiaMacroService = createUiaMacroService({
    workspaceRoot: workspaceStore.getSnapshot().workspace_root,
    repoRoot: process.cwd(),
    preferredUiaPeekHostPaths: buildPreferredUiaPeekHostPaths(),
  });

  ipcMain.handle("clibase:ping", async () => {
    return {
      appMode: isDevelopment ? "development" : "production",
      platform: process.platform,
      timestamp: new Date().toISOString(),
    };
  });

  ipcMain.handle("clibase:workspace-state", async (event) =>
    getWorkspaceBridgeState(event.sender),
  );
  ipcMain.handle("clibase:browser:get-state", async (_event, browserKey?: string) => {
    if (!runtimeRegistry) {
      throw new Error("Runtime registry is not ready.");
    }

    return runtimeRegistry.getBrowserState(browserKey);
  });
  ipcMain.handle(
    "clibase:browser:navigate",
    async (_event, url: string, browserKey?: string) => {
      if (!runtimeRegistry) {
        throw new Error("Runtime registry is not ready.");
      }

      const normalizedUrl = typeof url === "string" ? url.trim() : "";
      if (!normalizedUrl) {
        throw new Error("url is required.");
      }

      return runtimeRegistry.navigateBrowser(browserKey, normalizedUrl);
    },
  );
  ipcMain.handle("clibase:browser:back", async (_event, browserKey?: string) => {
    if (!runtimeRegistry) {
      throw new Error("Runtime registry is not ready.");
    }

    return runtimeRegistry.goBackBrowser(browserKey);
  });
  ipcMain.handle("clibase:browser:forward", async (_event, browserKey?: string) => {
    if (!runtimeRegistry) {
      throw new Error("Runtime registry is not ready.");
    }

    return runtimeRegistry.goForwardBrowser(browserKey);
  });
  ipcMain.handle("clibase:browser:reload", async (_event, browserKey?: string) => {
    if (!runtimeRegistry) {
      throw new Error("Runtime registry is not ready.");
    }

    return runtimeRegistry.reloadBrowser(browserKey);
  });
  ipcMain.handle(
    "clibase:browser:set-host-bounds",
    async (event, bounds?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null) => {
      const managedWindow = managedWindows.get(getWindowKeyForSender(event.sender));
      if (!managedWindow) {
        throw new Error("Managed window is not ready for browser host bounds sync.");
      }

      return managedWindow.browserSurface.setHostBounds(bounds ?? null);
    },
  );
  ipcMain.on(
    "clibase:browser:push-host-bounds",
    (event, bounds?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null) => {
      const managedWindow = managedWindows.get(getWindowKeyForSender(event.sender));
      if (!managedWindow) {
        return;
      }

      try {
        managedWindow.browserSurface.setHostBounds(bounds ?? null);
      } catch {
        // Ignore transient sync races during live resize.
      }
    },
  );
  ipcMain.handle("clibase:tab:activate", async (event, tabKey?: string) => {
    if (!workspaceStore) {
      throw new Error("Workspace store is not ready.");
    }

    if (!tabKey?.trim()) {
      throw new Error("tab_key is required.");
    }

    const nextSnapshot = workspaceStore.switchTab(
      tabKey,
      getWindowKeyForSender(event.sender),
    );
    await applyWorkspaceSnapshot(nextSnapshot);
    return getWorkspaceBridgeState(event.sender);
  });
  ipcMain.handle("clibase:tab:next", async (event) => {
    if (!workspaceStore) {
      throw new Error("Workspace store is not ready.");
    }

    const nextSnapshot = workspaceStore.activateNextTab(
      getWindowKeyForSender(event.sender),
    );
    await applyWorkspaceSnapshot(nextSnapshot);
    return getWorkspaceBridgeState(event.sender);
  });
  ipcMain.handle("clibase:tab:previous", async (event) => {
    if (!workspaceStore) {
      throw new Error("Workspace store is not ready.");
    }

    const nextSnapshot = workspaceStore.activatePreviousTab(
      getWindowKeyForSender(event.sender),
    );
    await applyWorkspaceSnapshot(nextSnapshot);
    return getWorkspaceBridgeState(event.sender);
  });
  ipcMain.handle("clibase:tab:detach", async (event, tabKey?: string) => {
    if (!workspaceStore) {
      throw new Error("Workspace store is not ready.");
    }

    const targetTabKey =
      tabKey?.trim() ||
      workspaceStore.getStateSummary(getWindowKeyForSender(event.sender)).active_tab_key;

    const nextSnapshot = workspaceStore.detachTab(targetTabKey);
    await applyWorkspaceSnapshot(nextSnapshot);
    return getWorkspaceBridgeState(event.sender);
  });
  ipcMain.handle("clibase:tab:redock", async (event, tabKey?: string) => {
    if (!workspaceStore) {
      throw new Error("Workspace store is not ready.");
    }

    const targetTabKey =
      tabKey?.trim() ||
      workspaceStore.getStateSummary(getWindowKeyForSender(event.sender)).active_tab_key;

    const nextSnapshot = workspaceStore.redockTab(targetTabKey);
    await applyWorkspaceSnapshot(nextSnapshot);
    return getWorkspaceBridgeState(event.sender);
  });
  ipcMain.handle("clibase:tab:reorder", async (event, tabOrderRaw?: string) => {
    if (!workspaceStore) {
      throw new Error("Workspace store is not ready.");
    }

    const nextSnapshot = workspaceStore.reorderTabs(parseTabOrderPayload(tabOrderRaw));
    await applyWorkspaceSnapshot(nextSnapshot);
    return getWorkspaceBridgeState(event.sender);
  });
  ipcMain.handle("clibase:layout:update-window-state", async (event, partialLayoutState) => {
    if (!workspaceStore) {
      throw new Error("Workspace store is not ready.");
    }

    const nextSnapshot = workspaceStore.updateWindowLayoutState(
      getWindowKeyForSender(event.sender),
      partialLayoutState ?? {},
    );
    await applyWorkspaceSnapshot(nextSnapshot);
    return getWorkspaceBridgeState(event.sender);
  });
  ipcMain.handle("clibase:terminal:create", async (_event, terminalKey?: string) => {
    if (!terminalService) {
      throw new Error("Terminal service is not ready.");
    }

    return terminalService.createTerminal(terminalKey);
  });
  ipcMain.handle("clibase:terminal:get-state", async (_event, terminalKey?: string) => {
    if (!terminalService) {
      throw new Error("Terminal service is not ready.");
    }

    return terminalService.getTerminalState(terminalKey);
  });
  ipcMain.handle(
    "clibase:terminal:write",
    async (_event, terminalKey: string | undefined, text: string, appendNewline = true) => {
      if (!terminalService) {
        throw new Error("Terminal service is not ready.");
      }

      return terminalService.writeTerminal(terminalKey, text, appendNewline);
    },
  );
  ipcMain.handle(
    "clibase:terminal:resize",
    async (_event, terminalKey: string | undefined, cols: number, rows: number) => {
      if (!terminalService) {
        throw new Error("Terminal service is not ready.");
      }

      return terminalService.resizeTerminal(terminalKey, cols, rows);
    },
  );
  ipcMain.handle(
    "clibase:terminal:logs-tail",
    async (_event, terminalKey: string | undefined, limit = 80) => {
      if (!terminalService) {
        throw new Error("Terminal service is not ready.");
      }

      return terminalService.getTerminalLogsTail(terminalKey, limit);
    },
  );
  ipcMain.handle("clibase:uia:get-registry", async () => {
    if (!uiaMacroService) {
      throw new Error("UIA macro service is not ready.");
    }

    return uiaMacroService.getRegistry();
  });
  ipcMain.handle(
    "clibase:uia:save-target",
    async (
      _event,
      payload: {
        target_key: string;
        target_name: string;
        exe_path: string;
        args: string[];
        working_dir: string;
        startup_wait_ms: number;
        host_reference_frame?: {
          width_px: number;
          height_px: number;
          coordinate_space: string;
          placement_mode: string;
        } | null;
      },
    ) => {
      if (!uiaMacroService) {
        throw new Error("UIA macro service is not ready.");
      }

      return uiaMacroService.saveTarget({
        target_key: payload.target_key,
        target_name: payload.target_name,
        exe_path: payload.exe_path,
        args: payload.args,
        working_dir: payload.working_dir,
        startup_wait_ms: payload.startup_wait_ms,
        host_reference_frame: payload.host_reference_frame as UiaHostReferenceFrame | null | undefined,
      });
    },
  );
  ipcMain.handle(
    "clibase:uia:launch-target",
    async (
      _event,
      targetKey: string,
      overrides?: {
        exe_path?: string;
        args?: string[];
        working_dir?: string;
        startup_wait_ms?: number;
      },
    ) => {
      if (!uiaMacroService) {
        throw new Error("UIA macro service is not ready.");
      }

      return uiaMacroService.launchTarget(targetKey, overrides);
    },
  );
  ipcMain.handle("clibase:uia:stop-target", async (_event, targetKey: string) => {
    if (!uiaMacroService) {
      throw new Error("UIA macro service is not ready.");
    }

    return uiaMacroService.stopTarget(targetKey);
  });
  ipcMain.handle("clibase:uia:get-target-state", async (_event, targetKey: string) => {
    if (!uiaMacroService) {
      throw new Error("UIA macro service is not ready.");
    }

    return uiaMacroService.getTargetState(targetKey);
  });
  ipcMain.handle(
    "clibase:uia:save-macro",
    async (
      _event,
      payload: {
        macro_key: string;
        macro_name: string;
        target_key: string;
        description: string;
        shared_tags: string[];
        steps?: unknown[];
        steps_yaml?: string;
      },
    ) => {
      if (!uiaMacroService) {
        throw new Error("UIA macro service is not ready.");
      }

      const nextSteps = Array.isArray(payload.steps)
        ? payload.steps
        : (() => {
            const yamlText = typeof payload.steps_yaml === "string" ? payload.steps_yaml.trim() : "";
            if (!yamlText) {
              return [];
            }

            const parsed = YAML.parse(yamlText);
            if (!Array.isArray(parsed)) {
              throw new Error("steps_yaml must parse to an array.");
            }

            return parsed;
          })();

      return uiaMacroService.saveMacro({
        macro_key: payload.macro_key,
        macro_name: payload.macro_name,
        target_key: payload.target_key,
        description: payload.description,
        shared_tags: payload.shared_tags,
        steps: nextSteps,
      });
    },
  );
  ipcMain.handle("clibase:uia:list-macros", async (_event, targetKey?: string) => {
    if (!uiaMacroService) {
      throw new Error("UIA macro service is not ready.");
    }

    return uiaMacroService.listMacros(targetKey);
  });
  ipcMain.handle("clibase:uia:delete-macro", async (_event, macroKey: string) => {
    if (!uiaMacroService) {
      throw new Error("UIA macro service is not ready.");
    }

    return uiaMacroService.deleteMacro(macroKey);
  });
  ipcMain.handle(
    "clibase:uia:run-macro",
    async (
      _event,
      payload: {
        macro_key: string;
        target_key?: string;
        ensure_target_running: boolean;
      },
    ) => {
      if (!uiaMacroService) {
        throw new Error("UIA macro service is not ready.");
      }

      return uiaMacroService.runMacro(payload);
    },
  );
  ipcMain.handle(
    "clibase:uia:update-adapter",
    async (
      _event,
      payload: {
        executable_path: string;
        default_timeout_ms: number;
        python_executable?: string;
        provider_key?: string;
      },
    ) => {
      if (!uiaMacroService) {
        throw new Error("UIA macro service is not ready.");
      }

      return uiaMacroService.updateAdapterConfig(payload);
    },
  );
  ipcMain.handle("clibase:uia:recording-start", async () => {
    recordRuntimeLog("info", "uia recording: IPC start requested", {});
    try {
      const bridge = await ensureUiapeekRecordingBridge();
      const state = await bridge.start();
      recordRuntimeLog("info", "uia recording: SignalR session ready", {
        connection_state: state.connection_state,
        session_id: state.session_id,
      });
      return state;
    } catch (error) {
      recordRuntimeLog("error", "uia recording: start failed", {
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
  ipcMain.handle("clibase:uia:recording-stop", async () => {
    recordRuntimeLog("info", "uia recording: IPC stop requested", {});
    const bridge = getUiapeekRecordingBridge();
    if (!bridge) {
      return {
        hub_url: defaultUiapeekHubUrl,
        connection_state: "Disconnected",
        session_id: null,
        is_recording: false,
      };
    }

    try {
      return await bridge.stop();
    } catch (error) {
      recordRuntimeLog("warn", "uia recording: stop failed", {
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
  ipcMain.handle("clibase:uia:recording-state", async () => {
    const bridge = getUiapeekRecordingBridge();
    if (!bridge) {
      return {
        hub_url: defaultUiapeekHubUrl,
        connection_state: "Disconnected",
        session_id: null,
        is_recording: false,
      };
    }

    return bridge.getState();
  });
  ipcMain.handle("clibase:uia:runtime-status", async () => {
    if (!uiaMacroService) {
      throw new Error("UIA macro service is not ready.");
    }

    const registry = uiaMacroService.getRegistry();
    const bridge = getUiapeekRecordingBridge();
    const recordingState = bridge
      ? bridge.getState()
      : {
          hub_url: defaultUiapeekHubUrl,
          connection_state: "Disconnected",
          session_id: null,
          is_recording: false,
        };

    const hubUrlForPing = recordingState.hub_url?.trim() || defaultUiapeekHubUrl;
    let uiapeek_http_ping_ok = false;
    try {
      uiapeek_http_ping_ok = await pingUiaPeekHubUrl(hubUrlForPing);
    } catch {
      uiapeek_http_ping_ok = false;
    }

    return {
      running_targets: registry.running_targets,
      recording_state: recordingState,
      uiapeek_host_exe: registry.uiapeek_host_resolution.resolved_executable,
      uiapeek_host_source: registry.uiapeek_host_resolution.resolution_source,
      hub_url_default: defaultUiapeekHubUrl,
      uiapeek_http_ping_ok,
    };
  });

  runtimeControlServer = createRuntimeControlServer({
    appMode: isDevelopment ? "development" : "production",
    getMainWindow: () => mainWindow,
    getWorkspaceStore: () => workspaceStore,
    getRuntimeRegistry: () => runtimeRegistry,
    getDurableLogStore: () => durableLogStore,
    getTerminalService: () => terminalService,
    getUiaMacroService: () => uiaMacroService,
    getUiapeekRecordingBridge,
    ensureUiapeekRecordingBridge,
    defaultUiapeekHubUrl,
    syncPrimaryBrowserSurface: async () => {
      await syncWindowAssignments();
    },
  });

  await syncWindowAssignments();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await syncWindowAssignments();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isAppQuitting = true;
  terminalService?.shutdown();
  uiaMacroService?.shutdown();
  void getUiapeekRecordingBridge()
    ?.shutdown()
    .catch(() => {});
  shutdownUiaPeekHostIfSpawned();
  for (const entry of managedWindows.values()) {
    entry.skipRedockOnClose = true;
  }
  if (runtimeControlServer) {
    void runtimeControlServer.closeServer();
  }
});
