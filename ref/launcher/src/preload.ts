import { contextBridge, ipcRenderer } from "electron";
import type {
  BrowserEventMessage,
  LauncherApi,
  LauncherRuntime,
  LauncherSettings,
  LauncherTheme,
  TerminalEventMessage,
  ToolBridgeEventMessage
} from "./shared.js";

const api: LauncherApi = {
  getRuntime: async () => (await ipcRenderer.invoke("launcher:get-runtime")) as LauncherRuntime,
  navigate: async (url: string) => {
    await ipcRenderer.invoke("browser:navigate", url);
  },
  setTerminalHeight: async (height: number) => {
    await ipcRenderer.invoke("layout:set-terminal-height", height);
  },
  setTerminalCollapsed: async (collapsed: boolean) => {
    await ipcRenderer.invoke("layout:set-terminal-collapsed", collapsed);
  },
  runTerminalCommand: async (commandLine: string) => {
    await ipcRenderer.invoke("terminal:run-command", commandLine);
  },
  injectBrowserCss: async (css: string) => {
    await ipcRenderer.invoke("browser:inject-css", css);
  },
  executeBrowserScript: async (script: string) => {
    await ipcRenderer.invoke("browser:execute-script", script);
  },
  sendBridgeEvent: async (eventName: string, payload: Record<string, unknown>) => {
    await ipcRenderer.invoke("tool:bridge:send", { event: eventName, payload });
  },
  onBridgeEvent: (listener: (message: ToolBridgeEventMessage) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, message: ToolBridgeEventMessage) => {
      listener(message);
    };
    ipcRenderer.on("tool:bridge:event", wrapped);
    return () => {
      ipcRenderer.off("tool:bridge:event", wrapped);
    };
  },
  getSettings: async () => (await ipcRenderer.invoke("settings:get")) as LauncherSettings,
  setTheme: async (theme: LauncherTheme) =>
    (await ipcRenderer.invoke("settings:set-theme", theme)) as LauncherSettings,
  onSettingsChanged: (listener: (settings: LauncherSettings) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, settings: LauncherSettings) => {
      listener(settings);
    };
    ipcRenderer.on("settings:changed", wrapped);
    return () => {
      ipcRenderer.off("settings:changed", wrapped);
    };
  },
  onBrowserEvent: (listener: (message: BrowserEventMessage) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, message: BrowserEventMessage) => {
      listener(message);
    };
    ipcRenderer.on("browser:event", wrapped);
    return () => {
      ipcRenderer.off("browser:event", wrapped);
    };
  },
  onTerminalEvent: (listener: (message: TerminalEventMessage) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, message: TerminalEventMessage) => {
      listener(message);
    };
    ipcRenderer.on("terminal:event", wrapped);
    return () => {
      ipcRenderer.off("terminal:event", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("launcherApi", api);
