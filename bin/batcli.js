#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import runtimeControl from "../shared/runtime-control.cjs";

const cwd = process.cwd();
const stateDir = path.join(cwd, ".clibase");
const stateFile = path.join(stateDir, "workflow-state.json");
const ssotFile = path.join(cwd, "doc", "0. Governance", "ssot.yaml");
const worklogFile = path.join(cwd, "doc", "9. Worklog", "99-worklog.md");

let cachedYamlModule = null;
let actionSequence = 0;

function print(message = "") {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseFlags(tokens) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    const nextToken = tokens[index + 1];

    if (!nextToken || nextToken.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = nextToken;
    index += 1;
  }

  return { flags, positionals };
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readState(optional = false) {
  if (!fs.existsSync(stateFile)) {
    if (optional) {
      return null;
    }

    fail("No active workflow. Start one with `batcli workflow start \"note\"`.");
  }

  return JSON.parse(readText(stateFile));
}

function saveState(state) {
  writeJson(stateFile, state);
}

async function getYamlModule() {
  if (cachedYamlModule) {
    return cachedYamlModule;
  }

  try {
    cachedYamlModule = await import("yaml");
    return cachedYamlModule;
  } catch {
    fail(
      "The `yaml` package is required for document commands. Run `node ./bin/batcli.js install` first.",
    );
  }
}

async function printStructured(value) {
  try {
    const YAML = await import("yaml");
    print(YAML.stringify(value).trimEnd());
    return;
  } catch {
    print(JSON.stringify(value, null, 2));
  }
}

async function readSsot() {
  if (!fs.existsSync(ssotFile)) {
    fail("Missing `doc/0. Governance/ssot.yaml`.");
  }

  try {
    const YAML = await getYamlModule();
    return YAML.parse(readText(ssotFile));
  } catch (error) {
    fail(`Unable to parse doc/0. Governance/ssot.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getRequiredDocuments() {
  const ssot = await readSsot();
  const requiredDocuments = ssot?.documentation?.required_documents;

  if (!Array.isArray(requiredDocuments) || requiredDocuments.length === 0) {
    fail("`doc/0. Governance/ssot.yaml` must define `documentation.required_documents`.");
  }

  return requiredDocuments;
}

async function validateDocs({ silent = false } = {}) {
  const requiredDocuments = await getRequiredDocuments();
  const issues = [];

  for (const relativePath of requiredDocuments) {
    const absolutePath = path.join(cwd, relativePath);

    if (!fs.existsSync(absolutePath)) {
      issues.push(`Missing required document: ${relativePath}`);
      continue;
    }

    const content = readText(absolutePath).trim();
    if (content.length === 0) {
      issues.push(`Empty required document: ${relativePath}`);
    }
  }

  if (fs.existsSync(worklogFile)) {
    const hasEntry = readText(worklogFile)
      .split(/\r?\n/)
      .some((line) => line.trim().startsWith("- "));

    if (!hasEntry) {
      issues.push("`doc/9. Worklog/99-worklog.md` must contain at least one worklog entry.");
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      process.stderr.write(`- ${issue}\n`);
    }
    process.exit(1);
  }

  if (!silent) {
    print("Documentation validation passed.");
    for (const relativePath of requiredDocuments) {
      print(`- ${relativePath}`);
    }
  }
}

function appendWorklog(message) {
  if (!message) {
    fail("Usage: batcli docs touch \"message\"");
  }

  if (!fs.existsSync(worklogFile)) {
    fail("Missing `doc/9. Worklog/99-worklog.md`.");
  }

  const timestamp = formatTimestamp();
  const entry = `- ${timestamp} | ${message}`;
  const current = readText(worklogFile).replace(/\s*$/, "");
  fs.writeFileSync(worklogFile, `${current}\n${entry}\n`, "utf8");

  const state = readState(true);
  if (state) {
    state.lastWorklogAt = timestamp;
    state.updatedAt = timestamp;
    saveState(state);
  }

  print(`Worklog updated: ${entry}`);
}

function startWorkflow(note) {
  if (!note) {
    fail("Usage: batcli workflow start \"note\"");
  }

  const existing = readState(true);
  if (existing) {
    fail("A workflow is already active. Run `batcli workflow status` or `batcli workflow stop` first.");
  }

  const timestamp = formatTimestamp();
  saveState({
    note,
    phase: "doc",
    startedAt: timestamp,
    updatedAt: timestamp,
    lastWorklogAt: null,
  });

  print("Workflow started.");
  print(`- note: ${note}`);
  print("- phase: doc");
}

async function switchPhase(phase) {
  const state = readState();

  if (phase === "code") {
    await validateDocs({ silent: true });
  }

  const timestamp = formatTimestamp();
  state.phase = phase;
  state.updatedAt = timestamp;
  saveState(state);

  print(`Workflow phase set to ${phase}.`);
}

function showStatus() {
  const state = readState(true);

  if (!state) {
    print("Workflow inactive.");
    return;
  }

  print("Workflow active.");
  print(`- note: ${state.note}`);
  print(`- phase: ${state.phase}`);
  print(`- startedAt: ${state.startedAt}`);
  print(`- updatedAt: ${state.updatedAt}`);
  print(`- lastWorklogAt: ${state.lastWorklogAt ?? "none"}`);
}

function stopWorkflow() {
  const state = readState();

  if (!state.lastWorklogAt) {
    fail("Before stopping, append a worklog entry with `batcli docs touch \"message\"`.");
  }

  fs.unlinkSync(stateFile);
  print("Workflow stopped.");
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    fail(`Failed to run \`${command} ${args.join(" ")}\`: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function runNpmCommand(args) {
  runCommand(getNpmCommand(), args);
}

function runAppScript(scriptName) {
  runNpmCommand(["run", scriptName]);
}

function createReadableActionKey() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const padMs = (value) => String(value).padStart(3, "0");
  actionSequence += 1;

  return [
    "act",
    "cli",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    padMs(now.getMilliseconds()),
    String(actionSequence).padStart(4, "0"),
  ].join("-");
}

function parseActionPayload(flags) {
  const payload = {};

  for (const [key, value] of Object.entries(flags)) {
    if (key === "action" || key === "scope") {
      continue;
    }

    if (key === "limit") {
      payload[key] = Number(value);
      continue;
    }

    payload[key] = value;
  }

  return payload;
}

function sendRuntimeActionRequest(request, scope) {
  const endpoint = runtimeControl.getRuntimeControlEndpoint(scope);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let responseBuffer = "";

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      responseBuffer += chunk;

      if (!responseBuffer.includes("\n")) {
        return;
      }

      const rawResponse = responseBuffer.slice(0, responseBuffer.indexOf("\n")).trim();

      try {
        resolve(JSON.parse(rawResponse));
      } catch (error) {
        reject(error);
      } finally {
        socket.end();
      }
    });

    socket.on("error", (error) => {
      reject(
        new Error(
          `Unable to reach the running Electron app at ${endpoint}. Start the desktop shell with \`batcli dev\` first. ${error.message}`,
        ),
      );
    });
  });
}

async function runActionCommand(args) {
  const { flags } = parseFlags(args);
  const actionName =
    typeof flags.action === "string" ? flags.action.trim() : "";

  if (!actionName) {
    fail("Usage: batcli action run --action <action-name> [--output <path>] [--limit <n>]");
  }

  const request = {
    action_key: createReadableActionKey(),
    action_name: actionName,
    payload: parseActionPayload(flags),
    requested_at: new Date().toISOString(),
  };

  try {
    const response = await sendRuntimeActionRequest(request, flags.scope);
    await printStructured(response);

    if (response?.status === "error") {
      process.exit(1);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function installDependencies(extraArgs) {
  const flags = extraArgs.filter(Boolean);
  const shouldLink =
    !flags.includes("--package-lock-only") &&
    !flags.includes("--dry-run") &&
    !flags.includes("--no-link");

  runNpmCommand(["install", ...flags.filter((flag) => flag !== "--no-link")]);

  if (shouldLink) {
    runNpmCommand(["link"]);
  }
}

function printHelp() {
  print("batcli commands:");
  print("- batcli install");
  print("- batcli dev");
  print("- batcli build");
  print("- batcli typecheck");
  print("- batcli preview");
  print("- batcli verify");
  print("- batcli action run --action <action-name>");
  print("- batcli workflow start \"note\"");
  print("- batcli workflow to-doc");
  print("- batcli workflow to-code");
  print("- batcli workflow status");
  print("- batcli workflow stop");
  print("- batcli docs validate");
  print("- batcli docs touch \"message\"");
}

async function main() {
  const [group, action, ...rest] = process.argv.slice(2);

  if (!group) {
    printHelp();
    process.exit(0);
  }

  if (group === "install") {
    installDependencies([action, ...rest]);
    process.exit(0);
  }

  if (group === "dev") {
    runAppScript("app:dev");
    process.exit(0);
  }

  if (group === "build") {
    runAppScript("app:build");
    process.exit(0);
  }

  if (group === "typecheck") {
    runAppScript("app:typecheck");
    process.exit(0);
  }

  if (group === "preview") {
    runAppScript("app:preview");
    process.exit(0);
  }

  if (group === "verify") {
    await validateDocs();
    runAppScript("app:typecheck");
    runAppScript("app:build");
    process.exit(0);
  }

  if (group === "action" && action === "run") {
    await runActionCommand(rest);
    process.exit(0);
  }

  if (group === "docs" && action === "validate") {
    await validateDocs();
    process.exit(0);
  }

  if (group === "docs" && action === "touch") {
    appendWorklog(rest.join(" ").trim());
    process.exit(0);
  }

  if (group === "workflow" && action === "start") {
    startWorkflow(rest.join(" ").trim());
    process.exit(0);
  }

  if (group === "workflow" && action === "to-doc") {
    await switchPhase("doc");
    process.exit(0);
  }

  if (group === "workflow" && action === "to-code") {
    await switchPhase("code");
    process.exit(0);
  }

  if (group === "workflow" && action === "status") {
    showStatus();
    process.exit(0);
  }

  if (group === "workflow" && action === "stop") {
    stopWorkflow();
    process.exit(0);
  }

  printHelp();
  process.exit(1);
}

await main();
