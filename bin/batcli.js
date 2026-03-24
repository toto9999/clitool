#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const cwd = process.cwd();
const stateDir = path.join(cwd, ".clibase");
const stateFile = path.join(stateDir, "workflow-state.json");
const ssotFile = path.join(cwd, "doc", "0. Governance", "ssot.yaml");
const worklogFile = path.join(cwd, "doc", "9. Worklog", "99-worklog.md");

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

function readSsot() {
  if (!fs.existsSync(ssotFile)) {
    fail("Missing `doc/0. Governance/ssot.yaml`.");
  }

  try {
    return YAML.parse(readText(ssotFile));
  } catch (error) {
    fail(`Unable to parse doc/0. Governance/ssot.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getRequiredDocuments() {
  const ssot = readSsot();
  const requiredDocuments = ssot?.documentation?.required_documents;

  if (!Array.isArray(requiredDocuments) || requiredDocuments.length === 0) {
    fail("`doc/0. Governance/ssot.yaml` must define `documentation.required_documents`.");
  }

  return requiredDocuments;
}

function validateDocs({ silent = false } = {}) {
  const requiredDocuments = getRequiredDocuments();
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

  print(`Workflow started.`);
  print(`- note: ${note}`);
  print(`- phase: doc`);
}

function switchPhase(phase) {
  const state = readState();

  if (phase === "code") {
    validateDocs({ silent: true });
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

function printHelp() {
  print("batcli commands:");
  print("- batcli workflow start \"note\"");
  print("- batcli workflow to-doc");
  print("- batcli workflow to-code");
  print("- batcli workflow status");
  print("- batcli workflow stop");
  print("- batcli docs validate");
  print("- batcli docs touch \"message\"");
}

const [group, action, ...rest] = process.argv.slice(2);

if (!group) {
  printHelp();
  process.exit(0);
}

if (group === "docs" && action === "validate") {
  validateDocs();
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
  switchPhase("doc");
  process.exit(0);
}

if (group === "workflow" && action === "to-code") {
  switchPhase("code");
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
