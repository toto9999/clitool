export type RuntimeLogLevel = "info" | "warn" | "error";

export interface RuntimeLogEntry {
  log_key: string;
  level: RuntimeLogLevel;
  message: string;
  created_at: string;
  detail?: Record<string, string>;
}

const runtimeLogs: RuntimeLogEntry[] = [];
const maxLogEntries = 200;
let logSequence = 0;

function getReadableLogKey() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");

  logSequence += 1;

  return [
    "log",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    String(logSequence).padStart(4, "0"),
  ].join("-");
}

export function recordRuntimeLog(
  level: RuntimeLogLevel,
  message: string,
  detail?: Record<string, string | number | boolean | null | undefined>,
) {
  const entry: RuntimeLogEntry = {
    log_key: getReadableLogKey(),
    level,
    message,
    created_at: new Date().toISOString(),
    detail: detail
      ? Object.fromEntries(
          Object.entries(detail)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )
      : undefined,
  };

  runtimeLogs.push(entry);
  if (runtimeLogs.length > maxLogEntries) {
    runtimeLogs.splice(0, runtimeLogs.length - maxLogEntries);
  }

  const detailSuffix = entry.detail
    ? ` ${JSON.stringify(entry.detail)}`
    : "";

  if (level === "error") {
    console.error(`[runtime:${level}] ${message}${detailSuffix}`);
    return entry;
  }

  if (level === "warn") {
    console.warn(`[runtime:${level}] ${message}${detailSuffix}`);
    return entry;
  }

  console.log(`[runtime:${level}] ${message}${detailSuffix}`);
  return entry;
}

export function getRuntimeLogsTail(limit = 20) {
  const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), maxLogEntries);
  return runtimeLogs.slice(-normalizedLimit);
}
