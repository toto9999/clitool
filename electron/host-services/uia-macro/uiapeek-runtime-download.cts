import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_UIAPEEK_RELEASE_TAG = "v2025.10.27.5";
const GITHUB_API_LATEST = "https://api.github.com/repos/g4-api/uia-peek/releases/latest";
const GITHUB_RELEASES_LATEST_HTML = "https://github.com/g4-api/uia-peek/releases/latest";

function effectiveUiaPeekReleaseTag(): string {
  return (process.env.CLIBASE_UIAPEEK_RELEASE_TAG || DEFAULT_UIAPEEK_RELEASE_TAG).trim();
}

function uiaPeekWantsLatestRelease(): boolean {
  return effectiveUiaPeekReleaseTag().toLowerCase() === "latest";
}

function githubReleaseJsonUrl(): string {
  if (uiaPeekWantsLatestRelease()) {
    return GITHUB_API_LATEST;
  }
  return `https://api.github.com/repos/g4-api/uia-peek/releases/tags/${encodeURIComponent(effectiveUiaPeekReleaseTag())}`;
}

const HTML_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string;
}

interface GitHubReleaseJson {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

function githubAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "clibase-electron-uiapeek",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** Optional air-gapped drop: place upstream UiaPeek.exe here (repo root). */
export function getUiaPeekVendorExePath(repoRoot: string): string {
  return path.join(repoRoot, "vendor", "uia-peek", "UiaPeek.exe");
}

/** Cached copy after first successful in-app download. */
export function getUiaPeekUserDataExePath(userDataPath: string): string {
  return path.join(userDataPath, "uia-peek", "UiaPeek.exe");
}

function isUiaPeekBundleComplete(dir: string): boolean {
  const exe = path.join(dir, "UiaPeek.exe");
  const dll = path.join(dir, "UiaPeek.dll");
  return fs.existsSync(exe) && fs.existsSync(dll);
}

function copyUiaPeekBundle(bundleRoot: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(bundleRoot, destDir, { recursive: true });
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

function pickWinZipPathFromExpandedAssetsHtml(html: string): string | null {
  const re = /href="(\/g4-api\/uia-peek\/releases\/download\/[^"]+\.zip)"/gi;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    paths.push(m[1]);
  }
  const noSource = paths.filter((p) => !p.includes("/archive/"));
  const win64 = noSource.find((p) => /win-x64/i.test(p));
  return win64 ?? noSource[0] ?? null;
}

type ApiResult =
  | { ok: true; url: string; digest?: string }
  | { ok: false; error: string };

async function resolveZipUrlViaGitHubApi(signal: AbortSignal): Promise<ApiResult> {
  const res = await fetch(githubReleaseJsonUrl(), {
    headers: githubAuthHeaders(),
    signal,
  });

  if (!res.ok) {
    return { ok: false, error: `GitHub API returned ${res.status}` };
  }

  const json = (await res.json()) as GitHubReleaseJson;
  const asset =
    json.assets.find((a) => /win-x64.*\.zip$/i.test(a.name)) ??
    json.assets.find(
      (a) => a.name.toLowerCase().endsWith(".zip") && a.name.toLowerCase().includes("win"),
    );

  if (!asset?.browser_download_url) {
    return { ok: false, error: "no Windows zip asset in release (API)" };
  }

  const digest =
    typeof asset.digest === "string" && asset.digest.startsWith("sha256:")
      ? asset.digest.slice("sha256:".length)
      : undefined;

  return { ok: true, url: asset.browser_download_url, digest };
}

async function resolveLatestReleaseTag(signal: AbortSignal): Promise<string> {
  const res = await fetch(GITHUB_RELEASES_LATEST_HTML, {
    redirect: "manual",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": HTML_UA,
    },
    signal,
  });
  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    const loc = res.headers.get("location");
    if (!loc) {
      throw new Error("releases/latest: redirect without Location");
    }
    const u = new URL(loc, "https://github.com");
    const segs = u.pathname.split("/").filter(Boolean);
    return segs[segs.length - 1];
  }
  if (res.ok) {
    const u = new URL(res.url);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs[segs.length - 1];
  }
  throw new Error(`releases/latest: unexpected HTTP ${res.status}`);
}

async function resolveZipUrlViaExpandedAssetsPage(signal: AbortSignal): Promise<string> {
  const tag = uiaPeekWantsLatestRelease()
    ? await resolveLatestReleaseTag(signal)
    : effectiveUiaPeekReleaseTag();
  const expandedUrl = `https://github.com/g4-api/uia-peek/releases/expanded_assets/${tag}`;
  const res = await fetch(expandedUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": HTML_UA,
    },
    signal,
  });
  if (!res.ok) {
    throw new Error(`expanded_assets returned ${res.status}`);
  }
  const html = await res.text();
  const rel = pickWinZipPathFromExpandedAssetsHtml(html);
  if (!rel) {
    throw new Error("no Windows .zip link in expanded_assets page");
  }
  return `https://github.com${rel}`;
}

async function resolveWindowsZipUrl(signal: AbortSignal): Promise<{ url: string; digest?: string }> {
  const api = await resolveZipUrlViaGitHubApi(signal);
  if (api.ok) {
    return { url: api.url, digest: api.digest };
  }

  const url = await resolveZipUrlViaExpandedAssetsPage(signal);
  return { url };
}

/**
 * Downloads the latest g4-api/uia-peek Windows release zip into app userData and
 * installs the full publish layout (exe + dlls + config) under userData/uia-peek/.
 * Requires network on first use. Falls back to releases/expanded_assets HTML when GitHub API is rate-limited (403).
 */
export async function downloadUiaPeekWindowsToUserData(userDataPath: string): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("UiaPeek bundle download is only implemented for Windows.");
  }

  const destExe = getUiaPeekUserDataExePath(userDataPath);
  const destDir = path.dirname(destExe);
  if (fs.existsSync(destExe) && isUiaPeekBundleComplete(destDir)) {
    return destExe;
  }

  const drop = (process.env.CLIBASE_UIAPEEK_EXE || "").trim();
  if (drop && fs.existsSync(drop)) {
    fs.mkdirSync(destDir, { recursive: true });
    const st = fs.statSync(drop);
    const bundleRoot = st.isDirectory() ? drop : path.dirname(drop);
    const exeInBundle = path.join(bundleRoot, "UiaPeek.exe");
    if (!fs.existsSync(exeInBundle)) {
      throw new Error(
        `CLIBASE_UIAPEEK_EXE must point to UiaPeek.exe or its publish folder (missing ${exeInBundle}).`,
      );
    }
    copyUiaPeekBundle(bundleRoot, destDir);
    if (!isUiaPeekBundleComplete(destDir)) {
      throw new Error("UiaPeek: CLIBASE_UIAPEEK_EXE copy did not produce a complete bundle.");
    }
    return destExe;
  }

  const signal = AbortSignal.timeout(180000);
  const { url, digest } = await resolveWindowsZipUrl(signal);

  const zipRes = await fetch(url, {
    headers: { "User-Agent": "clibase-electron-uiapeek" },
    signal,
  });

  if (!zipRes.ok) {
    throw new Error(`UiaPeek download: zip fetch failed with HTTP ${zipRes.status}.`);
  }

  const buffer = Buffer.from(await zipRes.arrayBuffer());

  if (digest) {
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    if (hash !== digest) {
      throw new Error("UiaPeek download: SHA-256 mismatch for release zip.");
    }
  }

  const safeTag = `dl_${Date.now()}`;
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

  const bundleRoot = path.dirname(found);
  fs.mkdirSync(destDir, { recursive: true });
  copyUiaPeekBundle(bundleRoot, destDir);
  if (!isUiaPeekBundleComplete(destDir)) {
    throw new Error(
      "UiaPeek download: bundle incomplete after copy (expected UiaPeek.exe + UiaPeek.dll).",
    );
  }

  try {
    fs.rmSync(path.join(userDataPath, "uia-peek", "_dl"), { recursive: true, force: true });
  } catch {
    // ignore cleanup
  }

  return destExe;
}
