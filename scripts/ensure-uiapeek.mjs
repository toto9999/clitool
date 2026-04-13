/**
 * Installs the full UiaPeek Windows publish layout under vendor/uia-peek/ (repo cwd).
 * Upstream zip contains UiaPeek.exe plus UiaPeek.dll, deps, runtimeconfig, appsettings — copying
 * only the exe breaks startup (process exits before HTTP). We copy the entire extracted folder.
 *
 * Order: existing canonical bundle → vendor subtree scan → CLIBASE_UIAPEEK_EXE → download
 * Download: GitHub API (optional GITHUB_TOKEN / GH_TOKEN) → expanded_assets HTML (no API).
 *
 * Env:
 *   CLIBASE_UIAPEEK_RELEASE_TAG — default v2025.10.27.5 (net8); set to "latest" for newest (.NET 10+).
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** @see https://github.com/g4-api/uia-peek/releases — latest builds may target .NET 10; pin net8-compatible default. */
const DEFAULT_UIAPEEK_RELEASE_TAG = "v2025.10.27.5";
const GITHUB_API_LATEST = "https://api.github.com/repos/g4-api/uia-peek/releases/latest";
const GITHUB_RELEASES_LATEST_HTML = "https://github.com/g4-api/uia-peek/releases/latest";

function effectiveUiaPeekReleaseTag() {
  return (process.env.CLIBASE_UIAPEEK_RELEASE_TAG || DEFAULT_UIAPEEK_RELEASE_TAG).trim();
}

function uiaPeekWantsLatestRelease() {
  return effectiveUiaPeekReleaseTag().toLowerCase() === "latest";
}

function githubReleaseJsonUrl() {
  if (uiaPeekWantsLatestRelease()) {
    return GITHUB_API_LATEST;
  }
  return `https://api.github.com/repos/g4-api/uia-peek/releases/tags/${encodeURIComponent(effectiveUiaPeekReleaseTag())}`;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function githubAuthHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "clibase-batcli-uiapeek",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

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

/** True when the publish folder has the managed host and main assembly (not exe-only partial copy). */
function isUiaPeekBundleComplete(dir) {
  const exe = path.join(dir, "UiaPeek.exe");
  const dll = path.join(dir, "UiaPeek.dll");
  return fs.existsSync(exe) && fs.existsSync(dll);
}

function copyUiaPeekBundle(bundleRoot, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(bundleRoot, destDir, { recursive: true });
}

/**
 * @returns {{ url: string, digest?: string } | null}
 */
async function resolveZipUrlViaGitHubApi() {
  const res = await fetch(githubReleaseJsonUrl(), {
    headers: githubAuthHeaders(),
  });

  if (!res.ok) {
    return { _error: `GitHub API returned ${res.status}` };
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
    return { _error: "no Windows zip asset in latest release (API)" };
  }

  const digest =
    typeof asset.digest === "string" && asset.digest.startsWith("sha256:")
      ? asset.digest.slice("sha256:".length)
      : undefined;

  return { url: asset.browser_download_url, digest };
}

/** GitHub SPA pages omit asset URLs; expanded_assets HTML includes href="/.../releases/download/...zip". */
function pickWinZipPathFromExpandedAssetsHtml(html) {
  const re = /href="(\/g4-api\/uia-peek\/releases\/download\/[^"]+\.zip)"/gi;
  const paths = [];
  let m;
  while ((m = re.exec(html))) {
    paths.push(m[1]);
  }
  const noSource = paths.filter((p) => !p.includes("/archive/"));
  const win64 = noSource.find((p) => /win-x64/i.test(p));
  return win64 ?? noSource[0] ?? null;
}

async function resolveLatestReleaseTag() {
  const res = await fetch(GITHUB_RELEASES_LATEST_HTML, {
    redirect: "manual",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": UA,
    },
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

async function resolveZipUrlViaExpandedAssetsPage() {
  const tag = uiaPeekWantsLatestRelease()
    ? await resolveLatestReleaseTag()
    : effectiveUiaPeekReleaseTag();
  const expandedUrl = `https://github.com/g4-api/uia-peek/releases/expanded_assets/${tag}`;
  const res = await fetch(expandedUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": UA,
    },
  });
  if (!res.ok) {
    throw new Error(`expanded_assets returned ${res.status}`);
  }
  const html = await res.text();
  const rel = pickWinZipPathFromExpandedAssetsHtml(html);
  if (!rel) {
    throw new Error("no Windows .zip link in expanded_assets page");
  }
  return { url: `https://github.com${rel}` };
}

async function resolveWindowsZipUrl() {
  const tagLabel = uiaPeekWantsLatestRelease() ? "latest" : effectiveUiaPeekReleaseTag();
  const api = await resolveZipUrlViaGitHubApi();
  if (api && !api._error && api.url) {
    console.log(`UiaPeek: using GitHub API (release ${tagLabel} JSON).`);
    return { url: api.url, digest: api.digest };
  }

  const apiErr = api && api._error ? String(api._error) : "unknown";
  console.log(`UiaPeek: GitHub API unavailable (${apiErr}). Trying expanded_assets (no API)…`);

  const fallback = await resolveZipUrlViaExpandedAssetsPage();
  console.log("UiaPeek: resolved zip URL from releases/expanded_assets HTML.");
  return fallback;
}

async function downloadZipBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`zip fetch failed with HTTP ${res.status}.`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function downloadUiaPeekToVendor(repoRoot, destExe) {
  if (process.platform !== "win32") {
    throw new Error("UiaPeek vendor download is only implemented for Windows.");
  }

  const { url, digest } = await resolveWindowsZipUrl();
  let buffer = await downloadZipBuffer(url);

  if (digest) {
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    if (hash !== digest) {
      throw new Error("UiaPeek download: SHA-256 mismatch for release zip.");
    }
  }

  const safeTag = `dl_${Date.now()}`;
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

  const bundleRoot = path.dirname(found);
  const destDir = path.dirname(destExe);
  copyUiaPeekBundle(bundleRoot, destDir);
  if (!isUiaPeekBundleComplete(destDir)) {
    throw new Error(
      "UiaPeek download: bundle incomplete after copy (expected UiaPeek.exe + UiaPeek.dll next to each other).",
    );
  }

  try {
    fs.rmSync(path.join(repoRoot, ".clibase", "uia-peek-dl"), { recursive: true, force: true });
  } catch {
    // ignore cleanup
  }
}

function tryMaterializeFromVendorScan(repoRoot, destExe) {
  const vendorDir = path.join(repoRoot, "vendor", "uia-peek");
  const destDir = path.dirname(destExe);
  if (!fs.existsSync(vendorDir)) {
    return false;
  }
  const found = findUiaPeekExeUnder(vendorDir, 0);
  if (!found) {
    return false;
  }
  const bundleRoot = path.dirname(found);
  if (path.resolve(found) === path.resolve(destExe)) {
    return isUiaPeekBundleComplete(destDir);
  }
  copyUiaPeekBundle(bundleRoot, destDir);
  console.log(`UiaPeek: copied bundle ${bundleRoot} -> ${destDir}`);
  return isUiaPeekBundleComplete(destDir);
}

function tryMaterializeFromEnv(destExe) {
  const p = (process.env.CLIBASE_UIAPEEK_EXE || "").trim();
  if (!p) {
    return false;
  }
  if (!fs.existsSync(p)) {
    console.error(`CLIBASE_UIAPEEK_EXE set but path missing: ${p}`);
    return false;
  }
  const destDir = path.dirname(destExe);
  let bundleRoot;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    bundleRoot = p;
  } else {
    bundleRoot = path.dirname(p);
  }
  const exeInBundle = path.join(bundleRoot, "UiaPeek.exe");
  if (!fs.existsSync(exeInBundle)) {
    console.error(
      `CLIBASE_UIAPEEK_EXE must point to UiaPeek.exe or its publish folder (missing ${exeInBundle}).`,
    );
    return false;
  }
  copyUiaPeekBundle(bundleRoot, destDir);
  console.log(`UiaPeek: installed from CLIBASE_UIAPEEK_EXE -> ${destDir}`);
  return isUiaPeekBundleComplete(destDir);
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const repoRoot = process.cwd();
const destExe = path.join(repoRoot, "vendor", "uia-peek", "UiaPeek.exe");

if (process.platform !== "win32") {
  console.error("UiaPeek vendor install: skipped (Windows only).");
  process.exit(0);
}

if (!force && fs.existsSync(destExe) && isUiaPeekBundleComplete(path.dirname(destExe))) {
  console.log(`UiaPeek already present: ${destExe}`);
  process.exit(0);
}

if (!force && fs.existsSync(destExe) && !isUiaPeekBundleComplete(path.dirname(destExe))) {
  console.log(
    "UiaPeek.exe exists but publish bundle is incomplete (old install copied exe only). Re-run with --force or delete vendor/uia-peek/*.dll and retry.",
  );
}

if (!force && tryMaterializeFromVendorScan(repoRoot, destExe)) {
  console.log(`UiaPeek ready: ${destExe}`);
  process.exit(0);
}

if (!force && tryMaterializeFromEnv(destExe)) {
  process.exit(0);
}

try {
  await downloadUiaPeekToVendor(repoRoot, destExe);
  console.log(`UiaPeek installed: ${destExe}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(
    "Hint: set GITHUB_TOKEN for API rate limits, extract the full win-x64 zip into vendor/uia-peek/, or set CLIBASE_UIAPEEK_EXE to UiaPeek.exe (or its folder).",
  );
  process.exit(1);
}
