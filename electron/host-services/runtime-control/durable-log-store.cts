import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

type DurableLogKind = "actions" | "events" | "audit";

interface DurableLogStoreOptions {
  workspaceRoot: string;
}

let durableRecordSequence = 0;

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

function getBucketKey(date = new Date()) {
  return `bucket-${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function createReadableKey(prefix: string, date = new Date()) {
  durableRecordSequence += 1;

  return [
    prefix,
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(durableRecordSequence, 4),
  ].join("-");
}

function appendYamlDocument(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  const rendered = YAML.stringify(value).trimEnd();
  const prefix =
    fs.existsSync(filePath) && fs.statSync(filePath).size > 0 ? "\n---\n" : "---\n";

  fs.appendFileSync(filePath, `${prefix}${rendered}\n`, "utf8");
}

export function buildDurableScopeKey(projectKey?: string | null, tabKey?: string | null) {
  const normalizedProjectKey = projectKey?.trim() || "";
  const normalizedTabKey = tabKey?.trim() || "";

  if (normalizedProjectKey && normalizedTabKey) {
    return `${normalizedProjectKey}-${normalizedTabKey}`;
  }

  if (normalizedProjectKey) {
    return normalizedProjectKey;
  }

  return "global";
}

export function createDurableLogStore(options: DurableLogStoreOptions) {
  const logsRoot = path.join(options.workspaceRoot, "logs");

  const appendRecord = (
    kind: DurableLogKind,
    scopeKey: string,
    value: Record<string, unknown>,
    createdAt = new Date(),
  ) => {
    const normalizedScopeKey = scopeKey.trim() || "global";
    const filePath = path.join(
      logsRoot,
      kind,
      normalizedScopeKey,
      `${getBucketKey(createdAt)}.yaml`,
    );
    appendYamlDocument(filePath, value);
    return filePath;
  };

  return {
    logsRoot,
    appendActionRecord: (
      scopeKey: string,
      value: Record<string, unknown>,
      createdAt = new Date(),
    ) => appendRecord("actions", scopeKey, value, createdAt),
    appendEventRecord: (
      scopeKey: string,
      value: Record<string, unknown>,
      createdAt = new Date(),
    ) => appendRecord("events", scopeKey, value, createdAt),
    appendAuditRecord: (
      scopeKey: string,
      value: Record<string, unknown>,
      createdAt = new Date(),
    ) => appendRecord("audit", scopeKey, value, createdAt),
    createEventRecordKey: () => createReadableKey("evt"),
    createAuditKey: () => createReadableKey("audit"),
  };
}
