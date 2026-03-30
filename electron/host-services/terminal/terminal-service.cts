import * as nodePty from "node-pty";
import { recordRuntimeLog } from "../runtime-control/runtime-logging.cjs";
import {
  buildDurableScopeKey,
  createDurableLogStore,
} from "../runtime-control/durable-log-store.cjs";
import type {
  LoadedWorkspaceSnapshot,
  WorkspaceTerminalModule,
} from "../workspace/workspace-store.cjs";

type DurableLogStore = ReturnType<typeof createDurableLogStore>;
type TerminalStatus = "idle" | "running" | "exited" | "error";
type TerminalStreamKind = "pty" | "system";

export interface TerminalOutputEntry {
  output_key: string;
  terminal_key: string;
  stream: TerminalStreamKind;
  text: string;
  created_at: string;
}

interface TerminalSessionEntry extends WorkspaceTerminalModule {
  pty_process: nodePty.IPty | null;
  data_subscription: nodePty.IDisposable | null;
  exit_subscription: nodePty.IDisposable | null;
  status: TerminalStatus;
  cols: number;
  rows: number;
  last_exit_code: number | null;
  started_at: string | null;
  stopped_at: string | null;
  output_ring: TerminalOutputEntry[];
}

interface TerminalServiceOptions {
  snapshot: LoadedWorkspaceSnapshot;
  durableLogStore: DurableLogStore;
  onTerminalOutput?: (entry: TerminalOutputEntry) => void;
  onTerminalStateChange?: (state: ReturnType<typeof toState>) => void;
}

const maxTerminalOutputEntries = 400;
let terminalOutputSequence = 0;

function pad(value: number, size = 2) {
  return String(value).padStart(size, "0");
}

function createTerminalOutputKey() {
  const now = new Date();
  terminalOutputSequence += 1;

  return [
    "termout",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    pad(terminalOutputSequence, 4),
  ].join("-");
}

function resolveShellLaunch(shellProfileKey?: string | null) {
  if (process.platform === "win32") {
    if (shellProfileKey?.includes("cmd")) {
      return {
        command: process.env.ComSpec || "cmd.exe",
        args: [],
      };
    }

    return {
      command: "powershell.exe",
      args: ["-NoLogo", "-NoProfile"],
    };
  }

  return {
    command: process.env.SHELL || "/bin/bash",
    args: ["-l"],
  };
}

function toState(entry: TerminalSessionEntry) {
  return {
    terminal_key: entry.terminal_key,
    project_key: entry.project_key,
    project_name: entry.project_name,
    tab_key: entry.tab_key,
    tab_name: entry.tab_name,
    module_key: entry.module_key,
    module_name: entry.module_name,
    slot_key: entry.slot_key,
    cli_profile_key: entry.cli_profile_key,
    shell_profile_key: entry.shell_profile_key,
    startup_path: entry.startup_path,
    session_key: entry.session_key,
    startup_commands: entry.startup_commands,
    status: entry.status,
    is_running: entry.status === "running" && entry.pty_process !== null,
    session_pid: entry.pty_process?.pid ?? null,
    session_process_name: entry.pty_process?.process ?? null,
    last_exit_code: entry.last_exit_code,
    cols: entry.cols,
    rows: entry.rows,
    output_entry_count: entry.output_ring.length,
    started_at: entry.started_at,
    stopped_at: entry.stopped_at,
    resize_mode: "pty",
    backend: "node-pty",
  };
}

export function createTerminalService(options: TerminalServiceOptions) {
  const durableLogStore = options.durableLogStore;
  const terminalEntries = new Map<string, TerminalSessionEntry>();

  const emitTerminalEvent = (
    entry: TerminalSessionEntry,
    eventName: string,
    payloadSchemaKey: string,
    payload: Record<string, unknown>,
  ) => {
    durableLogStore.appendEventRecord(
      buildDurableScopeKey(entry.project_key, entry.tab_key),
      {
        event_record_key: durableLogStore.createEventRecordKey(),
        trace_key: `trace-${entry.project_key}-${entry.terminal_key}`,
        event_name: eventName,
        source_kind: "host-service",
        source_key: entry.terminal_key,
        payload_schema_key: payloadSchemaKey,
        payload,
        created_at: new Date().toISOString(),
      },
    );
  };

  const disposeSubscriptions = (entry: TerminalSessionEntry) => {
    entry.data_subscription?.dispose();
    entry.exit_subscription?.dispose();
    entry.data_subscription = null;
    entry.exit_subscription = null;
  };

  const rebuildEntries = (snapshot: LoadedWorkspaceSnapshot) => {
    const previousEntries = new Map(terminalEntries);
    const nextKeys = new Set(snapshot.terminal_modules.map((module) => module.terminal_key));

    for (const [terminalKey, entry] of previousEntries.entries()) {
      if (!nextKeys.has(terminalKey)) {
        disposeSubscriptions(entry);
        entry.pty_process?.kill();
      }
    }

    terminalEntries.clear();

    for (const terminalModule of snapshot.terminal_modules) {
      const previousEntry = previousEntries.get(terminalModule.terminal_key);
      terminalEntries.set(terminalModule.terminal_key, {
        ...terminalModule,
        pty_process: previousEntry?.pty_process ?? null,
        data_subscription: previousEntry?.data_subscription ?? null,
        exit_subscription: previousEntry?.exit_subscription ?? null,
        status: previousEntry?.status ?? "idle",
        cols: previousEntry?.cols ?? terminalModule.default_cols,
        rows: previousEntry?.rows ?? terminalModule.default_rows,
        last_exit_code: previousEntry?.last_exit_code ?? null,
        started_at: previousEntry?.started_at ?? null,
        stopped_at: previousEntry?.stopped_at ?? null,
        output_ring: previousEntry?.output_ring ?? [],
      });
    }
  };

  const resolveEntry = (requestedTerminalKey?: string) => {
    const terminalKey =
      requestedTerminalKey?.trim() ||
      options.snapshot.active_terminal_key ||
      options.snapshot.terminal_modules[0]?.terminal_key;
    return terminalKey ? terminalEntries.get(terminalKey) ?? null : null;
  };

  const appendOutput = (
    entry: TerminalSessionEntry,
    stream: TerminalStreamKind,
    text: string,
  ) => {
    const nextEntry: TerminalOutputEntry = {
      output_key: createTerminalOutputKey(),
      terminal_key: entry.terminal_key,
      stream,
      text,
      created_at: new Date().toISOString(),
    };

    entry.output_ring.push(nextEntry);
    if (entry.output_ring.length > maxTerminalOutputEntries) {
      entry.output_ring.splice(0, entry.output_ring.length - maxTerminalOutputEntries);
    }

    recordRuntimeLog("info", "terminal output received", {
      terminal_key: entry.terminal_key,
      stream,
      text_length: text.length,
    });

    emitTerminalEvent(entry, "terminal.output.chunk", "payload-terminal-output-v1", {
      terminal_key: entry.terminal_key,
      stream,
      text_preview: text.slice(0, 1000),
      text_length: text.length,
    });

    options.onTerminalOutput?.(nextEntry);
  };

  const attachPtyListeners = (entry: TerminalSessionEntry, ptyProcess: nodePty.IPty) => {
    disposeSubscriptions(entry);

    entry.data_subscription = ptyProcess.onData((data) => {
      appendOutput(entry, "pty", data);
    });

    entry.exit_subscription = ptyProcess.onExit(({ exitCode, signal }) => {
      disposeSubscriptions(entry);
      entry.pty_process = null;
      entry.status = "exited";
      entry.last_exit_code = typeof exitCode === "number" ? exitCode : null;
      entry.stopped_at = new Date().toISOString();
      appendOutput(
        entry,
        "system",
        `[terminal-exit] code=${entry.last_exit_code ?? "null"} signal=${signal ?? "none"}`,
      );
      emitTerminalEvent(entry, "terminal.session.exited", "payload-terminal-session-exited-v1", {
        terminal_key: entry.terminal_key,
        exit_code: entry.last_exit_code,
        signal: signal ?? null,
      });
      options.onTerminalStateChange?.(toState(entry));
    });
  };

  const createTerminalSession = async (requestedTerminalKey?: string) => {
    const entry = resolveEntry(requestedTerminalKey);

    if (!entry) {
      throw new Error(`No terminal module is registered for ${requestedTerminalKey ?? "the active project"}.`);
    }

    if (entry.pty_process && entry.status === "running") {
      return {
        ...toState(entry),
        reused_existing_session: true,
      };
    }

    const launch = resolveShellLaunch(entry.shell_profile_key);
    const nextEnv = {
      ...process.env,
      CLIBASE_PROJECT_KEY: entry.project_key,
      CLIBASE_TERMINAL_KEY: entry.terminal_key,
      COLUMNS: String(entry.cols),
      LINES: String(entry.rows),
      TERM: process.platform === "win32" ? "xterm-256color" : process.env.TERM || "xterm-256color",
    };

    let ptyProcess: nodePty.IPty;
    try {
      ptyProcess = nodePty.spawn(launch.command, launch.args, {
        name: "xterm-256color",
        cols: entry.cols,
        rows: entry.rows,
        cwd: entry.startup_path || process.cwd(),
        env: nextEnv,
        encoding: "utf8",
        useConpty: process.platform === "win32" ? true : undefined,
      });
    } catch (error) {
      entry.status = "error";
      appendOutput(
        entry,
        "system",
        `[terminal-error] ${error instanceof Error ? error.message : String(error)}`,
      );
      emitTerminalEvent(entry, "terminal.session.error", "payload-terminal-session-error-v1", {
        terminal_key: entry.terminal_key,
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    entry.pty_process = ptyProcess;
    entry.status = "running";
    entry.last_exit_code = null;
    entry.started_at = new Date().toISOString();
    entry.stopped_at = null;
    entry.output_ring = [];

    attachPtyListeners(entry, ptyProcess);

    recordRuntimeLog("info", "terminal session created", {
      terminal_key: entry.terminal_key,
      project_key: entry.project_key,
      pid: ptyProcess.pid,
      backend: "node-pty",
    });

    emitTerminalEvent(entry, "terminal.session.created", "payload-terminal-session-created-v1", {
      terminal_key: entry.terminal_key,
      session_pid: ptyProcess.pid,
      startup_path: entry.startup_path,
      backend: "node-pty",
    });

    if (entry.startup_commands.length > 0) {
      for (const command of entry.startup_commands) {
        ptyProcess.write(`${command}\r`);
      }
    }

    const nextState = toState(entry);
    options.onTerminalStateChange?.(nextState);
    return nextState;
  };

  rebuildEntries(options.snapshot);

  return {
    syncSnapshot: (snapshot: LoadedWorkspaceSnapshot) => {
      options.snapshot = snapshot;
      rebuildEntries(snapshot);
      const states = Array.from(terminalEntries.values()).map((entry) => toState(entry));
      for (const state of states) {
        options.onTerminalStateChange?.(state);
      }
      return states;
    },
    createTerminal: createTerminalSession,
    getTerminalState: (requestedTerminalKey?: string) => {
      const entry = resolveEntry(requestedTerminalKey);
      if (!entry) {
        throw new Error(`No terminal module is registered for ${requestedTerminalKey ?? "the active project"}.`);
      }

      return toState(entry);
    },
    writeTerminal: async (
      requestedTerminalKey: string | undefined,
      text: string,
      appendNewline = true,
    ) => {
      const entry = resolveEntry(requestedTerminalKey);
      if (!entry) {
        throw new Error(`No terminal module is registered for ${requestedTerminalKey ?? "the active project"}.`);
      }

      if (!entry.pty_process || entry.status !== "running") {
        await createTerminalSession(entry.terminal_key);
      }

      const nextText = appendNewline ? `${text}\r` : text;
      entry.pty_process?.write(nextText);
      recordRuntimeLog("info", "terminal input forwarded", {
        terminal_key: entry.terminal_key,
        text_length: text.length,
        append_newline: appendNewline,
      });

      return {
        ...toState(entry),
        written_text: text,
        append_newline: appendNewline,
      };
    },
    resizeTerminal: (requestedTerminalKey: string | undefined, cols: number, rows: number) => {
      const entry = resolveEntry(requestedTerminalKey);
      if (!entry) {
        throw new Error(`No terminal module is registered for ${requestedTerminalKey ?? "the active project"}.`);
      }

      entry.cols = cols;
      entry.rows = rows;

      const applied = Boolean(entry.pty_process && entry.status === "running");
      if (entry.pty_process && entry.status === "running") {
        entry.pty_process.resize(cols, rows);
      }

      appendOutput(
        entry,
        "system",
        `[terminal-resize] cols=${cols} rows=${rows} applied=${applied ? "true" : "false"}`,
      );
      emitTerminalEvent(entry, "terminal.session.resized", "payload-terminal-session-resized-v1", {
        terminal_key: entry.terminal_key,
        cols,
        rows,
        applied,
        mode: "node-pty",
      });

      const nextState = {
        ...toState(entry),
        applied,
        mode: "node-pty",
      };
      options.onTerminalStateChange?.(nextState);
      return nextState;
    },
    killTerminal: (requestedTerminalKey?: string) => {
      const entry = resolveEntry(requestedTerminalKey);
      if (!entry) {
        throw new Error(`No terminal module is registered for ${requestedTerminalKey ?? "the active project"}.`);
      }

      const hadRunningSession = Boolean(entry.pty_process);
      entry.pty_process?.kill();

      emitTerminalEvent(entry, "terminal.session.kill-requested", "payload-terminal-session-kill-v1", {
        terminal_key: entry.terminal_key,
        had_running_session: hadRunningSession,
      });

      const nextState = {
        ...toState(entry),
        kill_requested: hadRunningSession,
      };
      options.onTerminalStateChange?.(nextState);
      return nextState;
    },
    getTerminalLogsTail: (requestedTerminalKey: string | undefined, limit = 20) => {
      const entry = resolveEntry(requestedTerminalKey);
      if (!entry) {
        throw new Error(`No terminal module is registered for ${requestedTerminalKey ?? "the active project"}.`);
      }

      const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), maxTerminalOutputEntries);

      return {
        ...toState(entry),
        entries: entry.output_ring.slice(-normalizedLimit),
        returned_count: Math.min(entry.output_ring.length, normalizedLimit),
      };
    },
    listTerminals: () => Array.from(terminalEntries.values()).map((entry) => toState(entry)),
    shutdown: () => {
      for (const entry of terminalEntries.values()) {
        disposeSubscriptions(entry);
        entry.pty_process?.kill();
      }
    },
  };
}
