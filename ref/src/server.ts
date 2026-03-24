import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { WebSocketServer, type WebSocket } from "ws";
import type { LauncherEvent, RunCommandRequest, StreamMessage } from "./types.js";
import { SymphonyAdapter } from "./symphonyAdapter.js";

const PORT = Number(process.env.PORT ?? 7071);
const WS_PATH = "/ws";
const app = express();
const symphonyAdapter = new SymphonyAdapter();

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDistDir = path.resolve(__dirname, "../web/dist");

const clients = new Set<WebSocket>();

const broadcast = (message: StreamMessage): void => {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    port: PORT
  });
});

app.get("/api/symphony/status", (_req, res) => {
  res.json(symphonyAdapter.getStatus());
});

app.post("/api/symphony/connect", async (req, res) => {
  const body = req.body;
  const config = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const status = await symphonyAdapter.connect(config);
  broadcast({
    type: "symphony:status",
    payload: {
      connected: status.connected,
      provider: status.provider,
      message: status.message
    }
  });
  res.json(status);
});

app.post("/api/launcher/send", async (req, res) => {
  const body = req.body;
  if (typeof body !== "object" || body === null) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }

  const launcherEvent = body as LauncherEvent;
  await symphonyAdapter.send(launcherEvent.payload);

  broadcast({
    type: "launcher:event",
    payload: {
      event: launcherEvent.event,
      payload: launcherEvent.payload
    }
  });

  res.json({ ok: true });
});

app.post("/api/terminal/run", (req, res) => {
  const body = req.body;
  if (typeof body !== "object" || body === null) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }

  const request = body as RunCommandRequest;
  if (typeof request.command !== "string" || request.command.trim() === "") {
    res.status(400).json({ error: "command is required" });
    return;
  }

  const args = Array.isArray(request.args)
    ? request.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  const cwd = typeof request.cwd === "string" && request.cwd.trim() !== "" ? request.cwd : process.cwd();

  const child = spawn(request.command, args, {
    cwd,
    shell: true,
    env: process.env
  });

  child.stdout.on("data", (chunk: Buffer) => {
    broadcast({
      type: "terminal:stdout",
      payload: { data: chunk.toString() }
    });
  });

  child.stderr.on("data", (chunk: Buffer) => {
    broadcast({
      type: "terminal:stderr",
      payload: { data: chunk.toString() }
    });
  });

  child.on("close", (code: number | null) => {
    broadcast({
      type: "terminal:exit",
      payload: { code: code ?? -1 }
    });
  });

  res.json({ ok: true, pid: child.pid ?? -1 });
});

app.use(express.static(webDistDir));
app.get("*", (_req, res) => {
  res.sendFile(path.resolve(webDistDir, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`launcher bridge server ready on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server, path: WS_PATH });
wss.on("connection", (socket) => {
  clients.add(socket);
  socket.send(
    JSON.stringify({
      type: "symphony:status",
      payload: symphonyAdapter.getStatus()
    } satisfies StreamMessage)
  );

  socket.on("close", () => {
    clients.delete(socket);
  });
});
