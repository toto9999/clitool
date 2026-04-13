/**
 * CLI probe for UiaPeek HTTP: GET /api/v4/g4/ping (same as Electron host).
 * Uses CLIBASE_UIAPEEK_HUB_URL or http://localhost:9955/hub/v4/g4/peek.
 * Exit 0 if HTTP 200, else 1.
 */
import http from "node:http";

const hubUrl =
  process.env.CLIBASE_UIAPEEK_HUB_URL?.trim() || "http://localhost:9955/hub/v4/g4/peek";

function probeHost(hostname) {
  if (hostname === "localhost" || hostname === "::1") {
    return "127.0.0.1";
  }
  return hostname;
}

const parsed = new URL(hubUrl);
const hostname = probeHost(parsed.hostname);
const port = Number(parsed.port) || 9955;

const req = http.request(
  {
    hostname,
    port,
    path: "/api/v4/g4/ping",
    method: "GET",
    timeout: 4000,
    family: 4,
  },
  (res) => {
    const ok = res.statusCode === 200;
    if (ok) {
      console.log(`OK http://${hostname}:${port}/api/v4/g4/ping (hub ${hubUrl})`);
      process.exit(0);
    }
    console.error(`FAIL HTTP ${res.statusCode} (hub ${hubUrl})`);
    process.exit(1);
  },
);

req.on("error", (err) => {
  console.error(`FAIL ${err.message} (hub ${hubUrl})`);
  process.exit(1);
});

req.on("timeout", () => {
  req.destroy();
  console.error(`FAIL timeout (hub ${hubUrl})`);
  process.exit(1);
});

req.end();
