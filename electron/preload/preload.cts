import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clibaseDesktop", {
  isElectron: true,
  platform: process.platform,
  ping: async () => ipcRenderer.invoke("clibase:ping"),
  getWorkspaceState: async () => ipcRenderer.invoke("clibase:workspace-state"),
  getBrowserState: async (browserKey?: string) =>
    ipcRenderer.invoke("clibase:browser:get-state", browserKey),
  navigateBrowser: async (url: string, browserKey?: string) =>
    ipcRenderer.invoke("clibase:browser:navigate", url, browserKey),
  goBackBrowser: async (browserKey?: string) =>
    ipcRenderer.invoke("clibase:browser:back", browserKey),
  goForwardBrowser: async (browserKey?: string) =>
    ipcRenderer.invoke("clibase:browser:forward", browserKey),
  reloadBrowser: async (browserKey?: string) =>
    ipcRenderer.invoke("clibase:browser:reload", browserKey),
  setBrowserHostBounds: async (
    bounds:
      | {
          x: number;
          y: number;
          width: number;
          height: number;
        }
      | null,
  ) => ipcRenderer.invoke("clibase:browser:set-host-bounds", bounds),
  pushBrowserHostBounds: (
    bounds:
      | {
          x: number;
          y: number;
          width: number;
          height: number;
        }
      | null,
  ) => {
    ipcRenderer.send("clibase:browser:push-host-bounds", bounds);
  },
  activateTab: async (tabKey: string) => ipcRenderer.invoke("clibase:tab:activate", tabKey),
  activateNextTab: async () => ipcRenderer.invoke("clibase:tab:next"),
  activatePreviousTab: async () => ipcRenderer.invoke("clibase:tab:previous"),
  detachTab: async (tabKey?: string) => ipcRenderer.invoke("clibase:tab:detach", tabKey),
  redockTab: async (tabKey?: string) => ipcRenderer.invoke("clibase:tab:redock", tabKey),
  reorderTabs: async (tabKeys: string[]) => ipcRenderer.invoke("clibase:tab:reorder", tabKeys),
  updateWindowLayoutState: async (partialLayoutState: unknown) =>
    ipcRenderer.invoke("clibase:layout:update-window-state", partialLayoutState),
  createTerminal: async (terminalKey?: string) =>
    ipcRenderer.invoke("clibase:terminal:create", terminalKey),
  getTerminalState: async (terminalKey?: string) =>
    ipcRenderer.invoke("clibase:terminal:get-state", terminalKey),
  writeTerminal: async (
    terminalKey: string | undefined,
    text: string,
    appendNewline = true,
  ) => ipcRenderer.invoke("clibase:terminal:write", terminalKey, text, appendNewline),
  resizeTerminal: async (
    terminalKey: string | undefined,
    cols: number,
    rows: number,
  ) => ipcRenderer.invoke("clibase:terminal:resize", terminalKey, cols, rows),
  getTerminalLogsTail: async (terminalKey?: string, limit = 80) =>
    ipcRenderer.invoke("clibase:terminal:logs-tail", terminalKey, limit),
  getUiaRegistry: async () => ipcRenderer.invoke("clibase:uia:get-registry"),
  saveUiaTarget: async (payload: {
    target_key: string;
    target_name: string;
    exe_path: string;
    args: string[];
    working_dir: string;
    startup_wait_ms: number;
    host_reference_frame?: {
      width_px: number;
      height_px: number;
      coordinate_space?: string;
      placement_mode?: string;
    } | null;
  }) => ipcRenderer.invoke("clibase:uia:save-target", payload),
  launchUiaTarget: async (
    targetKey: string,
    overrides?: {
      exe_path?: string;
      args?: string[];
      working_dir?: string;
      startup_wait_ms?: number;
    },
  ) => ipcRenderer.invoke("clibase:uia:launch-target", targetKey, overrides),
  stopUiaTarget: async (targetKey: string) =>
    ipcRenderer.invoke("clibase:uia:stop-target", targetKey),
  getUiaTargetState: async (targetKey: string) =>
    ipcRenderer.invoke("clibase:uia:get-target-state", targetKey),
  saveUiaMacro: async (payload: {
    macro_key: string;
    macro_name: string;
    target_key: string;
    description: string;
    shared_tags: string[];
    steps?: unknown[];
    steps_yaml?: string;
  }) => ipcRenderer.invoke("clibase:uia:save-macro", payload),
  listUiaMacros: async (targetKey?: string) =>
    ipcRenderer.invoke("clibase:uia:list-macros", targetKey),
  deleteUiaMacro: async (macroKey: string) =>
    ipcRenderer.invoke("clibase:uia:delete-macro", macroKey),
  runUiaMacro: async (payload: {
    macro_key: string;
    target_key?: string;
    ensure_target_running: boolean;
  }) => ipcRenderer.invoke("clibase:uia:run-macro", payload),
  updateUiaAdapter: async (payload: {
    executable_path: string;
    default_timeout_ms: number;
    python_executable?: string;
    provider_key?: string;
  }) => ipcRenderer.invoke("clibase:uia:update-adapter", payload),
  startUiaRecording: async () => ipcRenderer.invoke("clibase:uia:recording-start"),
  stopUiaRecording: async () => ipcRenderer.invoke("clibase:uia:recording-stop"),
  getUiaRecordingState: async () => ipcRenderer.invoke("clibase:uia:recording-state"),
  getUiaRuntimeStatus: async () => ipcRenderer.invoke("clibase:uia:runtime-status"),
  getUiaHttpPing: async () => ipcRenderer.invoke("clibase:uia:http-ping"),
  onUiaRecordingEvent: (listener: (entry: unknown) => void) => {
    const wrapped = (_event: unknown, entry: unknown) => {
      listener(entry);
    };

    ipcRenderer.on("clibase:uia:recording-event", wrapped);
    return () => {
      ipcRenderer.removeListener("clibase:uia:recording-event", wrapped);
    };
  },
  onTerminalOutput: (listener: (entry: unknown) => void) => {
    const wrapped = (_event: unknown, entry: unknown) => {
      listener(entry);
    };

    ipcRenderer.on("clibase:terminal-output", wrapped);
    return () => {
      ipcRenderer.removeListener("clibase:terminal-output", wrapped);
    };
  },
  onTerminalState: (listener: (state: unknown) => void) => {
    const wrapped = (_event: unknown, state: unknown) => {
      listener(state);
    };

    ipcRenderer.on("clibase:terminal-state", wrapped);
    return () => {
      ipcRenderer.removeListener("clibase:terminal-state", wrapped);
    };
  },
  onWorkspaceStateUpdated: (listener: (state: unknown) => void) => {
    const wrapped = (_event: unknown, state: unknown) => {
      listener(state);
    };

    ipcRenderer.on("clibase:workspace-state-updated", wrapped);
    return () => {
      ipcRenderer.removeListener("clibase:workspace-state-updated", wrapped);
    };
  },
});
