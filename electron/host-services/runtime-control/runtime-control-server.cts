import fs from "node:fs";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { BrowserWindow } from "electron";
import type { createBrowserSurface } from "../browser/browser-surface.cjs";
import { getRuntimeLogsTail, recordRuntimeLog } from "./runtime-logging.cjs";

type RuntimeControlSharedModule = {
  defaultRuntimeScope: string;
  getRuntimeControlEndpoint: (scope?: string) => string;
};

const runtimeControlShared = require("../../../shared/runtime-control.cjs") as RuntimeControlSharedModule;

interface RuntimeActionRequest {
  action_key: string;
  action_name: string;
  payload?: Record<string, unknown>;
  requested_at: string;
}

interface RuntimeActionResponse {
  status: "success" | "error";
  action_key: string;
  action_name: string;
  responded_at: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

interface RuntimeControlServerOptions {
  appMode: "development" | "production";
  getMainWindow: () => BrowserWindow | null;
  getBrowserSurface: () => ReturnType<typeof createBrowserSurface> | null;
}

function getDefaultScreenshotPath() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const fileName = [
    "shot",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("-") + ".png";

  return path.join(process.cwd(), ".clibase", "artifacts", "screenshots", fileName);
}

function normalizeOutputPath(outputPath?: unknown) {
  if (typeof outputPath !== "string" || outputPath.trim().length === 0) {
    return getDefaultScreenshotPath();
  }

  return path.isAbsolute(outputPath)
    ? outputPath
    : path.join(process.cwd(), outputPath);
}

async function ensureWindowReady(mainWindow: BrowserWindow) {
  if (mainWindow.webContents.isLoading()) {
    await once(mainWindow.webContents, "did-finish-load");
  }

  mainWindow.show();
  mainWindow.focus();
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function handleRuntimeAction(
  request: RuntimeActionRequest,
  options: RuntimeControlServerOptions,
): Promise<RuntimeActionResponse> {
  const { action_name: actionName, action_key: actionKey } = request;
  const payload = request.payload ?? {};

  recordRuntimeLog("info", "runtime action requested", {
    action_key: actionKey,
    action_name: actionName,
  });

  if (actionName === "app.ping") {
    const result = {
      app_mode: options.appMode,
      platform: process.platform,
      pid: process.pid,
      window_count: BrowserWindow.getAllWindows().length,
      control_endpoint: runtimeControlShared.getRuntimeControlEndpoint(),
    };

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
    });

    return {
      status: "success",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      result,
    };
  }

  if (actionName === "app.logs.tail") {
    const limit =
      typeof payload.limit === "number"
        ? payload.limit
        : typeof payload.limit === "string"
          ? Number(payload.limit)
          : 20;

    const result = {
      entries: getRuntimeLogsTail(limit),
      returned_count: getRuntimeLogsTail(limit).length,
    };

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      returned_count: result.returned_count,
    });

    return {
      status: "success",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      result,
    };
  }

  if (
    actionName === "browser.capture-screenshot" ||
    actionName === "browser.automation.capture-screenshot"
  ) {
    const mainWindow = options.getMainWindow();

    if (!mainWindow) {
      recordRuntimeLog("warn", "runtime action rejected: no active window", {
        action_key: actionKey,
        action_name: actionName,
      });

      return {
        status: "error",
        action_key: actionKey,
        action_name: actionName,
        responded_at: new Date().toISOString(),
        error: {
          code: "NO_ACTIVE_WINDOW",
          message: "No active BrowserWindow is available for screenshot capture.",
        },
      };
    }

    const outputPath = normalizeOutputPath(payload.output_path ?? payload.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    await ensureWindowReady(mainWindow);

    const capturedImage = await mainWindow.webContents.capturePage();
    const imageBuffer = capturedImage.toPNG();
    fs.writeFileSync(outputPath, imageBuffer);

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      output_path: outputPath,
      size_bytes: imageBuffer.length,
    });

    return {
      status: "success",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      result: {
        output_path: outputPath,
        size_bytes: imageBuffer.length,
        window_title: mainWindow.getTitle() || "clibase",
      },
    };
  }

  if (actionName === "browser.get-state") {
    const browserSurface = options.getBrowserSurface();

    if (!browserSurface) {
      return {
        status: "error",
        action_key: actionKey,
        action_name: actionName,
        responded_at: new Date().toISOString(),
        error: {
          code: "NO_BROWSER_SURFACE",
          message: "No embedded browser surface is attached to the main window.",
        },
      };
    }

    const result = browserSurface.getState();

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      current_url: result.current_url,
    });

    return {
      status: "success",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      result,
    };
  }

  if (
    actionName === "browser.navigate" ||
    actionName === "browser.automation.navigate"
  ) {
    const browserSurface = options.getBrowserSurface();

    if (!browserSurface) {
      return {
        status: "error",
        action_key: actionKey,
        action_name: actionName,
        responded_at: new Date().toISOString(),
        error: {
          code: "NO_BROWSER_SURFACE",
          message: "No embedded browser surface is attached to the main window.",
        },
      };
    }

    const targetUrl =
      typeof payload.url === "string" ? payload.url.trim() : "";

    if (!targetUrl) {
      return {
        status: "error",
        action_key: actionKey,
        action_name: actionName,
        responded_at: new Date().toISOString(),
        error: {
          code: "INVALID_URL",
          message: "The browser.navigate action requires a --url value.",
        },
      };
    }

    const result = await browserSurface.navigate(targetUrl);

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      current_url: result.current_url,
    });

    return {
      status: "success",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      result,
    };
  }

  if (actionName === "browser.automation.click") {
    const browserSurface = options.getBrowserSurface();

    if (!browserSurface) {
      return {
        status: "error",
        action_key: actionKey,
        action_name: actionName,
        responded_at: new Date().toISOString(),
        error: {
          code: "NO_BROWSER_SURFACE",
          message: "No embedded browser surface is attached to the main window.",
        },
      };
    }

    const selector =
      typeof payload.selector === "string" ? payload.selector.trim() : "";

    if (!selector) {
      return {
        status: "error",
        action_key: actionKey,
        action_name: actionName,
        responded_at: new Date().toISOString(),
        error: {
          code: "INVALID_SELECTOR",
          message: "The browser.automation.click action requires a --selector value.",
        },
      };
    }

    const clickResult = await browserSurface.click(selector);

    if (!clickResult.ok) {
      recordRuntimeLog("warn", "runtime action rejected: browser click failed", {
        action_key: actionKey,
        action_name: actionName,
        selector,
        reason: clickResult.reason,
      });

      return {
        status: "error",
        action_key: actionKey,
        action_name: actionName,
        responded_at: new Date().toISOString(),
        error: {
          code: clickResult.reason,
          message: `Unable to click selector: ${selector}`,
        },
      };
    }

    recordRuntimeLog("info", "runtime action succeeded", {
      action_key: actionKey,
      action_name: actionName,
      selector,
      tag_name: clickResult.tag_name,
    });

    return {
      status: "success",
      action_key: actionKey,
      action_name: actionName,
      responded_at: new Date().toISOString(),
      result: {
        selector,
        ...clickResult,
      },
    };
  }

  recordRuntimeLog("warn", "runtime action rejected: unknown action", {
    action_key: actionKey,
    action_name: actionName,
  });

  return {
    status: "error",
    action_key: actionKey,
    action_name: actionName,
    responded_at: new Date().toISOString(),
    error: {
      code: "UNKNOWN_ACTION",
      message: `Unknown runtime action: ${actionName}`,
    },
  };
}

export function createRuntimeControlServer(options: RuntimeControlServerOptions) {
  const endpoint = runtimeControlShared.getRuntimeControlEndpoint();

  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");

    let buffer = "";
    let handled = false;

    socket.on("data", async (chunk) => {
      buffer += chunk;

      if (handled || !buffer.includes("\n")) {
        return;
      }

      handled = true;
      const rawRequest = buffer.slice(0, buffer.indexOf("\n")).trim();

      try {
        const parsed = JSON.parse(rawRequest) as RuntimeActionRequest;
        const response = await handleRuntimeAction(parsed, options);
        socket.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        recordRuntimeLog("error", "runtime action crashed", {
          error_message: message,
        });

        const fallbackResponse: RuntimeActionResponse = {
          status: "error",
          action_key: "act-runtime-error",
          action_name: "runtime.control.error",
          responded_at: new Date().toISOString(),
          error: {
            code: "RUNTIME_CONTROL_FAILURE",
            message,
          },
        };

        socket.write(`${JSON.stringify(fallbackResponse)}\n`);
      } finally {
        socket.end();
      }
    });
  });

  server.on("error", (error) => {
    recordRuntimeLog("error", "runtime control server error", {
      error_message: error.message,
    });
  });

  if (process.platform !== "win32" && fs.existsSync(endpoint)) {
    fs.unlinkSync(endpoint);
  }

  server.listen(endpoint, () => {
    recordRuntimeLog("info", "runtime control server listening", {
      endpoint,
    });
  });

  const closeServer = () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        if (process.platform !== "win32" && fs.existsSync(endpoint)) {
          fs.unlinkSync(endpoint);
        }

        resolve();
      });
    });

  return {
    endpoint,
    closeServer,
  };
}
