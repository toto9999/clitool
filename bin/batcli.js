#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import runtimeControl from "../shared/runtime-control.cjs";

const cwd = process.cwd();
const stateDir = path.join(cwd, ".clibase");
const stateFile = path.join(stateDir, "workflow-state.json");
const INTERNAL_ROOT_ELEVATED = "--clibase-internal-root-elevated";
const ssotFile = path.join(cwd, "doc", "0. Governance", "ssot.yaml");
const worklogFile = path.join(cwd, "doc", "9. Worklog", "99-worklog.md");
const workspaceRoot = path.join(cwd, "workspace");
const workspaceStateRoot = path.join(cwd, "workspace-state");
const uuidLikePattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const readableSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const readableTokenPattern = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const aliasRefPattern = /^[a-z][a-z0-9+.-]*:\/\/[a-z0-9][a-z0-9\-./]*$/;
const maxReadableRefLength = 48;
const strictKeyPatternByField = {
  active_project_key: /^proj-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  project_key: /^proj-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  default_project_key: /^proj-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  active_tab_key: /^tab-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  tab_key: /^tab-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  default_tab_key: /^tab-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  browser_key: /^browser-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  terminal_key: /^term-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  module_key: /^mod-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  slot_key: /^slot-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  session_key: /^sess-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  window_key: /^window-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  display_key: /^display-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  cli_profile_key: /^cli-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  base_cli_profile_key: /^cli-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  default_cli_profile_key: /^cli-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  shell_profile_key: /^shell-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  runner_key: /^runner-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  browser_policy_key: /^policy-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  terminal_policy_key: /^policy-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  control_plane_policy_key: /^policy-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  layout_key: /^layout-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  layout_preset_key: /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/,
  catalog_module_key: /^catalog-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  package_key: /^package-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  ai_manifest_key: /^ai-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  settings_schema_key: /^schema-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  icon_key: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  seed_url_key: /^seed:\/\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
};

let cachedYamlModule = null;
let actionSequence = 0;
let traceSequence = 0;

function isBrokenPipeError(error) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "EPIPE"
  );
}

function installBrokenPipeGuards() {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error) => {
      if (isBrokenPipeError(error)) {
        return;
      }

      throw error;
    });
  }
}

installBrokenPipeGuards();

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

function normalizePathForMatch(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/");
}

function unquoteGitStatusPath(value) {
  const nextValue = String(value ?? "").trim();
  if (!nextValue.startsWith("\"") || !nextValue.endsWith("\"")) {
    return nextValue;
  }

  try {
    return JSON.parse(nextValue);
  } catch {
    return nextValue.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
  }
}

function pathMatchesGuard(pathValue, guardPath) {
  const normalizedPath = normalizePathForMatch(pathValue);
  const normalizedGuardPath = normalizePathForMatch(guardPath);

  if (!normalizedPath || !normalizedGuardPath) {
    return false;
  }

  if (normalizedGuardPath.endsWith("/")) {
    return normalizedPath.startsWith(normalizedGuardPath);
  }

  return (
    normalizedPath === normalizedGuardPath ||
    normalizedPath.startsWith(`${normalizedGuardPath}/`)
  );
}

function getGitChangedPaths() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain=1", "--untracked-files=all"],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.error || result.status !== 0) {
    return null;
  }

  const output = typeof result.stdout === "string" ? result.stdout : "";
  const changedPaths = new Set();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.length < 4) {
      continue;
    }

    const pathSegment = line.slice(3).trim();
    if (!pathSegment) {
      continue;
    }

    const renameSeparatorIndex = pathSegment.lastIndexOf(" -> ");
    const candidatePath =
      renameSeparatorIndex >= 0
        ? pathSegment.slice(renameSeparatorIndex + 4)
        : pathSegment;
    const normalizedPath = normalizePathForMatch(unquoteGitStatusPath(candidatePath));
    if (normalizedPath) {
      changedPaths.add(normalizedPath);
    }
  }

  return [...changedPaths];
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

    if (nextToken === undefined || nextToken.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = nextToken;
    index += 1;
  }

  return { flags, positionals };
}

function powershellExe() {
  return process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function stripInternalRootElevated(tokens) {
  return tokens.filter((token) => token !== INTERNAL_ROOT_ELEVATED);
}

function isRootElevatedArgPresent(tokens) {
  return tokens.includes(INTERNAL_ROOT_ELEVATED);
}

function canManageHyperVSync() {
  if (process.platform !== "win32") {
    return false;
  }
  const result = spawnSync(
    powershellExe(),
    [
      "-NoProfile",
      "-Command",
      [
        "$ErrorActionPreference = 'Stop'",
        "try {",
        "  Import-Module Hyper-V -ErrorAction Stop",
        "  $null = Get-VM -ErrorAction Stop | Select-Object -First 1",
        "  exit 0",
        "} catch {",
        "  exit 1",
        "}",
      ].join("; "),
    ],
    { windowsHide: true, encoding: "utf8", shell: false },
  );
  return result.status === 0;
}

function isWindowsAdministratorSync() {
  if (process.platform !== "win32") {
    return false;
  }
  const result = spawnSync(
    powershellExe(),
    [
      "-NoProfile",
      "-Command",
      [
        "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())",
        "$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
        "if ($isAdmin) { exit 0 }",
        "exit 1",
      ].join("; "),
    ],
    { windowsHide: true, encoding: "utf8", shell: false },
  );
  return result.status === 0;
}

function relaunchBatcliElevated(cliArgs) {
  const shell = powershellExe();
  const batcliCmd = path.join(cwd, "batcli.cmd");
  const fallbackScript = path.join(cwd, "bin", "batcli.js");
  const filteredArgs = stripInternalRootElevated(cliArgs);
  const elevatedArgs = [...filteredArgs, INTERNAL_ROOT_ELEVATED];
  const useBatcliCmd = fs.existsSync(batcliCmd);
  const launchPath = useBatcliCmd ? batcliCmd : process.execPath;
  const argumentList = useBatcliCmd ? elevatedArgs : [fallbackScript, ...elevatedArgs];
  const argParts = argumentList.map((token) => `'${escapePowerShellSingleQuoted(token)}'`).join(",");
  const launchEsc = escapePowerShellSingleQuoted(launchPath);
  const cwdEsc = escapePowerShellSingleQuoted(cwd);
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  Set-Location -LiteralPath '${cwdEsc}'`,
    `  $p = Start-Process -FilePath '${launchEsc}' -ArgumentList @(${argParts}) -WorkingDirectory '${cwdEsc}' -Verb RunAs -PassThru -Wait`,
    "  if ($null -eq $p) { exit 1 }",
    "  exit $p.ExitCode",
    "} catch {",
    "  if ($_.Exception.Message -match 'canceled by the user') {",
    "    Write-Host 'UAC elevation was canceled by the user.'",
    "    exit 2",
    "  }",
    "  throw",
    "}",
  ].join("; ");

  return spawnSync(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
}

function commandRequestsNoAutoElevate(tokens) {
  const { flags } = parseFlags(tokens);
  return Boolean(flags["no-auto-elevate"] || flags.no_auto_elevate);
}

function getCommandElevationRequirement(tokens) {
  if (tokens.includes("--help") || tokens.includes("-h")) {
    return null;
  }

  const [group, action, ...rest] = tokens;
  if (group !== "vm") {
    return null;
  }

  if (action === "network") {
    if (rest[0] === "repair") {
      return "admin";
    }
    return null;
  }

  if (action === "hyperv") {
    return "hyperv";
  }

  if (action === "guest" && ["session", "diagnose-gennx-new-project", "app"].includes(rest[0] ?? "")) {
    return null;
  }

  if (action === "gennx") {
    return null;
  }

  return null;
}

function maybeAutoElevateRoot(tokens, rootElevated) {
  if (process.platform !== "win32" || rootElevated) {
    return false;
  }
  if (commandRequestsNoAutoElevate(tokens)) {
    return false;
  }

  const requirement = getCommandElevationRequirement(tokens);
  if (!requirement) {
    return false;
  }

  if (requirement === "admin" && isWindowsAdministratorSync()) {
    return false;
  }
  if (requirement === "hyperv" && canManageHyperVSync()) {
    return false;
  }

  const userFacingCommand = `batcli ${tokens.join(" ")}`.trim();
  print(`batcli: re-launching elevated once for \`${userFacingCommand}\`.`);
  const relaunched = relaunchBatcliElevated(tokens);
  process.exit(typeof relaunched.status === "number" ? relaunched.status : 1);
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

function printJson(value) {
  print(JSON.stringify(value, null, 2));
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

async function validateUiDocumentationGuard({ silent = false } = {}) {
  const ssot = await readSsot();
  const uiChangeGuard = ssot?.documentation?.ui_change_guard;

  if (!uiChangeGuard?.enabled) {
    return;
  }

  const watchedCodePaths = Array.isArray(uiChangeGuard.watched_code_paths)
    ? uiChangeGuard.watched_code_paths.map(normalizePathForMatch).filter(Boolean)
    : [];
  const requiredDocPaths = Array.isArray(uiChangeGuard.required_doc_paths)
    ? uiChangeGuard.required_doc_paths.map(normalizePathForMatch).filter(Boolean)
    : [];

  if (watchedCodePaths.length === 0 || requiredDocPaths.length === 0) {
    fail(
      "`doc/0. Governance/ssot.yaml` ui_change_guard must define non-empty watched_code_paths and required_doc_paths.",
    );
  }

  const changedPaths = getGitChangedPaths();
  if (!changedPaths || changedPaths.length === 0) {
    return;
  }

  const hasUiCodeChange = changedPaths.some((changedPath) =>
    watchedCodePaths.some((watchPath) => pathMatchesGuard(changedPath, watchPath)),
  );

  if (!hasUiCodeChange) {
    return;
  }

  const hasUiDocChange = changedPaths.some((changedPath) =>
    requiredDocPaths.some((docPath) => pathMatchesGuard(changedPath, docPath)),
  );

  if (!hasUiDocChange) {
    fail(
      [
        "UI documentation guard failed.",
        `Detected UI code changes under: ${watchedCodePaths.join(", ")}`,
        "But no required UI governance document was updated.",
        `Update at least one of: ${requiredDocPaths.join(", ")}`,
      ].join(" "),
    );
  }

  if (!silent) {
    print("UI documentation guard passed.");
  }
}

function collectYamlFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const discovered = [];

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (entry.isFile() && /\.(yaml|yml)$/i.test(entry.name)) {
        discovered.push(absolutePath);
      }
    }
  };

  walk(rootDir);
  return discovered;
}

function shouldValidateIdentifierFile(relativePath) {
  const normalizedPath = normalizePathForMatch(relativePath);
  if (!normalizedPath) {
    return false;
  }

  if (!/\.(yaml|yml)$/i.test(normalizedPath)) {
    return false;
  }

  if (normalizedPath.startsWith("workspace/logs/")) {
    return false;
  }

  return (
    normalizedPath.startsWith("workspace/") ||
    normalizedPath.startsWith("workspace-state/")
  );
}

function toReadablePathSegments(pathSegments) {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    return "";
  }

  return pathSegments
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : String(segment),
    )
    .join(".");
}

function walkYamlScalars(value, visitor, pathSegments = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkYamlScalars(item, visitor, [...pathSegments, index]);
    });
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nextValue] of Object.entries(value)) {
      walkYamlScalars(nextValue, visitor, [...pathSegments, key]);
    }
    return;
  }

  visitor(value, pathSegments);
}

function normalizeSeedKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getPathKey(pathSegments, offsetFromEnd = 1) {
  const index = pathSegments.length - offsetFromEnd;
  if (index < 0) {
    return "";
  }

  const candidate = pathSegments[index];
  return typeof candidate === "string" ? candidate : "";
}

function getIssueLocation(relativePath, pathSegments, documentIndex, documentCount) {
  const documentLabel = documentCount > 1 ? ` (doc: ${documentIndex + 1})` : "";
  const pathLabel = toReadablePathSegments(pathSegments);
  return `${relativePath}${documentLabel}${pathLabel ? ` (path: ${pathLabel})` : ""}`;
}

function addIdentifierIssue(issues, message, relativePath, pathSegments, documentIndex, documentCount) {
  issues.push(`${message} @ ${getIssueLocation(relativePath, pathSegments, documentIndex, documentCount)}`);
}

function validateReadableIdentifierValue({
  fieldName,
  value,
  relativePath,
  pathSegments,
  documentIndex,
  documentCount,
  issues,
}) {
  if (typeof value !== "string") {
    return;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return;
  }

  const uuidMatch = normalizedValue.match(uuidLikePattern);
  if (uuidMatch) {
    addIdentifierIssue(
      issues,
      `Forbidden UUID-like identifier \`${uuidMatch[0]}\``,
      relativePath,
      pathSegments,
      documentIndex,
      documentCount,
    );
  }

  if (
    (fieldName.endsWith("_key") || fieldName.endsWith("_ref")) &&
    normalizedValue.length > maxReadableRefLength
  ) {
    addIdentifierIssue(
      issues,
      `Identifier \`${fieldName}\` is too long (${normalizedValue.length}). Keep readable aliases at ${maxReadableRefLength} chars or less.`,
      relativePath,
      pathSegments,
      documentIndex,
      documentCount,
    );
  }

  if (fieldName === "home_url") {
    const lowerValue = normalizedValue.toLowerCase();
    if (lowerValue.startsWith("data:")) {
      addIdentifierIssue(
        issues,
        "Browser home_url must not persist raw data URLs; use seed:// alias or canonical URL",
        relativePath,
        pathSegments,
        documentIndex,
        documentCount,
      );
      return;
    }

    if (lowerValue.startsWith("javascript:")) {
      addIdentifierIssue(
        issues,
        "Browser home_url must not use javascript: URLs",
        relativePath,
        pathSegments,
        documentIndex,
        documentCount,
      );
      return;
    }

    const isAcceptedHomeUrl =
      normalizedValue.startsWith("seed://") ||
      normalizedValue.startsWith("https://") ||
      normalizedValue.startsWith("http://") ||
      normalizedValue.startsWith("file://") ||
      normalizedValue === "about:blank";

    if (!isAcceptedHomeUrl) {
      addIdentifierIssue(
        issues,
        "Browser home_url must be seed://<alias>, http(s)://, file://, or about:blank",
        relativePath,
        pathSegments,
        documentIndex,
        documentCount,
      );
    }

    if (normalizedValue.startsWith("seed://")) {
      const slug = normalizedValue.slice("seed://".length);
      if (!readableSlugPattern.test(slug)) {
        addIdentifierIssue(
          issues,
          `Browser home_url seed alias \`${normalizedValue}\` must use readable kebab-case slug`,
          relativePath,
          pathSegments,
          documentIndex,
          documentCount,
        );
      }
    }

    return;
  }

  const strictPattern = strictKeyPatternByField[fieldName];
  if (strictPattern && !strictPattern.test(normalizedValue)) {
    addIdentifierIssue(
      issues,
      `Identifier \`${fieldName}\` must follow readable contract pattern`,
      relativePath,
      pathSegments,
      documentIndex,
      documentCount,
    );
    return;
  }

  if (fieldName.endsWith("_key") && !strictPattern && !readableTokenPattern.test(normalizedValue)) {
    addIdentifierIssue(
      issues,
      `Identifier \`${fieldName}\` must use readable lower-case token format`,
      relativePath,
      pathSegments,
      documentIndex,
      documentCount,
    );
    return;
  }

  if (
    fieldName.endsWith("_ref") &&
    !strictPattern &&
    !aliasRefPattern.test(normalizedValue) &&
    !readableTokenPattern.test(normalizedValue)
  ) {
    addIdentifierIssue(
      issues,
      `Reference \`${fieldName}\` must use readable alias format (scheme://slug or readable token)`,
      relativePath,
      pathSegments,
      documentIndex,
      documentCount,
    );
  }
}

async function validateReadableIdentifierPolicy({ silent = false } = {}) {
  const hasWorkspace = fs.existsSync(workspaceRoot);
  const hasWorkspaceState = fs.existsSync(workspaceStateRoot);
  if (!hasWorkspace && !hasWorkspaceState) {
    return;
  }

  const YAML = await getYamlModule();
  const issues = [];
  const normalizedSeedRefsByFile = new Map();
  const yamlFiles = [
    ...(hasWorkspace ? collectYamlFiles(workspaceRoot) : []),
    ...(hasWorkspaceState ? collectYamlFiles(workspaceStateRoot) : []),
  ];

  for (const absolutePath of yamlFiles) {
    const relativePath = normalizePathForMatch(path.relative(cwd, absolutePath));
    if (!shouldValidateIdentifierFile(relativePath)) {
      continue;
    }

    let parsedDocuments = [];

    try {
      if (typeof YAML.parseAllDocuments === "function") {
        const documents = YAML.parseAllDocuments(readText(absolutePath));
        parsedDocuments = documents.map((document, documentIndex) => {
          if (Array.isArray(document?.errors) && document.errors.length > 0) {
            issues.push(
              `Unable to parse workspace YAML \`${relativePath}\` document ${
                documentIndex + 1
              }: ${document.errors.map((item) => item.message).join("; ")}`,
            );
            return null;
          }

          return document.toJSON();
        });
      } else {
        parsedDocuments = [YAML.parse(readText(absolutePath))];
      }
    } catch (error) {
      issues.push(
        `Unable to parse workspace YAML \`${relativePath}\`: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }

    parsedDocuments.forEach((parsedDocument, documentIndex) => {
      walkYamlScalars(parsedDocument, (scalarValue, pathSegments) => {
        const leafKey = getPathKey(pathSegments, 1);
        const parentKey = getPathKey(pathSegments, 2);

        if (typeof scalarValue === "string") {
          validateReadableIdentifierValue({
            fieldName: leafKey,
            value: scalarValue,
            relativePath,
            pathSegments,
            documentIndex,
            documentCount: parsedDocuments.length,
            issues,
          });
        }

        if (typeof scalarValue === "string" && parentKey === "active_tabs") {
          if (!strictKeyPatternByField.project_key.test(leafKey)) {
            addIdentifierIssue(
              issues,
              "active_tabs map key must be a readable project_key (proj-...)",
              relativePath,
              pathSegments,
              documentIndex,
              parsedDocuments.length,
            );
          }

          if (!strictKeyPatternByField.tab_key.test(scalarValue.trim())) {
            addIdentifierIssue(
              issues,
              "active_tabs map value must be a readable tab_key (tab-...)",
              relativePath,
              pathSegments,
              documentIndex,
              parsedDocuments.length,
            );
          }
        }

        if (typeof scalarValue === "string" && parentKey === "project_order") {
          if (!strictKeyPatternByField.project_key.test(scalarValue.trim())) {
            addIdentifierIssue(
              issues,
              "project_order entries must be readable project_key (proj-...)",
              relativePath,
              pathSegments,
              documentIndex,
              parsedDocuments.length,
            );
          }
        }

        if (
          typeof scalarValue === "string" &&
          (parentKey === "tab_order" || parentKey === "attached_tab_keys")
        ) {
          if (!strictKeyPatternByField.tab_key.test(scalarValue.trim())) {
            addIdentifierIssue(
              issues,
              `${parentKey} entries must be readable tab_key (tab-...)`,
              relativePath,
              pathSegments,
              documentIndex,
              parsedDocuments.length,
            );
          }
        }

        if (
          typeof scalarValue === "string" &&
          leafKey === "seed_url_key" &&
          !normalizedSeedRefsByFile.has(relativePath)
        ) {
          normalizedSeedRefsByFile.set(relativePath, new Set());
        }

        if (typeof scalarValue === "string" && leafKey === "seed_url_key") {
          const normalizedSeed = normalizeSeedKey(scalarValue);
          const seenSeedRefs = normalizedSeedRefsByFile.get(relativePath);
          if (normalizedSeed && seenSeedRefs?.has(normalizedSeed)) {
            addIdentifierIssue(
              issues,
              `Duplicate seed_url_key \`${normalizedSeed}\``,
              relativePath,
              pathSegments,
              documentIndex,
              parsedDocuments.length,
            );
          }
          seenSeedRefs?.add(normalizedSeed);
          if (
            normalizedSeed.startsWith("seed://") &&
            !readableSlugPattern.test(normalizedSeed.slice("seed://".length))
          ) {
            addIdentifierIssue(
              issues,
              `Seed alias \`${normalizedSeed}\` must use readable kebab-case slug`,
              relativePath,
              pathSegments,
              documentIndex,
              parsedDocuments.length,
            );
          }
        }
      });
    });
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      process.stderr.write(`- ${issue}\n`);
    }
    process.exit(1);
  }

  if (!silent) {
    print("Readable identifier guard passed.");
  }
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

  await validateReadableIdentifierPolicy({ silent });
  await validateUiDocumentationGuard({ silent });

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

async function stopWorkflow() {
  const state = readState();

  if (!state.lastWorklogAt) {
    fail("Before stopping, append a worklog entry with `batcli docs touch \"message\"`.");
  }

  await validateDocs({ silent: true });

  fs.unlinkSync(stateFile);
  print("Workflow stopped.");
}

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, args, extraEnv = undefined) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    fail(`Failed to run \`${command} ${args.join(" ")}\`: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function canRunCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "pipe",
    env: process.env,
    shell: process.platform === "win32",
  });

  return !result.error && result.status === 0;
}

function runNpmCommand(args) {
  runCommand(getNpmCommand(), args);
}

function stripNamedFlagFromArgv(tokens, longName, snakeName = "") {
  const result = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === `--${longName}` || (snakeName && token === `--${snakeName}`)) {
      const nextToken = tokens[index + 1];
      if (nextToken !== undefined && !String(nextToken).startsWith("--")) {
        index += 1;
      }
      continue;
    }
    if (
      typeof token === "string" &&
      (token.startsWith(`--${longName}=`) || (snakeName && token.startsWith(`--${snakeName}=`)))
    ) {
      continue;
    }
    result.push(token);
  }
  return result;
}

function resolveVmGuestAppKey(tokens, fallback = "gennx") {
  const { flags } = parseFlags(tokens);
  const appKey =
    (typeof flags.app === "string" && flags.app.trim() ? flags.app.trim() : "") ||
    (typeof flags.app_key === "string" && flags.app_key.trim() ? flags.app_key.trim() : "") ||
    fallback;
  return String(appKey ?? "").trim().toLowerCase();
}

function getVmGuestAppScriptPath(appKey, operation) {
  if (appKey === "gennx") {
    if (operation === "launch-visible") {
      return path.join(cwd, "scripts", "vm-gennx-launch-guest.mjs");
    }
    if (operation === "capture-visible") {
      return path.join(cwd, "scripts", "vm-gennx-capture-guest.mjs");
    }
    if (operation === "verify-runtime") {
      return path.join(cwd, "scripts", "vm-gennx-verify-guest.mjs");
    }
    if (operation === "resolve-config") {
      return path.join(cwd, "scripts", "vm-gennx-resolve-config.mjs");
    }
  }
  fail(`Unsupported vm guest app operation/app combination: ${operation} / ${appKey}.`);
}

function runVmGuestAppOperation(operation, tokens, options = {}) {
  const appKey = resolveVmGuestAppKey(tokens, options.defaultAppKey || "gennx");
  const scriptPath = getVmGuestAppScriptPath(appKey, operation);
  if (!fs.existsSync(scriptPath)) {
    fail(`Missing \`${scriptPath}\`.`);
  }
  const forwarded = stripNamedFlagFromArgv(tokens, "app", "app_key");
  const result = spawnSync(process.execPath, [scriptPath, ...forwarded], {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  if (result.error) {
    fail(`Failed to run \`${scriptPath}\`: ${result.error.message}`);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function runNodeScript(scriptPath, args, extraEnv = undefined) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    stdio: "inherit",
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    shell: false,
  });

  if (result.error) {
    fail(`Failed to run \`${scriptPath}\`: ${result.error.message}`);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function runNpmCommandAllowFailure(args) {
  const result = spawnSync(getNpmCommand(), args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  return {
    error: result.error ?? null,
    status: typeof result.status === "number" ? result.status : 1,
  };
}

async function runCommandWithOptionalLog(
  command,
  args,
  { extraEnv, logFile, appendLog = false } = {},
) {
  if (!logFile) {
    runCommand(command, args, extraEnv);
    return;
  }

  const resolvedLogFile = path.isAbsolute(logFile)
    ? logFile
    : path.join(cwd, logFile);
  ensureDir(path.dirname(resolvedLogFile));

  const logStream = fs.createWriteStream(resolvedLogFile, {
    flags: appendLog ? "a" : "w",
    encoding: "utf8",
  });

  print(`batcli log file: ${resolvedLogFile}`);

  const child = spawn(command, args, {
    cwd,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    shell: process.platform === "win32",
    stdio: ["inherit", "pipe", "pipe"],
  });

  const safeWrite = (stream, chunk) => {
    if (stream.destroyed || stream.writableEnded) {
      return;
    }

    try {
      stream.write(chunk);
    } catch (error) {
      if (!isBrokenPipeError(error)) {
        throw error;
      }
    }
  };

  const writeChunk = (stream, chunk) => {
    safeWrite(stream, chunk);
    safeWrite(logStream, chunk);
  };

  child.stdout?.on("data", (chunk) => writeChunk(process.stdout, chunk));
  child.stderr?.on("data", (chunk) => writeChunk(process.stderr, chunk));

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (typeof code === "number" && code !== 0) {
        reject(new Error(`Command exited with status ${code}.`));
        return;
      }

      resolve();
    });
  }).finally(() => {
    logStream.end();
  });
}

async function runAppScript(scriptName, options = undefined) {
  await runCommandWithOptionalLog(getNpmCommand(), ["run", scriptName], options);
}

function parseDevCommandOptions(tokens) {
  const { flags } = parseFlags(tokens);
  const logFile =
    typeof flags["log-file"] === "string" && flags["log-file"].trim().length > 0
      ? flags["log-file"].trim()
      : "";

  return {
    logFile,
    appendLog:
      flags["append-log"] === true ||
      String(flags["append-log"] ?? "").trim().toLowerCase() === "true",
  };
}

function getPythonCommandSpec() {
  if (canRunCommand("py", ["-3", "--version"])) {
    return {
      command: "py",
      prefixArgs: ["-3"],
    };
  }

  if (canRunCommand("python", ["--version"])) {
    return {
      command: "python",
      prefixArgs: [],
    };
  }

  fail(
    "Python 3 is required for the Textual host. Install Python 3, then run `batcli install` again.",
  );
}

function getTextualHostDir() {
  return path.join(cwd, "cli-host", "textual");
}

function getTextualRequirementsFile() {
  return path.join(getTextualHostDir(), "requirements.txt");
}

function getTextualAppFile() {
  return path.join(getTextualHostDir(), "app.py");
}

function getTextualVenvDir() {
  return path.join(stateDir, "python", "textual-host");
}

function getTextualPythonExecutable() {
  const venvDir = getTextualVenvDir();
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

function getUiaExecutorDir() {
  return path.join(cwd, "cli-host", "uia-executor");
}

function getUiaExecutorRequirementsFile() {
  return path.join(getUiaExecutorDir(), "requirements.txt");
}

function getUiaExecutorVenvDir() {
  return path.join(stateDir, "python", "uia-executor");
}

function getUiaExecutorPythonExecutable() {
  const venvDir = getUiaExecutorVenvDir();
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

function ensureUiaExecutorInstalled() {
  if (process.platform !== "win32") {
    print("Skipping UIA executor venv (Windows only).");
    return;
  }

  const pythonSpec = getPythonCommandSpec();
  const venvDir = getUiaExecutorVenvDir();
  const venvPython = getUiaExecutorPythonExecutable();
  const requirementsFile = getUiaExecutorRequirementsFile();

  if (!fs.existsSync(requirementsFile)) {
    fail("Missing `cli-host/uia-executor/requirements.txt`.");
  }

  if (!fs.existsSync(venvPython)) {
    ensureDir(path.dirname(venvDir));
    runCommand(pythonSpec.command, [...pythonSpec.prefixArgs, "-m", "venv", venvDir]);
  }

  runCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  runCommand(venvPython, ["-m", "pip", "install", "-r", requirementsFile]);
}

function ensureUiaPeekVendorInstalled() {
  if (process.platform !== "win32") {
    print("Skipping UiaPeek vendor download (Windows only).");
    return;
  }

  const scriptPath = path.join(cwd, "scripts", "ensure-uiapeek.mjs");
  if (!fs.existsSync(scriptPath)) {
    fail("Missing `scripts/ensure-uiapeek.mjs`.");
  }

  runCommand("node", [scriptPath]);
}

function ensureTextualHostInstalled() {
  const pythonSpec = getPythonCommandSpec();
  const venvDir = getTextualVenvDir();
  const venvPython = getTextualPythonExecutable();
  const requirementsFile = getTextualRequirementsFile();

  if (!fs.existsSync(requirementsFile)) {
    fail("Missing `cli-host/textual/requirements.txt`.");
  }

  if (!fs.existsSync(venvPython)) {
    ensureDir(path.dirname(venvDir));
    runCommand(pythonSpec.command, [...pythonSpec.prefixArgs, "-m", "venv", venvDir]);
  }

  runCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  runCommand(venvPython, ["-m", "pip", "install", "-r", requirementsFile]);
}

function runTextualHost() {
  const textualAppFile = getTextualAppFile();
  const venvPython = getTextualPythonExecutable();

  if (!fs.existsSync(textualAppFile)) {
    fail("Missing `cli-host/textual/app.py`.");
  }

  if (!fs.existsSync(venvPython)) {
    fail("Textual host environment is not installed. Run `batcli install` first.");
  }

  runCommand(venvPython, ["-u", textualAppFile], {
    CLIBASE_BATCLI_ENTRY: path.join(cwd, "bin", "batcli.js"),
    CLIBASE_NODE_EXE: process.execPath,
    CLIBASE_REPO_ROOT: cwd,
    PYTHONUTF8: "1",
  });
}

function verifyTextualHostSyntax() {
  const pythonSpec = getPythonCommandSpec();
  const textualAppFile = getTextualAppFile();

  if (!fs.existsSync(textualAppFile)) {
    fail("Missing `cli-host/textual/app.py`.");
  }

  runCommand(pythonSpec.command, [...pythonSpec.prefixArgs, "-m", "py_compile", textualAppFile]);
}

function verifyUiaExecutorSyntax() {
  if (process.platform !== "win32") {
    return;
  }

  const runStepFile = path.join(cwd, "cli-host", "uia-executor", "run_step.py");
  if (!fs.existsSync(runStepFile)) {
    return;
  }

  const venvPython = getUiaExecutorPythonExecutable();
  if (fs.existsSync(venvPython)) {
    runCommand(venvPython, ["-m", "py_compile", runStepFile]);
    return;
  }

  const pythonSpec = getPythonCommandSpec();
  runCommand(pythonSpec.command, [...pythonSpec.prefixArgs, "-m", "py_compile", runStepFile]);
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

function createReadableTraceKey() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const padMs = (value) => String(value).padStart(3, "0");
  traceSequence += 1;

  return [
    "trace",
    "cli",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    padMs(now.getMilliseconds()),
    String(traceSequence).padStart(4, "0"),
  ].join("-");
}

function parseActionPayload(flags) {
  const payload = {};
  const numericKeys = new Set([
    "limit",
    "cols",
    "rows",
    "shell_split_ratio",
    "shell-split-ratio",
    "shell_stack_split_ratio",
    "shell-stack-split-ratio",
  ]);
  const booleanKeys = new Set([
    "append_newline",
    "append-newline",
    "browser_collapsed",
    "browser-collapsed",
  ]);

  for (const [key, value] of Object.entries(flags)) {
    if (key === "action" || key === "scope") {
      continue;
    }

    if (numericKeys.has(key)) {
      payload[key] = Number(value);
      continue;
    }

    if (booleanKeys.has(key)) {
      if (typeof value === "string") {
        payload[key] = value.trim().toLowerCase() === "true";
      } else {
        payload[key] = Boolean(value);
      }
      continue;
    }

    payload[key] = value;
  }

  return payload;
}

function toPositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boolFlagEnabled(value) {
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
}

function isSpawnPermissionRestricted(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("EPERM") ||
    message.includes("Access is denied") ||
    message.includes("액세스가 거부되었습니다")
  );
}

function sendRuntimeActionRequest(request, scope) {
  const endpoint = runtimeControl.getRuntimeControlEndpoint(scope);
  const socketTimeoutMs = 5000;

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let responseBuffer = "";
    let settled = false;

    socket.setEncoding("utf8");
    socket.setTimeout(socketTimeoutMs);

    const rejectOnce = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const resolveOnce = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

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
        resolveOnce(JSON.parse(rawResponse));
      } catch (error) {
        rejectOnce(error);
      } finally {
        socket.end();
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      rejectOnce(
        new Error(
          `Timed out after ${socketTimeoutMs}ms while waiting for the running Electron app at ${endpoint}. Start the desktop shell with \`batcli dev\` first.`,
        ),
      );
    });

    socket.on("error", (error) => {
      rejectOnce(
        new Error(
          `Unable to reach the running Electron app at ${endpoint}. Start the desktop shell with \`batcli dev\` first. ${error.message}`,
        ),
      );
    });
  });
}

function parseRuntimeSmokeOptions(tokens) {
  const { flags } = parseFlags(tokens);
  const timeoutMs = toPositiveNumber(
    flags["timeout-ms"] ?? flags.timeout_ms,
    45000,
  );
  const pollIntervalMs = toPositiveNumber(
    flags["poll-ms"] ?? flags.poll_ms,
    500,
  );
  const scope =
    typeof flags.scope === "string" && flags.scope.trim().length > 0
      ? flags.scope.trim()
      : runtimeControl.defaultRuntimeScope;
  const logFile =
    typeof flags["log-file"] === "string" && flags["log-file"].trim().length > 0
      ? flags["log-file"].trim()
      : ".clibase/logs/runtime-smoke.log";

  return {
    scope,
    timeoutMs,
    pollIntervalMs,
    existingOnly: boolFlagEnabled(flags["existing-only"] ?? flags.existing_only),
    skipBuild: boolFlagEnabled(flags["skip-build"] ?? flags.skip_build),
    logFile,
    appendLog: boolFlagEnabled(flags["append-log"] ?? flags.append_log),
  };
}

function getRuntimeSmokeArtifactChecklist() {
  return [
    path.join(cwd, "dist", "index.html"),
    path.join(cwd, "dist-electron", "main", "main.cjs"),
    path.join(cwd, "dist-electron", "preload", "preload.cjs"),
  ];
}

function getMissingRuntimeSmokeArtifacts() {
  return getRuntimeSmokeArtifactChecklist().filter(
    (artifactPath) => !fs.existsSync(artifactPath),
  );
}

function createSmokeRuntimeActionRequest() {
  return {
    action_key: createReadableActionKey(),
    trace_key: createReadableTraceKey(),
    action_name: "app.ping",
    actor_type: "global-cli",
    actor_key: "batcli-smoke",
    payload: {},
    requested_at: new Date().toISOString(),
  };
}

async function probeRuntimePing(scope) {
  try {
    const response = await sendRuntimeActionRequest(
      createSmokeRuntimeActionRequest(),
      scope,
    );
    if (response?.status === "success") {
      return response;
    }
    return null;
  } catch {
    return null;
  }
}

function createSmokeLogger(logFile, appendLog) {
  if (!logFile) {
    return {
      write: () => {},
      close: () => Promise.resolve(),
      resolvedPath: "",
    };
  }

  const resolvedPath = path.isAbsolute(logFile)
    ? logFile
    : path.join(cwd, logFile);
  ensureDir(path.dirname(resolvedPath));
  const stream = fs.createWriteStream(resolvedPath, {
    flags: appendLog ? "a" : "w",
    encoding: "utf8",
  });

  const write = (chunk) => {
    if (stream.destroyed || stream.writableEnded) {
      return;
    }

    try {
      stream.write(chunk);
    } catch (error) {
      if (!isBrokenPipeError(error)) {
        throw error;
      }
    }
  };

  return {
    write,
    close: () =>
      new Promise((resolve) => {
        stream.end(resolve);
      }),
    resolvedPath,
  };
}

function terminateChildProcessTree(child) {
  if (!child || typeof child.pid !== "number") {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      cwd,
      stdio: "ignore",
      shell: false,
    });
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // ignore shutdown race
  }
}

function launchRuntimeSmokeProcess({ logFile, appendLog }) {
  const launchScriptPath = path.join(cwd, "scripts", "launch-electron-dev.cjs");

  if (!fs.existsSync(launchScriptPath)) {
    fail("Missing `scripts/launch-electron-dev.cjs`.");
  }

  const logger = createSmokeLogger(logFile, appendLog);
  if (logger.resolvedPath) {
    print(`batcli runtime smoke log: ${logger.resolvedPath}`);
  }

  const spawnWithOptions = (stdio, electronStdioMode) =>
    spawn(process.execPath, [launchScriptPath], {
      cwd,
      env: {
        ...process.env,
        CLIBASE_FORCE_DIST_RENDERER: "1",
        CLIBASE_ELECTRON_STDIO: electronStdioMode,
      },
      stdio,
      shell: false,
    });

  let child = null;
  let usingPipedOutput = false;
  if (logger.resolvedPath) {
    try {
      child = spawnWithOptions(["ignore", "pipe", "pipe"], "pipe");
      usingPipedOutput = true;
    } catch (error) {
      if (!isSpawnPermissionRestricted(error)) {
        throw error;
      }
      print(
        "runtime smoke: piped child stdio is restricted in this environment; falling back to inherited stdio.",
      );
      logger.write(
        `[${formatTimestamp()}] piped child stdio was restricted; fallback to inherited stdio.\n`,
      );
    }
  }

  if (!child) {
    child = spawnWithOptions("inherit", "inherit");
  }

  if (usingPipedOutput) {
    const forwardChunk = (stream, chunk) => {
      if (!stream || !chunk) {
        return;
      }

      try {
        stream.write(chunk);
      } catch (error) {
        if (!isBrokenPipeError(error)) {
          throw error;
        }
      }
      logger.write(chunk);
    };

    child.stdout?.on("data", (chunk) => forwardChunk(process.stdout, chunk));
    child.stderr?.on("data", (chunk) => forwardChunk(process.stderr, chunk));
  }

  return {
    child,
    logger,
  };
}

async function waitForRuntimePing({ scope, timeoutMs, pollIntervalMs, child }) {
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt <= timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(
        `Electron smoke process exited before runtime endpoint became ready (exit code: ${child.exitCode}).`,
      );
    }

    try {
      const response = await sendRuntimeActionRequest(
        createSmokeRuntimeActionRequest(),
        scope,
      );

      if (response?.status === "success") {
        return {
          elapsedMs: Date.now() - startedAt,
          response,
        };
      }

      lastError = response?.error?.message
        ? String(response.error.message)
        : "runtime action returned error status";
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for runtime endpoint. Last error: ${lastError || "none"}`,
  );
}

async function runRuntimeSmokeCommand(args) {
  const options = parseRuntimeSmokeOptions(args);
  const endpoint = runtimeControl.getRuntimeControlEndpoint(options.scope);

  const existingRuntimeResponse = await probeRuntimePing(options.scope);
  if (existingRuntimeResponse) {
    await printStructured({
      status: "success",
      smoke: "runtime",
      mode: "existing-runtime",
      endpoint,
      response: existingRuntimeResponse,
    });
    return;
  }

  if (options.existingOnly) {
    throw new Error(
      `No running runtime endpoint was found at ${endpoint}. Start the Electron shell first, then rerun with --existing-only.`,
    );
  }

  if (!options.skipBuild) {
    print("runtime smoke: building app artifacts via batcli build path...");
    const buildOutcome = runNpmCommandAllowFailure(["run", "app:build"]);
    if (buildOutcome.error || buildOutcome.status !== 0) {
      const missingArtifacts = getMissingRuntimeSmokeArtifacts();
      if (missingArtifacts.length > 0) {
        throw new Error(
          [
            "runtime smoke build failed and required artifacts are missing.",
            `Missing artifacts: ${missingArtifacts.join(", ")}`,
          ].join(" "),
        );
      }

      const reason = buildOutcome.error
        ? buildOutcome.error.message
        : `exit code ${buildOutcome.status}`;
      print(
        `runtime smoke: build step failed (${reason}), continuing with existing dist artifacts.`,
      );
    }
  } else {
    print("runtime smoke: skipping build step as requested.");
    const missingArtifacts = getMissingRuntimeSmokeArtifacts();
    if (missingArtifacts.length > 0) {
      throw new Error(
        [
          "runtime smoke skipped build, but required artifacts are missing.",
          `Missing artifacts: ${missingArtifacts.join(", ")}`,
        ].join(" "),
      );
    }
  }

  const { child, logger } = launchRuntimeSmokeProcess(options);

  let childSpawnError = null;
  child.once("error", (error) => {
    childSpawnError = error;
  });

  let smokeFailure = null;

  try {
    const { elapsedMs, response } = await waitForRuntimePing({
      scope: options.scope,
      timeoutMs: options.timeoutMs,
      pollIntervalMs: options.pollIntervalMs,
      child,
    });

    await printStructured({
      status: "success",
      smoke: "runtime",
      mode: "spawned-runtime",
      elapsed_ms: elapsedMs,
      endpoint,
      response,
    });
  } catch (error) {
    if (childSpawnError) {
      smokeFailure = new Error(
        `Failed to start runtime smoke Electron process: ${
          childSpawnError instanceof Error
            ? childSpawnError.message
            : String(childSpawnError)
        }`,
      );
    } else {
      smokeFailure = error instanceof Error ? error : new Error(String(error));
    }
  } finally {
    terminateChildProcessTree(child);
    await logger.close();
  }

  if (smokeFailure) {
    const message = smokeFailure instanceof Error
      ? smokeFailure.message
      : String(smokeFailure);
    const restrictedEnvironment =
      message.includes("EPERM") ||
      message.includes("2147483651") ||
      message.includes("액세스가 거부되었습니다") ||
      message.includes("Access is denied");
    if (restrictedEnvironment) {
      throw new Error(
        [
          `Runtime smoke could not verify endpoint ${endpoint} in this execution environment due to process permission restrictions.`,
          `Root cause: ${message}`,
          "If Electron is already running, use `batcli smoke runtime --existing-only`. Otherwise run this on your local desktop session where Electron can launch.",
        ].join(" "),
      );
    }

    throw smokeFailure;
  }
}

async function runActionCommand(args) {
  const { flags } = parseFlags(args);
  const actionName =
    typeof flags.action === "string" ? flags.action.trim() : "";
  const outputFormat = typeof flags["output-format"] === "string"
    ? flags["output-format"].trim().toLowerCase()
    : typeof flags.output_format === "string"
      ? flags.output_format.trim().toLowerCase()
      : "yaml";

  if (!actionName) {
    fail("Usage: batcli action run --action <action-name> [--output <path>] [--limit <n>]");
  }

  const request = {
    action_key: createReadableActionKey(),
    trace_key: createReadableTraceKey(),
    action_name: actionName,
    actor_type: "global-cli",
    actor_key: "batcli",
    payload: parseActionPayload(flags),
    requested_at: new Date().toISOString(),
  };

  try {
    const response = await sendRuntimeActionRequest(request, flags.scope);

    if (outputFormat === "json") {
      printJson(response);
    } else {
      await printStructured(response);
    }

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
  const shouldInstallTextual =
    !flags.includes("--package-lock-only") &&
    !flags.includes("--dry-run") &&
    !flags.includes("--no-textual");

  const shouldInstallUiaExecutor =
    !flags.includes("--package-lock-only") &&
    !flags.includes("--dry-run") &&
    !flags.includes("--no-uia-executor") &&
    process.platform === "win32";

  const shouldInstallUiaPeek =
    !flags.includes("--package-lock-only") &&
    !flags.includes("--dry-run") &&
    !flags.includes("--no-uia-peek") &&
    process.platform === "win32";

  runNpmCommand([
    "install",
    ...flags.filter(
      (flag) =>
        flag !== "--no-link" &&
        flag !== "--no-textual" &&
        flag !== "--no-uia-executor" &&
        flag !== "--no-uia-peek",
    ),
  ]);

  if (shouldInstallTextual) {
    ensureTextualHostInstalled();
  }

  if (shouldInstallUiaExecutor) {
    ensureUiaExecutorInstalled();
  }

  if (shouldInstallUiaPeek) {
    ensureUiaPeekVendorInstalled();
  }

  if (shouldLink) {
    runNpmCommand(["link"]);
  }
}

function addDependenciesFromCli(extraArgs) {
  const { flags, positionals } = parseFlags(extraArgs);
  const packages = positionals.filter((value) => value && value.trim().length > 0);

  if (packages.length === 0) {
    fail("Usage: batcli deps add <package> [more-packages] [--dev] [--exact]");
  }

  const npmArgs = ["install"];

  if (flags.dev === true || flags["save-dev"] === true) {
    npmArgs.push("--save-dev");
  }

  if (flags.exact === true || flags["save-exact"] === true) {
    npmArgs.push("--save-exact");
  }

  if (flags["package-lock-only"] === true) {
    npmArgs.push("--package-lock-only");
  }

  if (flags["ignore-scripts"] === true) {
    npmArgs.push("--ignore-scripts");
  }

  npmArgs.push(...packages);
  runNpmCommand(npmArgs);
}

function printHelp() {
  print("batcli commands:");
  print("- batcli install [--no-link] [--no-textual] [--no-uia-executor] [--no-uia-peek]");
  print("- batcli uia-executor install");
  print("- batcli uia-peek download [--force]");
  print("- batcli uia gennx verify [--target-key target-gennx] [--steps-file workspace/uia-steps-gennx-click.yaml] [--macro-key macro-gennx-runtime-verify] [--no-cleanup]  (gennx_guest_runtime; requires GenNX exe + interactive Windows)");
  print("- batcli deps add <package>");
  print("- batcli dev [--log-file .clibase/logs/dev.log] [--append-log]");
  print("- batcli smoke runtime [--timeout-ms 45000] [--poll-ms 500] [--scope workspace-default] [--skip-build] [--existing-only] [--log-file .clibase/logs/runtime-smoke.log]");
  print("- batcli build");
  print("- batcli typecheck");
  print("- batcli preview");
  print("- batcli verify");
  print("- batcli tui");
  print("- batcli action run --action <action-name>");
  print("- batcli action run --action workspace.get-state");
  print("- batcli action run --action project.open --project_key <project-key>");
  print("- batcli action run --action tab.previous");
  print("- batcli action run --action layout.window-state.update --shell_split_ratio 0.62 [--window_key <window-key>]");
  print("- batcli action run --action layout.window-state.update --shell_stack_split_ratio 0.54 [--window_key <window-key>]");
  print("- batcli action run --action layout.window-state.update --browser_dock_position bottom [--window_key <window-key>]");
  print("- batcli action run --action layout.window-state.update --browser_collapsed true [--window_key <window-key>]");
  print("- batcli action run --action terminal.create --terminal_key <terminal-key>");
  print("- batcli action run --action terminal.write --terminal_key <terminal-key> --text <text>");
  print("- batcli workflow start \"note\"");
  print("- batcli workflow to-doc");
  print("- batcli workflow to-code");
  print("- batcli workflow status");
  print("- batcli workflow stop");
  print("- batcli docs validate");
  print("- batcli docs touch \"message\"");
  print("- batcli vm hyperv list|start|connect|ensure-running|guest-ip [vm-name] [--vm_profile_key vm-...] [--no-auto-elevate]  (Hyper-V visible/session control)");
  print("- batcli vm network diagnose|repair --vm_profile_key vm-... [--no-auto-elevate]  (host Internal+NAT / guest static IP recovery)");
  print("- batcli vm guest session status|ensure-visible --vm_profile_key vm-... [--skip-ensure-vm] [--no-auto-elevate]  (guest visible login/session automation)");
  print("- batcli vm guest diagnose-gennx-new-project --vm_profile_key vm-... [--no-auto-elevate]  (auto-login + visible New Project repro and evidence capture)");
  print("- batcli vm guest app launch-visible|capture-visible|verify-runtime|resolve-config --app gennx --vm_profile_key vm-... [--no-auto-elevate]  (standard visible guest-product CLI; old vm gennx ... names remain aliases)");
  print("- batcli vm gennx launch [--folder <dir>] [--exe-path <GenNX.exe>]  (HOST: local Start-Process; default folder dd Desktop x64_Release…; env CLIBASE_GENNX_LAUNCH_FOLDER / CLIBASE_GENNX_EXE)");
  print("- batcli vm gennx capture-guest [--vm_profile_key vm-gennx-lab] [--no-auto-elevate]  (alias: vm guest app capture-visible --app gennx)");
  print("- batcli vm gennx run [--vm_profile_key vm-gennx-lab] [--exe-path <guest>] [--direct] [--no-auto-elevate]  (alias: vm guest app launch-visible --app gennx)");
  print("- batcli vm gennx launch-guest [...]  (same as vm gennx run)");
  print("- batcli vm gennx verify-guest [--vm_profile_key vm-gennx-lab] [--skip-ensure-vm] [--no-auto-elevate]  (alias: vm guest app verify-runtime --app gennx)");
  print("- batcli vm gennx resolve-config [--vm_profile_key vm-...] [--exe-path <guest-exe>]  (alias: vm guest app resolve-config --app gennx)");
}

async function main() {
  const rawCliArgs = process.argv.slice(2);
  const rootElevated = isRootElevatedArgPresent(rawCliArgs);
  const cliArgs = stripInternalRootElevated(rawCliArgs);

  maybeAutoElevateRoot(cliArgs, rootElevated);

  const [group, action, ...rest] = cliArgs;

  if (!group) {
    printHelp();
    process.exit(0);
  }

  if (group === "uia-executor" && action === "install") {
    ensureUiaExecutorInstalled();
    process.exit(0);
  }

  if (group === "uia-peek" && action === "download") {
    const scriptPath = path.join(cwd, "scripts", "ensure-uiapeek.mjs");
    if (!fs.existsSync(scriptPath)) {
      fail("Missing `scripts/ensure-uiapeek.mjs`.");
    }
    runCommand("node", [scriptPath, ...rest]);
    process.exit(0);
  }

  if (group === "uia" && action === "gennx" && rest[0] === "verify") {
    const scriptPath = path.join(cwd, "scripts", "gennx-runtime-verify.mjs");
    if (!fs.existsSync(scriptPath)) {
      fail(`Missing \`${scriptPath}\`.`);
    }
    runCommand("node", [scriptPath, ...rest.slice(1)]);
    process.exit(0);
  }

  if (group === "install") {
    installDependencies([action, ...rest]);
    process.exit(0);
  }

  if (group === "deps" && action === "add") {
    addDependenciesFromCli(rest);
    process.exit(0);
  }

  if (group === "dev") {
    const options = parseDevCommandOptions(
      [action, ...rest].filter((token) => typeof token === "string"),
    );
    await runAppScript("app:dev", options.logFile ? options : undefined);
    process.exit(0);
  }

  if (group === "build") {
    await runAppScript("app:build");
    process.exit(0);
  }

  if (group === "smoke" && action === "runtime") {
    await runRuntimeSmokeCommand(rest);
    process.exit(0);
  }

  if (group === "typecheck") {
    await runAppScript("app:typecheck");
    process.exit(0);
  }

  if (group === "preview") {
    await runAppScript("app:preview");
    process.exit(0);
  }

  if (group === "verify") {
    await validateDocs();
    await runAppScript("app:typecheck");
    verifyTextualHostSyntax();
    verifyUiaExecutorSyntax();
    await runAppScript("app:build");
    process.exit(0);
  }

  if (group === "tui") {
    runTextualHost();
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
    await stopWorkflow();
    process.exit(0);
  }

  if (group === "vm" && action === "hyperv") {
    const scriptPath = path.join(cwd, "scripts", "vm-hyperv.mjs");
    if (!fs.existsSync(scriptPath)) {
      fail(`Missing \`${scriptPath}\`.`);
    }
    runNodeScript(scriptPath, rest);
    process.exit(0);
  }

  if (group === "vm" && action === "network") {
    const scriptPath = path.join(cwd, "scripts", "vm-network.mjs");
    if (!fs.existsSync(scriptPath)) {
      fail(`Missing \`${scriptPath}\`.`);
    }
    runNodeScript(scriptPath, rest);
    process.exit(0);
  }

  if (group === "vm" && action === "guest" && rest[0] === "session") {
    const scriptPath = path.join(cwd, "scripts", "vm-guest-session.mjs");
    if (!fs.existsSync(scriptPath)) {
      fail(`Missing \`${scriptPath}\`.`);
    }
    runNodeScript(scriptPath, rest.slice(1));
    process.exit(0);
  }

  if (group === "vm" && action === "guest" && rest[0] === "diagnose-gennx-new-project") {
    const scriptPath = path.join(cwd, "scripts", "vm-gennx-diagnose-new-project.mjs");
    if (!fs.existsSync(scriptPath)) {
      fail(`Missing \`${scriptPath}\`.`);
    }
    runNodeScript(scriptPath, rest.slice(1));
    process.exit(0);
  }

  if (group === "vm" && action === "guest" && rest[0] === "app" && rest[1] === "launch-visible") {
    runVmGuestAppOperation("launch-visible", rest.slice(2));
    process.exit(0);
  }

  if (group === "vm" && action === "guest" && rest[0] === "app" && rest[1] === "capture-visible") {
    runVmGuestAppOperation("capture-visible", rest.slice(2));
    process.exit(0);
  }

  if (group === "vm" && action === "guest" && rest[0] === "app" && rest[1] === "verify-runtime") {
    runVmGuestAppOperation("verify-runtime", rest.slice(2));
    process.exit(0);
  }

  if (group === "vm" && action === "guest" && rest[0] === "app" && rest[1] === "resolve-config") {
    runVmGuestAppOperation("resolve-config", rest.slice(2));
    process.exit(0);
  }

  if (group === "vm" && action === "gennx" && rest[0] === "capture-guest") {
    runVmGuestAppOperation("capture-visible", ["--app", "gennx", ...rest.slice(1)]);
    process.exit(0);
  }

  if (group === "vm" && action === "gennx" && (rest[0] === "run" || rest[0] === "launch-guest")) {
    runVmGuestAppOperation("launch-visible", ["--app", "gennx", ...rest.slice(1)]);
    process.exit(0);
  }

  if (group === "vm" && action === "gennx" && rest[0] === "launch") {
    const scriptPath = path.join(cwd, "scripts", "gennx-launch-exe.mjs");
    if (!fs.existsSync(scriptPath)) {
      fail(`Missing \`${scriptPath}\`.`);
    }
    runCommand("node", [scriptPath, ...rest.slice(1)]);
    process.exit(0);
  }

  if (group === "vm" && action === "gennx" && rest[0] === "verify-guest") {
    runVmGuestAppOperation("verify-runtime", ["--app", "gennx", ...rest.slice(1)]);
    process.exit(0);
  }

  if (group === "vm" && action === "gennx" && rest[0] === "resolve-config") {
    runVmGuestAppOperation("resolve-config", ["--app", "gennx", ...rest.slice(1)]);
    process.exit(0);
  }

  printHelp();
  process.exit(1);
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
