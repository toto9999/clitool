import { once } from "node:events";
import { BrowserWindow, WebContents, WebContentsView } from "electron";
import { recordRuntimeLog } from "../runtime-control/runtime-logging.cjs";

const browserPlaceholderUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>clibase browser surface</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Segoe UI, sans-serif;
        background: #0b1525;
        color: #edf3fb;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(76, 119, 185, 0.22), transparent 32%),
          linear-gradient(180deg, #0d182b 0%, #09111f 100%);
      }
      main {
        width: min(72ch, calc(100vw - 48px));
        padding: 28px;
        border-radius: 18px;
        border: 1px solid rgba(151, 180, 221, 0.2);
        background: rgba(8, 16, 28, 0.84);
        box-shadow: 0 22px 54px rgba(0, 0, 0, 0.38);
      }
      p {
        color: #bad1f1;
        line-height: 1.6;
      }
      button {
        margin-top: 12px;
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: #5ba0ff;
        color: #05111f;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Embedded browser surface</h1>
      <p>
        This host-owned WebContentsView is the first browser automation target.
        Use batcli browser actions to navigate, inspect, click, and capture it.
      </p>
      <button id="browser-surface-ready" type="button">Browser surface ready</button>
      <script>
        document.querySelector("#browser-surface-ready")?.addEventListener("click", () => {
          document.title = "clibase browser surface clicked";
          document.body.dataset.clicked = "yes";
        });
      </script>
    </main>
  </body>
</html>`)}`;

export interface BrowserSurfaceState {
  browser_key: string;
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

export interface BrowserClickResult {
  ok: true;
  tag_name: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  page_title: string;
  page_url: string;
}

export interface BrowserFillResult {
  ok: true;
  tag_name: string;
  input_type: string | null;
  value_length: number;
  page_title: string;
  page_url: string;
}

export interface BrowserExtractTextResult {
  ok: true;
  selector: string;
  tag_name: string;
  text: string;
  text_length: number;
  page_title: string;
  page_url: string;
}

export interface BrowserAutomationErrorResult {
  ok: false;
  reason: string;
  tag_name?: string;
  text?: string;
  input_type?: string | null;
}

interface BrowserSurfaceOptions {
  browserKey?: string;
  initialUrl?: string | null;
  initialShellSplitRatio?: number | null;
  initialBrowserDockPosition?: "left" | "right" | "top" | "bottom" | null;
  initialBrowserCollapsed?: boolean | null;
  onBrowserEvent?: (eventName: string, payload: Record<string, unknown>) => void;
}

type BrowserDockPosition = "left" | "right" | "top" | "bottom";
type BrowserHostBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function toReadableRuntimeUrl(url: string) {
  const normalized = url.trim();
  if (!normalized) {
    return normalized;
  }

  if (normalized.startsWith("data:text/html")) {
    return "data://inline-html";
  }

  if (normalized.startsWith("data:")) {
    return "data://inline-data";
  }

  return normalized;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeShellSplitRatio(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.56;
  }

  return Math.min(Math.max(value, 0.34), 0.74);
}

function normalizeBrowserDockPosition(value?: string | null): BrowserDockPosition {
  if (
    value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom"
  ) {
    return value;
  }

  return "right";
}

function normalizeBrowserHostBounds(
  mainWindow: BrowserWindow,
  value?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null,
): BrowserHostBounds | null {
  if (!value) {
    return null;
  }

  const x = typeof value.x === "number" && Number.isFinite(value.x) ? Math.round(value.x) : NaN;
  const y = typeof value.y === "number" && Number.isFinite(value.y) ? Math.round(value.y) : NaN;
  const width =
    typeof value.width === "number" && Number.isFinite(value.width)
      ? Math.round(value.width)
      : NaN;
  const height =
    typeof value.height === "number" && Number.isFinite(value.height)
      ? Math.round(value.height)
      : NaN;

  if (![x, y, width, height].every(Number.isFinite)) {
    return null;
  }

  if (width < 48 || height < 48) {
    return null;
  }

  const contentBounds = mainWindow.getContentBounds();
  const clampedX = clampNumber(x, 0, Math.max(contentBounds.width - 48, 0));
  const clampedY = clampNumber(y, 0, Math.max(contentBounds.height - 48, 0));
  const clampedWidth = clampNumber(width, 48, Math.max(contentBounds.width - clampedX, 48));
  const clampedHeight = clampNumber(height, 48, Math.max(contentBounds.height - clampedY, 48));

  return {
    x: clampedX,
    y: clampedY,
    width: clampedWidth,
    height: clampedHeight,
  };
}

function resolveShellSize(
  totalSpan: number,
  shellSplitRatio: number,
  preferredMinShell: number,
  preferredMinBrowser: number,
) {
  const maxShell = Math.max(totalSpan - preferredMinBrowser, 0);
  const minShell = Math.min(preferredMinShell, maxShell);

  if (maxShell <= 0) {
    return 0;
  }

  return Math.min(
    Math.max(Math.round(totalSpan * shellSplitRatio), minShell),
    maxShell,
  );
}

function getBrowserBounds(
  mainWindow: BrowserWindow,
  shellSplitRatio: number,
  browserDockPosition: "left" | "right" | "top" | "bottom",
  browserCollapsed: boolean,
) {
  if (browserCollapsed) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  const contentBounds = mainWindow.getContentBounds();
  const gutter = 24;
  const splitter = 14;
  const isHorizontalDock =
    browserDockPosition === "top" || browserDockPosition === "bottom";

  if (isHorizontalDock) {
    const availableHeight = Math.max(contentBounds.height - gutter * 2 - splitter, 280);
    const shellHeight = resolveShellSize(availableHeight, shellSplitRatio, 420, 280);
    const browserHeight = Math.max(availableHeight - shellHeight, 0);
    const browserY =
      browserDockPosition === "top" ? gutter : gutter + shellHeight + splitter;

    return {
      x: gutter,
      y: browserY,
      width: Math.max(contentBounds.width - gutter * 2, 320),
      height: Math.max(browserHeight, 0),
    };
  }

  const availableWidth = Math.max(contentBounds.width - gutter * 2 - splitter, 320);
  const shellWidth = resolveShellSize(availableWidth, shellSplitRatio, 420, 320);
  const browserWidth = Math.max(availableWidth - shellWidth, 0);
  const browserX =
    browserDockPosition === "left" ? gutter : gutter + shellWidth + splitter;

  return {
    x: browserX,
    y: gutter,
    width: browserWidth,
    height: Math.max(contentBounds.height - gutter * 2, 260),
  };
}

function canNavigateBack(webContents: WebContents) {
  return webContents.navigationHistory.canGoBack();
}

function canNavigateForward(webContents: WebContents) {
  return webContents.navigationHistory.canGoForward();
}

function getStateFromView(
  browserView: WebContentsView,
  browserKey: string,
  browserCollapsed: boolean,
): BrowserSurfaceState {
  const bounds = browserView.getBounds();

  return {
    browser_key: browserKey,
    current_url: browserView.webContents.getURL(),
    page_title: browserView.webContents.getTitle(),
    is_loading: browserView.webContents.isLoading(),
    is_visible: browserView.getVisible(),
    is_collapsed: browserCollapsed,
    can_go_back: canNavigateBack(browserView.webContents),
    can_go_forward: canNavigateForward(browserView.webContents),
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  };
}

async function waitForLoad(browserView: WebContentsView) {
  if (browserView.webContents.isLoading()) {
    await once(browserView.webContents, "did-finish-load");
  }
}

async function waitForNavigationSettlement(browserView: WebContentsView) {
  await new Promise((resolve) => setTimeout(resolve, 75));

  if (!browserView.webContents.isLoading()) {
    return;
  }

  await Promise.race([
    once(browserView.webContents, "did-stop-loading"),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
}

async function loadUrlLenient(browserView: WebContentsView, url: string) {
  try {
    await browserView.webContents.loadURL(url);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ERR_ABORTED")) {
      throw error;
    }

    await waitForNavigationSettlement(browserView);
  }
}

export function createBrowserSurface(
  mainWindow: BrowserWindow,
  options: BrowserSurfaceOptions = {},
) {
  let browserKey = options.browserKey?.trim() || "browser-surface-main";
  const initialUrl = options.initialUrl?.trim() || browserPlaceholderUrl;
  let shellSplitRatio = normalizeShellSplitRatio(options.initialShellSplitRatio);
  let browserDockPosition = normalizeBrowserDockPosition(
    options.initialBrowserDockPosition,
  );
  let browserCollapsed = Boolean(options.initialBrowserCollapsed);
  let browserHostBounds: BrowserHostBounds | null = null;
  const emitBrowserEvent = options.onBrowserEvent ?? (() => undefined);

  const browserView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: "persist:clibase-browser-surface-main",
    },
  });

  browserView.setVisible(false);
  mainWindow.contentView.addChildView(browserView);

  const layout = () => {
    const nextBounds =
      !browserCollapsed && browserHostBounds
        ? browserHostBounds
        : {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          };

    browserView.setVisible(!browserCollapsed && browserHostBounds !== null);
    browserView.setBounds(nextBounds);
  };

  layout();

  mainWindow.on("resize", layout);
  mainWindow.on("maximize", layout);
  mainWindow.on("unmaximize", layout);

  browserView.webContents.setWindowOpenHandler(({ url }) => {
    recordRuntimeLog("warn", "browser popup denied", {
      url,
    });

    return { action: "deny" };
  });

  browserView.webContents.on("did-start-loading", () => {
    recordRuntimeLog("info", "browser loading started", {
      url: toReadableRuntimeUrl(browserView.webContents.getURL()),
    });
  });

  browserView.webContents.on("did-stop-loading", () => {
    const readableUrl = toReadableRuntimeUrl(browserView.webContents.getURL());
    recordRuntimeLog("info", "browser loading stopped", {
      url: readableUrl,
      title: browserView.webContents.getTitle(),
    });
    emitBrowserEvent("browser.page.loaded", {
      browser_key: browserKey,
      url: readableUrl,
      title: browserView.webContents.getTitle(),
    });
  });

  browserView.webContents.on("did-navigate", (_event, url) => {
    const readableUrl = toReadableRuntimeUrl(url);
    recordRuntimeLog("info", "browser navigated", {
      url: readableUrl,
    });
    emitBrowserEvent("browser.page.navigated", {
      browser_key: browserKey,
      url: readableUrl,
    });
  });

  browserView.webContents.on("page-title-updated", (_event, title) => {
    const readableUrl = toReadableRuntimeUrl(browserView.webContents.getURL());
    recordRuntimeLog("info", "browser title updated", {
      title,
    });
    emitBrowserEvent("browser.title.updated", {
      browser_key: browserKey,
      title,
      url: readableUrl,
    });
  });

  void loadUrlLenient(browserView, initialUrl);

  return {
    get browserKey() {
      return browserKey;
    },
    view: browserView,
    layout,
    getState: () => getStateFromView(browserView, browserKey, browserCollapsed),
    rebind: async (nextBrowserKey: string, nextUrl?: string | null) => {
      const normalizedBrowserKey = nextBrowserKey.trim();
      if (!normalizedBrowserKey) {
        throw new Error("Browser surface rebind requires a readable browser key.");
      }

      browserKey = normalizedBrowserKey;
      if (typeof nextUrl === "string" && nextUrl.trim().length > 0) {
        await loadUrlLenient(browserView, nextUrl.trim());
      }

      recordRuntimeLog("info", "browser surface rebound", {
        browser_key: browserKey,
        current_url: toReadableRuntimeUrl(browserView.webContents.getURL()),
      });

      return getStateFromView(browserView, browserKey, browserCollapsed);
    },
    updateLayoutState: (nextLayoutState?: {
      shell_split_ratio?: number | null;
      browser_dock_position?: "left" | "right" | "top" | "bottom" | null;
      browser_collapsed?: boolean | null;
    }) => {
      shellSplitRatio = normalizeShellSplitRatio(nextLayoutState?.shell_split_ratio);
      browserDockPosition = normalizeBrowserDockPosition(
        nextLayoutState?.browser_dock_position,
      );
      if (typeof nextLayoutState?.browser_collapsed === "boolean") {
        browserCollapsed = nextLayoutState.browser_collapsed;
      }
      layout();
      return getStateFromView(browserView, browserKey, browserCollapsed);
    },
    setHostBounds: (
      nextBounds?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null,
    ) => {
      browserHostBounds = normalizeBrowserHostBounds(mainWindow, nextBounds);
      layout();
      return getStateFromView(browserView, browserKey, browserCollapsed);
    },
    navigate: async (url: string) => {
      await loadUrlLenient(browserView, url);
      return getStateFromView(browserView, browserKey, browserCollapsed);
    },
    navigateBack: async () => {
      if (!canNavigateBack(browserView.webContents)) {
        throw new Error("Browser surface cannot go back from the current page.");
      }

      browserView.webContents.navigationHistory.goBack();
      await waitForNavigationSettlement(browserView);
      return getStateFromView(browserView, browserKey, browserCollapsed);
    },
    navigateForward: async () => {
      if (!canNavigateForward(browserView.webContents)) {
        throw new Error("Browser surface cannot go forward from the current page.");
      }

      browserView.webContents.navigationHistory.goForward();
      await waitForNavigationSettlement(browserView);
      return getStateFromView(browserView, browserKey, browserCollapsed);
    },
    reload: async () => {
      browserView.webContents.reload();
      await waitForNavigationSettlement(browserView);
      return getStateFromView(browserView, browserKey, browserCollapsed);
    },
    click: async (selector: string) => {
      await waitForLoad(browserView);

      const clickResult = (await browserView.webContents.executeJavaScript(
        `(() => {
          const selector = ${JSON.stringify(selector)};
          const element = document.querySelector(selector);
          if (!element) {
            return { ok: false, reason: "ELEMENT_NOT_FOUND" };
          }

          const rect = element.getBoundingClientRect();
          const text = (element.textContent || "").trim().slice(0, 160);

          if (typeof element.click !== "function") {
            return {
              ok: false,
              reason: "CLICK_UNSUPPORTED",
              tag_name: element.tagName,
              text,
            };
          }

          element.click();

          return {
            ok: true,
            tag_name: element.tagName,
            text,
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            page_title: document.title,
            page_url: window.location.href,
          };
        })();`,
        true,
      )) as BrowserClickResult | BrowserAutomationErrorResult;

      return clickResult;
    },
    fill: async (selector: string, value: string) => {
      await waitForLoad(browserView);

      const fillResult = (await browserView.webContents.executeJavaScript(
        `(() => {
          const selector = ${JSON.stringify(selector)};
          const nextValue = ${JSON.stringify(value)};
          const element = document.querySelector(selector);

          if (!element) {
            return { ok: false, reason: "ELEMENT_NOT_FOUND" };
          }

          const tagName = element.tagName;
          const inputType = element instanceof HTMLInputElement ? element.type : null;
          const unsupportedInputTypes = new Set([
            "checkbox",
            "radio",
            "file",
            "submit",
            "button",
            "reset",
            "image",
            "range",
            "color",
          ]);

          const dispatchValueEvents = (target) => {
            target.dispatchEvent(new Event("input", { bubbles: true }));
            target.dispatchEvent(new Event("change", { bubbles: true }));
          };

          if (element instanceof HTMLInputElement) {
            if (unsupportedInputTypes.has(element.type)) {
              return {
                ok: false,
                reason: "FILL_UNSUPPORTED",
                tag_name: tagName,
                input_type: element.type,
              };
            }

            const descriptor =
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
            descriptor?.set?.call(element, nextValue);
            element.focus();
            dispatchValueEvents(element);

            return {
              ok: true,
              tag_name: tagName,
              input_type: element.type,
              value_length: nextValue.length,
              page_title: document.title,
              page_url: window.location.href,
            };
          }

          if (element instanceof HTMLTextAreaElement) {
            const descriptor =
              Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
            descriptor?.set?.call(element, nextValue);
            element.focus();
            dispatchValueEvents(element);

            return {
              ok: true,
              tag_name: tagName,
              input_type: null,
              value_length: nextValue.length,
              page_title: document.title,
              page_url: window.location.href,
            };
          }

          if (element instanceof HTMLElement && element.isContentEditable) {
            element.focus();
            element.textContent = nextValue;
            dispatchValueEvents(element);

            return {
              ok: true,
              tag_name: tagName,
              input_type: "contenteditable",
              value_length: nextValue.length,
              page_title: document.title,
              page_url: window.location.href,
            };
          }

          return {
            ok: false,
            reason: "FILL_UNSUPPORTED",
            tag_name: tagName,
            input_type: inputType,
          };
        })();`,
        true,
      )) as BrowserFillResult | BrowserAutomationErrorResult;

      return fillResult;
    },
    extractText: async (selector?: string) => {
      await waitForLoad(browserView);

      const extractResult = (await browserView.webContents.executeJavaScript(
        `(() => {
          const requestedSelector = ${JSON.stringify(selector ?? "")}.trim();
          const target = requestedSelector
            ? document.querySelector(requestedSelector)
            : document.body;

          if (!target) {
            return { ok: false, reason: "ELEMENT_NOT_FOUND" };
          }

          const rawText =
            "innerText" in target
              ? String(target.innerText || "")
              : String(target.textContent || "");

          const text = rawText.replace(/\\r\\n/g, "\\n").trim();

          return {
            ok: true,
            selector: requestedSelector || "body",
            tag_name: target instanceof HTMLElement ? target.tagName : "BODY",
            text,
            text_length: text.length,
            page_title: document.title,
            page_url: window.location.href,
          };
        })();`,
        true,
      )) as BrowserExtractTextResult | BrowserAutomationErrorResult;

      return extractResult;
    },
  };
}
