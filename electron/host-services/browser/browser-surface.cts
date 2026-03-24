import { once } from "node:events";
import { BrowserWindow, WebContentsView } from "electron";
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
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function getBrowserBounds(mainWindow: BrowserWindow) {
  const contentBounds = mainWindow.getContentBounds();
  const gutter = 24;
  const browserWidth = Math.max(Math.round(contentBounds.width * 0.44), 520);

  return {
    x: Math.max(contentBounds.width - browserWidth - gutter, gutter),
    y: gutter,
    width: Math.min(browserWidth, contentBounds.width - gutter * 2),
    height: Math.max(contentBounds.height - gutter * 2, 260),
  };
}

function getStateFromView(browserView: WebContentsView): BrowserSurfaceState {
  const bounds = browserView.getBounds();

  return {
    browser_key: "browser-surface-main",
    current_url: browserView.webContents.getURL(),
    page_title: browserView.webContents.getTitle(),
    is_loading: browserView.webContents.isLoading(),
    is_visible: browserView.getVisible(),
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

export function createBrowserSurface(mainWindow: BrowserWindow) {
  const browserView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      partition: "persist:clibase-browser-surface-main",
    },
  });

  browserView.setVisible(true);
  mainWindow.contentView.addChildView(browserView);

  const layout = () => {
    browserView.setBounds(getBrowserBounds(mainWindow));
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
      url: browserView.webContents.getURL(),
    });
  });

  browserView.webContents.on("did-stop-loading", () => {
    recordRuntimeLog("info", "browser loading stopped", {
      url: browserView.webContents.getURL(),
      title: browserView.webContents.getTitle(),
    });
  });

  browserView.webContents.on("did-navigate", (_event, url) => {
    recordRuntimeLog("info", "browser navigated", {
      url,
    });
  });

  browserView.webContents.on("page-title-updated", (_event, title) => {
    recordRuntimeLog("info", "browser title updated", {
      title,
    });
  });

  void browserView.webContents.loadURL(browserPlaceholderUrl);

  return {
    browserKey: "browser-surface-main",
    view: browserView,
    layout,
    getState: () => getStateFromView(browserView),
    navigate: async (url: string) => {
      await browserView.webContents.loadURL(url);
      return getStateFromView(browserView);
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
      )) as
        | {
            ok: true;
            tag_name: string;
            text: string;
            rect: { x: number; y: number; width: number; height: number };
            page_title: string;
            page_url: string;
          }
        | {
            ok: false;
            reason: string;
            tag_name?: string;
            text?: string;
          };

      return clickResult;
    },
  };
}
