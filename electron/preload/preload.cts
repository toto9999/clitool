import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("clibaseDesktop", {
  isElectron: true,
  platform: process.platform,
  ping: async () => ipcRenderer.invoke("clibase:ping"),
});
