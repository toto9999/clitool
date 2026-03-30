/**
 * Downloads the latest g4-api/uia-peek Windows release zip and copies UiaPeek.exe
 * to vendor/uia-peek/UiaPeek.exe (repo cwd). Mirrors electron host logic in
 * uiapeek-runtime-download.cts for CLI/offline bootstrap without Electron.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const GITHUB_API_LATEST = "https://api.github.com/repos/g4-api/uia-peek/releases/latest";

function findUiaPeekExeUnder(dir, depth) {
  if (depth > 12 || !fs.existsSync(dir)) {
    return null;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = findUiaPeekExeUnder(full, depth + 1);
      if (sub) {
        return sub;
      }
    } else if (entry.isFile() && entry.name.toLowerCase() === "uiapeek.exe") {
      return full;
    }
  }

  return null;
}

async function downloadUiaPeekToVendor(repoRoot, destExe) {
  if (process.platform !== "win32") {
    throw new Error("UiaPeek vendor download is only implemented for Windows.");
  }

  const res = await fetch(GITHUB_API_LATEST, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "clibase-batcli-uiapeek",
    },
  });

  if (!res.ok) {
    throw new Error(
      `UiaPeek download: GitHub API returned ${res.status}. Allow network or place UiaPeek.exe under vendor/uia-peek/.`,
    );
  }

  const json = await res.json();
  const assets = Array.isArray(json.assets) ? json.assets : [];
  const asset =
    assets.find((a) => a && /win-x64.*\.zip$/i.test(String(a.name))) ??
    assets.find(
      (a) =>
        a &&
        String(a.name).toLowerCase().endsWith(".zip") &&
        String(a.name).toLowerCase().includes("win"),
    );

  if (!asset || !asset.browser_download_url) {
    throw new Error("UiaPeek download: no Windows zip asset in latest release.");
  }

  const zipRes = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "clibase-batcli-uiapeek" },
  });

  if (!zipRes.ok) {
    throw new Error(`UiaPeek download: zip fetch failed with HTTP ${zipRes.status}.`);
  }

  const buffer = Buffer.from(await zipRes.arrayBuffer());

  if (typeof asset.digest === "string" && asset.digest.startsWith("sha256:")) {
    const expected = asset.digest.slice("sha256:".length);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    if (hash !== expected) {
      throw new Error("UiaPeek download: SHA-256 mismatch for release zip.");
    }
  }

  const safeTag = String(json.tag_name ?? "latest").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const extractRoot = path.join(repoRoot, ".clibase", "uia-peek-dl", safeTag);
  fs.mkdirSync(extractRoot, { recursive: true });

  const zipPath = path.join(extractRoot, "uia-peek-win.zip");
  fs.writeFileSync(zipPath, buffer);

  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const ps = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!fs.existsSync(ps)) {
    throw new Error("UiaPeek download: PowerShell not found.");
  }

  const expandDest = path.join(extractRoot, "expanded");
  try {
    fs.rmSync(expandDest, { recursive: true, force: true });
  } catch {
    // ignore
  }
  fs.mkdirSync(expandDest, { recursive: true });

  const escapedZip = zipPath.replace(/'/g, "''");
  const escapedDest = expandDest.replace(/'/g, "''");
  const result = spawnSync(
    ps,
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force`,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 120000 },
  );

  if (result.error) {
    throw new Error(`UiaPeek download: zip extract failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `UiaPeek download: Expand-Archive failed (${result.status}). ${result.stderr || result.stdout || ""}`,
    );
  }

  const found = findUiaPeekExeUnder(expandDest, 0);
  if (!found) {
    throw new Error("UiaPeek download: UiaPeek.exe not found inside release zip.");
  }

  fs.mkdirSync(path.dirname(destExe), { recursive: true });
  fs.copyFileSync(found, destExe);

  try {
    fs.rmSync(path.join(repoRoot, ".clibase", "uia-peek-dl"), { recursive: true, force: true });
  } catch {
    // ignore cleanup
  }
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const repoRoot = process.cwd();
const destExe = path.join(repoRoot, "vendor", "uia-peek", "UiaPeek.exe");

if (process.platform !== "win32") {
  console.error("UiaPeek vendor install: skipped (Windows only).");
  process.exit(0);
}

if (!force && fs.existsSync(destExe)) {
  console.log(`UiaPeek already present: ${destExe}`);
  process.exit(0);
}

try {
  await downloadUiaPeekToVendor(repoRoot, destExe);
  console.log(`UiaPeek installed: ${destExe}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
