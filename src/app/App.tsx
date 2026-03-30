import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import YAML from "yaml";
import {
  appendYamlMacroStep,
  buildSelectorFromHints,
  extractRecordingUiHints,
  formatMacroStepRecordYaml,
  nextRecordingStepKey,
} from "../utils/uiaRecordingHints";
import { recordingPayloadsToMacroSteps } from "../utils/uiaRecordingSessionToMacro";

/** Matches `defaultUiapeekHubUrl` in electron/main/main.cts when CLIBASE_UIAPEEK_HUB_URL is unset. */
const DEFAULT_UIAPEEK_HUB_URL_FALLBACK = "http://localhost:9955/hub/v4/g4/peek";

type DesktopStatus =
  | {
      kind: "browser-preview";
      title: string;
      detail: string;
    }
  | {
      kind: "desktop-shell";
      title: string;
      detail: string;
      platform: string;
      timestamp: string;
      appMode: "development" | "production";
    }
  | {
      kind: "error";
      title: string;
      detail: string;
    };

interface TabDragPayload {
  kind: "clibase-tab-drag";
  tabKey: string;
  projectKey: string | null;
  sourceWindowKey: string | null;
  sourceWindowMode: "docked-main-window" | "detached-window" | null;
}

type BrowserDockPosition = "left" | "right" | "top" | "bottom";
type DockDropTarget = "center" | BrowserDockPosition;
type BrowserHostBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type LayoutPolicy = ClibaseWorkspaceWindowSummary["layout_policy"];

const fallbackLayoutPolicy: LayoutPolicy = {
  layout_preset_key: "main_right_browser_v1",
  allowed_browser_dock_positions: ["right"],
  default_shell_split_ratio: 0.62,
  min_shell_split_ratio: 0.52,
  max_shell_split_ratio: 0.74,
  default_shell_stack_split_ratio: 0.32,
  min_shell_stack_split_ratio: 0.24,
  max_shell_stack_split_ratio: 0.52,
  default_browser_collapsed: false,
};

const browserPreviewStatus: DesktopStatus = {
  kind: "browser-preview",
  title: "Renderer-only preview",
  detail:
    "The React renderer is running without the Electron desktop shell. Use batcli dev to boot the Electron workbench.",
};

const tabDragMimeType = "application/x-clibase-tab";

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "n/a";
  }

  const nextDate = new Date(value);
  if (Number.isNaN(nextDate.getTime())) {
    return value;
  }

  return nextDate.toLocaleString();
}

function clampRatio(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, min), max);
}

function normalizeBrowserDockPosition(
  value: string | null | undefined,
): BrowserDockPosition {
  if (value === "left" || value === "right" || value === "top" || value === "bottom") {
    return value;
  }

  return "right";
}

function readHostBounds(element: HTMLElement | null): BrowserHostBounds | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return null;
  }

  const width = Math.max(Math.round(rect.width), 0);
  const height = Math.max(Math.round(rect.height), 0);
  if (width < 48 || height < 48) {
    return null;
  }

  return {
    x: Math.max(Math.round(rect.left), 0),
    y: Math.max(Math.round(rect.top), 0),
    width,
    height,
  };
}

function getActiveTerminalKey(workspaceState: ClibaseWorkspaceStateResult | null) {
  return (
    workspaceState?.workspace?.active_terminal_key ||
    workspaceState?.runtime_registry?.active_terminal_key ||
    ""
  );
}

function moveTabKey(
  tabOrder: string[],
  draggedTabKey: string,
  targetTabKey?: string | null,
) {
  const nextOrder = tabOrder.filter((entry) => entry !== draggedTabKey);
  const insertionIndex = targetTabKey ? nextOrder.indexOf(targetTabKey) : nextOrder.length;

  if (insertionIndex < 0) {
    nextOrder.push(draggedTabKey);
    return nextOrder;
  }

  nextOrder.splice(insertionIndex, 0, draggedTabKey);
  return nextOrder;
}

function areTabOrdersEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => entry === right[index]);
}

function writeDraggedTabData(
  event: React.DragEvent<HTMLElement>,
  payload: TabDragPayload,
) {
  const serialized = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(tabDragMimeType, serialized);
  event.dataTransfer.setData("text/plain", serialized);
}

function readDraggedTabData(
  event: Pick<React.DragEvent<HTMLElement>, "dataTransfer">,
) {
  const rawValue =
    event.dataTransfer.getData(tabDragMimeType) ||
    event.dataTransfer.getData("text/plain");

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<TabDragPayload>;
    if (parsed.kind !== "clibase-tab-drag" || typeof parsed.tabKey !== "string") {
      return null;
    }

    return {
      kind: "clibase-tab-drag",
      tabKey: parsed.tabKey,
      projectKey: parsed.projectKey ?? null,
      sourceWindowKey: parsed.sourceWindowKey ?? null,
      sourceWindowMode: parsed.sourceWindowMode ?? null,
    } satisfies TabDragPayload;
  } catch {
    return null;
  }
}

function shouldIgnoreWorkbenchShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function formatDockTargetLabel(target: DockDropTarget) {
  if (target === "center") {
    return "Center";
  }

  return `${target.charAt(0).toUpperCase()}${target.slice(1)}`;
}

function toReadableBrowserUrl(
  currentUrl: string | null | undefined,
  homeUrl?: string | null,
  homeUrlRef?: string | null,
) {
  const trimmed = currentUrl?.trim() ?? "";
  if (!trimmed) {
    return "n/a";
  }

  if (homeUrlRef && homeUrl && trimmed === homeUrl) {
    return homeUrlRef;
  }

  if (homeUrlRef && homeUrl?.startsWith("seed://") && trimmed.startsWith("data:")) {
    return homeUrlRef;
  }

  if (trimmed.startsWith("data:text/html")) {
    return "data://inline-html";
  }

  if (trimmed.startsWith("data:")) {
    return "data://inline-data";
  }

  return trimmed;
}

function getSuggestedBrowserAddress(state: ClibaseBrowserState | null) {
  if (!state) {
    return "";
  }

  const nextAddress = toReadableBrowserUrl(
    state.current_url,
    state.home_url,
    state.home_url_ref,
  );

  if (nextAddress === "n/a") {
    return "";
  }

  if (nextAddress.startsWith("data://")) {
    return state.current_url;
  }

  return nextAddress;
}

function splitCommaTokens(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatStructuredResult(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const defaultUiaMacroStepsYaml = [
  "- step_key: step-01",
  "  action_name: target.launch",
  "  selector: \"\"",
  "  value: \"\"",
  "  timeout_ms: 1200",
  "  continue_on_error: false",
  "  extra_args: []",
  "- step_key: step-02",
  "  action_name: wait.ms",
  "  selector: \"\"",
  "  value: \"\"",
  "  timeout_ms: 600",
  "  continue_on_error: false",
  "  extra_args: []",
  "- step_key: step-03",
  "  action_name: target.stop",
  "  selector: \"\"",
  "  value: \"\"",
  "  timeout_ms: 0",
  "  continue_on_error: true",
  "  extra_args: []",
].join("\n");

const defaultGenNxExePath =
  "C:\\Program Files\\MIDAS\\Gen\\970\\x64_Release_D260324_T2006_N222_r_b7_MR\\GenNX.exe";
const quickVerificationTargetKey = "target-gennx";
const quickVerificationTargetName = "MIDAS GenNX";

export default function App() {
  const [desktopStatus, setDesktopStatus] =
    useState<DesktopStatus>(browserPreviewStatus);
  const [workspaceState, setWorkspaceState] =
    useState<ClibaseWorkspaceStateResult | null>(null);
  const [activeTerminalKey, setActiveTerminalKey] = useState("");
  const [terminalState, setTerminalState] =
    useState<ClibaseTerminalState | null>(null);
  const [browserState, setBrowserState] = useState<ClibaseBrowserState | null>(null);
  const [browserAddress, setBrowserAddress] = useState("");
  const [browserNotice, setBrowserNotice] = useState(
    "Waiting for browser state sync.",
  );
  const [commandText, setCommandText] = useState("");
  const [workbenchSidePanel, setWorkbenchSidePanel] =
    useState<"workspace" | "terminal" | "verification">("workspace");
  const [terminalSessionNonce, setTerminalSessionNonce] = useState(0);
  const [terminalNotice, setTerminalNotice] = useState(
    "Waiting for the desktop shell terminal bridge.",
  );
  const [uiaRegistry, setUiaRegistry] = useState<ClibaseUiaRegistryResult | null>(null);
  const [uiaNotice, setUiaNotice] = useState(
    "UIA verification registry is waiting for sync.",
  );
  const [uiaResultText, setUiaResultText] = useState("");
  const [uiaTargetKey, setUiaTargetKey] = useState(quickVerificationTargetKey);
  const [uiaTargetName, setUiaTargetName] = useState(quickVerificationTargetName);
  const [uiaExePath, setUiaExePath] = useState(defaultGenNxExePath);
  const [uiaArgsText, setUiaArgsText] = useState("");
  const [uiaWorkingDir, setUiaWorkingDir] = useState("");
  const [uiaStartupWaitMs, setUiaStartupWaitMs] = useState("1200");
  const [uiaSelectedTargetKey, setUiaSelectedTargetKey] = useState("");
  const [uiaMacroKey, setUiaMacroKey] = useState("macro-local-smoke");
  const [uiaMacroName, setUiaMacroName] = useState("Local Smoke");
  const [uiaMacroDescription, setUiaMacroDescription] = useState(
    "Launch, wait, and stop target for verification.",
  );
  const [uiaMacroTagsText, setUiaMacroTagsText] = useState("local,smoke");
  const [uiaMacroStepsYaml, setUiaMacroStepsYaml] = useState(defaultUiaMacroStepsYaml);
  const [uiaSelectedMacroKey, setUiaSelectedMacroKey] = useState("");
  const [uiaAdapterPath, setUiaAdapterPath] = useState("");
  const [uiaPythonExecutable, setUiaPythonExecutable] = useState("");
  const [uiaProviderKey, setUiaProviderKey] = useState("flaui_python");
  const [uiaAdapterTimeoutMs, setUiaAdapterTimeoutMs] = useState("5000");
  const [uiaEnsureTargetRunning, setUiaEnsureTargetRunning] = useState(true);
  const [quickExePath, setQuickExePath] = useState(defaultGenNxExePath);
  const [quickStartupWaitMs, setQuickStartupWaitMs] = useState("1200");
  const [verificationHostRefW, setVerificationHostRefW] = useState("1280");
  const [verificationHostRefH, setVerificationHostRefH] = useState("720");
  const [verificationCoordSpace, setVerificationCoordSpace] = useState<
    "screen" | "client" | "host_reference"
  >("host_reference");
  const [verificationPlacementMode, setVerificationPlacementMode] = useState<
    "external_os_window" | "host_panel_fill"
  >("external_os_window");
  const [isVerificationAdvancedOpen, setIsVerificationAdvancedOpen] = useState(false);
  const [uiaRecordingPrettyLog, setUiaRecordingPrettyLog] = useState("");
  const [uiaLastRecordingPayload, setUiaLastRecordingPayload] = useState<unknown | null>(null);
  const [uiaResolvedUiapeek, setUiaResolvedUiapeek] = useState<{
    path: string;
    source: ClibaseUiaRegistryResult["uiapeek_resolution"]["resolution_source"];
  } | null>(null);
  const [uiaResolvedUiapeekHost, setUiaResolvedUiapeekHost] = useState<{
    path: string | null;
    source: ClibaseUiaRegistryResult["uiapeek_host_resolution"]["resolution_source"];
  } | null>(null);
  const [uiaRecordingState, setUiaRecordingState] = useState<ClibaseUiaRecordingState | null>(
    null,
  );
  const [draggedTabKey, setDraggedTabKey] = useState("");
  const [dropTargetTabKey, setDropTargetTabKey] = useState<string | null>(null);
  const [isStripDragActive, setIsStripDragActive] = useState(false);
  const [isStripAppendActive, setIsStripAppendActive] = useState(false);
  const [incomingDetachedTabKey, setIncomingDetachedTabKey] = useState("");
  const [isDockZoneActive, setIsDockZoneActive] = useState(false);
  const [activeDockDropTarget, setActiveDockDropTarget] =
    useState<DockDropTarget | null>(null);
  const [draftShellSplitRatio, setDraftShellSplitRatio] = useState<number | null>(null);
  const [isSplitResizing, setIsSplitResizing] = useState(false);
  const [draftShellStackSplitRatio, setDraftShellStackSplitRatio] =
    useState<number | null>(null);
  const [isShellStackResizing, setIsShellStackResizing] = useState(false);
  const uiaRecordingSessionPayloadsRef = useRef<unknown[]>([]);
  const [uiaRecordingSessionCount, setUiaRecordingSessionCount] = useState(0);
  const [uiaRecordingMergedAsSetText, setUiaRecordingMergedAsSetText] = useState(true);
  const [uiaRecordingOp, setUiaRecordingOp] = useState<"idle" | "start" | "stop">("idle");
  const [uiaRuntimeSnapshot, setUiaRuntimeSnapshot] = useState<ClibaseUiaRuntimeStatusResult | null>(
    null,
  );
  const [uiaRuntimeSnapshotError, setUiaRuntimeSnapshotError] = useState<string | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const browserSurfaceSlotRef = useRef<HTMLDivElement | null>(null);
  const workbenchGridRef = useRef<HTMLElement | null>(null);
  const shellStackGridRef = useRef<HTMLElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const seenOutputKeysRef = useRef(new Set<string>());
  const activeTerminalKeyRef = useRef("");
  const resizeTimerRef = useRef<number | null>(null);
  const shellSplitResizeFrameRef = useRef<number | null>(null);
  const shellSplitPendingRatioRef = useRef<number | null>(null);
  const shellStackResizeFrameRef = useRef<number | null>(null);
  const shellStackPendingRatioRef = useRef<number | null>(null);
  const lastBrowserHostBoundsKeyRef = useRef<string>("");
  const lastPushedBrowserHostBoundsKeyRef = useRef<string>("");

  const workspaceSummary = useMemo(() => {
    const workspace = workspaceState?.workspace;
    const currentWindow = workspace?.current_window ?? null;
    const currentLayoutPolicy = currentWindow?.layout_policy ?? fallbackLayoutPolicy;
    const visibleTabs = workspace?.visible_tabs ?? workspace?.active_project_tabs ?? [];

    return {
      activeProjectKey:
        workspace?.active_project_key ||
        workspaceState?.runtime_registry?.active_project_key ||
        "n/a",
      activeProjectName:
        workspace?.active_project_name ||
        workspaceState?.runtime_registry?.active_project_key ||
        "n/a",
      activeTabKey:
        workspace?.active_tab_key ||
        workspaceState?.runtime_registry?.active_tab_key ||
        "n/a",
      activeBrowserKey:
        workspace?.active_browser_key ||
        workspaceState?.runtime_registry?.active_browser_key ||
        "n/a",
      activeTerminalKey: getActiveTerminalKey(workspaceState) || "n/a",
      activeProjectTabs: workspace?.active_project_tabs ?? [],
      visibleTabs,
      currentWindow,
      layoutPolicy: currentLayoutPolicy,
      layoutPresetKey:
        currentWindow?.layout_state?.layout_preset_key ??
        currentLayoutPolicy.layout_preset_key,
      isDetachedWindow: currentWindow?.is_detached ?? false,
      hasPreviousTab: workspace?.has_previous_tab ?? false,
      hasNextTab: workspace?.has_next_tab ?? false,
      shellSplitRatio:
        currentWindow?.layout_state?.shell_split_ratio ??
        currentLayoutPolicy.default_shell_split_ratio,
      shellStackSplitRatio:
        currentWindow?.layout_state?.shell_stack_split_ratio ??
        currentLayoutPolicy.default_shell_stack_split_ratio,
      browserDockPosition: normalizeBrowserDockPosition(
        currentWindow?.layout_state?.browser_dock_position,
      ),
      browserCollapsed:
        currentWindow?.layout_state?.browser_collapsed ??
        currentLayoutPolicy.default_browser_collapsed,
      allowedBrowserDockPositions:
        currentLayoutPolicy.allowed_browser_dock_positions,
      canDetachActiveTab:
        !currentWindow?.is_detached && visibleTabs.length > 1,
    };
  }, [workspaceState]);

  const effectiveShellSplitRatio =
    draftShellSplitRatio ?? workspaceSummary.shellSplitRatio;
  const effectiveShellStackSplitRatio =
    draftShellStackSplitRatio ?? workspaceSummary.shellStackSplitRatio;
  const shellPaneFr = Math.round(effectiveShellSplitRatio * 100);
  const browserPaneFr = Math.max(100 - shellPaneFr, 26);
  const shellStackTopFr = Math.round(effectiveShellStackSplitRatio * 100);
  const shellStackBottomFr = Math.max(100 - shellStackTopFr, 24);
  const isHorizontalBrowserDock =
    workspaceSummary.browserDockPosition === "top" ||
    workspaceSummary.browserDockPosition === "bottom";
  const isVerificationMode = workbenchSidePanel === "verification";
  const isTerminalFocusMode = workbenchSidePanel === "terminal";
  const isBrowserSurfaceHidden =
    workspaceSummary.browserCollapsed || isTerminalFocusMode || isVerificationMode;
  const isBrowserLeading =
    workspaceSummary.browserDockPosition === "left" ||
    workspaceSummary.browserDockPosition === "top";
  const workbenchGridStyle = {
    ["--layout-shell-fr" as string]: `${shellPaneFr}fr`,
    ["--layout-browser-fr" as string]: `${browserPaneFr}fr`,
  } as CSSProperties;
  const workbenchGridClassName = isBrowserSurfaceHidden
    ? "workbench-grid workbench-grid--browser-collapsed"
    : `workbench-grid workbench-grid--dock-${workspaceSummary.browserDockPosition}`;
  const shellStackGridStyle = {
    ["--shell-stack-top-fr" as string]: `${shellStackTopFr}fr`,
    ["--shell-stack-bottom-fr" as string]: `${shellStackBottomFr}fr`,
  } as CSSProperties;
  const effectiveShellStackGridStyle = isTerminalFocusMode
    ? ({
        ...shellStackGridStyle,
        gridTemplateRows: "minmax(0, 1fr)",
      } as CSSProperties)
    : shellStackGridStyle;
  const isTabDragSessionActive =
    !workspaceSummary.isDetachedWindow &&
    Boolean(draggedTabKey || incomingDetachedTabKey);
  const allowedDockTargets = useMemo(
    () =>
      workspaceSummary.allowedBrowserDockPositions.filter(
        (entry): entry is BrowserDockPosition =>
          entry === "left" || entry === "right" || entry === "top" || entry === "bottom",
      ),
    [workspaceSummary.allowedBrowserDockPositions],
  );
  const dockDropTargets = useMemo(
    () => ["center", ...allowedDockTargets] as DockDropTarget[],
    [allowedDockTargets],
  );
  const dockPolicyHint = allowedDockTargets.length
    ? allowedDockTargets.map((entry) => formatDockTargetLabel(entry)).join(", ")
    : "Right";

  const clearTabDragState = () => {
    setDraggedTabKey("");
    setDropTargetTabKey(null);
    setIsStripDragActive(false);
    setIsStripAppendActive(false);
    setIncomingDetachedTabKey("");
    setIsDockZoneActive(false);
    setActiveDockDropTarget(null);
  };

  const repaintTerminalViewport = () => {
    const targetTerminal = terminalRef.current;
    if (!targetTerminal || targetTerminal.rows <= 0) {
      return;
    }

    targetTerminal.refresh(0, targetTerminal.rows - 1);
    targetTerminal.scrollToBottom();
  };

  const consumeTerminalEntries = (entries: ClibaseTerminalOutputEntry[]) => {
    const targetTerminal = terminalRef.current;
    if (!targetTerminal) {
      return;
    }

    let hasPtyOutput = false;

    for (const entry of entries) {
      if (entry.terminal_key !== activeTerminalKeyRef.current) {
        continue;
      }

      if (seenOutputKeysRef.current.has(entry.output_key)) {
        continue;
      }

      seenOutputKeysRef.current.add(entry.output_key);

      if (entry.stream === "pty") {
        targetTerminal.write(entry.text);
        hasPtyOutput = true;
        continue;
      }
      if (entry.text.startsWith("[terminal-error]")) {
        setTerminalNotice(entry.text.replace("[terminal-error] ", "").trim());
      } else if (entry.text.startsWith("[terminal-exit]")) {
        setTerminalNotice("Terminal session exited.");
      }
    }

    if (hasPtyOutput) {
      repaintTerminalViewport();
    }
  };

  const synchronizeTerminal = async (ensureSession: boolean) => {
    const bridge = window.clibaseDesktop;
    const terminalKey = activeTerminalKeyRef.current;

    if (!bridge?.isElectron || !terminalKey) {
      return null;
    }

    let nextState = await bridge.getTerminalState(terminalKey);
    if (ensureSession && nextState.status !== "running") {
      nextState = await bridge.createTerminal(terminalKey);
    }

    setTerminalState(nextState);

    const tail = await bridge.getTerminalLogsTail(terminalKey, 120);
    consumeTerminalEntries(tail.entries);
    return nextState;
  };

  const applyWorkspaceState = (nextWorkspaceState: ClibaseWorkspaceStateResult) => {
    setWorkspaceState(nextWorkspaceState);
    setActiveTerminalKey(getActiveTerminalKey(nextWorkspaceState));
  };

  const syncWorkspace = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    applyWorkspaceState(await bridge.getWorkspaceState());
  };

  const activateTab = async (tabKey: string) => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    applyWorkspaceState(await bridge.activateTab(tabKey));
  };

  const activateNextTab = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron || !workspaceSummary.hasNextTab) {
      return;
    }

    applyWorkspaceState(await bridge.activateNextTab());
  };

  const activatePreviousTab = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron || !workspaceSummary.hasPreviousTab) {
      return;
    }

    applyWorkspaceState(await bridge.activatePreviousTab());
  };

  const detachTab = async (tabKey?: string) => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    applyWorkspaceState(await bridge.detachTab(tabKey));
  };

  const redockTab = async (tabKey?: string) => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    applyWorkspaceState(await bridge.redockTab(tabKey));
  };

  const reorderTabs = async (tabOrder: string[]) => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    applyWorkspaceState(await bridge.reorderTabs(tabOrder));
  };

  const applyUiaRegistryState = (nextRegistry: ClibaseUiaRegistryResult) => {
    setUiaRegistry(nextRegistry);
    setUiaAdapterPath(nextRegistry.uia_adapter.executable_path);
    setUiaPythonExecutable(nextRegistry.uia_adapter.python_executable ?? "");
    setUiaProviderKey(nextRegistry.uia_adapter.provider_key ?? "flaui_python");
    setUiaAdapterTimeoutMs(String(nextRegistry.uia_adapter.default_timeout_ms));
    setUiaResolvedUiapeek(
      nextRegistry.uiapeek_resolution
        ? {
            path: nextRegistry.uiapeek_resolution.resolved_executable,
            source: nextRegistry.uiapeek_resolution.resolution_source,
          }
        : null,
    );
    setUiaResolvedUiapeekHost(
      nextRegistry.uiapeek_host_resolution
        ? {
            path: nextRegistry.uiapeek_host_resolution.resolved_executable,
            source: nextRegistry.uiapeek_host_resolution.resolution_source,
          }
        : null,
    );

    const resolvedTargetKey = nextRegistry.targets.some(
      (entry) => entry.target_key === uiaSelectedTargetKey,
    )
      ? uiaSelectedTargetKey
      : nextRegistry.targets[0]?.target_key ?? "";
    setUiaSelectedTargetKey(resolvedTargetKey);

    const selectedTargetRecord =
      nextRegistry.targets.find((entry) => entry.target_key === resolvedTargetKey) ??
      nextRegistry.targets[0] ??
      null;
    if (selectedTargetRecord) {
      setUiaTargetKey(selectedTargetRecord.target_key);
      setUiaTargetName(selectedTargetRecord.target_name);
      setUiaExePath(selectedTargetRecord.exe_path);
      setUiaArgsText(selectedTargetRecord.args.join(", "));
      setUiaWorkingDir(selectedTargetRecord.working_dir);
      setUiaStartupWaitMs(String(selectedTargetRecord.startup_wait_ms));
    }
    const quickTargetRecord =
      nextRegistry.targets.find((entry) => entry.target_key === quickVerificationTargetKey) ??
      null;
    if (quickTargetRecord) {
      setQuickExePath(quickTargetRecord.exe_path);
      setQuickStartupWaitMs(String(quickTargetRecord.startup_wait_ms));
    }

    const frameSource =
      quickTargetRecord?.host_reference_frame ??
      selectedTargetRecord?.host_reference_frame ??
      null;
    if (frameSource) {
      setVerificationHostRefW(String(frameSource.width_px));
      setVerificationHostRefH(String(frameSource.height_px));
      setVerificationCoordSpace(frameSource.coordinate_space);
      setVerificationPlacementMode(frameSource.placement_mode);
    } else {
      setVerificationHostRefW("1280");
      setVerificationHostRefH("720");
      setVerificationCoordSpace("host_reference");
      setVerificationPlacementMode("external_os_window");
    }

    const resolvedMacroKey = nextRegistry.macros.some(
      (entry) => entry.macro_key === uiaSelectedMacroKey,
    )
      ? uiaSelectedMacroKey
      : nextRegistry.macros[0]?.macro_key ?? "";
    setUiaSelectedMacroKey(resolvedMacroKey);

    const selectedMacroRecord =
      nextRegistry.macros.find((entry) => entry.macro_key === resolvedMacroKey) ??
      nextRegistry.macros[0] ??
      null;
    if (selectedMacroRecord) {
      setUiaMacroKey(selectedMacroRecord.macro_key);
      setUiaMacroName(selectedMacroRecord.macro_name);
      setUiaMacroDescription(selectedMacroRecord.description);
      setUiaMacroTagsText(selectedMacroRecord.shared_tags.join(", "));
      setUiaMacroStepsYaml(formatStructuredResult(selectedMacroRecord.steps));
      setUiaTargetKey(selectedMacroRecord.target_key || uiaTargetKey);
    }
  };

  const buildVerificationHostReferenceFrame = (): ClibaseUiaHostReferenceFrame => {
    const w = Math.max(1, Math.round(Number(verificationHostRefW) || 0));
    const h = Math.max(1, Math.round(Number(verificationHostRefH) || 0));
    return {
      width_px: w,
      height_px: h,
      coordinate_space: verificationCoordSpace,
      placement_mode: verificationPlacementMode,
    };
  };

  const refreshUiaRegistry = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return null;
    }

    try {
      const nextRegistry = await bridge.getUiaRegistry();
      applyUiaRegistryState(nextRegistry);
      setUiaNotice(
        `UIA registry synced (${nextRegistry.targets.length} targets, ${nextRegistry.macros.length} macros).`,
      );
      return nextRegistry;
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const refreshUiaRuntimeSnapshot = useCallback(async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    if (typeof bridge.getUiaRuntimeStatus === "function") {
      try {
        const snap = await bridge.getUiaRuntimeStatus();
        setUiaRuntimeSnapshot(snap);
        setUiaRecordingState(snap.recording_state);
        setUiaRuntimeSnapshotError(null);
        return;
      } catch (error) {
        setUiaRuntimeSnapshotError(error instanceof Error ? error.message : String(error));
      }
    }

    try {
      const rec = await bridge.getUiaRecordingState();
      setUiaRecordingState(rec);
      setUiaRuntimeSnapshotError(null);
    } catch (error) {
      setUiaRecordingState(null);
      setUiaRuntimeSnapshotError((prev) => prev ?? (error instanceof Error ? error.message : String(error)));
    }
  }, []);

  const launchQuickExe = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const normalizedExePath = quickExePath.trim();
    if (!normalizedExePath) {
      setUiaNotice("exe_path is required to run GenNX.");
      return;
    }

    const startupWait = Math.max(Number(quickStartupWaitMs) || 0, 0);
    const requestedHostFrame = buildVerificationHostReferenceFrame();
    const effectiveHostFrame =
      requestedHostFrame.placement_mode === "host_panel_fill"
        ? {
            ...requestedHostFrame,
            placement_mode: "external_os_window" as const,
          }
        : requestedHostFrame;

    try {
      const saved = await bridge.saveUiaTarget({
        target_key: quickVerificationTargetKey,
        target_name: quickVerificationTargetName,
        exe_path: normalizedExePath,
        args: [],
        working_dir: "",
        startup_wait_ms: startupWait,
        host_reference_frame: effectiveHostFrame,
      });
      const launched = await bridge.launchUiaTarget(saved.saved_target.target_key);
      setUiaTargetKey(saved.saved_target.target_key);
      setUiaTargetName(saved.saved_target.target_name);
      setUiaExePath(saved.saved_target.exe_path);
      setUiaStartupWaitMs(String(saved.saved_target.startup_wait_ms));
      setUiaSelectedTargetKey(saved.saved_target.target_key);
      setUiaResultText(
        formatStructuredResult({
          saved_target: saved.saved_target,
          target_state: launched,
        }),
      );
      if (requestedHostFrame.placement_mode === "host_panel_fill") {
        setVerificationPlacementMode("external_os_window");
      }
      const constraintInfo = launched.host_window_constraint;
      const placementHint =
        requestedHostFrame.placement_mode === "host_panel_fill"
          ? "host_panel_fill is not implemented yet, fell back to external_os_window."
          : "";
      const constraintHint = constraintInfo
        ? constraintInfo.ok
          ? "Window resize lock applied."
          : `Window resize lock failed: ${constraintInfo.detail ?? "unknown"}`
        : "No window-constraint response was returned.";
      setUiaNotice(
        launched.is_running
          ? `GenNX running (pid ${launched.pid ?? "n/a"}). ${constraintHint} ${placementHint}`.trim()
          : `GenNX launch requested. ${constraintHint} ${placementHint}`.trim(),
      );
      await refreshUiaRegistry();
      void refreshUiaRuntimeSnapshot();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const stopQuickExe = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    try {
      const result = await bridge.stopUiaTarget(quickVerificationTargetKey);
      setUiaSelectedTargetKey(quickVerificationTargetKey);
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(`Stop requested: ${quickVerificationTargetKey}`);
      await refreshUiaRegistry();
      void refreshUiaRuntimeSnapshot();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const saveUiaAdapter = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    try {
      const timeout = Math.max(Number(uiaAdapterTimeoutMs) || 5000, 500);
      const result = await bridge.updateUiaAdapter({
        executable_path: uiaAdapterPath.trim(),
        default_timeout_ms: timeout,
        python_executable: uiaPythonExecutable.trim(),
        provider_key: uiaProviderKey.trim(),
      });
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice("UIA adapter settings saved.");
      await refreshUiaRegistry();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const saveUiaTarget = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const targetKey = uiaTargetKey.trim();
    if (!targetKey) {
      setUiaNotice("target_key is required.");
      return;
    }

    try {
      const result = await bridge.saveUiaTarget({
        target_key: targetKey,
        target_name: uiaTargetName.trim(),
        exe_path: uiaExePath.trim(),
        args: splitCommaTokens(uiaArgsText),
        working_dir: uiaWorkingDir.trim(),
        startup_wait_ms: Math.max(Number(uiaStartupWaitMs) || 0, 0),
        host_reference_frame: buildVerificationHostReferenceFrame(),
      });
      setUiaSelectedTargetKey(result.saved_target.target_key);
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(`UIA target saved: ${result.saved_target.target_key}`);
      await refreshUiaRegistry();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const launchUiaTarget = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const targetKey = uiaSelectedTargetKey || uiaTargetKey.trim();
    if (!targetKey) {
      setUiaNotice("Select or enter target_key before launch.");
      return;
    }

    try {
      const result = await bridge.launchUiaTarget(targetKey);
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(
        result.is_running
          ? `Target running: ${targetKey} (pid ${result.pid ?? "n/a"})`
          : `Launch requested: ${targetKey}`,
      );
      await refreshUiaRegistry();
      void refreshUiaRuntimeSnapshot();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const stopUiaTarget = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const targetKey = uiaSelectedTargetKey || uiaTargetKey.trim();
    if (!targetKey) {
      setUiaNotice("Select or enter target_key before stop.");
      return;
    }

    try {
      const result = await bridge.stopUiaTarget(targetKey);
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(`Target stop requested: ${targetKey}`);
      await refreshUiaRegistry();
      void refreshUiaRuntimeSnapshot();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const saveUiaMacro = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const macroKey = uiaMacroKey.trim();
    const targetKey = (uiaSelectedTargetKey || uiaTargetKey).trim();
    if (!macroKey) {
      setUiaNotice("macro_key is required.");
      return;
    }
    if (!targetKey) {
      setUiaNotice("target_key is required.");
      return;
    }

    try {
      const result = await bridge.saveUiaMacro({
        macro_key: macroKey,
        macro_name: uiaMacroName.trim(),
        target_key: targetKey,
        description: uiaMacroDescription.trim(),
        shared_tags: splitCommaTokens(uiaMacroTagsText),
        steps_yaml: uiaMacroStepsYaml,
      });
      setUiaSelectedMacroKey(result.saved_macro.macro_key);
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(`UIA macro saved: ${result.saved_macro.macro_key}`);
      await refreshUiaRegistry();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const runUiaMacro = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const macroKey = (uiaSelectedMacroKey || uiaMacroKey).trim();
    const targetKey = (uiaSelectedTargetKey || uiaTargetKey).trim();
    if (!macroKey) {
      setUiaNotice("Select or enter macro_key before run.");
      return;
    }

    try {
      const result = await bridge.runUiaMacro({
        macro_key: macroKey,
        target_key: targetKey || undefined,
        ensure_target_running: uiaEnsureTargetRunning,
      });
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(
        `Macro run ${result.status}: ${result.macro_key} (${result.succeeded_step_count}/${result.step_count})`,
      );
      await refreshUiaRegistry();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const deleteUiaMacro = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const macroKey = (uiaSelectedMacroKey || uiaMacroKey).trim();
    if (!macroKey) {
      setUiaNotice("Select or enter macro_key before delete.");
      return;
    }

    try {
      const result = await bridge.deleteUiaMacro(macroKey);
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(`UIA macro deleted: ${macroKey}`);
      setUiaSelectedMacroKey("");
      await refreshUiaRegistry();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const startUiaRecording = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      setUiaNotice("Recording requires the desktop (Electron) app, not the Vite-only browser.");
      return;
    }

    setUiaRecordingOp("start");
    setUiaNotice(
      "Starting UiaPeek: resolving host, HTTP hub (auto-start can take up to ~25s), then SignalR. First run may download UiaPeek from GitHub (~1–3 min on slow networks).",
    );
    try {
      uiaRecordingSessionPayloadsRef.current = [];
      setUiaRecordingSessionCount(0);
      const next = await bridge.startUiaRecording();
      setUiaRecordingState(next);
      setUiaResultText(formatStructuredResult(next));
      setUiaNotice("UiaPeek recording session started (SignalR). Session buffer cleared for a new macro.");
      void refreshUiaRuntimeSnapshot();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setUiaRecordingOp("idle");
    }
  };

  const stopUiaRecording = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      setUiaNotice("Recording requires the desktop (Electron) app.");
      return;
    }

    setUiaRecordingOp("stop");
    try {
      const next = await bridge.stopUiaRecording();
      setUiaRecordingState(next);
      setUiaResultText(formatStructuredResult(next));
      setUiaNotice("UiaPeek recording stopped.");
      void refreshUiaRuntimeSnapshot();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setUiaRecordingOp("idle");
    }
  };

  const refreshUiaRecordingState = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    try {
      const next = await bridge.getUiaRecordingState();
      setUiaRecordingState(next);
      setUiaResultText(formatStructuredResult(next));
      setUiaNotice("UiaPeek recording state refreshed.");
      void refreshUiaRuntimeSnapshot();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const appendFlauiStepFromLastRecording = () => {
    if (uiaLastRecordingPayload === null || uiaLastRecordingPayload === undefined) {
      setUiaNotice("No recording event received yet.");
      return;
    }

    const hints = extractRecordingUiHints(uiaLastRecordingPayload);
    const selector = buildSelectorFromHints(hints);
    if (!selector) {
      setUiaNotice("Last event has no AutomationId/Name/ControlType to build a selector.");
      return;
    }

    const stepKey = nextRecordingStepKey(uiaMacroStepsYaml);
    const block = formatMacroStepRecordYaml(stepKey, "flaui.click", selector);
    setUiaMacroStepsYaml((prev) => appendYamlMacroStep(prev, block));
    setUiaNotice(`Appended macro step ${stepKey} (flaui.click).`);
  };

  const appendUiapeekStepFromLastRecording = () => {
    if (uiaLastRecordingPayload === null || uiaLastRecordingPayload === undefined) {
      setUiaNotice("No recording event received yet.");
      return;
    }

    const hints = extractRecordingUiHints(uiaLastRecordingPayload);
    const selector = buildSelectorFromHints(hints);
    if (!selector) {
      setUiaNotice("Last event has no AutomationId/Name/ControlType to build a selector.");
      return;
    }

    const stepKey = nextRecordingStepKey(uiaMacroStepsYaml);
    const block = formatMacroStepRecordYaml(stepKey, "uiapeek.invoke", selector);
    setUiaMacroStepsYaml((prev) => appendYamlMacroStep(prev, block));
    setUiaNotice(`Appended macro step ${stepKey} (uiapeek.invoke).`);
  };

  const copyLastRecordingPayload = async () => {
    if (uiaLastRecordingPayload === null || uiaLastRecordingPayload === undefined) {
      setUiaNotice("No recording event to copy.");
      return;
    }

    const text = JSON.stringify(uiaLastRecordingPayload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setUiaNotice("Last recording event JSON copied to clipboard.");
    } catch {
      setUiaNotice("Clipboard write failed.");
    }
  };

  const generateMacroFromRecordingSession = () => {
    const payloads = uiaRecordingSessionPayloadsRef.current;
    if (payloads.length === 0) {
      setUiaNotice("No events in this session buffer yet.");
      return;
    }

    const steps = recordingPayloadsToMacroSteps(payloads, {
      mergedFieldAction: uiaRecordingMergedAsSetText ? "set_text" : "type",
    });
    if (steps.length === 0) {
      setUiaNotice(
        "No flaui steps derived (need mouse/keyboard events with resolvable UI metadata). Check the event log.",
      );
      return;
    }

    setUiaMacroStepsYaml(YAML.stringify(steps));
    setUiaNotice(
      `Generated ${steps.length} flaui step(s) from ${payloads.length} buffered event(s). Review YAML, then Save macro.`,
    );
  };

  const saveRecordingSessionAsMacro = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const macroKey = uiaMacroKey.trim();
    const targetKey = (uiaSelectedTargetKey || uiaTargetKey).trim();
    if (!macroKey) {
      setUiaNotice("macro_key is required to save.");
      return;
    }
    if (!targetKey) {
      setUiaNotice("target_key is required to save.");
      return;
    }

    const payloads = uiaRecordingSessionPayloadsRef.current;
    if (payloads.length === 0) {
      setUiaNotice("No events in session buffer.");
      return;
    }

    const steps = recordingPayloadsToMacroSteps(payloads, {
      mergedFieldAction: uiaRecordingMergedAsSetText ? "set_text" : "type",
    });
    if (steps.length === 0) {
      setUiaNotice("No steps derived from session.");
      return;
    }

    const yaml = YAML.stringify(steps);
    setUiaMacroStepsYaml(yaml);

    try {
      const result = await bridge.saveUiaMacro({
        macro_key: macroKey,
        macro_name: uiaMacroName.trim(),
        target_key: targetKey,
        description: uiaMacroDescription.trim(),
        shared_tags: splitCommaTokens(uiaMacroTagsText),
        steps_yaml: yaml,
      });
      setUiaSelectedMacroKey(result.saved_macro.macro_key);
      setUiaResultText(formatStructuredResult(result));
      setUiaNotice(`Saved macro ${result.saved_macro.macro_key} with ${steps.length} step(s) from session.`);
      await refreshUiaRegistry();
    } catch (error) {
      setUiaNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const persistWindowLayoutState = async (nextShellSplitRatio: number) => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const normalizedRatio = clampRatio(
      nextShellSplitRatio,
      workspaceSummary.layoutPolicy.default_shell_split_ratio,
      workspaceSummary.layoutPolicy.min_shell_split_ratio,
      workspaceSummary.layoutPolicy.max_shell_split_ratio,
    );
    setDraftShellSplitRatio(normalizedRatio);
    applyWorkspaceState(
      await bridge.updateWindowLayoutState({
        shell_split_ratio: normalizedRatio,
      }),
    );
  };

  const persistShellStackLayoutState = async (nextShellStackSplitRatio: number) => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const normalizedRatio = clampRatio(
      nextShellStackSplitRatio,
      workspaceSummary.layoutPolicy.default_shell_stack_split_ratio,
      workspaceSummary.layoutPolicy.min_shell_stack_split_ratio,
      workspaceSummary.layoutPolicy.max_shell_stack_split_ratio,
    );
    setDraftShellStackSplitRatio(normalizedRatio);
    applyWorkspaceState(
      await bridge.updateWindowLayoutState({
        shell_stack_split_ratio: normalizedRatio,
      }),
    );
  };

  const updateBrowserDockPosition = async (nextPosition: BrowserDockPosition) => {
    const bridge = window.clibaseDesktop;
    if (
      !bridge?.isElectron ||
      !workspaceSummary.allowedBrowserDockPositions.includes(nextPosition)
    ) {
      return;
    }

    applyWorkspaceState(
      await bridge.updateWindowLayoutState({
        browser_dock_position: nextPosition,
      }),
    );
  };

  const getActiveBrowserKey = () => {
    const browserKey = workspaceSummary.activeBrowserKey.trim();
    if (!browserKey || browserKey === "n/a") {
      return undefined;
    }

    return browserKey;
  };

  const syncBrowserState = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return null;
    }

    try {
      const nextState = await bridge.getBrowserState(getActiveBrowserKey());
      setBrowserState(nextState);
      setBrowserNotice(
        nextState.is_loading
          ? "Browser state synced. The page is still loading."
          : "Browser state synced.",
      );
      setBrowserAddress((currentValue) =>
        currentValue.trim() ? currentValue : getSuggestedBrowserAddress(nextState),
      );
      return nextState;
    } catch (error) {
      setBrowserNotice(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const syncBrowserHostBounds = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const nextBounds = isBrowserSurfaceHidden
      ? null
      : readHostBounds(browserSurfaceSlotRef.current);
    const nextBoundsKey = nextBounds
      ? `${nextBounds.x}:${nextBounds.y}:${nextBounds.width}:${nextBounds.height}`
      : "null";

    if (lastBrowserHostBoundsKeyRef.current === nextBoundsKey) {
      return;
    }

    try {
      await bridge.setBrowserHostBounds(nextBounds);
      lastBrowserHostBoundsKeyRef.current = nextBoundsKey;
    } catch (error) {
      // Keep retrying on the next sync tick if the host window is not ready yet.
      lastBrowserHostBoundsKeyRef.current = "";
      throw error;
    }
  };

  const pushBrowserHostBounds = () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const nextBounds = isBrowserSurfaceHidden
      ? null
      : readHostBounds(browserSurfaceSlotRef.current);
    const nextBoundsKey = nextBounds
      ? `${nextBounds.x}:${nextBounds.y}:${nextBounds.width}:${nextBounds.height}`
      : "null";

    if (lastPushedBrowserHostBoundsKeyRef.current === nextBoundsKey) {
      return;
    }

    lastPushedBrowserHostBoundsKeyRef.current = nextBoundsKey;
    bridge.pushBrowserHostBounds(nextBounds);
  };

  const toggleBrowserCollapsed = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    applyWorkspaceState(
      await bridge.updateWindowLayoutState({
        browser_collapsed: !workspaceSummary.browserCollapsed,
      }),
    );
  };

  const recoverBrowserLane = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    applyWorkspaceState(
      await bridge.updateWindowLayoutState({
        layout_preset_key: workspaceSummary.layoutPresetKey,
        browser_collapsed: workspaceSummary.layoutPolicy.default_browser_collapsed,
        browser_dock_position:
          workspaceSummary.allowedBrowserDockPositions[0] ?? "right",
        shell_split_ratio: workspaceSummary.layoutPolicy.default_shell_split_ratio,
        shell_stack_split_ratio:
          workspaceSummary.layoutPolicy.default_shell_stack_split_ratio,
      }),
    );
    setBrowserNotice("Browser lane recovered to the canonical host preset.");
  };

  const navigateBrowser = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    const targetUrl = browserAddress.trim();
    if (!targetUrl) {
      setBrowserNotice("Enter a URL or data URI to navigate.");
      return;
    }

    try {
      const nextState = await bridge.navigateBrowser(targetUrl, getActiveBrowserKey());
      setBrowserState(nextState);
      setBrowserAddress(getSuggestedBrowserAddress(nextState));
      setBrowserNotice(
        `Navigated to ${toReadableBrowserUrl(nextState.current_url, nextState.home_url, nextState.home_url_ref)}`,
      );
    } catch (error) {
      setBrowserNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const goBackBrowser = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    try {
      const nextState = await bridge.goBackBrowser(getActiveBrowserKey());
      setBrowserState(nextState);
      setBrowserAddress(getSuggestedBrowserAddress(nextState));
      setBrowserNotice(
        `Moved back to ${toReadableBrowserUrl(nextState.current_url, nextState.home_url, nextState.home_url_ref)}`,
      );
    } catch (error) {
      setBrowserNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const goForwardBrowser = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    try {
      const nextState = await bridge.goForwardBrowser(getActiveBrowserKey());
      setBrowserState(nextState);
      setBrowserAddress(getSuggestedBrowserAddress(nextState));
      setBrowserNotice(
        `Moved forward to ${toReadableBrowserUrl(nextState.current_url, nextState.home_url, nextState.home_url_ref)}`,
      );
    } catch (error) {
      setBrowserNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const reloadBrowser = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    try {
      const nextState = await bridge.reloadBrowser(getActiveBrowserKey());
      setBrowserState(nextState);
      setBrowserAddress(getSuggestedBrowserAddress(nextState));
      setBrowserNotice(
        `Reloaded ${toReadableBrowserUrl(nextState.current_url, nextState.home_url, nextState.home_url_ref)}`,
      );
    } catch (error) {
      setBrowserNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const handleTabDragStart =
    (tabKey: string) => (event: React.DragEvent<HTMLButtonElement>) => {
      const payload: TabDragPayload = {
        kind: "clibase-tab-drag",
        tabKey,
        projectKey:
          workspaceState?.workspace?.active_project_key ??
          workspaceState?.runtime_registry?.active_project_key ??
          null,
        sourceWindowKey: workspaceSummary.currentWindow?.window_key ?? null,
        sourceWindowMode: workspaceSummary.currentWindow?.window_mode ?? null,
      };

      setDraggedTabKey(tabKey);
      setDropTargetTabKey(null);
      setIsStripDragActive(!workspaceSummary.isDetachedWindow);
      setIsStripAppendActive(false);
      setIncomingDetachedTabKey("");
      setIsDockZoneActive(false);
      setActiveDockDropTarget(null);
      writeDraggedTabData(event, payload);
    };

  const handleTabDragEnd =
    (tabKey: string) => async (event: React.DragEvent<HTMLButtonElement>) => {
      clearTabDragState();

      if (workspaceSummary.isDetachedWindow || !workspaceSummary.canDetachActiveTab) {
        return;
      }

      if (event.dataTransfer.dropEffect === "none") {
        await detachTab(tabKey);
      }
    };

  const handleStripDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (workspaceSummary.isDetachedWindow) {
      return;
    }

    const payload = readDraggedTabData(event);
    if (!payload) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setIsStripDragActive(true);
    setIsStripAppendActive(true);
    setDropTargetTabKey(null);
    if (payload.sourceWindowMode === "detached-window") {
      setIncomingDetachedTabKey(payload.tabKey);
    }
  };

  const handleStripDragLeave = (event: React.DragEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    setDropTargetTabKey(null);
    setIsStripDragActive(false);
    setIsStripAppendActive(false);
    setIsDockZoneActive(false);
    setActiveDockDropTarget(null);
  };

  const handleTabDrop = async (
    event: React.DragEvent<HTMLElement>,
    targetTabKey?: string | null,
  ) => {
    if (workspaceSummary.isDetachedWindow) {
      return;
    }

    const payload = readDraggedTabData(event);
    if (!payload || !workspaceState?.workspace) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    clearTabDragState();

    const currentOrder = workspaceState.workspace.active_project_tabs.map(
      (entry) => entry.tab_key,
    );
    const nextOrder = moveTabKey(currentOrder, payload.tabKey, targetTabKey);

    if (payload.sourceWindowMode === "detached-window") {
      await redockTab(payload.tabKey);
      if (!areTabOrdersEqual(currentOrder, nextOrder)) {
        await reorderTabs(nextOrder);
      }
      await activateTab(payload.tabKey);
      return;
    }

    if (!areTabOrdersEqual(currentOrder, nextOrder)) {
      await reorderTabs(nextOrder);
    }
  };

  const handleShellDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (workspaceSummary.isDetachedWindow) {
      return;
    }

    const payload = readDraggedTabData(event);
    if (!payload || payload.sourceWindowMode !== "detached-window") {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setIncomingDetachedTabKey(payload.tabKey);
    if (!activeDockDropTarget) {
      setActiveDockDropTarget("center");
    }
  };

  const handleShellDragLeave = (event: React.DragEvent<HTMLElement>) => {
    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    setIncomingDetachedTabKey("");
    setIsDockZoneActive(false);
    setActiveDockDropTarget(null);
  };

  const handleDockTargetDragOver =
    (target: DockDropTarget) => (event: React.DragEvent<HTMLElement>) => {
      const payload = readDraggedTabData(event);
      if (!payload || payload.sourceWindowMode !== "detached-window") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setIsDockZoneActive(true);
      setIncomingDetachedTabKey(payload.tabKey);
      setActiveDockDropTarget(target);
    };

  const handleDockZoneDrop = async (
    event: React.DragEvent<HTMLElement>,
    target: DockDropTarget,
  ) => {
    setIsDockZoneActive(false);
    setActiveDockDropTarget(null);
    await handleTabDrop(event, null);
    if (target !== "center") {
      await updateBrowserDockPosition(target);
    }
  };

  const handleStripAppendDrop = async (event: React.DragEvent<HTMLElement>) => {
    setIsStripAppendActive(false);
    await handleTabDrop(event, null);
  };

  const beginSplitResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const grid = workbenchGridRef.current;
    if (!grid || !workspaceSummary.currentWindow) {
      return;
    }

    event.preventDefault();

    const computeRatio = (pointerPrimaryAxis: number) => {
      const bounds = grid.getBoundingClientRect();
      if (isHorizontalBrowserDock) {
        if (bounds.height <= 0) {
          return workspaceSummary.shellSplitRatio;
        }

        const shellHeight = isBrowserLeading
          ? bounds.bottom - pointerPrimaryAxis
          : pointerPrimaryAxis - bounds.top;

        return clampRatio(
          shellHeight / bounds.height,
          workspaceSummary.layoutPolicy.default_shell_split_ratio,
          workspaceSummary.layoutPolicy.min_shell_split_ratio,
          workspaceSummary.layoutPolicy.max_shell_split_ratio,
        );
      }

      if (bounds.width <= 0) {
        return workspaceSummary.shellSplitRatio;
      }

      const shellWidth = isBrowserLeading
        ? bounds.right - pointerPrimaryAxis
        : pointerPrimaryAxis - bounds.left;

      return clampRatio(
        shellWidth / bounds.width,
        workspaceSummary.layoutPolicy.default_shell_split_ratio,
        workspaceSummary.layoutPolicy.min_shell_split_ratio,
        workspaceSummary.layoutPolicy.max_shell_split_ratio,
      );
    };

    let nextRatio = computeRatio(
      isHorizontalBrowserDock ? event.clientY : event.clientX,
    );
    setDraftShellSplitRatio(nextRatio);
    setIsSplitResizing(true);
    shellSplitPendingRatioRef.current = nextRatio;

    const flushDraftRatio = () => {
      if (shellSplitResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(shellSplitResizeFrameRef.current);
        shellSplitResizeFrameRef.current = null;
      }

      const pendingRatio = shellSplitPendingRatioRef.current;
      if (pendingRatio === null) {
        return;
      }

      nextRatio = pendingRatio;
      setDraftShellSplitRatio(pendingRatio);
      shellSplitPendingRatioRef.current = null;
    };

    const scheduleDraftRatio = (ratio: number) => {
      shellSplitPendingRatioRef.current = ratio;
      if (shellSplitResizeFrameRef.current !== null) {
        return;
      }

      shellSplitResizeFrameRef.current = window.requestAnimationFrame(() => {
        shellSplitResizeFrameRef.current = null;
        const pendingRatio = shellSplitPendingRatioRef.current;
        if (pendingRatio === null) {
          return;
        }

        nextRatio = pendingRatio;
        setDraftShellSplitRatio(pendingRatio);
        shellSplitPendingRatioRef.current = null;
      });
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextRatio = computeRatio(
        isHorizontalBrowserDock ? moveEvent.clientY : moveEvent.clientX,
      );
      scheduleDraftRatio(nextRatio);
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      flushDraftRatio();
      setIsSplitResizing(false);
      void persistWindowLayoutState(nextRatio).catch(() => {
        setDraftShellSplitRatio(null);
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  };

  const beginShellStackResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const stackGrid = shellStackGridRef.current;
    if (!stackGrid || !workspaceSummary.currentWindow) {
      return;
    }

    event.preventDefault();

    const computeRatio = (clientY: number) => {
      const bounds = stackGrid.getBoundingClientRect();
      if (bounds.height <= 0) {
        return workspaceSummary.shellStackSplitRatio;
      }

      const topHeight = clientY - bounds.top;
      return clampRatio(
        topHeight / bounds.height,
        workspaceSummary.layoutPolicy.default_shell_stack_split_ratio,
        workspaceSummary.layoutPolicy.min_shell_stack_split_ratio,
        workspaceSummary.layoutPolicy.max_shell_stack_split_ratio,
      );
    };

    let nextRatio = computeRatio(event.clientY);
    setDraftShellStackSplitRatio(nextRatio);
    setIsShellStackResizing(true);
    shellStackPendingRatioRef.current = nextRatio;

    const flushDraftRatio = () => {
      if (shellStackResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(shellStackResizeFrameRef.current);
        shellStackResizeFrameRef.current = null;
      }

      const pendingRatio = shellStackPendingRatioRef.current;
      if (pendingRatio === null) {
        return;
      }

      nextRatio = pendingRatio;
      setDraftShellStackSplitRatio(pendingRatio);
      shellStackPendingRatioRef.current = null;
    };

    const scheduleDraftRatio = (ratio: number) => {
      shellStackPendingRatioRef.current = ratio;
      if (shellStackResizeFrameRef.current !== null) {
        return;
      }

      shellStackResizeFrameRef.current = window.requestAnimationFrame(() => {
        shellStackResizeFrameRef.current = null;
        const pendingRatio = shellStackPendingRatioRef.current;
        if (pendingRatio === null) {
          return;
        }

        nextRatio = pendingRatio;
        setDraftShellStackSplitRatio(pendingRatio);
        shellStackPendingRatioRef.current = null;
      });
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextRatio = computeRatio(moveEvent.clientY);
      scheduleDraftRatio(nextRatio);
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      flushDraftRatio();
      setIsShellStackResizing(false);
      void persistShellStackLayoutState(nextRatio).catch(() => {
        setDraftShellStackSplitRatio(null);
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
  };

  useEffect(() => {
    setDraftShellSplitRatio(null);
    setDraftShellStackSplitRatio(null);
  }, [
    workspaceSummary.currentWindow?.window_key,
  ]);

  useEffect(() => {
    if (isSplitResizing) {
      return;
    }

    setDraftShellSplitRatio((currentRatio) => {
      if (currentRatio === null) {
        return null;
      }

      return Math.abs(currentRatio - workspaceSummary.shellSplitRatio) <= 0.0005
        ? null
        : currentRatio;
    });
  }, [
    workspaceSummary.shellSplitRatio,
    isSplitResizing,
  ]);

  useEffect(() => {
    if (isShellStackResizing) {
      return;
    }

    setDraftShellStackSplitRatio((currentRatio) => {
      if (currentRatio === null) {
        return null;
      }

      return Math.abs(currentRatio - workspaceSummary.shellStackSplitRatio) <= 0.0005
        ? null
        : currentRatio;
    });
  }, [
    workspaceSummary.shellStackSplitRatio,
    isShellStackResizing,
  ]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron || isSplitResizing || isShellStackResizing) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreWorkbenchShortcut(event.target)) {
        return;
      }

      const isPreviousShortcut =
        (event.ctrlKey && event.shiftKey && event.key === "Tab") ||
        (event.ctrlKey && event.key === "PageUp");
      const isNextShortcut =
        (event.ctrlKey && !event.shiftKey && event.key === "Tab") ||
        (event.ctrlKey && event.key === "PageDown");

      if (isPreviousShortcut && workspaceSummary.hasPreviousTab) {
        event.preventDefault();
        void activatePreviousTab();
        return;
      }

      if (isNextShortcut && workspaceSummary.hasNextTab) {
        event.preventDefault();
        void activateNextTab();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [workspaceSummary.hasNextTab, workspaceSummary.hasPreviousTab]);

  const sendCommand = async () => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron || !activeTerminalKey || !commandText.trim()) {
      return;
    }

    try {
      const nextState = await bridge.writeTerminal(
        activeTerminalKey,
        commandText,
        true,
      );
      setTerminalState(nextState);
      setCommandText("");
      setTerminalNotice("Command sent to the active PTY session.");
    } catch (error) {
      setTerminalNotice(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    activeTerminalKeyRef.current = activeTerminalKey;
  }, [activeTerminalKey, terminalSessionNonce]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      setDesktopStatus(browserPreviewStatus);
      return;
    }

    const stopWorkspaceUpdates = bridge.onWorkspaceStateUpdated((nextState) => {
      applyWorkspaceState(nextState);
    });

    void bridge
      .ping()
      .then(async (result) => {
        setDesktopStatus({
          kind: "desktop-shell",
          title: "Electron workbench connected",
          detail:
            "The desktop shell, browser surface, detached-window manager, and terminal bridge are active under the same batcli-first runtime.",
          platform: result.platform,
          timestamp: result.timestamp,
          appMode: result.appMode,
        });

        applyWorkspaceState(await bridge.getWorkspaceState());
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Unknown bridge failure";

        setDesktopStatus({
          kind: "error",
          title: "Electron bridge failed",
          detail: message,
        });
      });

    return () => {
      stopWorkspaceUpdates();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let bootstrapTimerId: number | null = null;
    let cleanupTerminalSurface: (() => void) | null = null;

    const bootstrapTerminalSurface = () => {
      if (disposed || cleanupTerminalSurface || terminalRef.current) {
        return;
      }

      const host = terminalHostRef.current;
      const bridge = window.clibaseDesktop;
      if (!host || !bridge?.isElectron) {
        bootstrapTimerId = window.setTimeout(bootstrapTerminalSurface, 120);
        return;
      }
      const hostRect = host.getBoundingClientRect();
      if (hostRect.width < 24 || hostRect.height < 24) {
        bootstrapTimerId = window.setTimeout(bootstrapTerminalSurface, 120);
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: '"Cascadia Code", Consolas, "Segoe UI Mono", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: {
          background: "#07111d",
          foreground: "#edf3fb",
          cursor: "#74b0ff",
          selectionBackground: "rgba(116, 176, 255, 0.24)",
        },
        scrollback: 4000,
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(host);
      terminal.focus();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      setTerminalNotice("Terminal surface mounted. Waiting for workspace sync.");

      const copySelectionToClipboard = async () => {
        const selectedText = terminalRef.current?.getSelection() ?? "";
        if (!selectedText) {
          return;
        }

        try {
          await navigator.clipboard.writeText(selectedText);
          setTerminalNotice("Terminal selection copied.");
        } catch (error) {
          setTerminalNotice(
            error instanceof Error
              ? error.message
              : "Failed to copy terminal selection.",
          );
        }
      };

      const pasteClipboardToTerminal = async () => {
        const terminalKey = activeTerminalKeyRef.current;
        if (!terminalKey) {
          return;
        }

        try {
          const clipboardText = await navigator.clipboard.readText();
          if (!clipboardText) {
            return;
          }

          await bridge.writeTerminal(terminalKey, clipboardText, false);
        } catch (error) {
          setTerminalNotice(
            error instanceof Error
              ? error.message
              : "Failed to paste clipboard text into terminal.",
          );
        }
      };

      terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        const hasCtrlOrMeta = event.ctrlKey || event.metaKey;

        if (
          hasCtrlOrMeta &&
          key === "c" &&
          (event.shiftKey || terminalRef.current?.hasSelection())
        ) {
          event.preventDefault();
          void copySelectionToClipboard();
          return false;
        }

        if (hasCtrlOrMeta && key === "v" && event.shiftKey) {
          event.preventDefault();
          void pasteClipboardToTerminal();
          return false;
        }

        return true;
      });

      const applyResize = () => {
        if (!terminalRef.current || !fitAddonRef.current) {
          return;
        }

        fitAddonRef.current.fit();
        repaintTerminalViewport();
        const terminalKey = activeTerminalKeyRef.current;
        if (!terminalKey) {
          return;
        }
        if (terminalRef.current.cols > 0 && terminalRef.current.rows > 0) {
          void bridge
            .resizeTerminal(
              terminalKey,
              terminalRef.current.cols,
              terminalRef.current.rows,
            )
            .then((nextState) => {
              setTerminalState(nextState);
            })
            .catch((error) => {
              setTerminalNotice(
                error instanceof Error ? error.message : String(error),
              );
            });
        }
      };

      const scheduleResize = () => {
        if (resizeTimerRef.current !== null) {
          window.clearTimeout(resizeTimerRef.current);
        }

        resizeTimerRef.current = window.setTimeout(() => {
          applyResize();
        }, 120);
      };

      const focusTerminalSurface = () => {
        terminalRef.current?.focus();
        repaintTerminalViewport();
      };

      const resizeObserver = new ResizeObserver(() => {
        scheduleResize();
      });
      resizeObserver.observe(host);
      host.addEventListener("pointerdown", focusTerminalSurface);
      const handleHostPaste = (event: ClipboardEvent) => {
        const terminalKey = activeTerminalKeyRef.current;
        if (!terminalKey) {
          return;
        }

        const clipboardText = event.clipboardData?.getData("text/plain") ?? "";
        if (!clipboardText) {
          return;
        }

        event.preventDefault();
        void bridge.writeTerminal(terminalKey, clipboardText, false).catch((error) => {
          setTerminalNotice(error instanceof Error ? error.message : String(error));
        });
      };
      host.addEventListener("paste", handleHostPaste as EventListener);

      const handleHostContextMenu = (event: MouseEvent) => {
        event.preventDefault();
        terminalRef.current?.focus();
        void pasteClipboardToTerminal();
      };
      host.addEventListener("contextmenu", handleHostContextMenu);

      const inputDisposable = terminal.onData((data) => {
        const terminalKey = activeTerminalKeyRef.current;
        if (!terminalKey) {
          return;
        }

        void bridge.writeTerminal(terminalKey, data, false).catch((error) => {
          setTerminalNotice(error instanceof Error ? error.message : String(error));
        });
      });

      const stopOutput = bridge.onTerminalOutput((entry) => {
        consumeTerminalEntries([entry]);
      });

      const stopState = bridge.onTerminalState((nextState) => {
        if (nextState.terminal_key !== activeTerminalKeyRef.current) {
          return;
        }

        setTerminalState(nextState);
        if (nextState.status === "running") {
          setTerminalNotice("PTY terminal connected.");
          repaintTerminalViewport();
        } else if (nextState.status === "exited") {
          setTerminalNotice("Terminal session exited. Reconnect to start a new PTY.");
        }
      });

      scheduleResize();
      void synchronizeTerminal(true)
        .then(() => {
          repaintTerminalViewport();
        })
        .catch((error) => {
          setTerminalNotice(error instanceof Error ? error.message : String(error));
        });

      // Force one explicit renderer sync after the terminal surface is mounted.
      setTerminalSessionNonce((value) => value + 1);

      cleanupTerminalSurface = () => {
        stopOutput();
        stopState();
        inputDisposable.dispose();
        resizeObserver.disconnect();
        host.removeEventListener("pointerdown", focusTerminalSurface);
        host.removeEventListener("paste", handleHostPaste as EventListener);
        host.removeEventListener("contextmenu", handleHostContextMenu);
        if (resizeTimerRef.current !== null) {
          window.clearTimeout(resizeTimerRef.current);
        }
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
      };
    };

    bootstrapTerminalSurface();

    return () => {
      disposed = true;
      if (bootstrapTimerId !== null) {
        window.clearTimeout(bootstrapTimerId);
      }
      cleanupTerminalSurface?.();
    };
  }, []);

  useEffect(() => {
    if (!isTerminalFocusMode || !terminalRef.current) {
      return;
    }

    const focusTimerId = window.setTimeout(() => {
      fitAddonRef.current?.fit();
      terminalRef.current?.focus();
      repaintTerminalViewport();
    }, 0);

    return () => {
      window.clearTimeout(focusTimerId);
    };
  }, [isTerminalFocusMode, activeTerminalKey, terminalSessionNonce]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron || !activeTerminalKey || !terminalRef.current) {
      return;
    }

    let cancelled = false;

    const syncTerminal = async () => {
      seenOutputKeysRef.current.clear();
      terminalRef.current?.clear();
      setTerminalNotice("Connecting the active PTY session...");

      try {
        const nextState = await synchronizeTerminal(true);
        if (cancelled) {
          return;
        }

        setTerminalNotice("PTY terminal connected.");
        terminalRef.current?.focus();
        repaintTerminalViewport();

        if (nextState && fitAddonRef.current && terminalRef.current) {
          fitAddonRef.current.fit();
          repaintTerminalViewport();
          if (terminalRef.current.cols > 0 && terminalRef.current.rows > 0) {
            const resizedState = await bridge.resizeTerminal(
              activeTerminalKey,
              terminalRef.current.cols,
              terminalRef.current.rows,
            );
            if (!cancelled) {
              setTerminalState(resizedState);
              repaintTerminalViewport();
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setTerminalNotice(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void syncTerminal();

    return () => {
      cancelled = true;
    };
  }, [activeTerminalKey, terminalSessionNonce]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron || !activeTerminalKey) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      if (isSplitResizing || isShellStackResizing) {
        return;
      }

      try {
        await synchronizeTerminal(true);
      } catch {
        // Keep the renderer resilient while the terminal session is still booting.
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, 1500);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTerminalKey, isSplitResizing, isShellStackResizing]);

  useLayoutEffect(() => {
    pushBrowserHostBounds();
  }, [
    draftShellSplitRatio,
    draftShellStackSplitRatio,
    isBrowserSurfaceHidden,
    workspaceSummary.browserDockPosition,
    workspaceSummary.activeBrowserKey,
    workspaceSummary.activeTabKey,
    workspaceSummary.currentWindow?.window_key,
  ]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (
      !bridge?.isElectron ||
      isBrowserSurfaceHidden ||
      isSplitResizing ||
      isShellStackResizing
    ) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      const browserKey = getActiveBrowserKey();
      if (!browserKey) {
        return;
      }

      try {
        const nextState = await bridge.getBrowserState(browserKey);
        if (cancelled) {
          return;
        }

        setBrowserState(nextState);
        setBrowserNotice(
          nextState.is_loading
            ? "Browser state synced. The page is still loading."
            : "Browser state synced.",
        );
        setBrowserAddress((currentValue) =>
          currentValue.trim() ? currentValue : getSuggestedBrowserAddress(nextState),
        );
      } catch (error) {
        if (!cancelled) {
          setBrowserNotice(error instanceof Error ? error.message : String(error));
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, 1500);

    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    workspaceSummary.activeBrowserKey,
    workspaceSummary.activeTabKey,
    isBrowserSurfaceHidden,
    isSplitResizing,
    isShellStackResizing,
  ]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    let frameId = 0;
    let cancelled = false;

    const scheduleSync = () => {
      if (cancelled || frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        void syncBrowserHostBounds().catch(() => {
          // Ignore slot sync failures while the window is still mounting or closing.
        });
      });
    };

    scheduleSync();

    const slot = browserSurfaceSlotRef.current;
    const resizeObserver =
      slot && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleSync();
          })
        : null;
    const workbench = workbenchGridRef.current;
    const workbenchResizeObserver =
      workbench && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            scheduleSync();
          })
        : null;

    if (slot && resizeObserver) {
      resizeObserver.observe(slot);
    }
    if (workbench && workbenchResizeObserver) {
      workbenchResizeObserver.observe(workbench);
    }

    window.addEventListener("resize", scheduleSync);
    window.addEventListener("scroll", scheduleSync, true);
    const intervalId = window.setInterval(() => {
      scheduleSync();
    }, 700);

    return () => {
      cancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      resizeObserver?.disconnect();
      workbenchResizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync, true);
      window.clearInterval(intervalId);
    };
  }, [
    browserState?.page_title,
    browserState?.current_url,
    isBrowserSurfaceHidden,
    workspaceSummary.browserDockPosition,
    workspaceSummary.activeBrowserKey,
    workspaceSummary.activeTabKey,
    workspaceSummary.currentWindow?.window_key,
    isSplitResizing,
    isShellStackResizing,
  ]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return;
    }

    return () => {
      if (shellSplitResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(shellSplitResizeFrameRef.current);
        shellSplitResizeFrameRef.current = null;
      }
      if (shellStackResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(shellStackResizeFrameRef.current);
        shellStackResizeFrameRef.current = null;
      }
      shellSplitPendingRatioRef.current = null;
      shellStackPendingRatioRef.current = null;
      lastBrowserHostBoundsKeyRef.current = "";
      lastPushedBrowserHostBoundsKeyRef.current = "";
      void bridge.setBrowserHostBounds(null).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!isVerificationMode) {
      return;
    }

    void refreshUiaRegistry();
  }, [isVerificationMode, workspaceSummary.activeProjectKey, workspaceSummary.activeTabKey]);

  useEffect(() => {
    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return undefined;
    }

    const unsubscribe = bridge.onUiaRecordingEvent((entry: { received_at?: string; payload?: unknown }) => {
      const receivedAt =
        typeof entry.received_at === "string" && entry.received_at.trim()
          ? entry.received_at
          : new Date().toISOString();
      const payload = "payload" in entry ? entry.payload : entry;
      setUiaLastRecordingPayload(payload);
      uiaRecordingSessionPayloadsRef.current = [...uiaRecordingSessionPayloadsRef.current, payload].slice(
        -1200,
      );
      setUiaRecordingSessionCount(uiaRecordingSessionPayloadsRef.current.length);
      const pretty =
        typeof payload === "undefined"
          ? "(empty)"
          : JSON.stringify(payload, null, 2);
      const block = `\n--- ${receivedAt} ---\n${pretty}\n`;
      setUiaRecordingPrettyLog((prev) => (prev + block).slice(-200000));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isVerificationMode) {
      return undefined;
    }

    const bridge = window.clibaseDesktop;
    if (!bridge?.isElectron) {
      return undefined;
    }

    void refreshUiaRuntimeSnapshot();
    const intervalId = window.setInterval(() => {
      void refreshUiaRuntimeSnapshot();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isVerificationMode, refreshUiaRuntimeSnapshot]);

  useEffect(() => {
    if (!uiaRegistry || !uiaSelectedTargetKey) {
      return;
    }

    const targetRecord =
      uiaRegistry.targets.find((entry) => entry.target_key === uiaSelectedTargetKey) ?? null;
    if (!targetRecord) {
      return;
    }

    setUiaTargetKey(targetRecord.target_key);
    setUiaTargetName(targetRecord.target_name);
    setUiaExePath(targetRecord.exe_path);
    setUiaArgsText(targetRecord.args.join(", "));
    setUiaWorkingDir(targetRecord.working_dir);
    setUiaStartupWaitMs(String(targetRecord.startup_wait_ms));
  }, [uiaRegistry, uiaSelectedTargetKey]);

  useEffect(() => {
    if (!uiaRegistry || !uiaSelectedMacroKey) {
      return;
    }

    const macroRecord =
      uiaRegistry.macros.find((entry) => entry.macro_key === uiaSelectedMacroKey) ?? null;
    if (!macroRecord) {
      return;
    }

    setUiaMacroKey(macroRecord.macro_key);
    setUiaMacroName(macroRecord.macro_name);
    setUiaMacroDescription(macroRecord.description);
    setUiaMacroTagsText(macroRecord.shared_tags.join(", "));
    setUiaMacroStepsYaml(formatStructuredResult(macroRecord.steps));
    if (macroRecord.target_key) {
      setUiaSelectedTargetKey(macroRecord.target_key);
    }
  }, [uiaRegistry, uiaSelectedMacroKey]);

  if (desktopStatus.kind !== "desktop-shell") {
    return (
      <main className="reset-shell">
        <section className="reset-card">
          <p className="reset-eyebrow">clibase desktop skeleton</p>
          <h1>{desktopStatus.title}</h1>
          <p className="reset-copy">{desktopStatus.detail}</p>
          <dl className="reset-grid">
            <div className="reset-metric">
              <dt>Runtime surface</dt>
              <dd>{desktopStatus.kind === "browser-preview" ? "Renderer only" : "Bridge error"}</dd>
            </div>
            <div className="reset-metric">
              <dt>Global CLI</dt>
              <dd>batcli</dd>
            </div>
            <div className="reset-metric">
              <dt>Bridge</dt>
              <dd>{desktopStatus.kind === "error" ? "error" : "not attached"}</dd>
            </div>
            <div className="reset-metric">
              <dt>Next host milestone</dt>
              <dd>detached tab windows and project-aware canvas</dd>
            </div>
          </dl>
        </section>
      </main>
    );
  }

  return (
    <main
      className={
        isTerminalFocusMode
          ? "workbench-shell workbench-shell--terminal-focus"
          : "workbench-shell"
      }
      onDragOver={handleShellDragOver}
      onDragLeave={handleShellDragLeave}
      onDrop={() => {
        setIncomingDetachedTabKey("");
        setIsDockZoneActive(false);
        setActiveDockDropTarget(null);
      }}
    >
      <div className="workbench-shell-layout">
        <aside className="workbench-side-tabs" aria-label="Workbench surface tabs">
          <p className="workbench-side-tabs__eyebrow">Surface</p>
          <button
            type="button"
            className={
              workbenchSidePanel === "workspace"
                ? "workbench-side-tab workbench-side-tab--active"
                : "workbench-side-tab"
            }
            onClick={() => {
              setWorkbenchSidePanel("workspace");
            }}
          >
            Workspace
          </button>
          <button
            type="button"
            className={
              workbenchSidePanel === "terminal"
                ? "workbench-side-tab workbench-side-tab--active"
                : "workbench-side-tab"
            }
            onClick={() => {
              setWorkbenchSidePanel("terminal");
              if (activeTerminalKey) {
                setTerminalSessionNonce((value) => value + 1);
              }
            }}
          >
            Terminal
          </button>
          <button
            type="button"
            className={
              workbenchSidePanel === "verification"
                ? "workbench-side-tab workbench-side-tab--active"
                : "workbench-side-tab"
            }
            onClick={() => {
              setWorkbenchSidePanel("verification");
              if (activeTerminalKey) {
                setTerminalSessionNonce((value) => value + 1);
              }
              void refreshUiaRegistry();
            }}
          >
            Verification
          </button>
          <p className="workbench-side-tabs__hint">
            Workspace for main flow, Terminal for pure PTY, Verification for quick EXE run and UIA checks.
          </p>
        </aside>

        <div className="workbench-shell-canvas">
      <section className="tab-strip-shell">
        <div
          className={
            isStripDragActive && !workspaceSummary.isDetachedWindow
              ? "tab-strip tab-strip--drop-active"
              : "tab-strip"
          }
          onDragOver={handleStripDragOver}
          onDrop={(event) => void handleStripAppendDrop(event)}
          onDragLeave={handleStripDragLeave}
        >
          {workspaceSummary.visibleTabs.map((tab) => {
            const isActive = tab.tab_key === workspaceSummary.activeTabKey;
            const isDragTarget = dropTargetTabKey === tab.tab_key;
            const canDragTab =
              workspaceSummary.isDetachedWindow || workspaceSummary.canDetachActiveTab;

            return (
              <button
                key={tab.tab_key}
                type="button"
                draggable={canDragTab}
                className={[
                  "tab-button",
                  isActive ? "tab-button--active" : "",
                  isDragTarget ? "tab-button--drag-over" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => void activateTab(tab.tab_key)}
                onDragStart={handleTabDragStart(tab.tab_key)}
                onDragEnd={(event) => void handleTabDragEnd(tab.tab_key)(event)}
                onDragOver={(event) => {
                  if (workspaceSummary.isDetachedWindow) {
                    return;
                  }

                  const payload = readDraggedTabData(event);
                  if (!payload) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  setIsStripDragActive(true);
                  setIsStripAppendActive(false);
                  setDropTargetTabKey(tab.tab_key);
                  if (payload.sourceWindowMode === "detached-window") {
                    setIncomingDetachedTabKey(payload.tabKey);
                  }
                }}
                onDrop={(event) => void handleTabDrop(event, tab.tab_key)}
              >
                <span className="tab-button__title">{tab.tab_name}</span>
                <span className="tab-button__meta">
                  {tab.browser_count}B {tab.terminal_count}T
                </span>
              </button>
            );
          })}
          {isTabDragSessionActive ? (
            <div
              className={
                isStripAppendActive
                  ? "tab-strip-drop-slot tab-strip-drop-slot--active"
                  : "tab-strip-drop-slot"
              }
              onDragOver={(event) => {
                if (workspaceSummary.isDetachedWindow) {
                  return;
                }

                const payload = readDraggedTabData(event);
                if (!payload) {
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                setIsStripDragActive(true);
                setDropTargetTabKey(null);
                setIsStripAppendActive(true);
                if (payload.sourceWindowMode === "detached-window") {
                  setIncomingDetachedTabKey(payload.tabKey);
                }
              }}
              onDrop={(event) => void handleStripAppendDrop(event)}
            >
              <span className="tab-strip-drop-slot__eyebrow">Append target</span>
              <strong>Drop to append</strong>
            </div>
          ) : null}
        </div>
        <div className="tab-strip-actions">
          <span className="tab-strip-caption">
            {workspaceSummary.activeProjectName} · {workspaceSummary.activeProjectKey}
            {workspaceSummary.currentWindow
              ? ` · ${workspaceSummary.currentWindow.is_detached ? "detached" : "main"}`
              : ""}
          </span>
          <div className="tab-strip-status">
            {workspaceSummary.isDetachedWindow ? (
              <>
              <span className="tab-strip-hint">
                Drag this tab onto the main window strip to redock it.
              </span>
                <button
                  type="button"
                  className="tab-strip-button tab-strip-button--secondary"
                  onClick={() => void redockTab(workspaceSummary.activeTabKey)}
                >
                  Return to main workbench
                </button>
              </>
            ) : (
              <span className="tab-strip-hint">
                Drag tabs to reorder or pull one out to detach it.
              </span>
            )}
            <div className="tab-strip-button-group">
              <button
                type="button"
                className="tab-strip-button tab-strip-button--secondary"
                onClick={() => void activatePreviousTab()}
                disabled={!workspaceSummary.hasPreviousTab}
              >
                Previous tab
              </button>
              <button
                type="button"
                className="tab-strip-button"
                onClick={() => void activateNextTab()}
                disabled={!workspaceSummary.hasNextTab}
              >
                Next tab
              </button>
            </div>
          </div>
        </div>
      </section>

      {!workspaceSummary.isDetachedWindow && incomingDetachedTabKey ? (
        <section
          className={
            isDockZoneActive ? "dock-drop-zone dock-drop-zone--active" : "dock-drop-zone"
          }
          onDragOver={handleDockTargetDragOver("center")}
          onDragLeave={(event) => {
            const relatedTarget = event.relatedTarget;
            if (
              relatedTarget instanceof Node &&
              event.currentTarget.contains(relatedTarget)
            ) {
              return;
            }

            setIsDockZoneActive(false);
            setActiveDockDropTarget(null);
          }}
        >
          <p className="dock-drop-zone__eyebrow">Redock target</p>
          <h2>
            Drop <code>{incomingDetachedTabKey}</code> to redock and choose the browser edge
          </h2>
          <p>
            Center keeps the current dock edge. This preset currently allows: {dockPolicyHint}.
          </p>
          <div className="dock-drop-target-grid dock-drop-target-grid--policy">
            {dockDropTargets.map((target) => (
              <div
                key={target}
                className={[
                  "dock-drop-target",
                  activeDockDropTarget === target ? "dock-drop-target--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={handleDockTargetDragOver(target)}
                onDrop={(event) => void handleDockZoneDrop(event, target)}
              >
                {formatDockTargetLabel(target)}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        className={workbenchGridClassName}
        ref={workbenchGridRef}
        style={workbenchGridStyle}
      >
        <div className="workbench-column workbench-column--shell">
          <section
            className="shell-stack-grid"
            ref={shellStackGridRef}
            style={effectiveShellStackGridStyle}
          >
            <div className="shell-stack-pane shell-stack-pane--top">
              {isVerificationMode ? (
                <article className="workbench-card workbench-card--verification">
                  <div className="verification-header">
                    <div>
                      <p className="reset-eyebrow">verification</p>
                      <h2>Run External EXE</h2>
                      <p className="verification-header__subtitle">
                        Simple path: run or stop your product EXE here. Advanced UIA/adapter/macro
                        controls are hidden by default.
                      </p>
                    </div>
                    <div className="verification-header__actions">
                      <button type="button" onClick={() => void refreshUiaRegistry()}>
                        Sync
                      </button>
                      <button
                        type="button"
                        className="tab-strip-button--secondary"
                        onClick={() => {
                          setIsVerificationAdvancedOpen((value) => !value);
                        }}
                      >
                        {isVerificationAdvancedOpen ? "Hide advanced" : "Show advanced"}
                      </button>
                    </div>
                  </div>

                  <p className="verification-notice">{uiaNotice}</p>

                  <section className="verification-runtime-panel" aria-label="EXE and UiaPeek runtime status">
                    <div className="verification-runtime-panel__head">
                      <h3 className="verification-runtime-panel__title">Runtime status</h3>
                      <button
                        type="button"
                        className="tab-strip-button--secondary"
                        onClick={() => void refreshUiaRuntimeSnapshot()}
                      >
                        Refresh status
                      </button>
                    </div>
                    <p className="verification-runtime-panel__poll" aria-live="polite">
                      Auto-refresh about every 5s while this tab is open. Use Refresh status after Run / Start
                      recording.
                    </p>
                    {uiaRuntimeSnapshotError ? (
                      <p className="verification-runtime-panel__error" role="alert">
                        {uiaRuntimeSnapshotError}
                      </p>
                    ) : null}
                    <div className="verification-runtime-panel__columns">
                      <div className="verification-runtime-panel__column">
                        <h4 className="verification-runtime-panel__subtitle">Target EXE (host)</h4>
                        <p className="verification-section__hint">
                          Only processes launched from this app (Quick Run uses{" "}
                          <strong>{quickVerificationTargetKey}</strong>, Advanced uses the selected target) show
                          Running / PID. EXE started outside clibase is not tracked here. FlaUI macros attach by
                          PID.
                        </p>
                        <table className="verification-runtime-table">
                          <thead>
                            <tr>
                              <th scope="col">target</th>
                              <th scope="col">state</th>
                              <th scope="col">pid</th>
                              <th scope="col">launched (UTC)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(uiaRuntimeSnapshot?.running_targets ?? uiaRegistry?.running_targets ?? [])
                              .length === 0 ? (
                              <tr>
                                <td colSpan={4}>No targets in registry. Sync or save a target profile.</td>
                              </tr>
                            ) : (
                              (uiaRuntimeSnapshot?.running_targets ?? uiaRegistry?.running_targets ?? []).map(
                                (row) => (
                                  <tr key={row.target_key}>
                                    <td>{row.target_key}</td>
                                    <td>{row.is_running ? "Running" : "Stopped"}</td>
                                    <td>{row.pid ?? "—"}</td>
                                    <td>{row.launched_at ? row.launched_at.slice(0, 19).replace("T", " ") : "—"}</td>
                                  </tr>
                                ),
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="verification-runtime-panel__column">
                        <h4 className="verification-runtime-panel__subtitle">UiaPeek hub (recording)</h4>
                        <p className="verification-section__hint">
                          Separate from the product EXE. HTTP ping = UiaPeek REST port up; SignalR = only after
                          Start recording connects.
                        </p>
                        <dl className="verification-runtime-dl">
                          <div>
                            <dt>Default hub URL</dt>
                            <dd>
                              {uiaRuntimeSnapshot?.hub_url_default ??
                                uiaRecordingState?.hub_url ??
                                DEFAULT_UIAPEEK_HUB_URL_FALLBACK}
                            </dd>
                          </div>
                          <div>
                            <dt>Active hub (SignalR)</dt>
                            <dd>
                              {uiaRuntimeSnapshot?.recording_state.hub_url ??
                                uiaRecordingState?.hub_url ??
                                DEFAULT_UIAPEEK_HUB_URL_FALLBACK}
                            </dd>
                          </div>
                          <div>
                            <dt>HTTP hub (GET /api/v4/g4/ping)</dt>
                            <dd>
                              {uiaRuntimeSnapshot
                                ? uiaRuntimeSnapshot.uiapeek_http_ping_ok
                                  ? "reachable (UiaPeek HTTP is up)"
                                  : "unreachable — run UiaPeek.exe on this port or check firewall"
                                : "unknown (refresh when runtime status IPC is available)"}
                            </dd>
                          </div>
                          <div>
                            <dt>SignalR connection state</dt>
                            <dd>
                              <div>
                                {uiaRuntimeSnapshot?.recording_state.connection_state ??
                                  uiaRecordingState?.connection_state ??
                                  "Disconnected"}
                              </div>
                              <div className="verification-runtime-panel__muted">
                                Disconnected is normal before Start recording. This is not the HTTP ping row
                                above.
                              </div>
                            </dd>
                          </div>
                          <div>
                            <dt>Recording active (hub flag)</dt>
                            <dd>
                              {uiaRuntimeSnapshot?.recording_state.is_recording === true ||
                              uiaRecordingState?.is_recording === true
                                ? "yes"
                                : "no"}
                            </dd>
                          </div>
                          <div>
                            <dt>session_id</dt>
                            <dd>
                              {uiaRuntimeSnapshot?.recording_state.session_id ??
                                uiaRecordingState?.session_id ??
                                "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>UiaPeek.exe (HTTP host)</dt>
                            <dd>
                              {(() => {
                                const exe =
                                  uiaRuntimeSnapshot?.uiapeek_host_exe ?? uiaResolvedUiapeekHost?.path ?? null;
                                const src =
                                  uiaRuntimeSnapshot?.uiapeek_host_source ??
                                  uiaResolvedUiapeekHost?.source ??
                                  null;
                                if (!exe) {
                                  return "— (Sync registry to resolve)";
                                }
                                return `${exe}${src ? ` (${src})` : ""}`;
                              })()}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </section>

                  <section className="verification-quick-grid">
                    <article className="verification-section verification-section--quick">
                      <h3>Quick Run (GenNX)</h3>
                      <p className="verification-section__hint">
                        1) exe_path 확인 2) Run GenNX 클릭 3) 아래 터미널에서 로그/명령 확인.
                      </p>
                      <label className="verification-field">
                        <span>exe_path</span>
                        <input
                          value={quickExePath}
                          onChange={(event) => {
                            setQuickExePath(event.target.value);
                          }}
                          placeholder={defaultGenNxExePath}
                        />
                      </label>
                      <div className="verification-grid verification-grid--compact">
                        <label className="verification-field">
                          <span>target_key</span>
                          <input value={quickVerificationTargetKey} readOnly />
                        </label>
                        <label className="verification-field">
                          <span>target_name</span>
                          <input value={quickVerificationTargetName} readOnly />
                        </label>
                      </div>
                      <label className="verification-field">
                        <span>startup_wait_ms</span>
                        <input
                          value={quickStartupWaitMs}
                          onChange={(event) => {
                            setQuickStartupWaitMs(event.target.value);
                          }}
                          placeholder="1200"
                        />
                      </label>
                      <div className="verification-host-ref">
                        <h4 className="verification-host-ref__title">기준 뷰포트 (좌표 계약)</h4>
                        <p className="verification-section__hint">
                          녹화·재생 시 좌표를 이 크기 기준으로 맞출 수 있도록 저장합니다. 실제 EXE는
                          지금도 별도 OS 창으로 실행되며, 이후 이 영역에 창을 맞추는 연동 시 같은
                          width/height/coordinate_space를 사용합니다.
                        </p>
                        <div className="verification-grid verification-grid--compact">
                          <label className="verification-field">
                            <span>width_px</span>
                            <input
                              value={verificationHostRefW}
                              onChange={(event) => {
                                setVerificationHostRefW(event.target.value);
                              }}
                              inputMode="numeric"
                            />
                          </label>
                          <label className="verification-field">
                            <span>height_px</span>
                            <input
                              value={verificationHostRefH}
                              onChange={(event) => {
                                setVerificationHostRefH(event.target.value);
                              }}
                              inputMode="numeric"
                            />
                          </label>
                          <label className="verification-field">
                            <span>coordinate_space</span>
                            <select
                              value={verificationCoordSpace}
                              onChange={(event) => {
                                setVerificationCoordSpace(
                                  event.target.value as "screen" | "client" | "host_reference",
                                );
                              }}
                            >
                              <option value="host_reference">host_reference (권장)</option>
                              <option value="client">client</option>
                              <option value="screen">screen</option>
                            </select>
                          </label>
                          <label className="verification-field">
                            <span>placement_mode</span>
                            <select
                              value={verificationPlacementMode}
                              onChange={(event) => {
                                setVerificationPlacementMode(
                                  event.target.value as "external_os_window" | "host_panel_fill",
                                );
                              }}
                            >
                              <option value="external_os_window">external_os_window (현재)</option>
                              <option value="host_panel_fill">host_panel_fill (예정)</option>
                            </select>
                          </label>
                        </div>
                        <div className="verification-host-frame-wrap">
                          <div
                            className="verification-host-frame"
                            style={{
                              aspectRatio: `${Math.max(1, Number(verificationHostRefW) || 16)} / ${Math.max(1, Number(verificationHostRefH) || 9)}`,
                            }}
                            role="img"
                            aria-label={`기준 뷰포트 ${Math.max(1, Math.round(Number(verificationHostRefW) || 0))} x ${Math.max(1, Math.round(Number(verificationHostRefH) || 0))} 픽셀`}
                          >
                            <span className="verification-host-frame__size">
                              {Math.max(1, Math.round(Number(verificationHostRefW) || 0))} x{" "}
                              {Math.max(1, Math.round(Number(verificationHostRefH) || 0))} px
                            </span>
                            <span className="verification-host-frame__label">
                              저장된 크기·좌표 계약 미리보기입니다. Windows에서는 external_os_window일 때
                              스폰 PID와 자식 프로세스 트리에서 가장 큰 최상위 창을 찾아 외곽 크기를 맞추고,
                              WM_GETMINMAXINFO로 최소·최대 추적 크기를 같게 해 리사이즈를 막습니다. 앱이
                              커스텀 무테두리 창이면 OS 표준 테두리는 보이지 않을 수 있습니다.
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="verification-actions">
                        <button type="button" onClick={() => void launchQuickExe()}>
                          Run GenNX
                        </button>
                        <button type="button" onClick={() => void stopQuickExe()}>
                          Stop GenNX
                        </button>
                        <button
                          type="button"
                          className="tab-strip-button--secondary"
                          onClick={() => void refreshUiaRegistry()}
                        >
                          Refresh state
                        </button>
                      </div>
                    </article>

                    <article className="verification-section verification-section--quick">
                      <h3>UiaPeek recording (SignalR)</h3>
                      <p className="verification-section__hint">
                        Start recording 시 localhost 허브가 없으면 UiaPeek.exe를 자동으로 찾거나(레포
                        vendor/uia-peek/, 앱 캐시), Windows에서는 최초 한 번 GitHub 릴리스에서 내려받은 뒤
                        HTTP를 띄우고 SignalR에 붙습니다. 원격 허브만 쓰는 경우 해당 머신에서 UiaPeek을 직접
                        실행해야 합니다. 오프라인은 vendor에 UiaPeek.exe를 두고 CLIBASE_UIAPEEK_OFFLINE_DOWNLOAD=1
                        로 다운로드를 건너뛸 수 있습니다. 허브 URL CLIBASE_UIAPEEK_HUB_URL, 호스트
                        CLIBASE_UIAPEEK_HOST_EXE, CLI CLIBASE_UIAPEEK_EXE.
                        {uiaResolvedUiapeekHost?.path
                          ? ` HTTP 호스트 후보: ${uiaResolvedUiapeekHost.path} (${uiaResolvedUiapeekHost.source}).`
                          : uiaResolvedUiapeekHost
                            ? ` HTTP 호스트를 찾지 못했습니다 (${uiaResolvedUiapeekHost.source}). UiaPeek 설치 또는 CLIBASE_UIAPEEK_HOST_EXE.`
                            : ""}
                        {uiaResolvedUiapeek
                          ? ` CLI: ${uiaResolvedUiapeek.path} (${uiaResolvedUiapeek.source}).`
                          : ""}
                      </p>
                      <div className="verification-grid verification-grid--compact">
                        <label className="verification-field">
                          <span>connection</span>
                          <input
                            readOnly
                            value={uiaRecordingState?.connection_state ?? "—"}
                            aria-label="Recording connection state"
                          />
                        </label>
                        <label className="verification-field">
                          <span>session_id</span>
                          <input
                            readOnly
                            value={uiaRecordingState?.session_id ?? ""}
                            placeholder="(none)"
                            aria-label="Recording session id"
                          />
                        </label>
                      </div>
                      <div className="verification-actions">
                        <button
                          type="button"
                          disabled={uiaRecordingOp !== "idle"}
                          aria-busy={uiaRecordingOp === "start"}
                          onClick={() => void startUiaRecording()}
                        >
                          {uiaRecordingOp === "start" ? "Starting…" : "Start recording"}
                        </button>
                        <button
                          type="button"
                          disabled={uiaRecordingOp !== "idle"}
                          aria-busy={uiaRecordingOp === "stop"}
                          onClick={() => void stopUiaRecording()}
                        >
                          {uiaRecordingOp === "stop" ? "Stopping…" : "Stop recording"}
                        </button>
                        <button
                          type="button"
                          className="tab-strip-button--secondary"
                          onClick={() => void refreshUiaRecordingState()}
                        >
                          Recording state
                        </button>
                        <button
                          type="button"
                          className="tab-strip-button--secondary"
                          onClick={() => {
                            setUiaRecordingPrettyLog("");
                            setUiaLastRecordingPayload(null);
                            uiaRecordingSessionPayloadsRef.current = [];
                            setUiaRecordingSessionCount(0);
                          }}
                        >
                          Clear event log
                        </button>
                        <button
                          type="button"
                          className="tab-strip-button--secondary"
                          onClick={() => void copyLastRecordingPayload()}
                        >
                          Copy last event JSON
                        </button>
                        <button type="button" onClick={() => appendFlauiStepFromLastRecording()}>
                          Append flaui.click from last event
                        </button>
                        <button type="button" onClick={() => appendUiapeekStepFromLastRecording()}>
                          Append uiapeek.invoke from last event
                        </button>
                        <button type="button" onClick={() => generateMacroFromRecordingSession()}>
                          Generate flaui macro from session
                        </button>
                        <button type="button" onClick={() => void saveRecordingSessionAsMacro()}>
                          Save session as macro
                        </button>
                      </div>
                      <p className="verification-section__hint" aria-live="polite">
                        Session buffer: {uiaRecordingSessionCount} event(s) (used for batch generate). Start
                        recording resets the buffer.
                      </p>
                      <label className="verification-field verification-field--checkbox">
                        <input
                          type="checkbox"
                          checked={uiaRecordingMergedAsSetText}
                          onChange={(event) => setUiaRecordingMergedAsSetText(event.target.checked)}
                          aria-label="Use flaui.set_text for merged keyboard input"
                        />
                        <span>
                          merged typing uses flaui.set_text (whole field; matches clear or select-all then
                          type). Uncheck for flaui.type (append keystrokes).
                        </span>
                      </label>
                      <label className="verification-field">
                        <span>events (pretty JSON, tail)</span>
                        <textarea
                          readOnly
                          rows={12}
                          value={uiaRecordingPrettyLog}
                          aria-label="UiaPeek recording events"
                        />
                      </label>
                    </article>
                  </section>

                  {isVerificationAdvancedOpen ? (
                    <section className="verification-advanced-shell">
                      <section className="verification-grid">
                        <article className="verification-section">
                          <h3>UIA adapter</h3>
                          <p className="verification-section__hint">
                            flaui.* 스텝은 repo의 cli-host/uia-executor (Python/pywinauto). uiapeek.* 는
                            UiaPeek CLI. provider는 표시 용이며, 스텝 접두사로 실행기가 갈립니다.
                          </p>
                          <label className="verification-field">
                            <span>provider_key</span>
                            <select
                              value={uiaProviderKey}
                              onChange={(event) => {
                                setUiaProviderKey(event.target.value);
                              }}
                            >
                              <option value="flaui_python">flaui_python (Python UIA 실행)</option>
                              <option value="uiapeek">uiapeek (UiaPeek CLI)</option>
                              <option value="mixed">mixed</option>
                            </select>
                          </label>
                          <label className="verification-field">
                            <span>Python executable</span>
                            <input
                              value={uiaPythonExecutable}
                              onChange={(event) => {
                                setUiaPythonExecutable(event.target.value);
                              }}
                              placeholder="empty = python or set CLIBASE_PYTHON"
                            />
                          </label>
                          <label className="verification-field">
                            <span>UiaPeek executable path (optional)</span>
                            <input
                              value={uiaAdapterPath}
                              onChange={(event) => {
                                setUiaAdapterPath(event.target.value);
                              }}
                              placeholder="empty = auto (PATH / CLIBASE_UIAPEEK_EXE / common install)"
                            />
                          </label>
                          {uiaResolvedUiapeek ? (
                            <p className="verification-section__hint" aria-live="polite">
                              Resolved for runs: {uiaResolvedUiapeek.path} ({uiaResolvedUiapeek.source})
                            </p>
                          ) : null}
                          <label className="verification-field">
                            <span>Default timeout ms</span>
                            <input
                              value={uiaAdapterTimeoutMs}
                              onChange={(event) => {
                                setUiaAdapterTimeoutMs(event.target.value);
                              }}
                              placeholder="5000"
                            />
                          </label>
                          <div className="verification-actions">
                            <button type="button" onClick={() => void saveUiaAdapter()}>
                              Save adapter
                            </button>
                          </div>
                        </article>

                        <article className="verification-section">
                          <h3>Target EXE</h3>
                          <label className="verification-field">
                            <span>Saved targets</span>
                            <select
                              value={uiaSelectedTargetKey}
                              onChange={(event) => {
                                setUiaSelectedTargetKey(event.target.value);
                              }}
                            >
                              <option value="">(new target)</option>
                              {uiaRegistry?.targets.map((entry) => (
                                <option key={entry.target_key} value={entry.target_key}>
                                  {entry.target_key} · {entry.target_name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="verification-grid verification-grid--compact">
                            <label className="verification-field">
                              <span>target_key</span>
                              <input
                                value={uiaTargetKey}
                                onChange={(event) => {
                                  setUiaTargetKey(event.target.value);
                                }}
                                placeholder={quickVerificationTargetKey}
                              />
                            </label>
                            <label className="verification-field">
                              <span>target_name</span>
                              <input
                                value={uiaTargetName}
                                onChange={(event) => {
                                  setUiaTargetName(event.target.value);
                                }}
                                placeholder={quickVerificationTargetName}
                              />
                            </label>
                          </div>
                          <label className="verification-field">
                            <span>exe_path</span>
                            <input
                              value={uiaExePath}
                              onChange={(event) => {
                                setUiaExePath(event.target.value);
                              }}
                              placeholder={defaultGenNxExePath}
                            />
                          </label>
                          <label className="verification-field">
                            <span>args (comma)</span>
                            <input
                              value={uiaArgsText}
                              onChange={(event) => {
                                setUiaArgsText(event.target.value);
                              }}
                              placeholder="--flag-a,--flag-b"
                            />
                          </label>
                          <div className="verification-grid verification-grid--compact">
                            <label className="verification-field">
                              <span>working_dir</span>
                              <input
                                value={uiaWorkingDir}
                                onChange={(event) => {
                                  setUiaWorkingDir(event.target.value);
                                }}
                                placeholder="optional"
                              />
                            </label>
                            <label className="verification-field">
                              <span>startup_wait_ms</span>
                              <input
                                value={uiaStartupWaitMs}
                                onChange={(event) => {
                                  setUiaStartupWaitMs(event.target.value);
                                }}
                                placeholder="1200"
                              />
                            </label>
                          </div>
                          <div className="verification-actions">
                            <button type="button" onClick={() => void saveUiaTarget()}>
                              Save target
                            </button>
                            <button type="button" onClick={() => void launchUiaTarget()}>
                              Launch target
                            </button>
                            <button type="button" onClick={() => void stopUiaTarget()}>
                              Stop target
                            </button>
                          </div>
                        </article>

                        <article className="verification-section">
                          <h3>Macro contract</h3>
                          <label className="verification-field">
                            <span>Saved macros</span>
                            <select
                              value={uiaSelectedMacroKey}
                              onChange={(event) => {
                                setUiaSelectedMacroKey(event.target.value);
                              }}
                            >
                              <option value="">(new macro)</option>
                              {uiaRegistry?.macros.map((entry) => (
                                <option key={entry.macro_key} value={entry.macro_key}>
                                  {entry.macro_key} · {entry.macro_name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="verification-grid verification-grid--compact">
                            <label className="verification-field">
                              <span>macro_key</span>
                              <input
                                value={uiaMacroKey}
                                onChange={(event) => {
                                  setUiaMacroKey(event.target.value);
                                }}
                                placeholder="macro-local-smoke"
                              />
                            </label>
                            <label className="verification-field">
                              <span>macro_name</span>
                              <input
                                value={uiaMacroName}
                                onChange={(event) => {
                                  setUiaMacroName(event.target.value);
                                }}
                                placeholder="Local Smoke"
                              />
                            </label>
                          </div>
                          <label className="verification-field">
                            <span>description</span>
                            <input
                              value={uiaMacroDescription}
                              onChange={(event) => {
                                setUiaMacroDescription(event.target.value);
                              }}
                              placeholder="What this macro verifies"
                            />
                          </label>
                          <label className="verification-field">
                            <span>shared_tags (comma)</span>
                            <input
                              value={uiaMacroTagsText}
                              onChange={(event) => {
                                setUiaMacroTagsText(event.target.value);
                              }}
                              placeholder="local,smoke"
                            />
                          </label>
                          <label className="verification-field">
                            <span>steps_yaml</span>
                            <textarea
                              value={uiaMacroStepsYaml}
                              onChange={(event) => {
                                setUiaMacroStepsYaml(event.target.value);
                              }}
                              rows={12}
                            />
                          </label>
                          <label className="verification-field verification-field--checkbox">
                            <input
                              type="checkbox"
                              checked={uiaEnsureTargetRunning}
                              onChange={(event) => {
                                setUiaEnsureTargetRunning(event.target.checked);
                              }}
                            />
                            <span>ensure_target_running on macro run</span>
                          </label>
                          <div className="verification-actions">
                            <button type="button" onClick={() => void saveUiaMacro()}>
                              Save macro
                            </button>
                            <button type="button" onClick={() => void runUiaMacro()}>
                              Run macro
                            </button>
                            <button type="button" onClick={() => void deleteUiaMacro()}>
                              Delete macro
                            </button>
                          </div>
                        </article>
                      </section>
                    </section>
                  ) : null}

                  <section className="verification-result">
                    <h3>Result</h3>
                    <pre>{uiaResultText || "No UIA action executed yet."}</pre>
                  </section>
                </article>
              ) : (
              <article className="workbench-card workbench-card--shell-control">
                <div className="shell-control-header">
                  <div className="shell-control-heading">
                    <p className="reset-eyebrow">active workspace</p>
                    <h1>{workspaceSummary.activeProjectName}</h1>
                    <p className="shell-control-subtitle">
                      {desktopStatus.title} · {workspaceSummary.activeProjectKey} ·{" "}
                      {workspaceSummary.currentWindow?.is_detached
                        ? "detached window"
                        : "main window"}
                    </p>
                  </div>
                  <div className="shell-control-actions">
                    <button type="button" onClick={() => void syncWorkspace()}>
                      Sync
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTerminalKey) {
                          setTerminalSessionNonce((value) => value + 1);
                        }
                      }}
                      disabled={!activeTerminalKey}
                    >
                      Reconnect terminal
                    </button>
                    <button
                      type="button"
                      className="tab-strip-button--secondary"
                      onClick={() => void toggleBrowserCollapsed()}
                    >
                      {workspaceSummary.browserCollapsed ? "Expand browser" : "Collapse browser"}
                    </button>
                    <button
                      type="button"
                      className="tab-strip-button--secondary"
                      onClick={() => void recoverBrowserLane()}
                    >
                      Recover lane
                    </button>
                    {workspaceSummary.isDetachedWindow ? (
                      <button
                        type="button"
                        onClick={() => void redockTab(workspaceSummary.activeTabKey)}
                      >
                        Redock tab
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="shell-control-chip-row">
                  <div className="shell-chip">
                    <span className="shell-chip__label">Tab</span>
                    <strong className="shell-chip__value">{workspaceSummary.activeTabKey}</strong>
                  </div>
                  <div className="shell-chip">
                    <span className="shell-chip__label">Browser</span>
                    <strong className="shell-chip__value">{workspaceSummary.activeBrowserKey}</strong>
                  </div>
                  <div className="shell-chip">
                    <span className="shell-chip__label">Terminal</span>
                    <strong className="shell-chip__value">{workspaceSummary.activeTerminalKey}</strong>
                  </div>
                  <div className="shell-chip">
                    <span className="shell-chip__label">Window</span>
                    <strong className="shell-chip__value">
                      {workspaceSummary.currentWindow?.window_key ?? "n/a"}
                    </strong>
                  </div>
                  <div className="shell-chip">
                    <span className="shell-chip__label">Mode</span>
                    <strong className="shell-chip__value">{desktopStatus.appMode}</strong>
                  </div>
                </div>

                <section className="shell-control-section">
                  <div className="shell-control-section__header">
                    <div>
                      <p className="reset-eyebrow">browser target</p>
                      <h2>{browserState?.page_title ?? "Main browser surface"}</h2>
                    </div>
                    <div className="dock-target-toolbar">
                      <span className="dock-target-toolbar__label">Dock</span>
                      {workspaceSummary.allowedBrowserDockPositions.map((position) => (
                        <button
                          key={position}
                          type="button"
                          className={
                            workspaceSummary.browserDockPosition === position
                              ? "dock-target-button dock-target-button--active"
                              : "dock-target-button"
                          }
                          onClick={() => void updateBrowserDockPosition(position)}
                        >
                          {position}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="browser-toolbar browser-toolbar--inline">
                    <input
                      value={browserAddress}
                      onChange={(event) => {
                        setBrowserAddress(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void navigateBrowser();
                        }
                      }}
                      placeholder="https://example.com or seed://clibase-main-browser"
                    />
                    <button type="button" onClick={() => void navigateBrowser()}>
                      Navigate
                    </button>
                    <button
                      type="button"
                      onClick={() => void goBackBrowser()}
                      disabled={!browserState?.can_go_back}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => void goForwardBrowser()}
                      disabled={!browserState?.can_go_forward}
                    >
                      Forward
                    </button>
                    <button type="button" onClick={() => void reloadBrowser()}>
                      Reload
                    </button>
                    <button type="button" onClick={() => void syncBrowserState()}>
                      Sync
                    </button>
                  </div>

                  <p className="browser-notice shell-control-notice">{browserNotice}</p>
                  {workspaceSummary.browserCollapsed ||
                  (browserState &&
                    (!browserState.is_visible ||
                      browserState.bounds.width < 40 ||
                      browserState.bounds.height < 40)) ? (
                    <div className="browser-recovery-banner" role="status">
                      <strong>Browser lane is hidden or too small.</strong>
                      <button type="button" onClick={() => void recoverBrowserLane()}>
                        Recover now
                      </button>
                    </div>
                  ) : null}
                </section>

                <dl className="shell-control-status-grid">
                  <div className="shell-status-card">
                    <dt>Loading</dt>
                    <dd>{browserState?.is_loading ? "yes" : "no"}</dd>
                  </div>
                  <div className="shell-status-card">
                    <dt>Dock</dt>
                    <dd>{workspaceSummary.browserDockPosition}</dd>
                  </div>
                  <div className="shell-status-card">
                    <dt>Tab count</dt>
                    <dd>{workspaceSummary.visibleTabs.length}</dd>
                  </div>
                  <div className="shell-status-card">
                    <dt>Terminal status</dt>
                    <dd>{terminalState?.status ?? "not attached"}</dd>
                  </div>
                  <div className="shell-status-card">
                    <dt>Terminal backend</dt>
                    <dd>{terminalState?.backend ?? "node-pty pending"}</dd>
                  </div>
                  <div className="shell-status-card">
                    <dt>PTY size</dt>
                    <dd>
                      {terminalState?.cols ?? "?"} x {terminalState?.rows ?? "?"}
                    </dd>
                  </div>
                  <div className="shell-status-card">
                    <dt>Browser bounds</dt>
                    <dd>
                      {browserState
                        ? `${browserState.bounds.width} x ${browserState.bounds.height}`
                        : "n/a"}
                    </dd>
                  </div>
                  <div className="shell-status-card">
                    <dt>Shell split</dt>
                    <dd>{Math.round(effectiveShellSplitRatio * 100)}%</dd>
                  </div>
                </dl>
              </article>
              )}
            </div>

            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize shell summary panels and terminal lane"
              className={[
                "shell-stack-splitter",
                isShellStackResizing ? "shell-stack-splitter--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={beginShellStackResize}
              onDoubleClick={() => {
                void persistShellStackLayoutState(
                  workspaceSummary.layoutPolicy.default_shell_stack_split_ratio,
                );
              }}
            >
              <span className="shell-stack-splitter__handle" />
            </div>

            <div className="shell-stack-pane shell-stack-pane--bottom">
              <article className="workbench-card workbench-card--terminal">
                <div className="terminal-toolbar">
                  <input
                    value={commandText}
                    onChange={(event) => {
                      setCommandText(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendCommand();
                      }
                    }}
                    placeholder="Send one line into the active PTY session"
                  />
                  <button
                    type="button"
                    onClick={() => void sendCommand()}
                    disabled={!activeTerminalKey || !commandText.trim()}
                  >
                    Send
                  </button>
                </div>
                <div className="terminal-meta">
                  <span>PTY pid: {terminalState?.session_pid ?? "n/a"}</span>
                  <span>
                    Size: {terminalState?.cols ?? "?"} x {terminalState?.rows ?? "?"}
                  </span>
                  <span>Exit: {terminalState?.last_exit_code ?? "running"}</span>
                </div>
                <div className="terminal-surface" ref={terminalHostRef} />
                <p className="terminal-hint">{terminalNotice}</p>
              </article>
            </div>
          </section>
        </div>

        {!isBrowserSurfaceHidden ? (
          <>
            <div
              role="separator"
              aria-orientation={isHorizontalBrowserDock ? "horizontal" : "vertical"}
              aria-label={`Resize workbench shell and ${workspaceSummary.browserDockPosition} browser lane`}
              className={[
                "workbench-splitter",
                isHorizontalBrowserDock ? "workbench-splitter--horizontal" : "",
                isSplitResizing ? "workbench-splitter--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerDown={beginSplitResize}
              onDoubleClick={() => {
                void persistWindowLayoutState(
                  workspaceSummary.layoutPolicy.default_shell_split_ratio,
                );
              }}
            >
              <span
                className={
                  isHorizontalBrowserDock
                    ? "workbench-splitter__handle workbench-splitter__handle--horizontal"
                    : "workbench-splitter__handle"
                }
              />
            </div>

            <aside className="workbench-column workbench-column--browser">
              <article className="workbench-card browser-frame">
                <div className="browser-frame__topbar">
                  <div className="browser-frame__titleblock">
                    <p className="reset-eyebrow">browser module</p>
                    <h2>{browserState?.module_name ?? "Main browser"}</h2>
                    <p className="browser-frame__meta">
                      {workspaceSummary.activeBrowserKey} · {workspaceSummary.browserDockPosition} dock
                      {" · "}
                      {browserState?.is_loading ? "loading" : "ready"}
                    </p>
                  </div>
                  <div className="browser-frame__actions">
                    <div className="dock-target-palette" aria-label="Browser dock targets">
                      {workspaceSummary.allowedBrowserDockPositions.map((position) => (
                        <button
                          key={position}
                          type="button"
                          className={
                            workspaceSummary.browserDockPosition === position
                              ? "dock-target-button dock-target-button--active"
                              : "dock-target-button"
                          }
                          onClick={() => void updateBrowserDockPosition(position)}
                        >
                          {position}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => void recoverBrowserLane()}>
                      Recover lane
                    </button>
                  </div>
                </div>
                <div
                  ref={browserSurfaceSlotRef}
                  className="browser-frame__surface-slot"
                  aria-label="Electron browser surface slot"
                />
                <div className="browser-frame__footer">
                  <span className="browser-frame__footer-url">
                    {browserState
                      ? toReadableBrowserUrl(
                          browserState.current_url,
                          browserState.home_url,
                          browserState.home_url_ref,
                        )
                      : "Waiting for browser content"}
                  </span>
                  <span>
                    {browserState
                      ? `${browserState.bounds.width} x ${browserState.bounds.height}`
                      : "bounds n/a"}
                  </span>
                </div>
              </article>
            </aside>
          </>
        ) : null}
      </section>
        </div>
      </div>
    </main>
  );
}
