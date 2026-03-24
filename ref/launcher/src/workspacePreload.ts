import { contextBridge, ipcRenderer } from "electron";
import type { ProjectRecord, ProjectWorkspaceConfig, ProjectsIndexFile } from "./workspace-model.js";

export type WorkspaceManagerApi = {
  getState: () => Promise<{
    index: ProjectsIndexFile;
    editingSlug: string | null;
    workspace: ProjectWorkspaceConfig | null;
    layoutTemplates: string[];
    defaultRootPath: string;
  }>;
  selectProject: (slug: string) => Promise<{ record: ProjectRecord; workspace: ProjectWorkspaceConfig }>;
  saveIndex: (index: ProjectsIndexFile) => Promise<void>;
  saveWorkspace: (slug: string, config: ProjectWorkspaceConfig) => Promise<void>;
  createProject: (input: { name: string; rootPath: string }) => Promise<ProjectRecord>;
  deleteProject: (slug: string) => Promise<void>;
  openProject: (slug: string) => Promise<void>;
  close: () => Promise<void>;
  onTheme: (listener: (theme: "dark" | "light") => void) => () => void;
};

const api: WorkspaceManagerApi = {
  getState: async () => (await ipcRenderer.invoke("workspace-manager:get-state")) as Awaited<
    ReturnType<WorkspaceManagerApi["getState"]>
  >,
  selectProject: async (slug) =>
    (await ipcRenderer.invoke("workspace-manager:select-project", slug)) as {
      record: ProjectRecord;
      workspace: ProjectWorkspaceConfig;
    },
  saveIndex: async (index) => {
    await ipcRenderer.invoke("workspace-manager:save-index", index);
  },
  saveWorkspace: async (slug, config) => {
    await ipcRenderer.invoke("workspace-manager:save-workspace", slug, config);
  },
  createProject: async (input) =>
    (await ipcRenderer.invoke("workspace-manager:create-project", input)) as ProjectRecord,
  deleteProject: async (slug) => {
    await ipcRenderer.invoke("workspace-manager:delete-project", slug);
  },
  openProject: async (slug) => {
    await ipcRenderer.invoke("workspace-manager:open-project", slug);
  },
  close: async () => {
    await ipcRenderer.invoke("workspace-manager:close");
  },
  onTheme: (listener) => {
    const wrapped = (_: Electron.IpcRendererEvent, settings: { theme: string }) => {
      if (settings.theme === "dark" || settings.theme === "light") {
        listener(settings.theme);
      }
    };
    ipcRenderer.on("settings:changed", wrapped);
    return () => ipcRenderer.off("settings:changed", wrapped);
  }
};

contextBridge.exposeInMainWorld("workspaceManagerApi", api);
