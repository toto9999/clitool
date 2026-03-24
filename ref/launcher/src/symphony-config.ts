import fs from "node:fs";
import path from "node:path";
import type { McpServerConfig, SkillConfig, SymphonyConfig } from "./shared.js";

const SYMPHONY_CONFIG_FILE = "symphony.config.json";

export const generateId = (): string =>
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const defaultSymphonyConfig = (): SymphonyConfig => ({
  skills: [],
  mcpServers: [],
  cliPort: 7777,
  autoStart: false
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isValidSkill = (v: unknown): v is SkillConfig =>
  isObject(v) &&
  typeof v.id === "string" &&
  typeof v.name === "string" &&
  typeof v.path === "string" &&
  typeof v.enabled === "boolean" &&
  typeof v.description === "string";

const isValidMcpServer = (v: unknown): v is McpServerConfig =>
  isObject(v) &&
  typeof v.id === "string" &&
  typeof v.name === "string" &&
  typeof v.command === "string" &&
  Array.isArray(v.args) &&
  typeof v.enabled === "boolean";

const sanitize = (value: unknown): SymphonyConfig => {
  const def = defaultSymphonyConfig();
  if (!isObject(value)) {
    return def;
  }

  const skills = Array.isArray(value.skills) ? value.skills.filter(isValidSkill) : def.skills;
  const mcpServers = Array.isArray(value.mcpServers)
    ? value.mcpServers.filter(isValidMcpServer)
    : def.mcpServers;
  const cliPort =
    typeof value.cliPort === "number" && value.cliPort >= 1024 && value.cliPort <= 65535
      ? Math.round(value.cliPort)
      : def.cliPort;
  const autoStart = typeof value.autoStart === "boolean" ? value.autoStart : def.autoStart;

  return { skills, mcpServers, cliPort, autoStart };
};

export const loadSymphonyConfig = (projectRoot: string): SymphonyConfig => {
  const configPath = path.join(projectRoot, SYMPHONY_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return defaultSymphonyConfig();
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return sanitize(JSON.parse(raw) as unknown);
  } catch {
    return defaultSymphonyConfig();
  }
};

export const saveSymphonyConfig = (projectRoot: string, config: SymphonyConfig): SymphonyConfig => {
  const configPath = path.join(projectRoot, SYMPHONY_CONFIG_FILE);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  return config;
};
