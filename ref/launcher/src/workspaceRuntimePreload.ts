import { contextBridge, ipcRenderer } from "electron";
import type { LauncherSettings, WorkspaceShellState } from "./shared.js";

export type WorkspaceRuntimeApi = {
  getSettings: () => Promise<LauncherSettings>;
  onSettingsChanged: (listener: (settings: LauncherSettings) => void) => () => void;
  getWorkspaceShell: () => Promise<WorkspaceShellState>;
  onWorkspaceShellChanged: (listener: (state: WorkspaceShellState) => void) => () => void;
};

const api: WorkspaceRuntimeApi = {
  getSettings: async () => (await ipcRenderer.invoke("settings:get")) as LauncherSettings,
  onSettingsChanged: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, settings: LauncherSettings) => listener(settings);
    ipcRenderer.on("settings:changed", wrapped);
    return () => ipcRenderer.off("settings:changed", wrapped);
  },
  getWorkspaceShell: async () => (await ipcRenderer.invoke("workspace:shell")) as WorkspaceShellState,
  onWorkspaceShellChanged: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, state: WorkspaceShellState) => listener(state);
    ipcRenderer.on("workspace:shell-changed", wrapped);
    return () => ipcRenderer.off("workspace:shell-changed", wrapped);
  }
};

contextBridge.exposeInMainWorld("workspaceRuntimeApi", api);
