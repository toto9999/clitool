import { contextBridge, ipcRenderer } from "electron";
import type {
  LauncherRuntime,
  LauncherSettings,
  MainShellTab,
  SidebarApi,
  SidebarMetrics,
  WorkspaceShellState
} from "./shared.js";

const api: SidebarApi = {
  openSettings: async () => {
    await ipcRenderer.invoke("settings:open-modal");
  },
  openWorkspaceManager: async () => {
    await ipcRenderer.invoke("workspace:open-manager");
  },
  switchTab: async (tab: MainShellTab) => {
    await ipcRenderer.invoke("sidebar:switch-tab", tab);
  },
  getWorkspaceShell: async () => (await ipcRenderer.invoke("workspace:shell")) as WorkspaceShellState,
  selectProject: async (slug: string) => {
    await ipcRenderer.invoke("workspace:select-project", slug);
  },
  selectProjectTab: async (tabId: string) => {
    await ipcRenderer.invoke("workspace:focus-instance", tabId);
  },
  getRuntime: async () => (await ipcRenderer.invoke("launcher:get-runtime")) as LauncherRuntime,
  getSettings: async () => (await ipcRenderer.invoke("settings:get")) as LauncherSettings,
  onSettingsChanged: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, settings: LauncherSettings) => listener(settings);
    ipcRenderer.on("settings:changed", wrapped);
    return () => ipcRenderer.off("settings:changed", wrapped);
  },
  onWorkspaceShellChanged: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, state: WorkspaceShellState) => listener(state);
    ipcRenderer.on("workspace:shell-changed", wrapped);
    return () => ipcRenderer.off("workspace:shell-changed", wrapped);
  },
  onSidebarMetrics: (listener: (m: SidebarMetrics) => void) => {
    const wrapped = (_: Electron.IpcRendererEvent, m: SidebarMetrics) => listener(m);
    ipcRenderer.on("workspace:sidebar-metrics", wrapped);
    return () => ipcRenderer.off("workspace:sidebar-metrics", wrapped);
  }
};

contextBridge.exposeInMainWorld("sidebarApi", api);
