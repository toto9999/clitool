import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const GITHUB_API_LATEST = "https://api.github.com/repos/g4-api/uia-peek/releases/latest";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string;
}

interface GitHubReleaseJson {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

/** Optional air-gapped drop: place upstream UiaPeek.exe here (repo root). */
export function getUiaPeekVendorExePath(repoRoot: string): string {
  return path.join(repoRoot, "vendor", "uia-peek", "UiaPeek.exe");
}

/** Cached copy after first successful in-app download. */
export function getUiaPeekUserDataExePath(userDataPath: string): string {
  return path.join(userDataPath, "uia-peek", "UiaPeek.exe");
}

function findUiaPeekExeUnder(dir: string, depth: number): string | null {
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

/**
 * Downloads the latest g4-api/uia-peek Windows release zip into app userData and
 * installs `UiaPeek.exe` next to the cache location. Requires network on first use.
 */
export async function downloadUiaPeekWindowsToUserData(userDataPath: string): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("UiaPeek bundle download is only implemented for Windows.");
  }

  const destExe = getUiaPeekUserDataExePath(userDataPath);
  if (fs.existsSync(destExe)) {
    return destExe;
  }

  const res = await fetch(GITHUB_API_LATEST, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "clibase-electron-uiapeek",
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    throw new Error(
      `UiaPeek download: GitHub API returned ${res.status}. Allow network or place UiaPeek.exe under vendor/uia-peek/.`,
    );
  }

  const json = (await res.json()) as GitHubReleaseJson;
  const asset =
    json.assets.find((a) => /win-x64.*\.zip$/i.test(a.name)) ??
    json.assets.find(
      (a) => a.name.toLowerCase().endsWith(".zip") && a.name.toLowerCase().includes("win"),
    );

  if (!asset) {
    throw new Error("UiaPeek download: no Windows zip asset in latest release.");
  }

  const zipRes = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "clibase-electron-uiapeek" },
    signal: AbortSignal.timeout(180000),
  });

  if (!zipRes.ok) {
    throw new Error(`UiaPeek download: zip fetch failed with HTTP ${zipRes.status}.`);
  }

  const buffer = Buffer.from(await zipRes.arrayBuffer());

  if (asset.digest?.startsWith("sha256:")) {
    const expected = asset.digest.slice("sha256:".length);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    if (hash !== expected) {
      throw new Error("UiaPeek download: SHA-256 mismatch for release zip.");
    }
  }

  const safeTag = json.tag_name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const extractRoot = path.join(userDataPath, "uia-peek", "_dl", safeTag);
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
    fs.rmSync(path.join(userDataPath, "uia-peek", "_dl"), { recursive: true, force: true });
  } catch {
    // ignore cleanup
  }

  return destExe;
}
