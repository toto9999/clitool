import type { BrowserEventMessage, LauncherSettings, LauncherTheme } from "./shared.js";

const MIN_TERMINAL_HEIGHT = 160;
const MAX_TERMINAL_HEIGHT = 600;

const toolInstanceKey = new URLSearchParams(window.location.search).get("toolInstance") ?? "";

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`selector not found: ${selector}`);
  }
  return element;
};

const state: {
  settings: LauncherSettings | null;
  isAdmin: boolean;
  currentUrl: string;
  isResizing: boolean;
  dragStartY: number;
  dragStartHeight: number;
  currentDragHeight: number;
} = {
  settings: null,
  isAdmin: false,
  currentUrl: "",
  isResizing: false,
  dragStartY: 0,
  dragStartHeight: 240,
  currentDragHeight: 240
};

const applyTheme = (theme: LauncherTheme): void => {
  document.documentElement.setAttribute("data-theme", theme);
};

const applyPanelCollapsedClass = (collapsed: boolean): void => {
  const root = query<HTMLElement>(".panel-root");
  root.classList.toggle("is-collapsed", collapsed);
};

const updateCollapseButton = (collapsed: boolean): void => {
  const button = query<HTMLButtonElement>("#toggle-collapse");
  button.classList.toggle("is-open", collapsed);
  button.setAttribute("aria-label", collapsed ? "open bottom panel" : "collapse bottom panel");
  button.title = collapsed ? "Open" : "Collapse";
};

const formatStatusLine = (settings: LauncherSettings): string => {
  const base = `theme=${settings.theme} | sidebar=${settings.sidebarWidth} | terminal=${settings.terminalHeight} | collapsed=${settings.terminalCollapsed}`;
  if (state.isAdmin && state.currentUrl) {
    return `${base} | url=${state.currentUrl}`;
  }
  return base;
};

const updateSettingsSummary = (settings: LauncherSettings): void => {
  const summary = query<HTMLElement>("#settings-summary");
  summary.textContent = formatStatusLine(settings);
  applyPanelCollapsedClass(settings.terminalCollapsed);
  updateCollapseButton(settings.terminalCollapsed);
};

const appendTerminalLog = (text: string): void => {
  const log = query<HTMLPreElement>("#terminal-log");
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
};

const setAdminChromeVisible = (visible: boolean): void => {
  const chrome = query<HTMLElement>("#admin-chrome");
  chrome.hidden = !visible;
};

const resizeHandle = (): HTMLElement => query<HTMLElement>("#resize-handle");
const dragLabel = (): HTMLElement => query<HTMLElement>("#drag-height-label");

const setDragActive = (active: boolean, height?: number): void => {
  resizeHandle().classList.toggle("is-dragging", active);
  const label = dragLabel();
  if (active && height !== undefined) {
    label.textContent = `${height}`;
    label.removeAttribute("hidden");
  } else {
    label.setAttribute("hidden", "");
  }
};

const onGlobalMouseMove = (event: MouseEvent): void => {
  if (!state.isResizing || !state.settings) {
    return;
  }
  const delta = state.dragStartY - event.clientY;
  const clamped = Math.max(MIN_TERMINAL_HEIGHT, Math.min(MAX_TERMINAL_HEIGHT, state.dragStartHeight + delta));
  state.currentDragHeight = clamped;
  setDragActive(true, Math.round(clamped));
};

const onGlobalMouseUp = (): void => {
  if (state.isResizing) {
    setDragActive(false);
    void window.launcherApi?.setTerminalHeight(Math.round(state.currentDragHeight));
  }
  state.isResizing = false;
};

const bindAdminChrome = (): void => {
  const urlInput = query<HTMLInputElement>("#url-input");
  const go = query<HTMLButtonElement>("#url-go");
  go.addEventListener("click", async () => {
    if (!window.launcherApi) {
      return;
    }
    const raw = urlInput.value.trim();
    if (!raw) {
      return;
    }
    await window.launcherApi.navigate(raw);
  });
  urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      go.click();
    }
  });

  const cmdInput = query<HTMLInputElement>("#terminal-cmd");
  query<HTMLButtonElement>("#terminal-run").addEventListener("click", async () => {
    if (!window.launcherApi) {
      return;
    }
    const line = cmdInput.value.trim();
    if (!line) {
      return;
    }
    await window.launcherApi.runTerminalCommand(line);
  });
  cmdInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void window.launcherApi?.runTerminalCommand(cmdInput.value.trim());
    }
  });

  const cssInput = query<HTMLInputElement>("#inject-css");
  query<HTMLButtonElement>("#css-inject").addEventListener("click", async () => {
    if (!window.launcherApi) {
      return;
    }
    const css = cssInput.value.trim();
    if (!css) {
      return;
    }
    await window.launcherApi.injectBrowserCss(css);
  });

  const scriptInput = query<HTMLInputElement>("#exec-script");
  query<HTMLButtonElement>("#script-run").addEventListener("click", async () => {
    if (!window.launcherApi) {
      return;
    }
    const script = scriptInput.value.trim();
    if (!script) {
      return;
    }
    await window.launcherApi.executeBrowserScript(script);
  });
};

const bindEvents = (): void => {
  const toggleCollapse = query<HTMLButtonElement>("#toggle-collapse");
  toggleCollapse.addEventListener("click", async () => {
    if (!window.launcherApi || !state.settings) {
      return;
    }
    await window.launcherApi.setTerminalCollapsed(!state.settings.terminalCollapsed);
  });

  resizeHandle().addEventListener("mousedown", (event) => {
    if (!state.settings || state.settings.terminalCollapsed) {
      return;
    }
    state.isResizing = true;
    state.dragStartY = event.clientY;
    state.dragStartHeight = state.settings.terminalHeight;
    state.currentDragHeight = state.settings.terminalHeight;
    setDragActive(true, state.settings.terminalHeight);
    event.preventDefault();
  });

  window.addEventListener("mousemove", onGlobalMouseMove);
  window.addEventListener("mouseup", onGlobalMouseUp);
};

const onBrowserEvent = (message: BrowserEventMessage): void => {
  if (
    message.instanceKey &&
    toolInstanceKey &&
    message.instanceKey !== toolInstanceKey
  ) {
    return;
  }
  if (message.event === "did-navigate" || message.event === "did-stop-loading") {
    state.currentUrl = message.url;
    if (state.settings) {
      updateSettingsSummary(state.settings);
    }
    if (state.isAdmin) {
      const urlInput = query<HTMLInputElement>("#url-input");
      urlInput.value = message.url;
    }
  }
};

const init = async (): Promise<void> => {
  if (!window.launcherApi) {
    return;
  }

  query<HTMLElement>("#tool-instance-chip").textContent = toolInstanceKey || "terminal";

  const runtime = await window.launcherApi.getRuntime();
  state.isAdmin = runtime.mode === "admin";
  setAdminChromeVisible(state.isAdmin);

  if (state.isAdmin) {
    bindAdminChrome();
    window.launcherApi.onTerminalEvent((message) => {
      if (message.type === "stdout" || message.type === "stderr") {
        appendTerminalLog(message.data);
      } else if (message.type === "exit") {
        appendTerminalLog(`[exit ${message.code}]\n`);
      }
    });
  }

  const settings = await window.launcherApi.getSettings();
  state.settings = settings;
  applyTheme(settings.theme);
  updateSettingsSummary(settings);
  bindEvents();

  window.launcherApi.onBrowserEvent(onBrowserEvent);

  window.launcherApi.onSettingsChanged((next) => {
    state.settings = next;
    applyTheme(next.theme);
    updateSettingsSummary(next);
  });
};

void init();
