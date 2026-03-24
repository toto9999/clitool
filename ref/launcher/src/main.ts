import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserView, BrowserWindow, ipcMain } from "electron";
import type {
  BrowserEventMessage,
  LauncherMode,
  LauncherSettings,
  LauncherTheme,
  MainShellTab,
  SymphonyConfig,
  SymphonyStatus,
  TerminalEventMessage,
  WorkspaceShellState
} from "./shared.js";
import { defaultSettings, loadSettings, saveSettings } from "./settings.js";
import {
  defaultSymphonyConfig,
  generateId,
  loadSymphonyConfig,
  saveSymphonyConfig
} from "./symphony-config.js";
import { loadLauncherMode } from "./launcher-env.js";
import type { LayoutTemplate, ProjectWorkspaceConfig, ProjectsIndexFile, ToolKind } from "./workspace-model.js";
import { computeWorkAreaCells, defaultWorkspaceConfig, type Rect } from "./workspace-model.js";
import {
  defaultProjectRootPath,
  ensureWorkspaceBootstrap,
  loadProjectWorkspace,
  projectWorkspacePath,
  saveProjectWorkspace,
  saveProjectsIndex,
  slugifyName,
  uniqueSlug,
  alignCellAssignmentsToTemplate
} from "./workspace-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const launcherMode: LauncherMode = loadLauncherMode(projectRoot);

const WINDOW_WIDTH = 1400;
const WINDOW_HEIGHT = 900;
const MIN_TERMINAL_HEIGHT = 160;
const MAX_TERMINAL_HEIGHT = 600;
const COLLAPSED_TERMINAL_HEIGHT = 44;

const DEFAULT_BLANK_PAGE =
  "data:text/html;charset=utf-8,%3Chtml%3E%3Cbody%20style%3D%22margin%3A0%3Bdisplay%3Agrid%3Bplace-items%3Acenter%3Bheight%3A100vh%3Bfont-family%3ASegoe%20UI%2CArial%2Csans-serif%3Bbackground%3A%23ffffff%3Bcolor%3A%23111111%3B%22%3EBrowser%3C%2Fbody%3E%3C%2Fhtml%3E";

const state: {
  settings: LauncherSettings;
  symphonyConfig: SymphonyConfig;
  currentUrl: string;
  lastExpandedTerminalHeight: number;
  previewTerminalHeight: number | null;
  collapseAnimating: boolean;
} = {
  settings: loadSettings(projectRoot),
  symphonyConfig: loadSymphonyConfig(projectRoot),
  currentUrl: DEFAULT_BLANK_PAGE,
  lastExpandedTerminalHeight: 240,
  previewTerminalHeight: null,
  collapseAnimating: false
};

let projectsIndex: ProjectsIndexFile = { activeSlug: null, projects: [] };
let workspaceManagerOpen = true;
let workspaceEditingSlug: string | null = null;
let activeProjectTabId: string | null = null;
let currentMainTab: MainShellTab = "workspace";

type ToolHost = { instanceKey: string; kind: ToolKind; view: BrowserView };
const toolHosts: ToolHost[] = [];
const toolContext = new Map<number, { slug: string; instanceKey: string; kind: ToolKind }>();
const lastToolBounds = new Map<string, ViewBounds>();

let mainWindow: BrowserWindow | null = null;
let sidebarView: BrowserView | null = null;
let symphonyView: BrowserView | null = null;
let overlayView: BrowserView | null = null;
let workspaceManagerView: BrowserView | null = null;
let workspaceRuntimeView: BrowserView | null = null;
let symphonyStatus: SymphonyStatus = "stopped";
const watchedFiles: string[] = [];
let hotReloadDistWatcher: fs.FSWatcher | null = null;
const pendingReloadTimers = new Map<string, NodeJS.Timeout>();
let collapseAnimationTimer: NodeJS.Timeout | null = null;

type ViewBounds = { x: number; y: number; width: number; height: number };

let lastSidebarBounds: ViewBounds | null = null;
let lastSymphonyBounds: ViewBounds | null = null;

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const isTheme = (value: unknown): value is LauncherTheme => value === "dark" || value === "light";

const applySettings = (next: Partial<LauncherSettings>): LauncherSettings => {
  const merged: LauncherSettings = {
    theme: next.theme ?? state.settings.theme,
    terminalHeight: next.terminalHeight ?? state.settings.terminalHeight,
    terminalCollapsed: next.terminalCollapsed ?? state.settings.terminalCollapsed,
    sidebarWidth: next.sidebarWidth ?? state.settings.sidebarWidth
  };
  const safe: LauncherSettings = {
    theme: isTheme(merged.theme) ? merged.theme : "dark",
    terminalHeight: clamp(merged.terminalHeight, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT),
    terminalCollapsed: Boolean(merged.terminalCollapsed),
    sidebarWidth: clamp(merged.sidebarWidth, 48, 240)
  };
  if (!safe.terminalCollapsed) {
    state.lastExpandedTerminalHeight = safe.terminalHeight;
  }
  state.settings = saveSettings(projectRoot, safe);
  return state.settings;
};

const LAYOUT_OPTIONS: LayoutTemplate[] = [
  "single",
  "h2",
  "h3",
  "h4",
  "v2",
  "v3",
  "v4",
  "grid2x2"
];

type ProjectTabRailItem = { tabId: string; label: string };

const projectTabRailForSlug = (slug: string | null): ProjectTabRailItem[] => {
  if (!slug) return [];
  return [
    { tabId: "overview", label: "Overview" },
    { tabId: "analysis", label: "Analysis" },
    { tabId: "report", label: "Report" }
  ];
};

const syncActiveProjectTab = (): void => {
  const tabs = projectTabRailForSlug(projectsIndex.activeSlug);
  if (!tabs.some((tab) => tab.tabId === activeProjectTabId)) {
    activeProjectTabId = tabs[0]?.tabId ?? null;
  }
};

const showToolRail = (): boolean =>
  currentMainTab === "workspace" &&
  !workspaceManagerOpen &&
  projectsIndex.activeSlug !== null;

/** Minimum widths so the project rail stays slim and tool rail still fits short labels. */
const SIDEBAR_COL_A_MIN = 40;
const SIDEBAR_COL_B_MIN = 64;
const SIDEBAR_DUAL_MIN_TOTAL = SIDEBAR_COL_A_MIN + SIDEBAR_COL_B_MIN;

const sidebarWidths = (): { total: number; colA: number; colB: number } => {
  const stored = clamp(state.settings.sidebarWidth, 48, 240);
  if (showToolRail()) {
    const total = Math.max(stored, SIDEBAR_DUAL_MIN_TOTAL);
    return { total, colA: SIDEBAR_COL_A_MIN, colB: total - SIDEBAR_COL_A_MIN };
  }
  return { total: stored, colA: stored, colB: 0 };
};

const getActiveWorkspaceConfig = (): ProjectWorkspaceConfig | null => {
  const slug = projectsIndex.activeSlug;
  if (!slug) return null;
  return loadProjectWorkspace(projectRoot, slug);
};

const getShellState = (): WorkspaceShellState => {
  const sw = sidebarWidths();
  const activeProject = projectsIndex.projects.find((p) => p.slug === projectsIndex.activeSlug) ?? null;
  const projectTabRail = projectTabRailForSlug(projectsIndex.activeSlug);
  syncActiveProjectTab();
  return {
    managerOpen: workspaceManagerOpen,
    mainTab: currentMainTab,
    showToolRail: showToolRail(),
    sidebarMetrics: {
      colA: sw.colA,
      colB: sw.colB,
      showToolRail: showToolRail()
    },
    projects: projectsIndex.projects.map((p) => ({ slug: p.slug, name: p.name })),
    activeSlug: projectsIndex.activeSlug,
    activeProjectName: activeProject?.name ?? null,
    projectTabRail,
    activeTabId: activeProjectTabId
  };
};

const broadcastShell = (): void => {
  const payload = getShellState();
  sidebarView?.webContents.send("workspace:shell-changed", payload);
  workspaceRuntimeView?.webContents.send("workspace:shell-changed", payload);
};

const sendSettingsChanged = (): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(state.settings.theme === "dark" ? "#1e1e1e" : "#ffffff");
  }
  if (sidebarView) {
    try {
      sidebarView.setBackgroundColor(state.settings.theme === "dark" ? "#252526" : "#ffffff");
    } catch {
      /* optional */
    }
  }
  for (const h of toolHosts) {
    h.view.webContents.send("settings:changed", state.settings);
  }
  overlayView?.webContents.send("settings:changed", state.settings);
  sidebarView?.webContents.send("settings:changed", state.settings);
  symphonyView?.webContents.send("settings:changed", state.settings);
  workspaceManagerView?.webContents.send("settings:changed", state.settings);
  workspaceRuntimeView?.webContents.send("settings:changed", state.settings);
};

const currentExpandedTerminalHeight = (): number => {
  if (typeof state.previewTerminalHeight === "number") {
    const min = state.collapseAnimating ? COLLAPSED_TERMINAL_HEIGHT : MIN_TERMINAL_HEIGHT;
    return clamp(state.previewTerminalHeight, min, MAX_TERMINAL_HEIGHT);
  }
  return clamp(state.settings.terminalHeight, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT);
};

const stopCollapseAnimation = (): void => {
  if (collapseAnimationTimer) {
    clearInterval(collapseAnimationTimer);
    collapseAnimationTimer = null;
  }
};

const isSameBounds = (a: ViewBounds | null, b: ViewBounds): boolean =>
  a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const animateTerminalHeight = (
  fromHeight: number,
  toHeight: number,
  onDone: () => void,
  durationMs = 140
): void => {
  stopCollapseAnimation();
  state.collapseAnimating = true;
  const frameMs = 16;
  const stepCount = Math.max(1, Math.round(durationMs / frameMs));
  let step = 0;
  collapseAnimationTimer = setInterval(() => {
    step += 1;
    const ratio = step / stepCount;
    const eased = ratio < 1 ? 1 - (1 - ratio) * (1 - ratio) : 1;
    state.previewTerminalHeight = fromHeight + (toHeight - fromHeight) * eased;
    updateLayout();
    if (step >= stepCount) {
      stopCollapseAnimation();
      state.previewTerminalHeight = null;
      state.collapseAnimating = false;
      onDone();
    }
  }, frameMs);
};

const detachStackTops = (): void => {
  if (!mainWindow) return;
  const attached = new Set(mainWindow.getBrowserViews());
  if (symphonyView && attached.has(symphonyView)) mainWindow.removeBrowserView(symphonyView);
  if (overlayView && attached.has(overlayView)) mainWindow.removeBrowserView(overlayView);
  if (workspaceManagerView && attached.has(workspaceManagerView)) {
    mainWindow.removeBrowserView(workspaceManagerView);
  }
  if (workspaceRuntimeView && attached.has(workspaceRuntimeView)) {
    mainWindow.removeBrowserView(workspaceRuntimeView);
  }
};

const attachStackTops = (): void => {
  if (!mainWindow) return;
  if (symphonyView) mainWindow.addBrowserView(symphonyView);
  if (workspaceManagerView) mainWindow.addBrowserView(workspaceManagerView);
  if (workspaceRuntimeView) mainWindow.addBrowserView(workspaceRuntimeView);
  if (overlayView) mainWindow.addBrowserView(overlayView);
};

const destroyToolHosts = (): void => {
  if (!mainWindow) return;
  for (const h of toolHosts) {
    mainWindow.removeBrowserView(h.view);
    toolContext.delete(h.view.webContents.id);
    const wc = h.view.webContents as Electron.WebContents & { destroy?: () => void };
    wc.destroy?.();
  }
  toolHosts.length = 0;
  lastToolBounds.clear();
};

const rebuildToolHosts = (): void => {
  if (!mainWindow || !sidebarView || !symphonyView || !overlayView || !workspaceManagerView) return;

  destroyToolHosts();
  detachStackTops();

  /* Keep sidebar above tool BrowserViews (later addBrowserView = higher stack). */
  if (mainWindow && sidebarView) {
    mainWindow.removeBrowserView(sidebarView);
    mainWindow.addBrowserView(sidebarView);
  }

  attachStackTops();
  updateLayout();
  broadcastShell();
};

const setBoundsIfChanged = (key: string, view: BrowserView, b: ViewBounds): void => {
  const prev = lastToolBounds.get(key);
  if (!isSameBounds(prev ?? null, b)) {
    view.setBounds(b);
    lastToolBounds.set(key, b);
  }
};

const hideAllTools = (): void => {
  const z: ViewBounds = { x: 0, y: 0, width: 0, height: 0 };
  for (const h of toolHosts) {
    setBoundsIfChanged(h.instanceKey, h.view, z);
  }
};

const updateLayout = (): void => {
  if (!mainWindow || !sidebarView || !symphonyView) return;

  const [width, height] = mainWindow.getContentSize();
  const { total: sidebarTotal, colA, colB } = sidebarWidths();

  const nextSidebarBounds: ViewBounds = { x: 0, y: 0, width: sidebarTotal, height };
  if (!isSameBounds(lastSidebarBounds, nextSidebarBounds)) {
    sidebarView.setBounds(nextSidebarBounds);
    lastSidebarBounds = nextSidebarBounds;
  }

  sidebarView.webContents.send("workspace:sidebar-metrics", { colA, colB, showToolRail: showToolRail() });

  const workX = sidebarTotal;
  const workW = width - sidebarTotal;
  const workArea: Rect = { x: workX, y: 0, width: workW, height };

  const hidden: ViewBounds = { x: 0, y: 0, width: 0, height: 0 };

  if (workspaceManagerOpen && workspaceManagerView) {
    hideAllTools();
    symphonyView.setBounds(hidden);
    lastSymphonyBounds = hidden;
    workspaceRuntimeView?.setBounds(hidden);
    workspaceManagerView.setBounds({ x: workX, y: 0, width: workW, height });
    if (overlayView) {
      const ob = overlayView.getBounds();
      if (ob.width > 0 && ob.height > 0) {
        overlayView.setBounds({ x: 0, y: 0, width, height });
      }
    }
    return;
  }

  workspaceManagerView?.setBounds(hidden);

  if (currentMainTab === "symphony") {
    hideAllTools();
    workspaceRuntimeView?.setBounds(hidden);
    const nextSymphonyBounds: ViewBounds = { x: workX, y: 0, width: workW, height };
    if (!isSameBounds(lastSymphonyBounds, nextSymphonyBounds)) {
      symphonyView.setBounds(nextSymphonyBounds);
      lastSymphonyBounds = nextSymphonyBounds;
    }
  } else {
    symphonyView.setBounds(hidden);
    lastSymphonyBounds = hidden;
    hideAllTools();
    workspaceRuntimeView?.setBounds({ x: workX, y: 0, width: workW, height });
  }

  if (overlayView) {
    const ob = overlayView.getBounds();
    if (ob.width > 0 && ob.height > 0) {
      overlayView.setBounds({ x: 0, y: 0, width, height });
    }
  }
};

const sendBrowserEvent = (message: BrowserEventMessage): void => {
  for (const h of toolHosts) {
    if (h.kind === "terminal") {
      h.view.webContents.send("browser:event", message);
    }
  }
};

type ReloadTarget = "panel" | "sidebar" | "symphony" | "overlay" | "workspace";

const RELOAD_DEBOUNCE_MS = 250;

const scheduleReload = (target: ReloadTarget): void => {
  const key = `reload:${target}`;
  const pending = pendingReloadTimers.get(key);
  if (pending) clearTimeout(pending);
  const timer = setTimeout(() => {
    if (target === "panel") {
      for (const h of toolHosts) {
        if (h.kind === "terminal" && !h.view.webContents.isDestroyed()) {
          void h.view.webContents.reloadIgnoringCache();
        }
      }
    }
    if (target === "sidebar" && sidebarView && !sidebarView.webContents.isDestroyed()) {
      void sidebarView.webContents.reloadIgnoringCache();
    }
    if (target === "symphony" && symphonyView && !symphonyView.webContents.isDestroyed()) {
      void symphonyView.webContents.reloadIgnoringCache();
    }
    if (target === "overlay" && overlayView && !overlayView.webContents.isDestroyed()) {
      void overlayView.webContents.reloadIgnoringCache();
    }
    if (
      target === "workspace" &&
      workspaceManagerView &&
      !workspaceManagerView.webContents.isDestroyed()
    ) {
      void workspaceManagerView.webContents.reloadIgnoringCache();
    }
    if (
      target === "workspace" &&
      workspaceRuntimeView &&
      !workspaceRuntimeView.webContents.isDestroyed()
    ) {
      void workspaceRuntimeView.webContents.reloadIgnoringCache();
    }
  }, RELOAD_DEBOUNCE_MS);
  pendingReloadTimers.set(key, timer);
};

const sendSymphonyConfigChanged = (config: SymphonyConfig): void => {
  symphonyView?.webContents.send("symphony:config-changed", config);
};

const sendSymphonyStatusChanged = (status: SymphonyStatus): void => {
  symphonyView?.webContents.send("symphony:status-changed", status);
};

const applySymphonyConfig = (next: SymphonyConfig): SymphonyConfig => {
  state.symphonyConfig = saveSymphonyConfig(projectRoot, next);
  sendSymphonyConfigChanged(state.symphonyConfig);
  return state.symphonyConfig;
};

const setupHotReloadWatchers = (): void => {
  const panelFiles = ["renderer.html", "renderer.css", "renderer.js"];
  const sidebarFiles = ["sidebar.html", "sidebar.css", "sidebar.js"];
  const settingsFiles = ["settings.html", "settings.css", "settingsView.js"];
  const symphonyFiles = ["symphony.html", "symphony.css", "symphonyView.js"];
  const workspaceFiles = [
    "workspace-ui.html",
    "workspace-ui.css",
    "workspace-ui.js",
    "workspace-runtime.html",
    "workspace-runtime.css",
    "workspace-runtime.js"
  ];

  const watchOpts = { interval: 300 };

  for (const fileName of panelFiles) {
    const fullPath = path.join(__dirname, fileName);
    watchedFiles.push(fullPath);
    fs.watchFile(fullPath, watchOpts, () => scheduleReload("panel"));
  }
  for (const fileName of sidebarFiles) {
    const fullPath = path.join(__dirname, fileName);
    watchedFiles.push(fullPath);
    fs.watchFile(fullPath, watchOpts, () => scheduleReload("sidebar"));
  }
  for (const fileName of settingsFiles) {
    const fullPath = path.join(__dirname, fileName);
    watchedFiles.push(fullPath);
    fs.watchFile(fullPath, watchOpts, () => scheduleReload("overlay"));
  }
  for (const fileName of symphonyFiles) {
    const fullPath = path.join(__dirname, fileName);
    watchedFiles.push(fullPath);
    fs.watchFile(fullPath, watchOpts, () => scheduleReload("symphony"));
  }
  for (const fileName of workspaceFiles) {
    const fullPath = path.join(__dirname, fileName);
    watchedFiles.push(fullPath);
    fs.watchFile(fullPath, watchOpts, () => scheduleReload("workspace"));
  }

  try {
    hotReloadDistWatcher = fs.watch(__dirname, (event, filename) => {
      if (!filename) return;
      if (/^renderer\.(html|css|js)$/.test(filename)) scheduleReload("panel");
      else if (/^sidebar\.(html|css|js)$/.test(filename)) scheduleReload("sidebar");
      else if (/^symphony\.(html|css)$/.test(filename) || filename === "symphonyView.js")
        scheduleReload("symphony");
      else if (/^settings\.(html|css)$/.test(filename) || filename === "settingsView.js")
        scheduleReload("overlay");
      else if (
        /^workspace-ui\.(html|css)$/.test(filename) ||
        filename === "workspace-ui.js" ||
        /^workspace-runtime\.(html|css)$/.test(filename) ||
        filename === "workspace-runtime.js"
      )
        scheduleReload("workspace");
    });
  } catch {
    hotReloadDistWatcher = null;
  }
};

const attachBrowserEvents = (view: BrowserView, instanceKey: string): void => {
  view.webContents.on("did-start-loading", () => {
    sendBrowserEvent({
      event: "did-start-loading",
      url: view.webContents.getURL(),
      instanceKey
    });
  });
  view.webContents.on("did-stop-loading", () => {
    sendBrowserEvent({
      event: "did-stop-loading",
      url: view.webContents.getURL(),
      instanceKey
    });
  });
  view.webContents.on("did-navigate", (_event, url) => {
    if (toolHosts.filter((t) => t.kind === "browser").length === 1) {
      state.currentUrl = url;
    }
    sendBrowserEvent({
      event: "did-navigate",
      url,
      instanceKey
    });
  });
};

const openSettingsOverlay = (): void => {
  if (!mainWindow || !overlayView) return;
  detachStackTops();
  attachStackTops();
  const [width, height] = mainWindow.getContentSize();
  overlayView.setBounds({ x: 0, y: 0, width, height });
  overlayView.webContents.send("settings:changed", state.settings);
};

const closeSettingsOverlay = (): void => {
  if (!overlayView) return;
  overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
};

const activateProjectWorkspace = (slug: string): void => {
  if (!projectsIndex.projects.some((project) => project.slug === slug)) return;
  projectsIndex = { ...projectsIndex, activeSlug: slug };
  saveProjectsIndex(projectRoot, projectsIndex);
  workspaceEditingSlug = slug;
  syncActiveProjectTab();
  currentMainTab = "workspace";
  workspaceManagerOpen = false;
  rebuildToolHosts();
};

const openWorkspaceManager = (): void => {
  currentMainTab = "workspace";
  workspaceManagerOpen = true;
  workspaceEditingSlug = projectsIndex.activeSlug ?? projectsIndex.projects[0]?.slug ?? null;
  if (!mainWindow || !workspaceManagerView) return;
  const [width, height] = mainWindow.getContentSize();
  const { total: sidebarTotal } = sidebarWidths();
  const workW = width - sidebarTotal;
  workspaceManagerView.setBounds({ x: sidebarTotal, y: 0, width: workW, height });
  workspaceManagerView.webContents.send("settings:changed", state.settings);
  updateLayout();
  broadcastShell();
};

const closeWorkspaceManager = (): void => {
  if (!projectsIndex.activeSlug) {
    return;
  }
  syncActiveProjectTab();
  workspaceManagerOpen = false;
  workspaceManagerView?.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  rebuildToolHosts();
  broadcastShell();
};

const resolveBrowserViewForAdmin = (): BrowserView | null => {
  const cfg = getActiveWorkspaceConfig();
  if (!cfg) return null;
  let inst = cfg.instances.find((i) => i.kind === "browser");
  if (!inst) return null;
  return toolHosts.find((h) => h.instanceKey === inst!.instanceKey && h.kind === "browser")?.view ?? null;
};

const createWindow = async (): Promise<void> => {
  const panelPreloadPath = path.join(__dirname, "preload.js");
  const sidebarPreloadPath = path.join(__dirname, "sidebarPreload.js");
  const settingsPreloadPath = path.join(__dirname, "settingsPreload.js");
  const symphonyPreloadPath = path.join(__dirname, "symphonyPreload.js");
  const workspacePreloadPath = path.join(__dirname, "workspacePreload.js");
  const workspaceRuntimePreloadPath = path.join(__dirname, "workspaceRuntimePreload.js");
  const sidebarHtmlPath = path.join(__dirname, "sidebar.html");
  const settingsHtmlPath = path.join(__dirname, "settings.html");
  const symphonyHtmlPath = path.join(__dirname, "symphony.html");
  const workspaceHtmlPath = path.join(__dirname, "workspace-ui.html");
  const workspaceRuntimeHtmlPath = path.join(__dirname, "workspace-runtime.html");

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    title: "MIDAS Launcher",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  sidebarView = new BrowserView({
    webPreferences: {
      preload: sidebarPreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  symphonyView = new BrowserView({
    webPreferences: {
      preload: symphonyPreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  overlayView = new BrowserView({
    webPreferences: {
      preload: settingsPreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  workspaceManagerView = new BrowserView({
    webPreferences: {
      preload: workspacePreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  workspaceRuntimeView = new BrowserView({
    webPreferences: {
      preload: workspaceRuntimePreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setBackgroundColor(state.settings.theme === "dark" ? "#1e1e1e" : "#ffffff");
  mainWindow.addBrowserView(sidebarView);
  try {
    sidebarView.setBackgroundColor(state.settings.theme === "dark" ? "#252526" : "#ffffff");
  } catch {
    /* optional API */
  }

  rebuildToolHosts();

  symphonyView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  overlayView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  workspaceManagerView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  workspaceRuntimeView.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  await sidebarView.webContents.loadFile(sidebarHtmlPath);
  await symphonyView.webContents.loadFile(symphonyHtmlPath);
  await overlayView.webContents.loadFile(settingsHtmlPath);
  await workspaceManagerView.webContents.loadFile(workspaceHtmlPath);
  await workspaceRuntimeView.webContents.loadFile(workspaceRuntimeHtmlPath);

  const pushThemeToView = (wc: Electron.WebContents): void => {
    if (!wc.isDestroyed()) wc.send("settings:changed", state.settings);
  };
  sidebarView.webContents.on("did-finish-load", () => pushThemeToView(sidebarView!.webContents));
  symphonyView.webContents.on("did-finish-load", () => pushThemeToView(symphonyView!.webContents));
  overlayView.webContents.on("did-finish-load", () => pushThemeToView(overlayView!.webContents));
  workspaceManagerView.webContents.on("did-finish-load", () =>
    pushThemeToView(workspaceManagerView!.webContents)
  );
  workspaceRuntimeView.webContents.on("did-finish-load", () =>
    pushThemeToView(workspaceRuntimeView!.webContents)
  );

  updateLayout();
  sendSettingsChanged();
  broadcastShell();

  mainWindow.on("resize", () => updateLayout());

  mainWindow.on("closed", () => {
    destroyToolHosts();
    sidebarView = null;
    symphonyView = null;
    overlayView = null;
    workspaceManagerView = null;
    workspaceRuntimeView = null;
    mainWindow = null;
  });
};

ipcMain.handle("settings:get", () => state.settings);

ipcMain.handle("settings:set-theme", (_event, theme: LauncherTheme) => {
  const updated = applySettings({ theme });
  if (mainWindow) {
    mainWindow.setBackgroundColor(updated.theme === "dark" ? "#1e1e1e" : "#ffffff");
  }
  sendSettingsChanged();
  setTimeout(() => sendSettingsChanged(), 100);
  return updated;
});

ipcMain.handle("settings:open-modal", () => openSettingsOverlay());
ipcMain.handle("settings:close-modal", () => closeSettingsOverlay());

ipcMain.handle("layout:set-terminal-height", (_event, height: number) => {
  const sender = _event.sender;
  const ctx = toolContext.get(sender.id);
  if (!ctx || ctx.kind !== "terminal") return;
  stopCollapseAnimation();
  state.previewTerminalHeight = null;
  state.collapseAnimating = false;
  const nextHeight = clamp(height, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT);
  applySettings({ terminalHeight: nextHeight, terminalCollapsed: false });
  updateLayout();
  sendSettingsChanged();
});

ipcMain.handle("layout:set-terminal-collapsed", (_event, collapsed: boolean) => {
  const sender = _event.sender;
  const ctx = toolContext.get(sender.id);
  if (!ctx || ctx.kind !== "terminal") return;
  const currentHeight = currentExpandedTerminalHeight();
  if (collapsed && !state.settings.terminalCollapsed) {
    state.lastExpandedTerminalHeight = currentHeight;
    animateTerminalHeight(currentHeight, COLLAPSED_TERMINAL_HEIGHT, () => {
      applySettings({ terminalCollapsed: true, terminalHeight: currentHeight });
      updateLayout();
      sendSettingsChanged();
    });
    return;
  }
  if (!collapsed && state.settings.terminalCollapsed) {
    const restoreHeight = clamp(state.lastExpandedTerminalHeight, MIN_TERMINAL_HEIGHT, MAX_TERMINAL_HEIGHT);
    applySettings({ terminalCollapsed: false, terminalHeight: restoreHeight });
    animateTerminalHeight(COLLAPSED_TERMINAL_HEIGHT, restoreHeight, () => {
      updateLayout();
      sendSettingsChanged();
    });
  }
});

ipcMain.handle("sidebar:switch-tab", (_event, tab: MainShellTab) => {
  if (launcherMode !== "admin" && tab === "symphony") return;
  currentMainTab = tab;
  lastSidebarBounds = null;
  lastSymphonyBounds = null;
  lastToolBounds.clear();
  updateLayout();
  broadcastShell();
});

ipcMain.handle("workspace:open-manager", () => openWorkspaceManager());
ipcMain.handle("workspace:shell", () => getShellState());
ipcMain.handle("workspace:select-project", (_event, slug: string) => {
  activateProjectWorkspace(slug);
});
ipcMain.handle("workspace:focus-instance", (_event, instanceKey: string) => {
  if (!projectTabRailForSlug(projectsIndex.activeSlug).some((tab) => tab.tabId === instanceKey)) return;
  activeProjectTabId = instanceKey;
  updateLayout();
  broadcastShell();
});

ipcMain.handle("tool:get-context", (event) => toolContext.get(event.sender.id) ?? null);

ipcMain.handle(
  "tool:bridge:send",
  (event, msg: { event: string; payload: Record<string, unknown> }) => {
    const ctx = toolContext.get(event.sender.id);
    if (!ctx || !msg?.event) return;
    const ts = Date.now();
    const slug = ctx.slug;
    for (const h of toolHosts) {
      const c = toolContext.get(h.view.webContents.id);
      if (!c || c.slug !== slug) continue;
      h.view.webContents.send("tool:bridge:event", {
        event: msg.event,
        sourceKey: ctx.instanceKey,
        payload: msg.payload,
        ts
      });
    }
  }
);

ipcMain.handle("workspace-manager:get-state", () => ({
  index: projectsIndex,
  editingSlug: workspaceEditingSlug,
  workspace: workspaceEditingSlug ? loadProjectWorkspace(projectRoot, workspaceEditingSlug) : null,
  layoutTemplates: LAYOUT_OPTIONS,
  defaultRootPath: defaultProjectRootPath(projectRoot)
}));

ipcMain.handle("workspace-manager:select-project", (_event, slug: string) => {
  const rec = projectsIndex.projects.find((p) => p.slug === slug);
  const workspace = loadProjectWorkspace(projectRoot, slug);
  if (!rec || !workspace) throw new Error("project not found");
  workspaceEditingSlug = slug;
  return { record: rec, workspace };
});

ipcMain.handle("workspace-manager:save-index", (_event, index: ProjectsIndexFile) => {
  const activeSlug =
    index.activeSlug && index.projects.some((project) => project.slug === index.activeSlug)
      ? index.activeSlug
      : index.projects[0]?.slug ?? null;
  projectsIndex = {
    ...index,
    activeSlug
  };
  syncActiveProjectTab();
  saveProjectsIndex(projectRoot, projectsIndex);
  broadcastShell();
  updateLayout();
});

ipcMain.handle("workspace-manager:save-workspace", (_event, slug: string, config: ProjectWorkspaceConfig) => {
  saveProjectWorkspace(projectRoot, slug, config);
  if (projectsIndex.activeSlug === slug) broadcastShell();
});

ipcMain.handle(
  "workspace-manager:create-project",
  (_event, input: { name: string; rootPath: string }) => {
    const base = slugifyName(input.name);
    const slug = uniqueSlug(projectRoot, base);
    const t = new Date().toISOString();
    const rec = {
      slug,
      name: input.name.trim() || slug,
      rootPath: input.rootPath.trim() || defaultProjectRootPath(projectRoot),
      createdAt: t,
      updatedAt: t
    };
    projectsIndex = { ...projectsIndex, projects: [...projectsIndex.projects, rec] };
    saveProjectsIndex(projectRoot, projectsIndex);
    const cfg = alignCellAssignmentsToTemplate(defaultWorkspaceConfig());
    saveProjectWorkspace(projectRoot, slug, cfg);
    workspaceEditingSlug = slug;
    workspaceManagerOpen = true;
    projectsIndex = { ...projectsIndex, activeSlug: slug };
    syncActiveProjectTab();
    saveProjectsIndex(projectRoot, projectsIndex);
    rebuildToolHosts();
    broadcastShell();
    return rec;
  }
);

ipcMain.handle("workspace-manager:open-project", (_event, slug: string) => {
  activateProjectWorkspace(slug);
});

ipcMain.handle("workspace-manager:delete-project", (_event, slug: string) => {
  projectsIndex = {
    ...projectsIndex,
    projects: projectsIndex.projects.filter((p) => p.slug !== slug)
  };
  if (projectsIndex.activeSlug === slug) {
    projectsIndex = { ...projectsIndex, activeSlug: projectsIndex.projects[0]?.slug ?? null };
  }
  if (workspaceEditingSlug === slug) {
    workspaceEditingSlug = projectsIndex.projects[0]?.slug ?? null;
  }
  syncActiveProjectTab();
  saveProjectsIndex(projectRoot, projectsIndex);
  try {
    fs.unlinkSync(projectWorkspacePath(projectRoot, slug));
  } catch {
    /* ignore */
  }
  rebuildToolHosts();
  broadcastShell();
});

ipcMain.handle("workspace-manager:close", () => closeWorkspaceManager());

ipcMain.handle("launcher:get-runtime", () => ({ mode: launcherMode }));

ipcMain.handle("launcher:get-diagnostics", () => {
  if (launcherMode !== "admin") return null;
  const v = resolveBrowserViewForAdmin();
  return {
    mode: launcherMode,
    browserUrl: v?.webContents.getURL() ?? ""
  };
});

const requireAdminSymphony = (): boolean => launcherMode === "admin";

ipcMain.handle("symphony:get-config", () => state.symphonyConfig);
ipcMain.handle("symphony:get-status", () => symphonyStatus);

ipcMain.handle(
  "symphony:add-skill",
  (_event, skill: { name: string; path: string; description: string }) => {
    if (!requireAdminSymphony()) return state.symphonyConfig;
    const next: SymphonyConfig = {
      ...state.symphonyConfig,
      skills: [
        ...state.symphonyConfig.skills,
        { id: generateId(), name: skill.name, path: skill.path, description: skill.description, enabled: true }
      ]
    };
    return applySymphonyConfig(next);
  }
);

ipcMain.handle("symphony:remove-skill", (_event, id: string) => {
  if (!requireAdminSymphony()) return state.symphonyConfig;
  const next: SymphonyConfig = {
    ...state.symphonyConfig,
    skills: state.symphonyConfig.skills.filter((s) => s.id !== id)
  };
  return applySymphonyConfig(next);
});

ipcMain.handle("symphony:toggle-skill", (_event, id: string) => {
  if (!requireAdminSymphony()) return state.symphonyConfig;
  const next: SymphonyConfig = {
    ...state.symphonyConfig,
    skills: state.symphonyConfig.skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
  };
  return applySymphonyConfig(next);
});

ipcMain.handle(
  "symphony:add-mcp-server",
  (_event, server: { name: string; command: string; args: string[] }) => {
    if (!requireAdminSymphony()) return state.symphonyConfig;
    const next: SymphonyConfig = {
      ...state.symphonyConfig,
      mcpServers: [
        ...state.symphonyConfig.mcpServers,
        { id: generateId(), name: server.name, command: server.command, args: server.args, enabled: true }
      ]
    };
    return applySymphonyConfig(next);
  }
);

ipcMain.handle("symphony:remove-mcp-server", (_event, id: string) => {
  if (!requireAdminSymphony()) return state.symphonyConfig;
  const next: SymphonyConfig = {
    ...state.symphonyConfig,
    mcpServers: state.symphonyConfig.mcpServers.filter((s) => s.id !== id)
  };
  return applySymphonyConfig(next);
});

ipcMain.handle("symphony:toggle-mcp-server", (_event, id: string) => {
  if (!requireAdminSymphony()) return state.symphonyConfig;
  const next: SymphonyConfig = {
    ...state.symphonyConfig,
    mcpServers: state.symphonyConfig.mcpServers.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    )
  };
  return applySymphonyConfig(next);
});

ipcMain.handle(
  "symphony:update-cli-settings",
  (_event, settings: { cliPort: number; autoStart: boolean }) => {
    if (!requireAdminSymphony()) return state.symphonyConfig;
    const next: SymphonyConfig = {
      ...state.symphonyConfig,
      cliPort: settings.cliPort,
      autoStart: settings.autoStart
    };
    return applySymphonyConfig(next);
  }
);

ipcMain.handle("symphony:start", () => {
  if (!requireAdminSymphony()) return;
  symphonyStatus = "running";
  sendSymphonyStatusChanged(symphonyStatus);
});

ipcMain.handle("symphony:stop", () => {
  if (!requireAdminSymphony()) return;
  symphonyStatus = "stopped";
  sendSymphonyStatusChanged(symphonyStatus);
});

ipcMain.handle("browser:navigate", async (_event, url: string) => {
  if (launcherMode !== "admin") return;
  const v = resolveBrowserViewForAdmin();
  if (!v) return;
  await v.webContents.loadURL(url);
});

ipcMain.handle("browser:inject-css", async (_event, css: string) => {
  if (launcherMode !== "admin") return;
  const v = resolveBrowserViewForAdmin();
  if (!v) return;
  await v.webContents.insertCSS(css, { cssOrigin: "author" });
});

ipcMain.handle("browser:execute-script", async (_event, script: string) => {
  if (launcherMode !== "admin") return;
  const v = resolveBrowserViewForAdmin();
  if (!v) return;
  await v.webContents.executeJavaScript(script);
});

ipcMain.handle("terminal:run-command", async (event, commandLine: string) => {
  if (launcherMode !== "admin") return;
  const ctx = toolContext.get(event.sender.id);
  const target =
    ctx?.kind === "terminal"
      ? toolHosts.find((h) => h.instanceKey === ctx.instanceKey && h.kind === "terminal")?.view
      : toolHosts.find((h) => h.kind === "terminal")?.view;
  if (!target) return;
  const line = commandLine.trim();
  if (!line) return;
  target.webContents.send("terminal:event", {
    type: "stdout",
    data: `[launcher] ${line}\n`
  } satisfies TerminalEventMessage);
});

app.whenReady().then(async () => {
  projectsIndex = ensureWorkspaceBootstrap(projectRoot);
  workspaceEditingSlug = projectsIndex.activeSlug ?? projectsIndex.projects[0]?.slug ?? null;
  syncActiveProjectTab();
  if (!state.settings) state.settings = defaultSettings();
  if (!state.symphonyConfig) state.symphonyConfig = defaultSymphonyConfig();
  state.lastExpandedTerminalHeight = clamp(
    state.settings.terminalHeight,
    MIN_TERMINAL_HEIGHT,
    MAX_TERMINAL_HEIGHT
  );
  await createWindow();
  setupHotReloadWatchers();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopCollapseAnimation();
  hotReloadDistWatcher?.close();
  hotReloadDistWatcher = null;
  for (const file of watchedFiles) fs.unwatchFile(file);
  for (const timer of pendingReloadTimers.values()) clearTimeout(timer);
  pendingReloadTimers.clear();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
