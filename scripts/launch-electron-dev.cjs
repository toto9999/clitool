const { spawn } = require("node:child_process");
const electronBinary = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const requestedStdioMode = String(process.env.CLIBASE_ELECTRON_STDIO ?? "")
  .trim()
  .toLowerCase();

let stdio = "inherit";
if (requestedStdioMode === "ignore") {
  stdio = "ignore";
}
if (requestedStdioMode === "pipe") {
  stdio = ["ignore", "pipe", "pipe"];
}

const child = spawn(electronBinary, ["."], {
  cwd: process.cwd(),
  stdio,
  env,
});

if (Array.isArray(stdio)) {
  child.stdout?.on("data", (chunk) => {
    if (!chunk) {
      return;
    }

    try {
      process.stdout.write(chunk);
    } catch {
      // ignore closed output stream
    }
  });

  child.stderr?.on("data", (chunk) => {
    if (!chunk) {
      return;
    }

    try {
      process.stderr.write(chunk);
    } catch {
      // ignore closed output stream
    }
  });
}

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
