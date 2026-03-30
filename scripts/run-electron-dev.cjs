const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = process.cwd();
const rendererHost = "127.0.0.1";
const rendererPort = 5173;
const electronMainPath = path.join(repoRoot, "dist-electron", "main", "main.cjs");
const electronPreloadPath = path.join(repoRoot, "dist-electron", "preload", "preload.cjs");
const electronSourceRoot = path.join(repoRoot, "electron");
const launchScriptPath = path.join(repoRoot, "scripts", "launch-electron-dev.cjs");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRendererReady(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function getFileMtimeMs(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.isFile() ? stats.mtimeMs : 0;
  } catch {
    return 0;
  }
}

function getLatestSourceMtimeMs(dirPath) {
  let latest = 0;

  const visit = (targetPath) => {
    let entries;
    try {
      entries = fs.readdirSync(targetPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist-electron") {
        continue;
      }

      const fullPath = path.join(targetPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!/\.(ts|cts|mts)$/.test(entry.name)) {
        continue;
      }

      const mtimeMs = getFileMtimeMs(fullPath);
      if (mtimeMs > latest) {
        latest = mtimeMs;
      }
    }
  };

  visit(dirPath);
  return latest;
}

async function waitForFreshElectronBuild() {
  const latestSourceMtimeMs = getLatestSourceMtimeMs(electronSourceRoot);
  const timeoutMs = 180000;
  const startedAt = Date.now();

  for (;;) {
    const rendererReady = await isRendererReady(rendererHost, rendererPort);
    const mainReady = getFileMtimeMs(electronMainPath) >= latestSourceMtimeMs;
    const preloadReady = getFileMtimeMs(electronPreloadPath) >= latestSourceMtimeMs;

    if (rendererReady && mainReady && preloadReady) {
      return;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        "Timed out waiting for renderer and Electron build artifacts to become ready.",
      );
    }

    await delay(250);
  }
}

async function main() {
  await waitForFreshElectronBuild();

  const child = spawn(process.execPath, [launchScriptPath], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

void main();
