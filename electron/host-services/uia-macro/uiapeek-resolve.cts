import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type UiaPeekResolutionSource = "env" | "store" | "path" | "where" | "fallback";

export type UiaPeekHostResolutionSource =
  | "host_env"
  | "host_app_bundle"
  | "host_store_uiapeek"
  | "host_store_direct"
  | "host_adjacent_cli"
  | "host_from_cli_resolve"
  | "host_common"
  | "host_where"
  | "host_path"
  | "none";

export interface UiaPeekAdapterPathConfig {
  executable_path: string;
}

export interface UiaPeekHostResolveOptions {
  /** Checked after CLIBASE_UIAPEEK_HOST_EXE (e.g. repo vendor/, app userData cache). */
  preferredHostExePaths?: string[];
}

function findUiaPeekExecutableInPath(): string | null {
  const pathVar = process.env.PATH ?? process.env.Path ?? "";
  const dirs = pathVar.split(path.delimiter).filter(Boolean);
  const names = process.platform === "win32" ? ["uiapeek.exe", "uiapeek"] : ["uiapeek"];

  for (const dir of dirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        if (fs.existsSync(full)) {
          const st = fs.statSync(full);
          if (st.isFile()) {
            return full;
          }
        }
      } catch {
        // ignore access errors
      }
    }
  }

  return null;
}

function findUiaPeekViaWhere(): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const whereExe = path.join(systemRoot, "System32", "where.exe");
  if (!fs.existsSync(whereExe)) {
    return null;
  }

  const result = spawnSync(whereExe, ["uiapeek"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error || result.status !== 0 || !result.stdout) {
    return null;
  }

  const firstLine = result.stdout
    .trim()
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  if (!firstLine) {
    return null;
  }

  const candidate = firstLine.trim();
  return fs.existsSync(candidate) ? candidate : null;
}

function findUiaPeekInCommonLocations(): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  const local = process.env.LOCALAPPDATA;
  const candidates: string[] = [];
  if (local) {
    candidates.push(path.join(local, "Programs", "uia-peek", "uiapeek.exe"));
    candidates.push(path.join(local, "Programs", "UiaPeek", "uiapeek.exe"));
    candidates.push(path.join(local, "uia-peek", "uiapeek.exe"));
  }

  const programFiles = process.env.ProgramFiles;
  if (programFiles) {
    candidates.push(path.join(programFiles, "UiaPeek", "uiapeek.exe"));
    candidates.push(path.join(programFiles, "uia-peek", "uiapeek.exe"));
  }

  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, "UiaPeek", "uiapeek.exe"));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function resolveUiaPeekExecutable(adapterConfig: UiaPeekAdapterPathConfig): {
  executable: string;
  source: UiaPeekResolutionSource;
} {
  const fromEnv = process.env.CLIBASE_UIAPEEK_EXE?.trim();
  if (fromEnv) {
    return { executable: fromEnv, source: "env" };
  }

  const stored = adapterConfig.executable_path.trim();
  if (stored) {
    return { executable: stored, source: "store" };
  }

  const common = findUiaPeekInCommonLocations();
  if (common) {
    return { executable: common, source: "path" };
  }

  const wherePath = findUiaPeekViaWhere();
  if (wherePath) {
    return { executable: wherePath, source: "where" };
  }

  const pathScan = findUiaPeekExecutableInPath();
  if (pathScan) {
    return { executable: pathScan, source: "path" };
  }

  return { executable: "uiapeek", source: "fallback" };
}

function findUiaPeekHostInPath(): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  const pathVar = process.env.PATH ?? process.env.Path ?? "";
  const dirs = pathVar.split(path.delimiter).filter(Boolean);
  const name = "UiaPeek.exe";

  for (const dir of dirs) {
    const full = path.join(dir, name);
    try {
      if (fs.existsSync(full)) {
        const st = fs.statSync(full);
        if (st.isFile()) {
          return full;
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

function findUiaPeekHostViaWhere(): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const whereExe = path.join(systemRoot, "System32", "where.exe");
  if (!fs.existsSync(whereExe)) {
    return null;
  }

  const result = spawnSync(whereExe, ["UiaPeek.exe"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error || result.status !== 0 || !result.stdout) {
    return null;
  }

  const firstLine = result.stdout
    .trim()
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  if (!firstLine) {
    return null;
  }

  const candidate = firstLine.trim();
  return fs.existsSync(candidate) ? candidate : null;
}

function findUiaPeekHostInCommonLocations(): string | null {
  if (process.platform !== "win32") {
    return null;
  }

  const local = process.env.LOCALAPPDATA;
  const candidates: string[] = [];
  if (local) {
    candidates.push(path.join(local, "Programs", "uia-peek", "UiaPeek.exe"));
    candidates.push(path.join(local, "Programs", "UiaPeek", "UiaPeek.exe"));
    candidates.push(path.join(local, "uia-peek", "UiaPeek.exe"));
  }

  const programFiles = process.env.ProgramFiles;
  if (programFiles) {
    candidates.push(path.join(programFiles, "UiaPeek", "UiaPeek.exe"));
    candidates.push(path.join(programFiles, "uia-peek", "UiaPeek.exe"));
  }

  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (programFilesX86) {
    candidates.push(path.join(programFilesX86, "UiaPeek", "UiaPeek.exe"));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolves the UiaPeek **HTTP host** binary (UiaPeek.exe) used to serve port 9955.
 * See upstream README: run UiaPeek.exe to expose REST + SignalR.
 */
export function resolveUiaPeekHostExecutable(
  adapterConfig: UiaPeekAdapterPathConfig,
  resolveOptions?: UiaPeekHostResolveOptions,
): {
  executable: string | null;
  source: UiaPeekHostResolutionSource;
} {
  const fromEnv = process.env.CLIBASE_UIAPEEK_HOST_EXE?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return { executable: fromEnv, source: "host_env" };
  }

  for (const raw of resolveOptions?.preferredHostExePaths ?? []) {
    const candidate = raw.trim();
    if (candidate && fs.existsSync(candidate)) {
      return { executable: candidate, source: "host_app_bundle" };
    }
  }

  const stored = adapterConfig.executable_path.trim();
  if (stored && fs.existsSync(stored)) {
    const bn = path.basename(stored);
    if (/^UiaPeek\.exe$/i.test(bn)) {
      return { executable: stored, source: "host_store_direct" };
    }
    if (/^uiapeek\.exe$/i.test(bn)) {
      const adjacent = path.join(path.dirname(stored), "UiaPeek.exe");
      if (fs.existsSync(adjacent)) {
        return { executable: adjacent, source: "host_adjacent_cli" };
      }
      return { executable: stored, source: "host_store_uiapeek" };
    }
  }

  const cli = resolveUiaPeekExecutable(adapterConfig);
  if (cli.executable !== "uiapeek" && path.isAbsolute(cli.executable)) {
    const adjacent = path.join(path.dirname(cli.executable), "UiaPeek.exe");
    if (fs.existsSync(adjacent)) {
      return { executable: adjacent, source: "host_adjacent_cli" };
    }
    if (path.basename(cli.executable).toLowerCase().endsWith(".exe")) {
      return { executable: cli.executable, source: "host_from_cli_resolve" };
    }
  }

  const common = findUiaPeekHostInCommonLocations();
  if (common) {
    return { executable: common, source: "host_common" };
  }

  const whereHost = findUiaPeekHostViaWhere();
  if (whereHost) {
    return { executable: whereHost, source: "host_where" };
  }

  const pathScan = findUiaPeekHostInPath();
  if (pathScan) {
    return { executable: pathScan, source: "host_path" };
  }

  return { executable: null, source: "none" };
}
