import { contextBridge, ipcRenderer } from "electron";
import type { LauncherSettings, SymphonyApi, SymphonyConfig, SymphonyStatus } from "./shared.js";

const api: SymphonyApi = {
  getSettings: async () => (await ipcRenderer.invoke("settings:get")) as LauncherSettings,
  onSettingsChanged: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, settings: LauncherSettings) => listener(settings);
    ipcRenderer.on("settings:changed", wrapped);
    return () => ipcRenderer.off("settings:changed", wrapped);
  },

  getConfig: async () => (await ipcRenderer.invoke("symphony:get-config")) as SymphonyConfig,

  addSkill: async (skill) =>
    (await ipcRenderer.invoke("symphony:add-skill", skill)) as SymphonyConfig,

  removeSkill: async (id) =>
    (await ipcRenderer.invoke("symphony:remove-skill", id)) as SymphonyConfig,

  toggleSkill: async (id) =>
    (await ipcRenderer.invoke("symphony:toggle-skill", id)) as SymphonyConfig,

  addMcpServer: async (server) =>
    (await ipcRenderer.invoke("symphony:add-mcp-server", server)) as SymphonyConfig,

  removeMcpServer: async (id) =>
    (await ipcRenderer.invoke("symphony:remove-mcp-server", id)) as SymphonyConfig,

  toggleMcpServer: async (id) =>
    (await ipcRenderer.invoke("symphony:toggle-mcp-server", id)) as SymphonyConfig,

  updateCliSettings: async (settings) =>
    (await ipcRenderer.invoke("symphony:update-cli-settings", settings)) as SymphonyConfig,

  getStatus: async () => (await ipcRenderer.invoke("symphony:get-status")) as SymphonyStatus,

  start: async () => {
    await ipcRenderer.invoke("symphony:start");
  },

  stop: async () => {
    await ipcRenderer.invoke("symphony:stop");
  },

  onStatusChanged: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, status: SymphonyStatus) => listener(status);
    ipcRenderer.on("symphony:status-changed", wrapped);
    return () => ipcRenderer.off("symphony:status-changed", wrapped);
  },

  onConfigChanged: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, config: SymphonyConfig) => listener(config);
    ipcRenderer.on("symphony:config-changed", wrapped);
    return () => ipcRenderer.off("symphony:config-changed", wrapped);
  }
};

contextBridge.exposeInMainWorld("symphonyApi", api);
