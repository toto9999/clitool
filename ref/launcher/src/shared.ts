export type BrowserEventName =
  | "did-start-loading"
  | "did-stop-loading"
  | "did-navigate"
  | "page-title-updated";

export type BrowserEventMessage = {
  event: BrowserEventName;
  url: string;
  title?: string;
  /** Source browser tool instance when multiple browsers exist */
  instanceKey?: string;
};

export type TerminalEventMessage =
  | {
      type: "stdout";
      data: string;
    }
  | {
      type: "stderr";
      data: string;
    }
  | {
      type: "exit";
      code: number;
    };

export type LauncherBridgePayload = {
  event: string;
  payload: Record<string, unknown>;
};

export type LauncherTheme = "dark" | "light";

export type LauncherMode = "admin" | "user";

export type LauncherRuntime = {
  mode: LauncherMode;
};

export type LauncherDiagnostics = {
  mode: LauncherMode;
  browserUrl: string;
};

export type ToolBridgeEventMessage = {
  event: string;
  sourceKey: string;
  payload: Record<string, unknown>;
  ts: number;
};

/** Left shell mode. workspace = project tools; symphony = admin agent settings. */
export type MainShellTab = "workspace" | "symphony";

export type SkillConfig = {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  description: string;
};

export type McpServerConfig = {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
};

export type SymphonyStatus = "stopped" | "starting" | "running" | "error";

export type SymphonyConfig = {
  skills: SkillConfig[];
  mcpServers: McpServerConfig[];
  cliPort: number;
  autoStart: boolean;
};

export type SymphonyApi = {
  getSettings: () => Promise<LauncherSettings>;
  onSettingsChanged: (listener: (settings: LauncherSettings) => void) => () => void;
  getConfig: () => Promise<SymphonyConfig>;
  addSkill: (skill: { name: string; path: string; description: string }) => Promise<SymphonyConfig>;
  removeSkill: (id: string) => Promise<SymphonyConfig>;
  toggleSkill: (id: string) => Promise<SymphonyConfig>;
  addMcpServer: (server: { name: string; command: string; args: string[] }) => Promise<SymphonyConfig>;
  removeMcpServer: (id: string) => Promise<SymphonyConfig>;
  toggleMcpServer: (id: string) => Promise<SymphonyConfig>;
  updateCliSettings: (settings: { cliPort: number; autoStart: boolean }) => Promise<SymphonyConfig>;
  getStatus: () => Promise<SymphonyStatus>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  onStatusChanged: (listener: (status: SymphonyStatus) => void) => () => void;
  onConfigChanged: (listener: (config: SymphonyConfig) => void) => () => void;
};

export type ToolKindId = "browser" | "terminal";

export type SidebarMetrics = {
  colA: number;
  colB: number;
  showToolRail: boolean;
};

export type WorkspaceShellState = {
  managerOpen: boolean;
  mainTab: MainShellTab;
  showToolRail: boolean;
  sidebarMetrics: SidebarMetrics;
  projects: { slug: string; name: string }[];
  activeSlug: string | null;
  activeProjectName: string | null;
  projectTabRail: { tabId: string; label: string }[];
  activeTabId: string | null;
};

export type LauncherSettings = {
  theme: LauncherTheme;
  terminalHeight: number;
  terminalCollapsed: boolean;
  sidebarWidth: number;
};

export type LauncherApi = {
  getRuntime: () => Promise<LauncherRuntime>;
  navigate: (url: string) => Promise<void>;
  setTerminalHeight: (height: number) => Promise<void>;
  setTerminalCollapsed: (collapsed: boolean) => Promise<void>;
  runTerminalCommand: (commandLine: string) => Promise<void>;
  injectBrowserCss: (css: string) => Promise<void>;
  executeBrowserScript: (script: string) => Promise<void>;
  sendBridgeEvent: (eventName: string, payload: Record<string, unknown>) => Promise<void>;
  onBridgeEvent: (listener: (message: ToolBridgeEventMessage) => void) => () => void;
  getSettings: () => Promise<LauncherSettings>;
  setTheme: (theme: LauncherTheme) => Promise<LauncherSettings>;
  onSettingsChanged: (listener: (settings: LauncherSettings) => void) => () => void;
  onBrowserEvent: (listener: (message: BrowserEventMessage) => void) => () => void;
  onTerminalEvent: (listener: (message: TerminalEventMessage) => void) => () => void;
};

export type SidebarApi = {
  openSettings: () => Promise<void>;
  openWorkspaceManager: () => Promise<void>;
  switchTab: (tab: MainShellTab) => Promise<void>;
  getWorkspaceShell: () => Promise<WorkspaceShellState>;
  selectProject: (slug: string) => Promise<void>;
  selectProjectTab: (tabId: string) => Promise<void>;
  getRuntime: () => Promise<LauncherRuntime>;
  getSettings: () => Promise<LauncherSettings>;
  onSettingsChanged: (listener: (settings: LauncherSettings) => void) => () => void;
  onWorkspaceShellChanged: (listener: (state: WorkspaceShellState) => void) => () => void;
  onSidebarMetrics: (listener: (m: SidebarMetrics) => void) => () => void;
};

export type SettingsApi = {
  getRuntime: () => Promise<LauncherRuntime>;
  getDiagnostics: () => Promise<LauncherDiagnostics | null>;
  getSettings: () => Promise<LauncherSettings>;
  setTheme: (theme: LauncherTheme) => Promise<LauncherSettings>;
  close: () => Promise<void>;
  onSettingsChanged: (listener: (settings: LauncherSettings) => void) => () => void;
};

declare global {
  interface Window {
    launcherApi?: LauncherApi;
    sidebarApi?: SidebarApi;
    settingsApi?: SettingsApi;
    symphonyApi?: SymphonyApi;
  }
}
