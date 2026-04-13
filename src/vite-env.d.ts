/// <reference types="vite/client" />

interface ClibaseDesktopPingResult {
  appMode: "development" | "production";
  platform: string;
  timestamp: string;
}

interface ClibaseTerminalOutputEntry {
  output_key: string;
  terminal_key: string;
  stream: string;
  text: string;
  created_at: string;
}

interface ClibaseTerminalState {
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
  status: string;
  is_running: boolean;
  session_pid: number | null;
  session_process_name: string | null;
  last_exit_code: number | null;
  cols: number;
  rows: number;
  output_entry_count: number;
  started_at: string | null;
  stopped_at: string | null;
  resize_mode: string;
  backend: string;
}

interface ClibaseTerminalLogsTailResult extends ClibaseTerminalState {
  entries: ClibaseTerminalOutputEntry[];
  returned_count: number;
}

interface ClibaseUiaAdapterConfig {
  provider_key: string;
  executable_path: string;
  python_executable: string;
  default_timeout_ms: number;
}

interface ClibaseUiaHostReferenceFrame {
  width_px: number;
  height_px: number;
  coordinate_space: "screen" | "client" | "host_reference";
  placement_mode: "external_os_window" | "host_panel_fill";
}

interface ClibaseUiaTargetRecord {
  target_key: string;
  target_name: string;
  exe_path: string;
  args: string[];
  working_dir: string;
  startup_wait_ms: number;
  created_at: string;
  updated_at: string;
  host_reference_frame?: ClibaseUiaHostReferenceFrame;
}

interface ClibaseUiaMacroStepRecord {
  step_key: string;
  action_name: string;
  selector: string;
  value: string;
  timeout_ms: number | null;
  continue_on_error: boolean;
  extra_args: string[];
}

interface ClibaseUiaMacroRecord {
  macro_key: string;
  macro_name: string;
  target_key: string;
  description: string;
  shared_tags: string[];
  steps: ClibaseUiaMacroStepRecord[];
  created_at: string;
  updated_at: string;
}

interface ClibaseUiaTargetRuntimeState {
  target_key: string;
  target_name: string;
  is_running: boolean;
  pid: number | null;
  launched_at: string | null;
  exit_code: number | null;
  exited_at: string | null;
  stop_requested?: boolean;
  reused_existing_process?: boolean;
  exe_path?: string;
  args?: string[];
  working_dir?: string;
  host_window_constraint?: { ok: boolean; detail?: string };
}

type ClibaseUiaPeekResolutionSource = "env" | "store" | "path" | "where" | "fallback";

type ClibaseUiaPeekHostResolutionSource =
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

interface ClibaseUiaRegistryResult {
  store_path: string;
  version: number;
  uia_adapter: ClibaseUiaAdapterConfig;
  targets: ClibaseUiaTargetRecord[];
  macros: ClibaseUiaMacroRecord[];
  running_targets: ClibaseUiaTargetRuntimeState[];
  uiapeek_resolution: {
    resolved_executable: string;
    resolution_source: ClibaseUiaPeekResolutionSource;
  };
  uiapeek_host_resolution: {
    resolved_executable: string | null;
    resolution_source: ClibaseUiaPeekHostResolutionSource;
  };
}

interface ClibaseUiaMacroListResult {
  target_key: string | null;
  macros: ClibaseUiaMacroRecord[];
  macro_count: number;
}

interface ClibaseUiaMacroRunResult {
  macro_key: string;
  macro_name: string;
  target_key: string;
  target_name: string;
  status: "success" | "error";
  started_at: string;
  finished_at: string;
  step_count: number;
  succeeded_step_count: number;
  failed_step_count: number;
  step_results: Array<Record<string, unknown>>;
}

interface ClibaseUiaRecordingState {
  hub_url: string;
  connection_state: string;
  session_id: string | null;
  is_recording: boolean;
}

interface ClibaseUiaRuntimeStatusResult {
  running_targets: ClibaseUiaTargetRuntimeState[];
  recording_state: ClibaseUiaRecordingState;
  uiapeek_host_exe: string | null;
  uiapeek_host_source: ClibaseUiaPeekHostResolutionSource;
  hub_url_default: string;
  /** GET /api/v4/g4/ping on the hub HTTP port (UiaPeek listening); independent of SignalR recording session. */
  uiapeek_http_ping_ok: boolean;
}

interface ClibaseUiaHttpPingResult {
  ok: boolean;
  hub_url: string;
}

interface ClibaseUiaRecordingEventEnvelope {
  received_at: string;
  payload: unknown;
}

interface ClibaseWorkspaceTabSummary {
  tab_key: string;
  tab_name: string;
  layout_type: string;
  module_count: number;
  browser_count: number;
  terminal_count: number;
}

interface ClibaseWorkspaceWindowSummary {
  window_key: string;
  window_mode: "docked-main-window" | "detached-window";
  attached_tab_keys: string[];
  active_tab_key: string;
  is_detached: boolean;
  layout_state: {
    layout_preset_key: string;
    shell_split_ratio: number;
    browser_dock_position: "left" | "right" | "top" | "bottom";
    shell_stack_split_ratio: number;
    browser_collapsed: boolean;
  };
  layout_policy: {
    layout_preset_key: string;
    allowed_browser_dock_positions: Array<"left" | "right" | "top" | "bottom">;
    default_shell_split_ratio: number;
    min_shell_split_ratio: number;
    max_shell_split_ratio: number;
    default_shell_stack_split_ratio: number;
    min_shell_stack_split_ratio: number;
    max_shell_stack_split_ratio: number;
    default_browser_collapsed: boolean;
  };
}

interface ClibaseWorkspaceWindowRecord {
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
  layout_state: {
    layout_preset_key: string;
    shell_split_ratio: number;
    browser_dock_position: "left" | "right" | "top" | "bottom";
    shell_stack_split_ratio: number;
    browser_collapsed: boolean;
  };
  layout_policy: {
    layout_preset_key: string;
    allowed_browser_dock_positions: Array<"left" | "right" | "top" | "bottom">;
    default_shell_split_ratio: number;
    min_shell_split_ratio: number;
    max_shell_split_ratio: number;
    default_shell_stack_split_ratio: number;
    min_shell_stack_split_ratio: number;
    max_shell_stack_split_ratio: number;
    default_browser_collapsed: boolean;
  };
}

interface ClibaseBrowserState {
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
  session_key: string | null;
  is_attached: boolean;
  current_url: string;
  page_title: string;
  is_loading: boolean;
  is_visible: boolean;
  is_collapsed: boolean;
  can_go_back: boolean;
  can_go_forward: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface ClibaseBrowserHostBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ClibaseWorkspaceStateResult {
  workspace: {
    active_project_key: string;
    active_project_name: string;
    main_window_key: string;
    active_tab_key: string;
    active_browser_key: string | null;
    active_terminal_key: string | null;
    tab_count: number;
    visible_tab_count: number;
    active_project_tabs: ClibaseWorkspaceTabSummary[];
    visible_tabs: ClibaseWorkspaceTabSummary[];
    current_window: ClibaseWorkspaceWindowSummary | null;
    window_records: ClibaseWorkspaceWindowRecord[];
    active_tab_index: number;
    has_previous_tab: boolean;
    has_next_tab: boolean;
    browser_count: number;
    terminal_count: number;
  } | null;
  runtime_registry: {
    active_project_key: string;
    active_tab_key: string;
    active_browser_key: string | null;
    active_terminal_key: string | null;
  } | null;
}

interface ClibaseDesktopBridge {
  isElectron: boolean;
  platform: string;
  ping: () => Promise<ClibaseDesktopPingResult>;
  getWorkspaceState: () => Promise<ClibaseWorkspaceStateResult>;
  getBrowserState: (browserKey?: string) => Promise<ClibaseBrowserState>;
  navigateBrowser: (url: string, browserKey?: string) => Promise<ClibaseBrowserState>;
  goBackBrowser: (browserKey?: string) => Promise<ClibaseBrowserState>;
  goForwardBrowser: (browserKey?: string) => Promise<ClibaseBrowserState>;
  reloadBrowser: (browserKey?: string) => Promise<ClibaseBrowserState>;
  setBrowserHostBounds: (bounds: ClibaseBrowserHostBounds | null) => Promise<ClibaseBrowserState>;
  pushBrowserHostBounds: (bounds: ClibaseBrowserHostBounds | null) => void;
  activateTab: (tabKey: string) => Promise<ClibaseWorkspaceStateResult>;
  activateNextTab: () => Promise<ClibaseWorkspaceStateResult>;
  activatePreviousTab: () => Promise<ClibaseWorkspaceStateResult>;
  detachTab: (tabKey?: string) => Promise<ClibaseWorkspaceStateResult>;
  redockTab: (tabKey?: string) => Promise<ClibaseWorkspaceStateResult>;
  reorderTabs: (tabKeys: string[]) => Promise<ClibaseWorkspaceStateResult>;
  updateWindowLayoutState: (partialLayoutState: {
    layout_preset_key?: string;
    shell_split_ratio?: number;
    browser_dock_position?: "left" | "right" | "top" | "bottom";
    shell_stack_split_ratio?: number;
    browser_collapsed?: boolean;
  }) => Promise<ClibaseWorkspaceStateResult>;
  createTerminal: (terminalKey?: string) => Promise<ClibaseTerminalState>;
  getTerminalState: (terminalKey?: string) => Promise<ClibaseTerminalState>;
  writeTerminal: (
    terminalKey: string | undefined,
    text: string,
    appendNewline?: boolean,
  ) => Promise<ClibaseTerminalState>;
  resizeTerminal: (
    terminalKey: string | undefined,
    cols: number,
    rows: number,
  ) => Promise<ClibaseTerminalState & { applied?: boolean; mode?: string }>;
  getTerminalLogsTail: (
    terminalKey?: string,
    limit?: number,
  ) => Promise<ClibaseTerminalLogsTailResult>;
  getUiaRegistry: () => Promise<ClibaseUiaRegistryResult>;
  saveUiaTarget: (payload: {
    target_key: string;
    target_name: string;
    exe_path: string;
    args: string[];
    working_dir: string;
    startup_wait_ms: number;
    host_reference_frame?: ClibaseUiaHostReferenceFrame | null;
  }) => Promise<{
    saved_target: ClibaseUiaTargetRecord;
    target_state: ClibaseUiaTargetRuntimeState;
  }>;
  launchUiaTarget: (
    targetKey: string,
    overrides?: {
      exe_path?: string;
      args?: string[];
      working_dir?: string;
      startup_wait_ms?: number;
    },
  ) => Promise<ClibaseUiaTargetRuntimeState>;
  stopUiaTarget: (targetKey: string) => Promise<ClibaseUiaTargetRuntimeState>;
  getUiaTargetState: (targetKey: string) => Promise<ClibaseUiaTargetRuntimeState>;
  saveUiaMacro: (payload: {
    macro_key: string;
    macro_name: string;
    target_key: string;
    description: string;
    shared_tags: string[];
    steps?: unknown[];
    steps_yaml?: string;
  }) => Promise<{ saved_macro: ClibaseUiaMacroRecord }>;
  listUiaMacros: (targetKey?: string) => Promise<ClibaseUiaMacroListResult>;
  deleteUiaMacro: (macroKey: string) => Promise<{
    deleted_macro: ClibaseUiaMacroRecord;
    macro_count: number;
  }>;
  runUiaMacro: (payload: {
    macro_key: string;
    target_key?: string;
    ensure_target_running: boolean;
  }) => Promise<ClibaseUiaMacroRunResult>;
  updateUiaAdapter: (payload: {
    executable_path: string;
    default_timeout_ms: number;
    python_executable?: string;
    provider_key?: string;
  }) => Promise<{ uia_adapter: ClibaseUiaAdapterConfig }>;
  startUiaRecording: () => Promise<ClibaseUiaRecordingState>;
  stopUiaRecording: () => Promise<ClibaseUiaRecordingState>;
  getUiaRecordingState: () => Promise<ClibaseUiaRecordingState>;
  getUiaRuntimeStatus: () => Promise<ClibaseUiaRuntimeStatusResult>;
  getUiaHttpPing: () => Promise<ClibaseUiaHttpPingResult>;
  onUiaRecordingEvent: (
    listener: (entry: ClibaseUiaRecordingEventEnvelope) => void,
  ) => () => void;
  onTerminalOutput: (listener: (entry: ClibaseTerminalOutputEntry) => void) => () => void;
  onTerminalState: (listener: (state: ClibaseTerminalState) => void) => () => void;
  onWorkspaceStateUpdated: (
    listener: (state: ClibaseWorkspaceStateResult) => void,
  ) => () => void;
}

interface Window {
  clibaseDesktop?: ClibaseDesktopBridge;
}
