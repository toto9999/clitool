import fs from "node:fs";
import path from "node:path";
import type { LauncherMode } from "./shared.js";

const ENV_FILE = "launcher.env";

/**
 * Reads `LAUNCHER_MODE` from ref/launcher/launcher.env at startup. Invalid or missing values default to `user`.
 */
export function loadLauncherMode(projectRoot: string): LauncherMode {
  const envPath = path.join(projectRoot, ENV_FILE);
  if (!fs.existsSync(envPath)) {
    return "user";
  }

  const text = fs.readFileSync(envPath, "utf-8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (key !== "LAUNCHER_MODE") {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value === "admin") {
      return "admin";
    }
    return "user";
  }

  return "user";
}
