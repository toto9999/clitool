import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const srcDir = path.join(projectRoot, "src");
const distDir = path.join(projectRoot, "dist");

const assets = [
  "renderer.html", "renderer.css",
  "sidebar.html", "sidebar.css",
  "settings.html", "settings.css",
  "symphony.html", "symphony.css",
  "workspace-ui.html", "workspace-ui.css",
  "workspace-runtime.html", "workspace-runtime.css"
];

function copyViaCmd(from, to) {
  const r = spawnSync("cmd", ["/c", "copy", "/Y", `"${from}"`, `"${to}"`], {
    windowsHide: true,
    encoding: "utf8"
  });
  return r.status === 0;
}

function ensureWritable(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.chmodSync(target, 0o666);
  } catch {
    /* best effort */
  }
}

function copyFileWithRetry(from, to, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      ensureWritable(to);
      fs.copyFileSync(from, to);
      return;
    } catch (err) {
      if (err.code === "EPERM") {
        ensureWritable(to);
        const fallback =
          process.platform === "win32"
            ? copyViaCmd(from, to)
            : (() => {
                try {
                  fs.writeFileSync(to, fs.readFileSync(from));
                  return true;
                } catch {
                  return false;
                }
              })();
        if (fallback) return;
        if (attempt < maxAttempts) {
          const end = Date.now() + 1500;
          while (Date.now() < end) {}
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

for (const asset of assets) {
  const from = path.join(srcDir, asset);
  const to = path.join(distDir, asset);
  copyFileWithRetry(from, to);
}
