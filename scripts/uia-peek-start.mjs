/**
 * Starts vendor UiaPeek.exe and waits until http://127.0.0.1:9955/api/v4/g4/ping returns 200 or times out.
 * On Windows, launches via PowerShell Start-Process so UiaPeek gets a real console (upstream calls
 * Console.Clear; stdio=ignore from Node would crash with "invalid handle" in headless/agent terminals).
 *
 * Env:
 *   CLIBASE_UIAPEEK_HOST_EXE — override path to UiaPeek.exe
 *   CLIBASE_UIAPEEK_HTTP_WAIT_MS — total wait budget (default 120000)
 *   CLIBASE_UIAPEEK_START_ATTEMPTS — max spawn attempts (default 3)
 *   CLIBASE_UIAPEEK_RELEASE_TAG — see scripts/ensure-uiapeek.mjs (default net8-compatible pin)
 *   CLIBASE_UIAPEEK_SKIP_RUNTIME_INSTALL — set to 1 to skip auto ASP.NET Core runtime install
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultExe = path.join(repoRoot, "vendor", "uia-peek", "UiaPeek.exe");
const exe = (process.env.CLIBASE_UIAPEEK_HOST_EXE || "").trim() || defaultExe;

function ping9955() {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 9955,
        path: "/api/v4/g4/ping",
        method: "GET",
        timeout: 2000,
        family: 4,
      },
      (res) => {
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Prefer workspace-local dotnet, then user-local, so apphost finds Microsoft.AspNetCore.App. */
function spawnEnvForUiaPeek() {
  const env = { ...process.env };
  const repoDotnetDir =
    process.env.CLIBASE_UIAPEEK_DOTNET_DIR?.trim() || path.join(repoRoot, ".clibase", "dotnet");
  const localDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "dotnet");
  const progDir = path.join(process.env.ProgramFiles || "", "dotnet");
  if (fs.existsSync(path.join(repoDotnetDir, "dotnet.exe"))) {
    env.PATH = `${repoDotnetDir}${path.delimiter}${env.PATH || ""}`;
    if (!env.DOTNET_ROOT) {
      env.DOTNET_ROOT = repoDotnetDir;
    }
  } else if (fs.existsSync(path.join(localDir, "dotnet.exe"))) {
    env.PATH = `${localDir}${path.delimiter}${env.PATH || ""}`;
    if (!env.DOTNET_ROOT) {
      env.DOTNET_ROOT = localDir;
    }
  } else if (fs.existsSync(path.join(progDir, "dotnet.exe")) && !env.DOTNET_ROOT) {
    env.DOTNET_ROOT = progDir;
  }
  return env;
}

/**
 * Launch UiaPeek outside Node's stdio (upstream uses Console). Prefer cmd `start` so a normal
 * Win32 session is used; PowerShell Start-Process can fail when powershell.exe is blocked or
 * mis-resolved from Git Bash / agent shells.
 */
function spawnUiaPeekWin32(exePath, stdioOpt) {
  const cwd = path.dirname(exePath);
  const exeAbs = path.resolve(exePath);
  const env = spawnEnvForUiaPeek();
  const comspec =
    process.env.ComSpec || path.join(process.env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  // cmd START: first quoted token is WINDOW TITLE. Use "" so the next args are /D and the exe (not "UiaPeek" as title).
  return spawn(comspec, ["/c", "start", "", "/D", cwd, exeAbs], {
    detached: true,
    stdio: stdioOpt,
    windowsHide: false,
    env,
    shell: false,
  });
}

if (process.platform !== "win32") {
  console.error("uia-peek start: Windows only.");
  process.exit(0);
}

if (!fs.existsSync(exe)) {
  console.error(`UiaPeek not found: ${exe}`);
  console.error("Run: batcli uia-peek download");
  process.exit(1);
}

const ensureRuntimeScript = path.join(repoRoot, "scripts", "ensure-dotnet-aspnetcore-runtime.mjs");
if (fs.existsSync(ensureRuntimeScript)) {
  const er = spawnSync(process.execPath, [ensureRuntimeScript], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if ((er.status ?? 1) !== 0) {
    console.error("Run: batcli install   or   batcli uia-peek install-runtime");
    process.exit(1);
  }
}

const waitMsTotal = Math.min(
  180000,
  Math.max(10000, Number.parseInt(process.env.CLIBASE_UIAPEEK_HTTP_WAIT_MS || "120000", 10) || 120000),
);
const maxAttempts = Math.max(1, Math.min(5, Number.parseInt(process.env.CLIBASE_UIAPEEK_START_ATTEMPTS || "3", 10) || 3));
const perAttemptMs = Math.max(12000, Math.floor(waitMsTotal / maxAttempts));

async function main() {
  if (await ping9955()) {
    console.log("UiaPeek HTTP already up: http://127.0.0.1:9955/api/v4/g4/ping");
    process.exit(0);
  }

  const useDebug = process.env.CLIBASE_UIAPEEK_SPAWN_DEBUG === "1";
  const stdioOpt = useDebug ? "inherit" : "ignore";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (await ping9955()) {
      console.log("UiaPeek HTTP became ready before spawn (another instance?).");
      process.exit(0);
    }

    const child = spawnUiaPeekWin32(exe, stdioOpt);
    child.unref();

    console.log(`Starting UiaPeek (attempt ${attempt}/${maxAttempts})…`);

    const deadline = Date.now() + perAttemptMs;
    while (Date.now() < deadline) {
      await sleep(400);
      if (await ping9955()) {
        console.log("UiaPeek HTTP ready: http://127.0.0.1:9955 (hub matches CLIBASE_UIAPEEK_HUB_URL or default)");
        process.exit(0);
      }
    }

    if (await ping9955()) {
      process.exit(0);
    }
    if (attempt < maxAttempts) {
      console.warn(`Retrying UiaPeek spawn (${attempt + 1}/${maxAttempts})…`);
    }
  }

  console.error(
    [
      `Timed out after ~${waitMsTotal}ms (${maxAttempts} attempt(s)) waiting for UiaPeek HTTP.`,
      "Check: batcli install, batcli uia-peek install-runtime, antivirus, or run UiaPeek.exe from Explorer.",
      "See vendor/uia-peek/README.md",
    ].join(" "),
  );
  process.exit(1);
}

main();
