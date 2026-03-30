import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import { recordRuntimeLog } from "../runtime-control/runtime-logging.cjs";

let spawnedHostProcess: ChildProcess | null = null;
let hostSpawnedByClibase = false;

function parseHubToHttpTarget(hubUrl: string): { hostname: string; port: number } {
  const parsed = new URL(hubUrl);
  const port = Number(parsed.port) || 9955;
  return { hostname: parsed.hostname, port };
}

/** Node `localhost` often resolves to ::1; UiaPeek may listen on IPv4 only — use 127.0.0.1 for the HTTP probe. */
function httpProbeHost(hostname: string): string {
  if (hostname === "localhost" || hostname === "::1") {
    return "127.0.0.1";
  }
  return hostname;
}

function parseHttpWaitMs(): number {
  const raw = process.env.CLIBASE_UIAPEEK_HTTP_WAIT_MS?.trim();
  if (!raw) {
    return 90000;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 5000) {
    return 90000;
  }
  return Math.min(n, 300000);
}

export function pingUiaPeekHttp(hostname: string, port: number): Promise<boolean> {
  const probeHost = httpProbeHost(hostname);
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: probeHost,
        port,
        path: "/api/v4/g4/ping",
        method: "GET",
        timeout: 2000,
        family: 4,
      },
      (res) => {
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => {
      resolve(false);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * If UiaPeek HTTP is not yet reachable, spawns UiaPeek.exe (Windows) and waits for /api/v4/g4/ping.
 */
export async function ensureUiaPeekHttpServer(options: {
  hubUrl: string;
  hostExePath: string;
}): Promise<{ started: boolean }> {
  const { hostname, port } = parseHubToHttpTarget(options.hubUrl);

  if (await pingUiaPeekHttp(hostname, port)) {
    return { started: false };
  }

  const isLocalHub =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";
  if (!isLocalHub) {
    throw new Error(
      `UiaPeek hub ${hostname}:${port} is not reachable. Start UiaPeek on that machine or point CLIBASE_UIAPEEK_HUB_URL to localhost for auto-start on this PC.`,
    );
  }

  if (process.platform !== "win32") {
    throw new Error(
      "UiaPeek HTTP auto-start is only supported on Windows. Start UiaPeek manually or set CLIBASE_UIAPEEK_HUB_URL to a reachable hub.",
    );
  }

  if (!fs.existsSync(options.hostExePath)) {
    throw new Error(`UiaPeek host executable not found: ${options.hostExePath}`);
  }

  const waitMs = parseHttpWaitMs();
  const hostExitRef: {
    value: { code: number | null; signal: NodeJS.Signals | null } | null;
  } = { value: null };

  spawnedHostProcess = spawn(options.hostExePath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  hostSpawnedByClibase = true;

  spawnedHostProcess.on("exit", (code, signal) => {
    hostExitRef.value = { code, signal };
    recordRuntimeLog("warn", "uiapeek http: spawned UiaPeek.exe exited", {
      code,
      signal,
      exe: options.hostExePath,
    });
  });

  spawnedHostProcess.unref();

  recordRuntimeLog("info", "uiapeek http: spawned host, waiting for ping", {
    exe: options.hostExePath,
    probe: `http://${httpProbeHost(hostname)}:${port}/api/v4/g4/ping`,
    wait_ms: waitMs,
  });

  const startedAt = Date.now();
  const deadline = startedAt + waitMs;
  let poll = 0;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 400);
    });
    const ok = await pingUiaPeekHttp(hostname, port);
    if (ok) {
      recordRuntimeLog("info", "uiapeek http: ping ok", { port });
      return { started: true };
    }
    if (hostExitRef.value) {
      const ex = hostExitRef.value;
      throw new Error(
        `UiaPeek.exe exited before HTTP came up (code ${ex.code}, signal ${ex.signal ?? "none"}). Try running ${options.hostExePath} manually, another port, or Administrator. Hub URL: ${options.hubUrl}`,
      );
    }
    poll += 1;
    if (poll % 25 === 0) {
      recordRuntimeLog("info", "uiapeek http: still waiting for ping", {
        elapsed_ms: Date.now() - startedAt,
      });
    }
  }

  throw new Error(
    `Timed out after ${waitMs}ms waiting for UiaPeek HTTP at http://${httpProbeHost(hostname)}:${port}/api/v4/g4/ping. Install or run UiaPeek manually, set CLIBASE_UIAPEEK_HOST_EXE, increase CLIBASE_UIAPEEK_HTTP_WAIT_MS, or start as Administrator if hooks block startup. Hub: ${options.hubUrl}`,
  );
}

/** True if GET /api/v4/g4/ping returns 200 on the hub derived from hubUrl (e.g. before SignalR connects). */
export async function pingUiaPeekHubUrl(hubUrl: string): Promise<boolean> {
  const { hostname, port } = parseHubToHttpTarget(hubUrl);
  return pingUiaPeekHttp(hostname, port);
}

export function shutdownUiaPeekHostIfSpawned(): void {
  if (!hostSpawnedByClibase || !spawnedHostProcess) {
    return;
  }

  try {
    spawnedHostProcess.kill();
  } catch {
    // ignore
  }

  spawnedHostProcess = null;
  hostSpawnedByClibase = false;
}
