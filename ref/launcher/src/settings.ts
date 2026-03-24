import fs from "node:fs";
import path from "node:path";
import type { LauncherSettings, LauncherTheme } from "./shared.js";

const SETTINGS_FILE = "launcher.settings.json";

const isTheme = (value: unknown): value is LauncherTheme => value === "dark" || value === "light";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const defaultSettings = (): LauncherSettings => ({
  theme: "dark",
  terminalHeight: 240,
  terminalCollapsed: false,
  /** Compact base width; dual rail widens only when a project tool rail is visible. */
  sidebarWidth: 58
});

const sanitizeSettings = (value: unknown): LauncherSettings => {
  const defaults = defaultSettings();
  if (!isObject(value)) {
    return defaults;
  }

  const rawTheme = value.theme;
  const rawTerminalHeight = value.terminalHeight;
  const rawTerminalCollapsed = value.terminalCollapsed;
  const rawSidebarWidth = value.sidebarWidth;

  const theme = isTheme(rawTheme) ? rawTheme : defaults.theme;
  const terminalHeight =
    typeof rawTerminalHeight === "number" && rawTerminalHeight >= 160 && rawTerminalHeight <= 600
      ? Math.round(rawTerminalHeight)
      : defaults.terminalHeight;
  const sidebarWidth =
    typeof rawSidebarWidth === "number" && rawSidebarWidth >= 48 && rawSidebarWidth <= 240
      ? Math.round(rawSidebarWidth)
      : defaults.sidebarWidth;
  const terminalCollapsed = typeof rawTerminalCollapsed === "boolean" ? rawTerminalCollapsed : false;

  return {
    theme,
    terminalHeight,
    terminalCollapsed,
    sidebarWidth
  };
};

export const getSettingsPath = (projectRoot: string): string => path.join(projectRoot, SETTINGS_FILE);

export const loadSettings = (projectRoot: string): LauncherSettings => {
  const settingsPath = getSettingsPath(projectRoot);
  if (!fs.existsSync(settingsPath)) {
    return defaultSettings();
  }

  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch {
    return defaultSettings();
  }
};

export const saveSettings = (projectRoot: string, settings: LauncherSettings): LauncherSettings => {
  const settingsPath = getSettingsPath(projectRoot);
  const safe = sanitizeSettings(settings);
  fs.writeFileSync(settingsPath, `${JSON.stringify(safe, null, 2)}\n`, "utf-8");
  return safe;
};
