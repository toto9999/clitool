import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { recordRuntimeLog } from "../runtime-control/runtime-logging.cjs";

export interface WorkspaceBrowserModule {
  browser_key: string;
  project_key: string;
  project_name: string;
  tab_key: string;
  tab_name: string;
  module_key: string;
  module_name: string;
  slot_key: string;
  home_url_ref: string | null;
  home_url: string | null;
  resolved_home_url: string | null;
  session_key: string | null;
}

export interface WorkspaceTerminalModule {
  terminal_key: string;
  project_key: string;
  project_name: string;
  tab_key: string;
  tab_name: string;
  module_key: string;
  module_name: string;
  slot_key: string;
  cli_profile_key: string | null;
  shell_profile_key: string | null;
  startup_path: string | null;
  session_key: string | null;
  startup_commands: string[];
  default_cols: number;
  default_rows: number;
}

export interface WorkspaceProjectSummary {
  project_key: string;
  project_name: string;
  icon_key: string;
  default_tab_key: string;
  tab_order: string[];
}

export interface WorkspaceTabSummary {
  tab_key: string;
  tab_name: string;
  layout_type: string;
  module_count: number;
  browser_count: number;
  terminal_count: number;
}

export interface WorkspaceWindowRecord {
  window_key: string;
  project_key: string;
  window_mode: "docked-main-window" | "detached-window";
  attached_tab_keys: string[];
  active_tab_key: string;
  display_key: string | null;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  layout_state: WorkspaceWindowLayoutState;
}

export interface WorkspaceWindowLayoutState {
  layout_preset_key: WorkspaceLayoutPresetKey;
  shell_split_ratio: number;
  browser_dock_position: BrowserDockPosition;
  shell_stack_split_ratio: number;
  browser_collapsed: boolean;
}

export interface LoadedWorkspaceSnapshot {
  workspace_root: string;
  workspace_state_root: string;
  default_cli_profile_key: string;
  active_project_key: string;
  active_tab_key: string;
  active_browser_key: string | null;
  active_terminal_key: string | null;
  projects: WorkspaceProjectSummary[];
  active_project: WorkspaceProjectSummary;
  active_project_tabs: WorkspaceTabSummary[];
  window_records: WorkspaceWindowRecord[];
  main_window_key: string;
  browser_modules: WorkspaceBrowserModule[];
  terminal_modules: WorkspaceTerminalModule[];
}

interface WorkspaceStoreOptions {
  mode: "development" | "production";
  repoRoot: string;
  userDataPath: string;
}

type GenericRecord = Record<string, unknown>;
type BrowserDockPosition = "left" | "right" | "top" | "bottom";
type WorkspaceLayoutPresetKey = "main_right_browser_v1";
type BrowserSeedUrlRef = `seed://${string}`;

interface BrowserSeedPageDefinition {
  seed_url_key: BrowserSeedUrlRef;
  title: string;
  body_label: string;
  button_label: string;
}

interface BrowserSeedRegistry {
  by_ref: Map<BrowserSeedUrlRef, string>;
  ref_by_title: Map<string, BrowserSeedUrlRef>;
}

export interface WorkspaceWindowLayoutPolicy {
  layout_preset_key: WorkspaceLayoutPresetKey;
  allowed_browser_dock_positions: BrowserDockPosition[];
  default_shell_split_ratio: number;
  min_shell_split_ratio: number;
  max_shell_split_ratio: number;
  default_shell_stack_split_ratio: number;
  min_shell_stack_split_ratio: number;
  max_shell_stack_split_ratio: number;
  default_browser_collapsed: boolean;
}

const workspaceLayoutPolicies: Record<WorkspaceLayoutPresetKey, WorkspaceWindowLayoutPolicy> = {
  main_right_browser_v1: {
    layout_preset_key: "main_right_browser_v1",
    allowed_browser_dock_positions: ["right"],
    default_shell_split_ratio: 0.62,
    min_shell_split_ratio: 0.52,
    max_shell_split_ratio: 0.74,
    default_shell_stack_split_ratio: 0.32,
    min_shell_stack_split_ratio: 0.24,
    max_shell_stack_split_ratio: 0.52,
    default_browser_collapsed: false,
  },
};

function getWorkspaceLayoutPolicy(
  presetKey?: unknown,
): WorkspaceWindowLayoutPolicy {
  if (
    typeof presetKey === "string" &&
    presetKey.trim() in workspaceLayoutPolicies
  ) {
    return workspaceLayoutPolicies[presetKey.trim() as WorkspaceLayoutPresetKey];
  }

  return workspaceLayoutPolicies.main_right_browser_v1;
}

function toPortablePath(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeYamlFile(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${YAML.stringify(value)}`, "utf8");
}

function ensureYamlFile(filePath: string, value: unknown) {
  if (fs.existsSync(filePath)) {
    return;
  }

  writeYamlFile(filePath, value);
}

function readYamlFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return YAML.parse(raw) as T;
}

function asRecord(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as GenericRecord;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function asNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
}

function clampRatio(value: unknown, fallback: number, min: number, max: number) {
  return Math.min(Math.max(asNumber(value, fallback), min), max);
}

function normalizeBrowserDockPosition(
  value: unknown,
  policy: WorkspaceWindowLayoutPolicy,
): BrowserDockPosition {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase() as BrowserDockPosition;
    if (policy.allowed_browser_dock_positions.includes(normalized)) {
      return normalized;
    }
  }

  return policy.allowed_browser_dock_positions[0] ?? "right";
}

function createDefaultWindowLayoutState(
  presetKey?: unknown,
): WorkspaceWindowLayoutState {
  const policy = getWorkspaceLayoutPolicy(presetKey);

  return {
    layout_preset_key: policy.layout_preset_key,
    shell_split_ratio: policy.default_shell_split_ratio,
    browser_dock_position: policy.allowed_browser_dock_positions[0] ?? "right",
    shell_stack_split_ratio: policy.default_shell_stack_split_ratio,
    browser_collapsed: policy.default_browser_collapsed,
  };
}

function normalizeWindowLayoutState(
  value: unknown,
): WorkspaceWindowLayoutState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultWindowLayoutState();
  }

  const layoutStateValue = value as GenericRecord;
  const explicitPresetKey = asString(layoutStateValue.layout_preset_key, "").trim();
  if (!explicitPresetKey) {
    return createDefaultWindowLayoutState();
  }

  const policy = getWorkspaceLayoutPolicy(explicitPresetKey);
  return {
    layout_preset_key: policy.layout_preset_key,
    shell_split_ratio: clampRatio(
      layoutStateValue.shell_split_ratio,
      policy.default_shell_split_ratio,
      policy.min_shell_split_ratio,
      policy.max_shell_split_ratio,
    ),
    browser_dock_position: normalizeBrowserDockPosition(
      layoutStateValue.browser_dock_position,
      policy,
    ),
    shell_stack_split_ratio: clampRatio(
      layoutStateValue.shell_stack_split_ratio,
      policy.default_shell_stack_split_ratio,
      policy.min_shell_stack_split_ratio,
      policy.max_shell_stack_split_ratio,
    ),
    browser_collapsed: asBoolean(
      layoutStateValue.browser_collapsed,
      policy.default_browser_collapsed,
    ),
  };
}

function patchWindowLayoutState(
  currentLayoutState: WorkspaceWindowLayoutState,
  partialLayoutState: {
    layout_preset_key?: string;
    shell_split_ratio?: number;
    browser_dock_position?: BrowserDockPosition;
    shell_stack_split_ratio?: number;
    browser_collapsed?: boolean;
  },
) {
  const nextPresetKey =
    partialLayoutState.layout_preset_key ?? currentLayoutState.layout_preset_key;
  const policy = getWorkspaceLayoutPolicy(nextPresetKey);
  const nextBaseState =
    nextPresetKey !== currentLayoutState.layout_preset_key
      ? createDefaultWindowLayoutState(nextPresetKey)
      : currentLayoutState;

  return {
    layout_preset_key: policy.layout_preset_key,
    shell_split_ratio:
      typeof partialLayoutState.shell_split_ratio === "number"
        ? clampRatio(
            partialLayoutState.shell_split_ratio,
            policy.default_shell_split_ratio,
            policy.min_shell_split_ratio,
            policy.max_shell_split_ratio,
          )
        : clampRatio(
            nextBaseState.shell_split_ratio,
            policy.default_shell_split_ratio,
            policy.min_shell_split_ratio,
            policy.max_shell_split_ratio,
          ),
    browser_dock_position:
      partialLayoutState.browser_dock_position !== undefined
        ? normalizeBrowserDockPosition(partialLayoutState.browser_dock_position, policy)
        : normalizeBrowserDockPosition(nextBaseState.browser_dock_position, policy),
    shell_stack_split_ratio:
      typeof partialLayoutState.shell_stack_split_ratio === "number"
        ? clampRatio(
            partialLayoutState.shell_stack_split_ratio,
            policy.default_shell_stack_split_ratio,
            policy.min_shell_stack_split_ratio,
            policy.max_shell_stack_split_ratio,
          )
        : clampRatio(
            nextBaseState.shell_stack_split_ratio,
            policy.default_shell_stack_split_ratio,
            policy.min_shell_stack_split_ratio,
            policy.max_shell_stack_split_ratio,
          ),
    browser_collapsed:
      typeof partialLayoutState.browser_collapsed === "boolean"
        ? partialLayoutState.browser_collapsed
        : asBoolean(
            nextBaseState.browser_collapsed,
            policy.default_browser_collapsed,
          ),
  } satisfies WorkspaceWindowLayoutState;
}

function getModuleBrowserKey(
  moduleRecord: GenericRecord,
  settingsRecord: GenericRecord,
  fallbackIndex: number,
) {
  const explicitBrowserKey = asString(settingsRecord.browser_key, "").trim();

  if (explicitBrowserKey) {
    return explicitBrowserKey;
  }

  const moduleKey = asString(moduleRecord.module_key, "").trim();
  if (moduleKey) {
    return `browser-${moduleKey}`;
  }

  return `browser-surface-${String(fallbackIndex).padStart(2, "0")}`;
}

function getModuleTerminalKey(
  moduleRecord: GenericRecord,
  settingsRecord: GenericRecord,
  fallbackIndex: number,
) {
  const explicitTerminalKey = asString(settingsRecord.terminal_key, "").trim();

  if (explicitTerminalKey) {
    return explicitTerminalKey;
  }

  const moduleKey = asString(moduleRecord.module_key, "").trim();
  if (moduleKey) {
    return `term-${moduleKey}`;
  }

  return `term-shell-${String(fallbackIndex).padStart(2, "0")}`;
}

function getWorkspaceRoots(options: WorkspaceStoreOptions) {
  if (options.mode === "development") {
    return {
      workspaceRoot: path.join(options.repoRoot, "workspace"),
      workspaceStateRoot: path.join(options.repoRoot, "workspace-state"),
    };
  }

  return {
    workspaceRoot: path.join(options.userDataPath, "workspace"),
    workspaceStateRoot: path.join(options.userDataPath, "workspace-state"),
  };
}

function buildDataPage(title: string, bodyLabel: string, buttonLabel: string) {
  return `data:text/html;charset=UTF-8,${encodeURIComponent(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Segoe UI, sans-serif;
      }
      html, body {
        height: 100%;
      }
      body {
        margin: 0;
        overflow: auto;
        background:
          radial-gradient(circle at top, rgba(68, 114, 176, 0.14), transparent 36%),
          linear-gradient(180deg, #08101b 0%, #050a12 100%);
        color: #edf3fb;
      }
      .seed-canvas {
        min-height: 100%;
        padding: 20px;
        display: grid;
        align-content: start;
        gap: 14px;
      }
      .seed-shell {
        margin: 0 auto;
        width: min(860px, 100%);
        display: grid;
        gap: 14px;
      }
      .seed-card {
        border-radius: 14px;
        border: 1px solid rgba(151, 180, 221, 0.16);
        background: rgba(8, 16, 28, 0.88);
        padding: 14px;
      }
      .seed-eyebrow {
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        color: #8fb2e6;
      }
      .seed-title {
        margin: 0;
        font-size: clamp(22px, 2.4vw, 28px);
        line-height: 1.1;
      }
      .seed-copy {
        margin: 8px 0 0;
        color: #c5d8f0;
        line-height: 1.5;
      }
      .seed-controls {
        display: grid;
        gap: 10px;
        align-content: start;
      }
      .seed-label {
        color: #bad1f1;
        font-size: 13px;
      }
      .seed-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      #query,
      #go {
        margin: 0;
        border-radius: 10px;
        border: 1px solid rgba(151, 180, 221, 0.25);
        font: inherit;
      }
      #query {
        width: 100%;
        padding: 10px 12px;
        background: rgba(12, 28, 46, 0.92);
        color: #ecf4fe;
      }
      #go {
        cursor: pointer;
        padding: 10px 14px;
        background: #74b0ff;
        color: #05111f;
        font-weight: 700;
      }
      #status {
        margin: 0;
        color: #bad1f1;
        white-space: pre-wrap;
        border: 1px solid rgba(151, 180, 221, 0.2);
        border-radius: 10px;
        background: rgba(8, 18, 32, 0.9);
        padding: 10px 12px;
      }
      @media (max-width: 740px) {
        .seed-canvas {
          padding: 14px;
        }
      }
    </style>
  </head>
  <body>
    <div class="seed-canvas">
      <main class="seed-shell" data-panel-version="6">
        <section class="seed-card">
          <p class="seed-eyebrow">Browser seed</p>
          <h1 class="seed-title">${title}</h1>
          <p class="seed-copy">${bodyLabel}</p>
          <p class="seed-copy">
            This is plain page content inside the browser surface. It is intentionally minimal
            so it never looks like another host panel.
          </p>
        </section>
        <section class="seed-card seed-controls">
          <label class="seed-label" for="query">Seed value</label>
          <input id="query" placeholder="type here" />
          <div class="seed-row">
            <button id="go" type="button">${buttonLabel}</button>
          </div>
          <pre id="status">ready</pre>
        </section>
      </main>
    </div>
    <script>
      const button = document.querySelector("#go");
      const input = document.querySelector("#query");
      const status = document.querySelector("#status");

      const updateStatus = (message) => {
        if (status) {
          status.textContent = message;
        }
      };

      button?.addEventListener("click", () => {
        const value = input instanceof HTMLInputElement ? input.value : "";
        document.title = value ? "${title} :: " + value : "${title} clicked";
        updateStatus(value ? "value:" + value : "clicked");
      });
    </script>
  </body>
</html>`)}`;
}

function normalizeSeedUrlRef(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized.startsWith("seed://")) {
    throw new Error(`Seed url ref must start with seed:// (${value}).`);
  }

  const slug = normalized.slice("seed://".length);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Seed url ref must use readable kebab-case (${value}).`);
  }

  return `seed://${slug}` as BrowserSeedUrlRef;
}

function buildDefaultBrowserSeedDefinitions(): BrowserSeedPageDefinition[] {
  return [
    {
      seed_url_key: "seed://clibase-main-browser",
      title: "CLIBase Main Browser",
      body_label: "Main project browser target.",
      button_label: "Commit main page state",
    },
    {
      seed_url_key: "seed://clibase-review-browser",
      title: "CLIBase Review Browser",
      body_label: "Review tab browser target.",
      button_label: "Commit review page state",
    },
    {
      seed_url_key: "seed://clibase-lab-browser",
      title: "CLIBase Lab Browser",
      body_label: "Lab project browser target.",
      button_label: "Commit lab page state",
    },
  ];
}

function loadBrowserSeedRegistry(workspaceRoot: string): BrowserSeedRegistry {
  const seedsFilePath = getBrowserSeedsFilePath(workspaceRoot);
  const defaultSeeds = buildDefaultBrowserSeedDefinitions();
  const parsed = fs.existsSync(seedsFilePath)
    ? readYamlFile<unknown>(seedsFilePath)
    : { seeds: defaultSeeds };
  const parsedRecord = asRecord(
    parsed,
    "workspace/browser-seeds.yaml must be a mapping.",
  );
  const rawSeeds = Array.isArray(parsedRecord.seeds)
    ? parsedRecord.seeds
    : defaultSeeds;

  const by_ref = new Map<BrowserSeedUrlRef, string>();
  const ref_by_title = new Map<string, BrowserSeedUrlRef>();

  for (const [index, seedEntry] of rawSeeds.entries()) {
    const entry = asRecord(
      seedEntry,
      `browser seed entry ${index + 1} in workspace/browser-seeds.yaml must be a mapping.`,
    );
    const seedUrlRef = normalizeSeedUrlRef(asString(entry.seed_url_key, ""));
    const title = asString(entry.title, "").trim();
    const bodyLabel = asString(entry.body_label, "").trim();
    const buttonLabel = asString(entry.button_label, "").trim();

    if (!title) {
      throw new Error(
        `browser seed ${seedUrlRef} in workspace/browser-seeds.yaml must define title.`,
      );
    }

    if (by_ref.has(seedUrlRef)) {
      throw new Error(`Duplicate browser seed ref ${seedUrlRef} in workspace/browser-seeds.yaml.`);
    }

    by_ref.set(
      seedUrlRef,
      buildDataPage(title, bodyLabel || "Workspace browser target.", buttonLabel || "Apply"),
    );
    ref_by_title.set(title.toLowerCase(), seedUrlRef);
  }

  return {
    by_ref,
    ref_by_title,
  };
}

function resolveBrowserHomeUrl(
  homeUrl: string,
  browserSeedRegistry: BrowserSeedRegistry,
) {
  const trimmed = homeUrl.trim();
  if (!trimmed) {
    return {
      home_url_ref: null,
      home_url: null,
    };
  }

  if (!trimmed.startsWith("seed://")) {
    return {
      home_url_ref: null,
      home_url: trimmed,
    };
  }

  const seedUrlRef = normalizeSeedUrlRef(trimmed);
  const resolvedHomeUrl = browserSeedRegistry.by_ref.get(seedUrlRef);
  if (!resolvedHomeUrl) {
    throw new Error(
      `Unknown browser seed ref ${seedUrlRef}. Define it in workspace/browser-seeds.yaml.`,
    );
  }

  return {
    home_url_ref: seedUrlRef,
    home_url: resolvedHomeUrl,
  };
}

function maybeUpgradeLegacySeedBrowserPage(
  homeUrl: string,
  browserSeedRegistry: BrowserSeedRegistry,
) {
  const trimmed = homeUrl.trim();
  if (!trimmed.startsWith("data:text/html")) {
    return trimmed;
  }

  const separatorIndex = trimmed.indexOf(",");
  if (separatorIndex < 0) {
    return trimmed;
  }

  let decodedHtml = "";
  try {
    decodedHtml = decodeURIComponent(trimmed.slice(separatorIndex + 1));
  } catch {
    return trimmed;
  }

  const lowerHtml = decodedHtml.toLowerCase();
  const isSeedPageLike =
    lowerHtml.includes("id=\"query\"") &&
    lowerHtml.includes("id=\"go\"") &&
    lowerHtml.includes("id=\"status\"") &&
    lowerHtml.includes("clibase");
  const hasPanelVersion6 = lowerHtml.includes("data-panel-version=\"6\"");
  const shouldUpgradeSeedPage = isSeedPageLike && !hasPanelVersion6;

  if (!shouldUpgradeSeedPage) {
    return trimmed;
  }

  const title =
    decodedHtml.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ||
    "CLIBase Browser";
  const bodyLabel =
    decodedHtml.match(/<p>([^<]+)<\/p>/i)?.[1]?.trim() ||
    "Workspace browser target";
  const buttonLabel =
    decodedHtml
      .match(/<button[^>]*id=["']go["'][^>]*>([^<]+)<\/button>/i)?.[1]
      ?.trim() || "Apply";
  const mappedSeedRef = browserSeedRegistry.ref_by_title.get(title.toLowerCase());
  if (mappedSeedRef) {
    return mappedSeedRef;
  }

  return buildDataPage(title, bodyLabel, buttonLabel);
}

function buildDefaultFiles(options: WorkspaceStoreOptions) {
  const startupDirectory = toPortablePath(options.repoRoot);
  const projectMainKey = "proj-clibase-main";
  const projectLabKey = "proj-clibase-lab";
  const tabMainKey = "tab-workbench-01";
  const tabReviewKey = "tab-review-02";
  const tabLabKey = "tab-lab-01";
  const browserKey = "browser-surface-main";
  const reviewBrowserKey = "browser-surface-review-02";
  const mainProjectWindowKey = "window-proj-clibase-main-main";
  const labProjectWindowKey = "window-proj-clibase-lab-main";
  const mainBrowserSeedRef = "seed://clibase-main-browser";
  const reviewBrowserSeedRef = "seed://clibase-review-browser";
  const labBrowserSeedRef = "seed://clibase-lab-browser";

  return {
    app: {
      default_cli_profile_key: "cli-global-default",
      cli_defaults: {
        shell_profile_key: "shell-pwsh-default",
        runner_key: "runner-local-shell",
        startup_directory: startupDirectory,
      },
    },
    browserSeeds: {
      seeds: buildDefaultBrowserSeedDefinitions(),
    },
    cliProfiles: {
      profiles: [
        {
          cli_profile_key: "cli-global-default",
          base_cli_profile_key: null,
          cli_settings: {
            shell_profile_key: "shell-pwsh-default",
            runner_key: "runner-local-shell",
            startup_directory: startupDirectory,
            env_defaults: {
              CLIBASE_ENV: options.mode,
            },
          },
          secret_refs: [],
          allowed_module_types: ["terminal", "ai-assistant"],
          description: "Global CLI base",
        },
      ],
    },
    moduleCatalog: {
      modules: [
        {
          catalog_module_key: "catalog-browser-standard",
          module_type: "browser",
          display_name: "Browser",
          runtime_class: "browser-surface",
          package_key: "package-builtin-browser-surface",
          ai_manifest_key: "ai-browser-standard",
          settings_schema_key: "schema-browser-standard",
          allowed_commands: [
            "browser.get-state",
            "browser.navigate",
            "browser.navigate.back",
            "browser.navigate.forward",
            "browser.navigate.reload",
            "browser.automation.click",
            "browser.automation.fill",
            "browser.automation.extract-text",
            "browser.capture-screenshot",
          ],
          emitted_events: [
            "browser.page.loaded",
            "browser.page.navigated",
            "browser.title.updated",
          ],
        },
        {
          catalog_module_key: "catalog-terminal-standard",
          module_type: "terminal",
          display_name: "Terminal",
          runtime_class: "terminal-surface",
          package_key: "package-builtin-terminal-pty",
          ai_manifest_key: "ai-terminal-standard",
          settings_schema_key: "schema-terminal-standard",
          allowed_commands: [
            "terminal.create",
            "terminal.get-state",
            "terminal.write",
            "terminal.resize",
            "terminal.logs.tail",
            "terminal.kill",
          ],
          emitted_events: [
            "terminal.session.created",
            "terminal.output.chunk",
            "terminal.session.exited",
          ],
        },
      ],
    },
    projectsIndex: {
      default_project_key: projectMainKey,
      project_order: [projectMainKey, projectLabKey],
      project_summaries: [
        {
          project_key: projectMainKey,
          project_name: "CLIBase Main",
          icon_key: "command",
          default_tab_key: tabMainKey,
        },
        {
          project_key: projectLabKey,
          project_name: "CLIBase Lab",
          icon_key: "flask-conical",
          default_tab_key: tabLabKey,
        },
      ],
    },
    mainProject: {
      project_key: projectMainKey,
      project_name: "CLIBase Main",
      icon_key: "command",
      default_tab_key: tabMainKey,
      cli_profile_key: "cli-global-default",
      cli_overrides: {
        startup_directory: startupDirectory,
        env_overrides: {
          CLIBASE_PROJECT_KEY: projectMainKey,
        },
      },
      project_policies: {
        browser_policy_key: "policy-browser-standard",
        terminal_policy_key: "policy-terminal-standard",
        control_plane_policy_key: "policy-control-plane-standard",
      },
      tab_order: [tabMainKey, tabReviewKey],
    },
    labProject: {
      project_key: projectLabKey,
      project_name: "CLIBase Lab",
      icon_key: "flask-conical",
      default_tab_key: tabLabKey,
      cli_profile_key: "cli-global-default",
      cli_overrides: {
        startup_directory: startupDirectory,
        env_overrides: {
          CLIBASE_PROJECT_KEY: projectLabKey,
          CLIBASE_PROJECT_MODE: "lab",
        },
      },
      project_policies: {
        browser_policy_key: "policy-browser-standard",
        terminal_policy_key: "policy-terminal-standard",
        control_plane_policy_key: "policy-control-plane-standard",
      },
      tab_order: [tabLabKey],
    },
    mainAttachments: {
      project_key: projectMainKey,
      enabled_skill_attachments: [],
      enabled_mcp_attachments: [],
      action_exposure_policy: {
        require_global_cli_projection: true,
        require_gui_projection: true,
        require_logging: true,
      },
      controller_defaults: {
        default_gui_actions: ["project.open", "project.save"],
        default_cli_actions: ["project.open", "project.save"],
        default_skill_targets: ["project"],
        default_mcp_targets: ["project"],
      },
    },
    labAttachments: {
      project_key: projectLabKey,
      enabled_skill_attachments: [],
      enabled_mcp_attachments: [],
      action_exposure_policy: {
        require_global_cli_projection: true,
        require_gui_projection: true,
        require_logging: true,
      },
      controller_defaults: {
        default_gui_actions: ["project.open", "project.save"],
        default_cli_actions: ["project.open", "project.save"],
        default_skill_targets: ["project"],
        default_mcp_targets: ["project"],
      },
    },
    mainTab: {
      tab_key: tabMainKey,
      tab_name: "Workbench",
      cli_profile_key: "cli-global-default",
      cli_overrides: {
        startup_directory: startupDirectory,
      },
      layout: {
        layout_key: "layout-workbench-01",
        layout_type: "two-column",
        slots: [
          {
            slot_key: "slot-browser-01",
            title: "Browser",
            bounds: {
              x: 0,
              y: 0,
              w: 7,
              h: 12,
            },
          },
          {
            slot_key: "slot-terminal-01",
            title: "Terminal",
            bounds: {
              x: 7,
              y: 0,
              w: 5,
              h: 12,
            },
          },
        ],
      },
      modules: [
        {
          module_key: "mod-browser-main-01",
          module_type: "browser",
          catalog_module_key: "catalog-browser-standard",
          slot_key: "slot-browser-01",
          module_name: "Main Browser",
          cli_profile_key: null,
          cli_overrides: null,
          settings: {
            browser_key: browserKey,
            home_url: mainBrowserSeedRef,
            session_key: "sess-browser-main-01",
          },
          channel_refs: {
            inbound: [
              "browser.get-state",
              "browser.navigate",
              "browser.automation.click",
              "browser.capture-screenshot",
            ],
            outbound: [
              "browser.page.loaded",
              "browser.title.updated",
            ],
          },
        },
        {
          module_key: "mod-terminal-main-01",
          module_type: "terminal",
          catalog_module_key: "catalog-terminal-standard",
          slot_key: "slot-terminal-01",
          module_name: "Main Shell",
          cli_profile_key: "cli-global-default",
          cli_overrides: null,
          settings: {
            terminal_key: "term-shell-main-01",
            shell_profile_key: "shell-pwsh-default",
            startup_path: startupDirectory,
            session_key: "sess-terminal-main-01",
            default_cols: 120,
            default_rows: 32,
            startup_commands: [],
          },
          channel_refs: {
            inbound: [
              "terminal.create",
              "terminal.write",
              "terminal.resize",
              "terminal.kill",
              "terminal.logs.tail",
            ],
            outbound: [
              "terminal.output.chunk",
              "terminal.session.exited",
            ],
          },
        },
      ],
      bindings: [],
    },
    reviewTab: {
      tab_key: tabReviewKey,
      tab_name: "Review",
      cli_profile_key: "cli-global-default",
      cli_overrides: {
        startup_directory: startupDirectory,
      },
      communication_policy: {
        default_message_scope: "tab-local-only",
        cross_tab_policy: "deny",
      },
      navigation_policy: {
        show_next_button: true,
        next_target_mode: "hidden",
      },
      window_policy: {
        primary_surface: "tab-strip",
        detachable: true,
        default_window_mode: "docked-main-window",
      },
      layout: {
        layout_key: "layout-review-02",
        layout_type: "two-column",
        slots: [
          {
            slot_key: "slot-browser-02",
            title: "Review Browser",
            bounds: {
              x: 0,
              y: 0,
              w: 8,
              h: 12,
            },
          },
          {
            slot_key: "slot-terminal-02",
            title: "Review Terminal",
            bounds: {
              x: 8,
              y: 0,
              w: 4,
              h: 12,
            },
          },
        ],
      },
      modules: [
        {
          module_key: "mod-browser-review-02",
          module_type: "browser",
          catalog_module_key: "catalog-browser-standard",
          slot_key: "slot-browser-02",
          module_name: "Review Browser",
          cli_profile_key: null,
          cli_overrides: null,
          settings: {
            browser_key: reviewBrowserKey,
            home_url: reviewBrowserSeedRef,
            session_key: "sess-browser-review-02",
          },
          channel_refs: {
            inbound: [
              "browser.get-state",
              "browser.navigate",
              "browser.automation.click",
              "browser.capture-screenshot",
            ],
            outbound: [
              "browser.page.loaded",
              "browser.title.updated",
            ],
          },
        },
        {
          module_key: "mod-terminal-review-02",
          module_type: "terminal",
          catalog_module_key: "catalog-terminal-standard",
          slot_key: "slot-terminal-02",
          module_name: "Review Shell",
          cli_profile_key: "cli-global-default",
          cli_overrides: null,
          settings: {
            terminal_key: "term-shell-review-02",
            shell_profile_key: "shell-pwsh-default",
            startup_path: startupDirectory,
            session_key: "sess-terminal-review-02",
            default_cols: 100,
            default_rows: 32,
            startup_commands: [],
          },
          channel_refs: {
            inbound: [
              "terminal.create",
              "terminal.write",
              "terminal.resize",
              "terminal.kill",
              "terminal.logs.tail",
            ],
            outbound: [
              "terminal.output.chunk",
              "terminal.session.exited",
            ],
          },
        },
      ],
      bindings: [],
    },
    labTab: {
      tab_key: tabLabKey,
      tab_name: "Lab",
      cli_profile_key: "cli-global-default",
      cli_overrides: {
        startup_directory: startupDirectory,
      },
      layout: {
        layout_key: "layout-lab-01",
        layout_type: "two-column",
        slots: [
          {
            slot_key: "slot-browser-01",
            title: "Browser",
            bounds: {
              x: 0,
              y: 0,
              w: 7,
              h: 12,
            },
          },
          {
            slot_key: "slot-terminal-01",
            title: "Terminal",
            bounds: {
              x: 7,
              y: 0,
              w: 5,
              h: 12,
            },
          },
        ],
      },
      modules: [
        {
          module_key: "mod-browser-lab-01",
          module_type: "browser",
          catalog_module_key: "catalog-browser-standard",
          slot_key: "slot-browser-01",
          module_name: "Lab Browser",
          cli_profile_key: null,
          cli_overrides: null,
          settings: {
            browser_key: browserKey,
            home_url: labBrowserSeedRef,
            session_key: "sess-browser-lab-01",
          },
          channel_refs: {
            inbound: [
              "browser.get-state",
              "browser.navigate",
              "browser.automation.click",
              "browser.capture-screenshot",
            ],
            outbound: [
              "browser.page.loaded",
              "browser.title.updated",
            ],
          },
        },
        {
          module_key: "mod-terminal-lab-01",
          module_type: "terminal",
          catalog_module_key: "catalog-terminal-standard",
          slot_key: "slot-terminal-01",
          module_name: "Lab Shell",
          cli_profile_key: "cli-global-default",
          cli_overrides: null,
          settings: {
            terminal_key: "term-shell-lab-01",
            shell_profile_key: "shell-pwsh-default",
            startup_path: startupDirectory,
            session_key: "sess-terminal-lab-01",
            default_cols: 120,
            default_rows: 32,
            startup_commands: [],
          },
          channel_refs: {
            inbound: [
              "terminal.create",
              "terminal.write",
              "terminal.resize",
              "terminal.kill",
              "terminal.logs.tail",
            ],
            outbound: [
              "terminal.output.chunk",
              "terminal.session.exited",
            ],
          },
        },
      ],
      bindings: [],
    },
    runtimeIndex: {
      active_project_key: projectMainKey,
      active_tabs: {
        [projectMainKey]: tabMainKey,
        [projectLabKey]: tabLabKey,
      },
    },
    mainViews: {
      project_key: projectMainKey,
      windows: [
        {
          window_key: mainProjectWindowKey,
          project_key: projectMainKey,
          window_mode: "docked-main-window",
          attached_tab_keys: [tabMainKey, tabReviewKey],
          active_tab_key: tabMainKey,
          display_key: null,
          bounds: null,
          layout_state: createDefaultWindowLayoutState(),
        },
      ],
    },
    labViews: {
      project_key: projectLabKey,
      windows: [
        {
          window_key: labProjectWindowKey,
          project_key: projectLabKey,
          window_mode: "docked-main-window",
          attached_tab_keys: [tabLabKey],
          active_tab_key: tabLabKey,
          display_key: null,
          bounds: null,
          layout_state: createDefaultWindowLayoutState(),
        },
      ],
    },
  };
}

function getProjectFilePath(workspaceRoot: string, projectKey: string) {
  return path.join(workspaceRoot, "projects", projectKey, "project.yaml");
}

function getBrowserSeedsFilePath(workspaceRoot: string) {
  return path.join(workspaceRoot, "browser-seeds.yaml");
}

function getAttachmentsFilePath(workspaceRoot: string, projectKey: string) {
  return path.join(workspaceRoot, "projects", projectKey, "attachments.yaml");
}

function getTabFilePath(workspaceRoot: string, projectKey: string, tabKey: string) {
  return path.join(workspaceRoot, "projects", projectKey, "tabs", `${tabKey}.yaml`);
}

function getViewsFilePath(workspaceStateRoot: string, projectKey: string) {
  return path.join(workspaceStateRoot, "projects", projectKey, "views.yaml");
}

function extractProjects(
  workspaceRoot: string,
  workspaceStateRoot: string,
) {
  const appFile = path.join(workspaceRoot, "app.yaml");
  const projectsIndexFile = path.join(workspaceRoot, "projects-index.yaml");
  const runtimeIndexFile = path.join(workspaceStateRoot, "runtime-index.yaml");

  const appConfig = asRecord(
    readYamlFile<unknown>(appFile),
    "workspace/app.yaml must contain a mapping.",
  );
  const projectsIndex = asRecord(
    readYamlFile<unknown>(projectsIndexFile),
    "workspace/projects-index.yaml must contain a mapping.",
  );
  const runtimeIndex = asRecord(
    readYamlFile<unknown>(runtimeIndexFile),
    "workspace-state/runtime-index.yaml must contain a mapping.",
  );

  const projectOrder = asStringArray(projectsIndex.project_order);
  const defaultProjectKey =
    asString(runtimeIndex.active_project_key).trim() ||
    asString(projectsIndex.default_project_key).trim() ||
    projectOrder[0];

  const projects = projectOrder.map((projectKey) => {
    const projectFile = getProjectFilePath(workspaceRoot, projectKey);
    const projectRecord = asRecord(
      readYamlFile<unknown>(projectFile),
      `${projectFile} must contain a mapping.`,
    );

    return {
      project_key: asString(projectRecord.project_key, projectKey),
      project_name: asString(projectRecord.project_name, projectKey),
      icon_key: asString(projectRecord.icon_key, "command"),
      default_tab_key: asString(projectRecord.default_tab_key, ""),
      tab_order: asStringArray(projectRecord.tab_order),
    } satisfies WorkspaceProjectSummary;
  });

  const activeProject =
    projects.find((project) => project.project_key === defaultProjectKey) ??
    projects[0];

  if (!activeProject) {
    throw new Error("No workspace projects were found.");
  }

  const activeTabsRecord = asRecord(
    runtimeIndex.active_tabs ?? {},
    "workspace-state/runtime-index.yaml active_tabs must be a mapping.",
  );
  const activeTabKey =
    asString(activeTabsRecord[activeProject.project_key]).trim() ||
    activeProject.default_tab_key ||
    activeProject.tab_order[0];

  return {
    default_cli_profile_key: asString(appConfig.default_cli_profile_key, "cli-global-default"),
    active_project: activeProject,
    active_tab_key: activeTabKey,
    projects,
  };
}

function extractTabRecord(
  workspaceRoot: string,
  activeProject: WorkspaceProjectSummary,
  activeTabKey: string,
) {
  const tabFile = getTabFilePath(
    workspaceRoot,
    activeProject.project_key,
    activeTabKey,
  );

  return {
    tabFile,
    tabRecord: asRecord(
      readYamlFile<unknown>(tabFile),
      `${tabFile} must contain a mapping.`,
    ),
  };
}

function extractTabSummaries(
  workspaceRoot: string,
  activeProject: WorkspaceProjectSummary,
) {
  return activeProject.tab_order
    .map((tabKey) => {
      const { tabRecord } = extractTabRecord(workspaceRoot, activeProject, tabKey);
      const modules = Array.isArray(tabRecord.modules) ? tabRecord.modules : [];
      let browserCount = 0;
      let terminalCount = 0;

      for (const entry of modules) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          continue;
        }

        const moduleType = asString((entry as GenericRecord).module_type, "");
        if (moduleType === "browser") {
          browserCount += 1;
        }
        if (moduleType === "terminal") {
          terminalCount += 1;
        }
      }

      return {
        tab_key: tabKey,
        tab_name: asString(tabRecord.tab_name, tabKey),
        layout_type: asString(
          asRecord(tabRecord.layout ?? {}, "Tab layout must be a mapping.").layout_type,
          "single-column",
        ),
        module_count: modules.length,
        browser_count: browserCount,
        terminal_count: terminalCount,
      } satisfies WorkspaceTabSummary;
    })
    .filter((entry) => entry.tab_key.trim().length > 0);
}

function extractWindowRecords(
  workspaceStateRoot: string,
  activeProject: WorkspaceProjectSummary,
) {
  const viewsFile = getViewsFilePath(
    workspaceStateRoot,
    activeProject.project_key,
  );
  const viewsRecord = asRecord(
    readYamlFile<unknown>(viewsFile),
    `${viewsFile} must contain a mapping.`,
  );
  const windows = Array.isArray(viewsRecord.windows) ? viewsRecord.windows : [];

  const windowRecords = windows
    .map((entry, index) => {
      const windowRecord = asRecord(
        entry,
        `Window entry ${index + 1} in ${viewsFile} must be a mapping.`,
      );
      const boundsValue = windowRecord.bounds;
      const bounds =
        boundsValue && typeof boundsValue === "object" && !Array.isArray(boundsValue)
          ? {
              x: asNumber((boundsValue as GenericRecord).x, 0),
              y: asNumber((boundsValue as GenericRecord).y, 0),
              width: asNumber((boundsValue as GenericRecord).width, 0),
              height: asNumber((boundsValue as GenericRecord).height, 0),
            }
          : null;
      const layoutStateValue =
        windowRecord.layout_state &&
        typeof windowRecord.layout_state === "object" &&
        !Array.isArray(windowRecord.layout_state)
          ? (windowRecord.layout_state as GenericRecord)
          : {};

      return {
        window_key: asString(
          windowRecord.window_key,
          `window-${activeProject.project_key}-${String(index + 1).padStart(2, "0")}`,
        ),
        project_key: activeProject.project_key,
        window_mode:
          asString(windowRecord.window_mode, "docked-main-window") === "detached-window"
            ? "detached-window"
            : "docked-main-window",
        attached_tab_keys: asStringArray(windowRecord.attached_tab_keys).filter(
          (tabKey) => activeProject.tab_order.includes(tabKey),
        ),
        active_tab_key: asString(windowRecord.active_tab_key, ""),
        display_key: (() => {
          const displayKey = asString(windowRecord.display_key, "").trim();
          return displayKey || null;
        })(),
        bounds,
        layout_state: normalizeWindowLayoutState(layoutStateValue),
      } satisfies WorkspaceWindowRecord;
    })
    .filter((entry) => entry.attached_tab_keys.length > 0);

  const mainWindowRecord =
    windowRecords.find((entry) => entry.window_mode === "docked-main-window") ??
    null;

  if (!mainWindowRecord) {
    throw new Error(
      `Project ${activeProject.project_key} does not define a main docked window in views.yaml.`,
    );
  }

  return {
    main_window_key: mainWindowRecord.window_key,
    window_records: windowRecords,
  };
}

function extractBrowserModules(
  workspaceRoot: string,
  activeProject: WorkspaceProjectSummary,
  tabKeys: string[],
  browserSeedRegistry: BrowserSeedRegistry,
) {
  return tabKeys.flatMap((activeTabKey) => {
    const { tabFile, tabRecord } = extractTabRecord(
      workspaceRoot,
      activeProject,
      activeTabKey,
    );
    const modules = Array.isArray(tabRecord.modules) ? tabRecord.modules : [];

    return modules
    .map((entry, index) => {
      const moduleRecord = asRecord(
        entry,
        `Module entry ${index + 1} in ${tabFile} must be a mapping.`,
      );

      if (asString(moduleRecord.module_type) !== "browser") {
        return null;
      }

      const settingsRecord = asRecord(
        moduleRecord.settings ?? {},
        `Browser module settings for ${asString(moduleRecord.module_key, `index-${index}`)} must be a mapping.`,
      );
      const resolvedHomeUrl = (() => {
        const homeUrl = asString(settingsRecord.home_url, "").trim();
        if (!homeUrl) {
          return {
            home_url: null,
            home_url_ref: null,
            resolved_home_url: null,
          };
        }

        const upgradedHomeUrl = maybeUpgradeLegacySeedBrowserPage(
          homeUrl,
          browserSeedRegistry,
        );
        const resolvedHomeUrl = resolveBrowserHomeUrl(
          upgradedHomeUrl,
          browserSeedRegistry,
        );
        return {
          home_url: upgradedHomeUrl,
          home_url_ref: resolvedHomeUrl.home_url_ref,
          resolved_home_url: resolvedHomeUrl.home_url,
        };
      })();

      const browserModule: WorkspaceBrowserModule = {
        browser_key: getModuleBrowserKey(moduleRecord, settingsRecord, index + 1),
        project_key: activeProject.project_key,
        project_name: activeProject.project_name,
        tab_key: activeTabKey,
        tab_name: asString(tabRecord.tab_name, activeTabKey),
        module_key: asString(moduleRecord.module_key, `mod-browser-${index + 1}`),
        module_name: asString(moduleRecord.module_name, `Browser ${index + 1}`),
        slot_key: asString(moduleRecord.slot_key, `slot-browser-${index + 1}`),
        home_url: resolvedHomeUrl.home_url,
        home_url_ref: resolvedHomeUrl.home_url_ref,
        resolved_home_url: resolvedHomeUrl.resolved_home_url,
        session_key: (() => {
          const sessionKey = asString(settingsRecord.session_key, "").trim();
          return sessionKey || null;
        })(),
      };

      return browserModule;
    })
    .filter((entry): entry is WorkspaceBrowserModule => entry !== null);
  });
}

function extractTerminalModules(
  workspaceRoot: string,
  activeProject: WorkspaceProjectSummary,
  tabKeys: string[],
) {
  return tabKeys.flatMap((activeTabKey) => {
    const { tabFile, tabRecord } = extractTabRecord(
      workspaceRoot,
      activeProject,
      activeTabKey,
    );
    const modules = Array.isArray(tabRecord.modules) ? tabRecord.modules : [];

    return modules
    .map((entry, index) => {
      const moduleRecord = asRecord(
        entry,
        `Module entry ${index + 1} in ${tabFile} must be a mapping.`,
      );

      if (asString(moduleRecord.module_type) !== "terminal") {
        return null;
      }

      const settingsRecord = asRecord(
        moduleRecord.settings ?? {},
        `Terminal module settings for ${asString(moduleRecord.module_key, `index-${index}`)} must be a mapping.`,
      );

      return {
        terminal_key: getModuleTerminalKey(moduleRecord, settingsRecord, index + 1),
        project_key: activeProject.project_key,
        project_name: activeProject.project_name,
        tab_key: activeTabKey,
        tab_name: asString(tabRecord.tab_name, activeTabKey),
        module_key: asString(moduleRecord.module_key, `mod-terminal-${index + 1}`),
        module_name: asString(moduleRecord.module_name, `Terminal ${index + 1}`),
        slot_key: asString(moduleRecord.slot_key, `slot-terminal-${index + 1}`),
        cli_profile_key: (() => {
          const cliProfileKey = asString(moduleRecord.cli_profile_key, "").trim();
          return cliProfileKey || null;
        })(),
        shell_profile_key: (() => {
          const shellProfileKey = asString(settingsRecord.shell_profile_key, "").trim();
          return shellProfileKey || null;
        })(),
        startup_path: (() => {
          const startupPath = asString(settingsRecord.startup_path, "").trim();
          return startupPath || null;
        })(),
        session_key: (() => {
          const sessionKey = asString(settingsRecord.session_key, "").trim();
          return sessionKey || null;
        })(),
        startup_commands: asStringArray(settingsRecord.startup_commands),
        default_cols: asNumber(settingsRecord.default_cols, 120),
        default_rows: asNumber(settingsRecord.default_rows, 32),
      } satisfies WorkspaceTerminalModule;
    })
    .filter((entry): entry is WorkspaceTerminalModule => entry !== null);
  });
}

export function createWorkspaceStore(options: WorkspaceStoreOptions) {
  const { workspaceRoot, workspaceStateRoot } = getWorkspaceRoots(options);
  const defaultFiles = buildDefaultFiles(options);
  const runtimeIndexFile = path.join(workspaceStateRoot, "runtime-index.yaml");

  function ensureBootstrap() {
    ensureDir(workspaceRoot);
    ensureDir(workspaceStateRoot);

    ensureYamlFile(path.join(workspaceRoot, "app.yaml"), defaultFiles.app);
    ensureYamlFile(getBrowserSeedsFilePath(workspaceRoot), defaultFiles.browserSeeds);
    ensureYamlFile(
      path.join(workspaceRoot, "cli-profiles.yaml"),
      defaultFiles.cliProfiles,
    );
    ensureYamlFile(
      path.join(workspaceRoot, "module-catalog.yaml"),
      defaultFiles.moduleCatalog,
    );
    ensureYamlFile(
      path.join(workspaceRoot, "projects-index.yaml"),
      defaultFiles.projectsIndex,
    );
    ensureYamlFile(
      getProjectFilePath(workspaceRoot, "proj-clibase-main"),
      defaultFiles.mainProject,
    );
    ensureYamlFile(
      getAttachmentsFilePath(workspaceRoot, "proj-clibase-main"),
      defaultFiles.mainAttachments,
    );
    ensureYamlFile(
      getTabFilePath(workspaceRoot, "proj-clibase-main", "tab-workbench-01"),
      defaultFiles.mainTab,
    );
    ensureYamlFile(
      getTabFilePath(workspaceRoot, "proj-clibase-main", "tab-review-02"),
      defaultFiles.reviewTab,
    );
    ensureYamlFile(
      getViewsFilePath(workspaceStateRoot, "proj-clibase-main"),
      defaultFiles.mainViews,
    );
    ensureYamlFile(
      getProjectFilePath(workspaceRoot, "proj-clibase-lab"),
      defaultFiles.labProject,
    );
    ensureYamlFile(
      getAttachmentsFilePath(workspaceRoot, "proj-clibase-lab"),
      defaultFiles.labAttachments,
    );
    ensureYamlFile(
      getTabFilePath(workspaceRoot, "proj-clibase-lab", "tab-lab-01"),
      defaultFiles.labTab,
    );
    ensureYamlFile(
      getViewsFilePath(workspaceStateRoot, "proj-clibase-lab"),
      defaultFiles.labViews,
    );
    ensureYamlFile(runtimeIndexFile, defaultFiles.runtimeIndex);
  }

  function loadSnapshot(): LoadedWorkspaceSnapshot {
    const { default_cli_profile_key, active_project, active_tab_key, projects } =
      extractProjects(workspaceRoot, workspaceStateRoot);
    const active_project_tabs = extractTabSummaries(workspaceRoot, active_project);
    const { main_window_key, window_records } = extractWindowRecords(
      workspaceStateRoot,
      active_project,
    );
    const browserSeedRegistry = loadBrowserSeedRegistry(workspaceRoot);
    const browser_modules = extractBrowserModules(
      workspaceRoot,
      active_project,
      active_project.tab_order,
      browserSeedRegistry,
    );
    const terminal_modules = extractTerminalModules(
      workspaceRoot,
      active_project,
      active_project.tab_order,
    );
    const activeBrowserModule =
      browser_modules.find((entry) => entry.tab_key === active_tab_key) ?? browser_modules[0] ?? null;
    const activeTerminalModule =
      terminal_modules.find((entry) => entry.tab_key === active_tab_key) ?? terminal_modules[0] ?? null;

    return {
      workspace_root: workspaceRoot,
      workspace_state_root: workspaceStateRoot,
      default_cli_profile_key,
      active_project_key: active_project.project_key,
      active_tab_key,
      active_browser_key: activeBrowserModule?.browser_key ?? null,
      active_terminal_key: activeTerminalModule?.terminal_key ?? null,
      projects,
      active_project,
      active_project_tabs,
      window_records,
      main_window_key,
      browser_modules,
      terminal_modules,
    };
  }

  function updateRuntimeIndex(
    mutate: (runtimeIndexRecord: GenericRecord, activeTabs: GenericRecord) => void,
  ) {
    const runtimeIndexRecord = asRecord(
      readYamlFile<unknown>(runtimeIndexFile),
      "workspace-state/runtime-index.yaml must contain a mapping.",
    );
    const activeTabs = asRecord(
      runtimeIndexRecord.active_tabs ?? {},
      "workspace-state/runtime-index.yaml active_tabs must be a mapping.",
    );

    mutate(runtimeIndexRecord, activeTabs);
    runtimeIndexRecord.active_tabs = activeTabs;
    writeYamlFile(runtimeIndexFile, runtimeIndexRecord);
    snapshot = loadSnapshot();
    return snapshot;
  }

  function updateProjectViews(
    projectKey: string,
    mutate: (viewsRecord: GenericRecord, windows: GenericRecord[]) => void,
  ) {
    const viewsFile = getViewsFilePath(workspaceStateRoot, projectKey);
    const viewsRecord = asRecord(
      readYamlFile<unknown>(viewsFile),
      `${viewsFile} must contain a mapping.`,
    );
    const windows = Array.isArray(viewsRecord.windows)
      ? viewsRecord.windows.map((entry) =>
          asRecord(entry, `${viewsFile} windows entries must be mappings.`),
        )
      : [];

    mutate(viewsRecord, windows);
    viewsRecord.windows = windows;
    writeYamlFile(viewsFile, viewsRecord);
    snapshot = loadSnapshot();
    return snapshot;
  }

  function updateProjectFile(
    projectKey: string,
    mutate: (projectRecord: GenericRecord) => void,
  ) {
    const projectFile = getProjectFilePath(workspaceRoot, projectKey);
    const projectRecord = asRecord(
      readYamlFile<unknown>(projectFile),
      `${projectFile} must contain a mapping.`,
    );

    mutate(projectRecord);
    writeYamlFile(projectFile, projectRecord);
    snapshot = loadSnapshot();
    return snapshot;
  }

  function switchProject(projectKey: string, requestedTabKey?: string) {
    const normalizedProjectKey = projectKey.trim();
    if (!normalizedProjectKey) {
      throw new Error("project_key is required.");
    }

    const projectFile = getProjectFilePath(workspaceRoot, normalizedProjectKey);
    if (!fs.existsSync(projectFile)) {
      throw new Error(`No project exists for ${normalizedProjectKey}.`);
    }

    const projectRecord = asRecord(
      readYamlFile<unknown>(projectFile),
      `${projectFile} must contain a mapping.`,
    );
    const projectTabOrder = asStringArray(projectRecord.tab_order);
    const nextTabKey =
      requestedTabKey?.trim() ||
      asString(projectRecord.default_tab_key).trim() ||
      projectTabOrder[0];

    if (!nextTabKey) {
      throw new Error(`Project ${normalizedProjectKey} has no readable tab to open.`);
    }

    snapshot = updateRuntimeIndex((runtimeIndexRecord, activeTabs) => {
      activeTabs[normalizedProjectKey] = nextTabKey;
      runtimeIndexRecord.active_project_key = normalizedProjectKey;
    });

    recordRuntimeLog("info", "workspace project switched", {
      active_project_key: snapshot.active_project_key,
      active_tab_key: snapshot.active_tab_key,
      browser_count: snapshot.browser_modules.length,
      terminal_count: snapshot.terminal_modules.length,
    });

    return snapshot;
  }

  function switchTab(tabKey: string, requestedWindowKey?: string) {
    const normalizedTabKey = tabKey.trim();
    if (!normalizedTabKey) {
      throw new Error("tab_key is required.");
    }

    const targetWindowKey = requestedWindowKey?.trim() || snapshot.main_window_key;
    const targetWindow =
      snapshot.window_records.find((entry) => entry.window_key === targetWindowKey) ?? null;
    const allowedTabs = new Set(
      targetWindow?.attached_tab_keys.length
        ? targetWindow.attached_tab_keys
        : snapshot.active_project.tab_order,
    );
    if (!allowedTabs.has(normalizedTabKey)) {
      throw new Error(
        `Tab ${normalizedTabKey} is not attached to window ${targetWindowKey}.`,
      );
    }

    snapshot = updateProjectViews(snapshot.active_project.project_key, (_viewsRecord, windows) => {
      const matchingWindow =
        windows.find((entry) => asString(entry.window_key, "") === targetWindowKey) ?? null;
      if (!matchingWindow) {
        throw new Error(`No window record exists for ${targetWindowKey}.`);
      }
      matchingWindow.active_tab_key = normalizedTabKey;
    });

    snapshot = updateRuntimeIndex((_runtimeIndexRecord, activeTabs) => {
      activeTabs[snapshot.active_project.project_key] = normalizedTabKey;
    });

    recordRuntimeLog("info", "workspace tab switched", {
      active_project_key: snapshot.active_project_key,
      active_tab_key: snapshot.active_tab_key,
      browser_count: snapshot.browser_modules.length,
      terminal_count: snapshot.terminal_modules.length,
    });

    return snapshot;
  }

  function activateNextTab(requestedWindowKey?: string) {
    const targetWindowKey = requestedWindowKey?.trim() || snapshot.main_window_key;
    const targetWindow =
      snapshot.window_records.find((entry) => entry.window_key === targetWindowKey) ?? null;
    const tabOrder =
      targetWindow?.attached_tab_keys.length
        ? targetWindow.attached_tab_keys
        : snapshot.active_project.tab_order;
    const currentActiveTabKey =
      targetWindow?.active_tab_key?.trim() || snapshot.active_tab_key;
    const activeIndex = tabOrder.indexOf(currentActiveTabKey);

    if (activeIndex < 0) {
      throw new Error(
        `Active tab ${currentActiveTabKey} is not present in the current window tab order.`,
      );
    }

    const nextTabKey = tabOrder[activeIndex + 1];
    if (!nextTabKey) {
      throw new Error(
        `No next tab exists after ${currentActiveTabKey} in ${snapshot.active_project.project_key}.`,
      );
    }

    return switchTab(nextTabKey, targetWindowKey);
  }

  function activatePreviousTab(requestedWindowKey?: string) {
    const targetWindowKey = requestedWindowKey?.trim() || snapshot.main_window_key;
    const targetWindow =
      snapshot.window_records.find((entry) => entry.window_key === targetWindowKey) ?? null;
    const tabOrder =
      targetWindow?.attached_tab_keys.length
        ? targetWindow.attached_tab_keys
        : snapshot.active_project.tab_order;
    const currentActiveTabKey =
      targetWindow?.active_tab_key?.trim() || snapshot.active_tab_key;
    const activeIndex = tabOrder.indexOf(currentActiveTabKey);

    if (activeIndex < 0) {
      throw new Error(
        `Active tab ${currentActiveTabKey} is not present in the current window tab order.`,
      );
    }

    const previousTabKey = activeIndex > 0 ? tabOrder[activeIndex - 1] : "";
    if (!previousTabKey) {
      throw new Error(
        `No previous tab exists before ${currentActiveTabKey} in ${snapshot.active_project.project_key}.`,
      );
    }

    return switchTab(previousTabKey, targetWindowKey);
  }

  function reorderTabs(nextTabOrder: string[]) {
    const normalizedOrder = nextTabOrder.map((entry) => entry.trim()).filter(Boolean);
    const currentOrder = snapshot.active_project.tab_order;

    if (normalizedOrder.length !== currentOrder.length) {
      throw new Error("tab.reorder requires the full tab order for the current project.");
    }

    for (const tabKey of currentOrder) {
      if (!normalizedOrder.includes(tabKey)) {
        throw new Error(`tab.reorder is missing ${tabKey}.`);
      }
    }

    snapshot = updateProjectFile(snapshot.active_project.project_key, (projectRecord) => {
      projectRecord.tab_order = normalizedOrder;
      const defaultTabKey = asString(projectRecord.default_tab_key, "").trim();
      if (!defaultTabKey || !normalizedOrder.includes(defaultTabKey)) {
        projectRecord.default_tab_key = normalizedOrder[0];
      }
    });

    snapshot = updateProjectViews(snapshot.active_project.project_key, (_viewsRecord, windows) => {
      for (const windowRecord of windows) {
        const attachedTabs = asStringArray(windowRecord.attached_tab_keys);
        const nextAttachedTabs = normalizedOrder.filter((tabKey) =>
          attachedTabs.includes(tabKey),
        );
        windowRecord.attached_tab_keys = nextAttachedTabs;

        const activeTabKey = asString(windowRecord.active_tab_key, "").trim();
        if (!nextAttachedTabs.includes(activeTabKey)) {
          windowRecord.active_tab_key = nextAttachedTabs[0] ?? "";
        }
      }
    });

    recordRuntimeLog("info", "workspace tabs reordered", {
      active_project_key: snapshot.active_project_key,
      tab_order: snapshot.active_project.tab_order.join(", "),
    });

    return snapshot;
  }

  function detachTab(tabKey: string) {
    const normalizedTabKey = tabKey.trim();
    if (!normalizedTabKey) {
      throw new Error("tab_key is required.");
    }

    const mainWindowRecord = snapshot.window_records.find(
      (entry) => entry.window_key === snapshot.main_window_key,
    );

    if (!mainWindowRecord) {
      throw new Error(`No main window record exists for ${snapshot.active_project.project_key}.`);
    }

    if (!mainWindowRecord.attached_tab_keys.includes(normalizedTabKey)) {
      throw new Error(`Tab ${normalizedTabKey} is not currently docked in the main window.`);
    }

    if (mainWindowRecord.attached_tab_keys.length <= 1) {
      throw new Error("The last docked tab cannot be detached from the main window.");
    }

    const detachedWindowKey = `window-${snapshot.active_project.project_key}-${normalizedTabKey}`;

    snapshot = updateProjectViews(snapshot.active_project.project_key, (_viewsRecord, windows) => {
      const nextWindows = windows.filter(
        (entry) => asString(entry.window_key, "") !== detachedWindowKey,
      );
      windows.length = 0;
      for (const nextWindow of nextWindows) {
        windows.push(nextWindow);
      }

      const targetMainWindow = windows.find(
        (entry) => asString(entry.window_key, "") === snapshot.main_window_key,
      );
      if (!targetMainWindow) {
        throw new Error("Main window record disappeared during detach.");
      }

      const attachedTabs = asStringArray(targetMainWindow.attached_tab_keys).filter(
        (entry) => entry !== normalizedTabKey,
      );
      targetMainWindow.attached_tab_keys = attachedTabs;
      if (asString(targetMainWindow.active_tab_key, "") === normalizedTabKey) {
        targetMainWindow.active_tab_key = attachedTabs[0] ?? "";
      }

      windows.push({
        window_key: detachedWindowKey,
        project_key: snapshot.active_project.project_key,
        window_mode: "detached-window",
        attached_tab_keys: [normalizedTabKey],
        active_tab_key: normalizedTabKey,
        display_key: null,
        bounds: null,
        layout_state: {
          ...normalizeWindowLayoutState(mainWindowRecord.layout_state),
        },
      });
    });

    snapshot = updateRuntimeIndex((runtimeIndexRecord, activeTabs) => {
      const nextActiveTab =
        snapshot.window_records.find((entry) => entry.window_key === snapshot.main_window_key)
          ?.active_tab_key ||
        normalizedTabKey;
      activeTabs[snapshot.active_project.project_key] = nextActiveTab;
      runtimeIndexRecord.active_project_key = snapshot.active_project.project_key;
    });

    recordRuntimeLog("info", "workspace tab detached", {
      active_project_key: snapshot.active_project_key,
      tab_key: normalizedTabKey,
      detached_window_key: detachedWindowKey,
    });

    return snapshot;
  }

  function redockTab(tabKey: string) {
    const normalizedTabKey = tabKey.trim();
    if (!normalizedTabKey) {
      throw new Error("tab_key is required.");
    }

    const detachedWindowKey = `window-${snapshot.active_project.project_key}-${normalizedTabKey}`;
    const mainWindowRecord = snapshot.window_records.find(
      (entry) => entry.window_key === snapshot.main_window_key,
    );

    if (!mainWindowRecord) {
      throw new Error(`No main window record exists for ${snapshot.active_project.project_key}.`);
    }

    snapshot = updateProjectViews(snapshot.active_project.project_key, (_viewsRecord, windows) => {
      const keptWindows = windows.filter(
        (entry) => asString(entry.window_key, "") !== detachedWindowKey,
      );
      windows.length = 0;
      for (const nextWindow of keptWindows) {
        windows.push(nextWindow);
      }

      const targetMainWindow = windows.find(
        (entry) => asString(entry.window_key, "") === snapshot.main_window_key,
      );
      if (!targetMainWindow) {
        throw new Error("Main window record disappeared during redock.");
      }

      const attachedTabs = asStringArray(targetMainWindow.attached_tab_keys);
      if (!attachedTabs.includes(normalizedTabKey)) {
        const desiredOrder = snapshot.active_project.tab_order.filter(
          (entry) => attachedTabs.includes(entry) || entry === normalizedTabKey,
        );
        targetMainWindow.attached_tab_keys = desiredOrder;
      }
      targetMainWindow.active_tab_key = normalizedTabKey;
    });

    snapshot = updateRuntimeIndex((runtimeIndexRecord, activeTabs) => {
      activeTabs[snapshot.active_project.project_key] = normalizedTabKey;
      runtimeIndexRecord.active_project_key = snapshot.active_project.project_key;
    });

    recordRuntimeLog("info", "workspace tab redocked", {
      active_project_key: snapshot.active_project_key,
      tab_key: normalizedTabKey,
      detached_window_key: detachedWindowKey,
    });

    return snapshot;
  }

  function updateWindowPlacement(
    windowKey: string,
    placement: {
      display_key?: string | null;
      bounds?: WorkspaceWindowRecord["bounds"];
    },
  ) {
    const normalizedWindowKey = windowKey.trim();
    if (!normalizedWindowKey) {
      throw new Error("window_key is required.");
    }

    snapshot = updateProjectViews(snapshot.active_project.project_key, (_viewsRecord, windows) => {
      const targetWindow =
        windows.find((entry) => asString(entry.window_key, "") === normalizedWindowKey) ?? null;

      if (!targetWindow) {
        throw new Error(`No window record exists for ${normalizedWindowKey}.`);
      }

      targetWindow.display_key =
        typeof placement.display_key === "string"
          ? placement.display_key.trim() || null
          : placement.display_key === null
            ? null
            : targetWindow.display_key;

      targetWindow.bounds = placement.bounds
        ? {
            x: asNumber(placement.bounds.x, 0),
            y: asNumber(placement.bounds.y, 0),
            width: asNumber(placement.bounds.width, 1280),
            height: asNumber(placement.bounds.height, 860),
          }
        : null;
    });

    return snapshot;
  }

  function updateWindowBounds(
    windowKey: string,
    bounds: WorkspaceWindowRecord["bounds"],
  ) {
    return updateWindowPlacement(windowKey, { bounds });
  }

  function updateWindowLayoutState(
    windowKey: string,
    partialLayoutState: Partial<WorkspaceWindowLayoutState>,
  ) {
    const normalizedWindowKey = windowKey.trim();
    if (!normalizedWindowKey) {
      throw new Error("window_key is required.");
    }

    snapshot = updateProjectViews(snapshot.active_project.project_key, (_viewsRecord, windows) => {
      const targetWindow =
        windows.find((entry) => asString(entry.window_key, "") === normalizedWindowKey) ?? null;

      if (!targetWindow) {
        throw new Error(`No window record exists for ${normalizedWindowKey}.`);
      }

      targetWindow.layout_state = patchWindowLayoutState(
        normalizeWindowLayoutState(targetWindow.layout_state),
        partialLayoutState,
      );
    });

    const updatedLayoutState =
      snapshot.window_records.find((entry) => entry.window_key === normalizedWindowKey)?.layout_state ??
      createDefaultWindowLayoutState();

    recordRuntimeLog("info", "workspace window layout state updated", {
      active_project_key: snapshot.active_project_key,
      window_key: normalizedWindowKey,
      layout_preset_key: updatedLayoutState.layout_preset_key,
      shell_split_ratio: updatedLayoutState.shell_split_ratio,
      browser_dock_position: updatedLayoutState.browser_dock_position,
      shell_stack_split_ratio: updatedLayoutState.shell_stack_split_ratio,
      browser_collapsed: updatedLayoutState.browser_collapsed,
    });

    return snapshot;
  }

  ensureBootstrap();

  let snapshot = loadSnapshot();

  recordRuntimeLog("info", "workspace loaded", {
    workspace_root: snapshot.workspace_root,
    active_project_key: snapshot.active_project_key,
    active_tab_key: snapshot.active_tab_key,
    browser_count: snapshot.browser_modules.length,
    terminal_count: snapshot.terminal_modules.length,
  });

  return {
    getSnapshot: () => snapshot,
    reload: () => {
      snapshot = loadSnapshot();
      recordRuntimeLog("info", "workspace reloaded", {
        active_project_key: snapshot.active_project_key,
        active_tab_key: snapshot.active_tab_key,
        browser_count: snapshot.browser_modules.length,
        terminal_count: snapshot.terminal_modules.length,
      });
      return snapshot;
    },
    switchProject,
    switchTab,
    activateNextTab,
    activatePreviousTab,
    reorderTabs,
    detachTab,
    redockTab,
    updateWindowPlacement,
    updateWindowBounds,
    updateWindowLayoutState,
    getStateSummary: (windowKey?: string) => {
      const currentWindow =
        snapshot.window_records.find((entry) => entry.window_key === windowKey) ??
        snapshot.window_records.find((entry) => entry.window_key === snapshot.main_window_key) ??
        null;
      const visibleTabKeys = currentWindow?.attached_tab_keys ?? snapshot.active_project.tab_order;
      const visibleTabs = snapshot.active_project_tabs.filter((entry) =>
        visibleTabKeys.includes(entry.tab_key),
      );
      const currentTabKey =
        currentWindow?.active_tab_key && visibleTabKeys.includes(currentWindow.active_tab_key)
          ? currentWindow.active_tab_key
          : visibleTabs[0]?.tab_key ?? snapshot.active_tab_key;
      const currentBrowserKey =
        snapshot.browser_modules.find((entry) => entry.tab_key === currentTabKey)?.browser_key ??
        snapshot.active_browser_key;
      const currentTerminalKey =
        snapshot.terminal_modules.find((entry) => entry.tab_key === currentTabKey)?.terminal_key ??
        snapshot.active_terminal_key;
      const activeVisibleTabIndex = Math.max(
        visibleTabs.findIndex((entry) => entry.tab_key === currentTabKey),
        0,
      );

      return {
        workspace_root: snapshot.workspace_root,
        workspace_state_root: snapshot.workspace_state_root,
        default_cli_profile_key: snapshot.default_cli_profile_key,
        active_project_key: snapshot.active_project_key,
        active_project_name: snapshot.active_project.project_name,
        main_window_key: snapshot.main_window_key,
        active_tab_key: currentTabKey,
        active_browser_key: currentBrowserKey,
        active_terminal_key: currentTerminalKey,
        project_count: snapshot.projects.length,
        tab_count: snapshot.active_project_tabs.length,
        visible_tab_count: visibleTabs.length,
        active_project_tabs: snapshot.active_project_tabs,
        visible_tabs: visibleTabs,
        current_window: currentWindow
            ? {
                window_key: currentWindow.window_key,
                window_mode: currentWindow.window_mode,
                attached_tab_keys: currentWindow.attached_tab_keys,
                active_tab_key: currentTabKey,
                is_detached: currentWindow.window_mode === "detached-window",
                layout_state: currentWindow.layout_state,
                layout_policy: getWorkspaceLayoutPolicy(
                  currentWindow.layout_state.layout_preset_key,
                ),
              }
          : null,
        window_records: snapshot.window_records.map((windowRecord) => ({
          ...windowRecord,
          layout_policy: getWorkspaceLayoutPolicy(
            windowRecord.layout_state.layout_preset_key,
          ),
        })),
        active_tab_index: activeVisibleTabIndex,
        has_previous_tab: activeVisibleTabIndex > 0,
        has_next_tab: activeVisibleTabIndex < visibleTabs.length - 1,
        browser_count: snapshot.browser_modules.length,
        terminal_count: snapshot.terminal_modules.length,
        projects: snapshot.projects,
        browser_modules: snapshot.browser_modules.map((browserModule) => ({
          browser_key: browserModule.browser_key,
          project_key: browserModule.project_key,
          tab_key: browserModule.tab_key,
          module_key: browserModule.module_key,
          module_name: browserModule.module_name,
          home_url_ref: browserModule.home_url_ref,
          home_url: browserModule.home_url,
        })),
        terminal_modules: snapshot.terminal_modules.map((terminalModule) => ({
          terminal_key: terminalModule.terminal_key,
          project_key: terminalModule.project_key,
          tab_key: terminalModule.tab_key,
          module_key: terminalModule.module_key,
          module_name: terminalModule.module_name,
          shell_profile_key: terminalModule.shell_profile_key,
          startup_path: terminalModule.startup_path,
        })),
      };
    },
  };
}
