import fs from "node:fs";
import path from "node:path";
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
  "workspace-ui.html", "workspace-ui.css"
];

const copyAsset = (asset) => {
  const from = path.join(srcDir, asset);
  const to = path.join(distDir, asset);
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  fs.copyFileSync(from, to);
  console.log(`[watch-assets] copied ${asset}`);
};

for (const asset of assets) {
  copyAsset(asset);
  const from = path.join(srcDir, asset);
  fs.watchFile(from, { interval: 250 }, () => {
    copyAsset(asset);
  });
}

console.log("[watch-assets] watching renderer/sidebar assets");
