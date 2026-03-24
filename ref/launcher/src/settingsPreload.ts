import { contextBridge, ipcRenderer } from "electron";
import type {
  LauncherDiagnostics,
  LauncherRuntime,
  LauncherSettings,
  LauncherTheme,
  SettingsApi
} from "./shared.js";

const api: SettingsApi = {
  getRuntime: async () => (await ipcRenderer.invoke("launcher:get-runtime")) as LauncherRuntime,
  getDiagnostics: async () => (await ipcRenderer.invoke("launcher:get-diagnostics")) as LauncherDiagnostics | null,
  getSettings: async () => (await ipcRenderer.invoke("settings:get")) as LauncherSettings,
  setTheme: async (theme: LauncherTheme) =>
    (await ipcRenderer.invoke("settings:set-theme", theme)) as LauncherSettings,
  close: async () => {
    await ipcRenderer.invoke("settings:close-modal");
  },
  onSettingsChanged: (listener: (settings: LauncherSettings) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, settings: LauncherSettings) => {
      listener(settings);
    };
    ipcRenderer.on("settings:changed", wrapped);
    return () => {
      ipcRenderer.off("settings:changed", wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("settingsApi", api);
