/**
 * Terminal-only UiaPeek recording: SignalR hub (no Electron runtime).
 * Prerequisites: UiaPeek HTTP up — `batcli uia-peek start` (or run UiaPeek.exe manually).
 * Then launch your target EXE; this script only collects events from the hub.
 *
 * Usage (via batcli):
 *   batcli uia record terminal capture [--ms 8000] [--out-dir .clibase/uia-terminal-record] [--hub URL]
 */

import * as signalR from "@microsoft/signalr";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import YAML from "yaml";

import { recordingPayloadsToMacroSteps } from "../src/utils/uiaRecordingSessionToMacro";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function installNodeWebSocketPolyfill() {
  const g = globalThis as unknown as { WebSocket?: typeof WebSocket };
  if (!g.WebSocket) {
    g.WebSocket = WebSocket as unknown as typeof g.WebSocket;
  }
}

function asSessionId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function ping9955(hubUrl: string): Promise<boolean> {
  let hostname = "127.0.0.1";
  let port = 9955;
  try {
    const u = new URL(hubUrl);
    hostname = u.hostname === "localhost" || u.hostname === "::1" ? "127.0.0.1" : u.hostname;
    port = Number(u.port) || 9955;
  } catch {
    // keep defaults
  }
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname,
        port,
        path: "/api/v4/g4/ping",
        method: "GET",
        timeout: 3000,
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

async function captureSession(options: {
  hubUrl: string;
  waitMs: number;
  outDir: string;
}) {
  const ok = await ping9955(options.hubUrl);
  if (!ok) {
    console.error(
      "UiaPeek HTTP is not reachable (127.0.0.1:9955 /api/v4/g4/ping). Run: batcli uia-peek start",
    );
    process.exit(1);
  }

  installNodeWebSocketPolyfill();

  const payloads: unknown[] = [];
  let sessionId: string | null = null;

  const connection = new signalR.HubConnectionBuilder()
    .withUrl(options.hubUrl)
    .withAutomaticReconnect([0, 2000, 5000])
    .build();

  connection.on("ReceiveRecordingEvent", (...args: unknown[]) => {
    const payload = args.length <= 1 ? args[0] : args;
    payloads.push(payload);
  });

  connection.on("RecordingSessionStarted", (...args: unknown[]) => {
    const id = asSessionId(args[0]);
    if (id) {
      sessionId = id;
    }
  });

  await connection.start();

  let invokeResult: unknown;
  try {
    invokeResult = await connection.invoke("StartRecordingSession");
  } catch (e) {
    console.error("StartRecordingSession failed:", e instanceof Error ? e.message : String(e));
    await connection.stop();
    process.exit(1);
  }

  const fromInvoke = asSessionId(invokeResult);
  if (fromInvoke) {
    sessionId = fromInvoke;
  }

  console.log(`Recording… session=${sessionId ?? "?"} hub=${options.hubUrl} wait_ms=${options.waitMs}`);
  await new Promise((r) => setTimeout(r, options.waitMs));

  const sid = sessionId;
  try {
    if (sid && connection.state === signalR.HubConnectionState.Connected) {
      await connection.invoke("StopRecordingSession", sid);
    }
  } catch (e) {
    console.warn("StopRecordingSession:", e instanceof Error ? e.message : String(e));
  }

  try {
    await connection.stop();
  } catch {
    // ignore
  }

  fs.mkdirSync(options.outDir, { recursive: true });
  const payloadsPath = path.join(options.outDir, "payloads.json");
  fs.writeFileSync(payloadsPath, `${JSON.stringify(payloads, null, 2)}\n`, "utf8");

  const steps = recordingPayloadsToMacroSteps(payloads);
  const stepsPath = path.join(options.outDir, "steps.yaml");
  fs.writeFileSync(stepsPath, `${YAML.stringify(steps).trimEnd()}\n`, "utf8");

  console.log(`Wrote ${payloadsPath} (${payloads.length} payload(s))`);
  console.log(`Wrote ${stepsPath} (${steps.length} step(s))`);
}

function parseArgs(argv: string[]) {
  let waitMs = 8000;
  let outDir = path.join(process.cwd(), ".clibase", "uia-terminal-record");
  let hubUrl =
    process.env.CLIBASE_UIAPEEK_HUB_URL?.trim() || "http://localhost:9955/hub/v4/g4/peek";

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--ms" && argv[i + 1]) {
      waitMs = Math.max(0, Number(argv[(i += 1)]) || 0);
      continue;
    }
    if (a === "--out-dir" && argv[i + 1]) {
      outDir = path.resolve(argv[(i += 1)]);
      continue;
    }
    if (a === "--hub" && argv[i + 1]) {
      hubUrl = String(argv[(i += 1)]).trim();
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: batcli uia record terminal capture [--ms N] [--out-dir DIR] [--hub URL]`);
      process.exit(0);
    }
  }

  return { waitMs, outDir, hubUrl };
}

async function main() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (sub !== "capture") {
    console.error("Expected: batcli uia record terminal capture [options]");
    console.error("  --ms        Recording window in ms (default 8000)");
    console.error("  --out-dir   Output directory (default .clibase/uia-terminal-record)");
    console.error("  --hub       SignalR hub URL (default from CLIBASE_UIAPEEK_HUB_URL or localhost:9955)");
    process.exit(sub === "--help" ? 0 : 2);
  }

  const opts = parseArgs(argv.slice(1));
  await captureSession({
    hubUrl: opts.hubUrl,
    waitMs: opts.waitMs,
    outDir: opts.outDir,
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
