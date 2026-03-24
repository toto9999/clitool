import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { createBrowserSurface } from "../host-services/browser/browser-surface.cjs";
import { createRuntimeControlServer } from "../host-services/runtime-control/runtime-control-server.cjs";
import { recordRuntimeLog } from "../host-services/runtime-control/runtime-logging.cjs";

const rendererDevUrl = "http://127.0.0.1:5173";
const isDevelopment = !app.isPackaged;
const shouldOpenDevtools = process.env.CLIBASE_OPEN_DEVTOOLS === "1";
let mainWindow: BrowserWindow | null = null;
let runtimeControlServer: ReturnType<typeof createRuntimeControlServer> | null = null;
let browserSurface: ReturnType<typeof createBrowserSurface> | null = null;

function getPreloadPath() {
  return path.join(__dirname, "../preload/preload.cjs");
}

function getRendererPath() {
  return path.join(__dirname, "../../dist/index.html");
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#08111d",
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  recordRuntimeLog("info", "main window created", {
    app_mode: isDevelopment ? "development" : "production",
  });

  browserSurface = createBrowserSurface(mainWindow);
  recordRuntimeLog("info", "browser surface attached", {
    browser_key: browserSurface.browserKey,
  });

  mainWindow.on("closed", () => {
    recordRuntimeLog("info", "main window closed");
    browserSurface = null;
    mainWindow = null;
  });

  if (isDevelopment) {
    await mainWindow.loadURL(rendererDevUrl);
    if (shouldOpenDevtools) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
    return mainWindow;
  }

  await mainWindow.loadFile(getRendererPath());
  return mainWindow;
}

app.whenReady().then(async () => {
  recordRuntimeLog("info", "electron app ready", {
    app_mode: isDevelopment ? "development" : "production",
  });

  ipcMain.handle("clibase:ping", async () => {
    return {
      appMode: isDevelopment ? "development" : "production",
      platform: process.platform,
      timestamp: new Date().toISOString(),
    };
  });

  runtimeControlServer = createRuntimeControlServer({
    appMode: isDevelopment ? "development" : "production",
    getMainWindow: () => mainWindow,
    getBrowserSurface: () => browserSurface,
  });

  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (runtimeControlServer) {
    void runtimeControlServer.closeServer();
  }
});
