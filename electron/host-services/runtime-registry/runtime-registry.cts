import type {
  BrowserSurfaceState,
  createBrowserSurface,
} from "../browser/browser-surface.cjs";
import { recordRuntimeLog } from "../runtime-control/runtime-logging.cjs";
import type {
  LoadedWorkspaceSnapshot,
  WorkspaceBrowserModule,
  WorkspaceTerminalModule,
} from "../workspace/workspace-store.cjs";

type BrowserSurfaceController = ReturnType<typeof createBrowserSurface>;

interface BrowserRuntimeEntry extends WorkspaceBrowserModule {
  controller: BrowserSurfaceController | null;
}

interface TerminalRuntimeEntry extends WorkspaceTerminalModule {}

function isDestroyedObjectError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Object has been destroyed");
}

function cloneBrowserMetadata(entry: BrowserRuntimeEntry) {
  return {
    browser_key: entry.browser_key,
    project_key: entry.project_key,
    project_name: entry.project_name,
    tab_key: entry.tab_key,
    tab_name: entry.tab_name,
    module_key: entry.module_key,
    module_name: entry.module_name,
    slot_key: entry.slot_key,
    home_url_ref: entry.home_url_ref,
    home_url: entry.home_url,
    session_key: entry.session_key,
    is_attached: entry.controller !== null,
  };
}

function cloneTerminalMetadata(entry: TerminalRuntimeEntry) {
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
    default_cols: entry.default_cols,
    default_rows: entry.default_rows,
  };
}

function toReadableInlineDataUrl(url: string) {
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

function toReadableBrowserUrl(entry: BrowserRuntimeEntry, rawUrl: string) {
  const normalized = rawUrl.trim();
  if (!normalized) {
    return normalized;
  }

  if (
    entry.home_url_ref &&
    entry.home_url?.startsWith("seed://") &&
    normalized.startsWith("data:")
  ) {
    return entry.home_url_ref;
  }

  if (
    entry.home_url_ref &&
    entry.resolved_home_url &&
    normalized === entry.resolved_home_url
  ) {
    return entry.home_url_ref;
  }

  return toReadableInlineDataUrl(normalized);
}

function toReadableBrowserState(entry: BrowserRuntimeEntry, currentState: BrowserSurfaceState) {
  const readableCurrentUrl = toReadableBrowserUrl(entry, currentState.current_url);
  const includeRawCurrentUrl = readableCurrentUrl !== currentState.current_url;

  return {
    ...currentState,
    current_url: readableCurrentUrl,
    ...(includeRawCurrentUrl
      ? {
          current_url_raw: currentState.current_url,
        }
      : {}),
  };
}

function toReadableAutomationResult<TResult>(
  entry: BrowserRuntimeEntry,
  result: TResult,
) {
  if (!result || typeof result !== "object") {
    return result;
  }

  const pageUrlValue =
    "page_url" in (result as Record<string, unknown>)
      ? (result as Record<string, unknown>).page_url
      : null;
  if (typeof pageUrlValue !== "string" || !pageUrlValue.trim()) {
    return result;
  }

  const readablePageUrl = toReadableBrowserUrl(entry, pageUrlValue);
  const includeRawPageUrl = readablePageUrl !== pageUrlValue;

  return {
    ...(result as Record<string, unknown>),
    page_url: readablePageUrl,
    ...(includeRawPageUrl
      ? {
          page_url_raw: pageUrlValue,
        }
      : {}),
  } as TResult;
}

export function createRuntimeRegistry(initialSnapshot: LoadedWorkspaceSnapshot) {
  let snapshot = initialSnapshot;

  const browserEntries = new Map<string, BrowserRuntimeEntry>();
  const terminalEntries = new Map<string, TerminalRuntimeEntry>();

  const rebuildEntries = (nextSnapshot: LoadedWorkspaceSnapshot) => {
    const attachedControllers = new Map<string, BrowserSurfaceController | null>(
      Array.from(browserEntries.values()).map((entry) => [
        entry.browser_key,
        entry.controller,
      ]),
    );

    browserEntries.clear();
    terminalEntries.clear();

    for (const browserModule of nextSnapshot.browser_modules) {
      browserEntries.set(browserModule.browser_key, {
        ...browserModule,
        controller: attachedControllers.get(browserModule.browser_key) ?? null,
      });
    }

    for (const terminalModule of nextSnapshot.terminal_modules) {
      terminalEntries.set(terminalModule.terminal_key, {
        ...terminalModule,
      });
    }

    snapshot = nextSnapshot;
  };

  rebuildEntries(initialSnapshot);

  const getPrimaryBrowserKey = () =>
    snapshot.active_browser_key ?? snapshot.browser_modules[0]?.browser_key ?? "browser-surface-main";

  const getPrimaryTerminalKey = () =>
    snapshot.active_terminal_key ?? snapshot.terminal_modules[0]?.terminal_key ?? "term-shell-main-01";

  const resolveBrowserEntry = (requestedBrowserKey?: string) => {
    const browserKey = requestedBrowserKey?.trim() || getPrimaryBrowserKey();
    return browserEntries.get(browserKey) ?? null;
  };

  const resolveTerminalEntry = (requestedTerminalKey?: string) => {
    const terminalKey = requestedTerminalKey?.trim() || getPrimaryTerminalKey();
    return terminalEntries.get(terminalKey) ?? null;
  };

  const detachController = (entry: BrowserRuntimeEntry, reason: string) => {
    if (!entry.controller) {
      return;
    }

    entry.controller = null;
    recordRuntimeLog("warn", "browser surface detached from runtime registry", {
      browser_key: entry.browser_key,
      reason,
    });
  };

  const getSafeBrowserState = (entry: BrowserRuntimeEntry) => {
    if (!entry.controller) {
      return null;
    }

    try {
      return entry.controller.getState();
    } catch (error) {
      if (isDestroyedObjectError(error)) {
        detachController(entry, "controller-destroyed");
        return null;
      }

      throw error;
    }
  };

  const getRequiredBrowserController = (entry: BrowserRuntimeEntry) => {
    const currentState = getSafeBrowserState(entry);
    if (!entry.controller || !currentState) {
      throw new Error(`Browser surface ${entry.browser_key} is not attached yet.`);
    }

    return {
      controller: entry.controller,
      currentState,
    };
  };

  return {
    replaceSnapshot: (nextSnapshot: LoadedWorkspaceSnapshot) => {
      rebuildEntries(nextSnapshot);
      return nextSnapshot;
    },
    getSnapshot: () => snapshot,
    getPrimaryBrowserDefinition: () => resolveBrowserEntry(getPrimaryBrowserKey()),
    getPrimaryTerminalDefinition: () => resolveTerminalEntry(getPrimaryTerminalKey()),
    getBrowserDefinition: (requestedBrowserKey?: string) =>
      resolveBrowserEntry(requestedBrowserKey)
        ? cloneBrowserMetadata(resolveBrowserEntry(requestedBrowserKey)!)
        : null,
    getTerminalDefinition: (requestedTerminalKey?: string) =>
      resolveTerminalEntry(requestedTerminalKey)
        ? cloneTerminalMetadata(resolveTerminalEntry(requestedTerminalKey)!)
        : null,
    registerBrowserSurface: (controller: BrowserSurfaceController) => {
      const entry = resolveBrowserEntry(controller.browserKey);

      if (!entry) {
        throw new Error(`No browser module is registered for ${controller.browserKey}.`);
      }

      for (const browserEntry of browserEntries.values()) {
        if (
          browserEntry.controller === controller ||
          (browserEntry.browser_key === controller.browserKey && browserEntry !== entry)
        ) {
          browserEntry.controller = null;
        }
      }

      entry.controller = controller;
      return cloneBrowserMetadata(entry);
    },
    unregisterBrowserSurface: (
      target: BrowserSurfaceController | string | undefined | null,
      reason = "controller-unregistered",
    ) => {
      if (!target) {
        return;
      }

      const targetBrowserKey =
        typeof target === "string" ? target.trim() : target.browserKey.trim();

      for (const browserEntry of browserEntries.values()) {
        if (
          browserEntry.controller === target ||
          (targetBrowserKey && browserEntry.browser_key === targetBrowserKey)
        ) {
          detachController(browserEntry, reason);
        }
      }
    },
    getBrowserState: (requestedBrowserKey?: string) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { currentState } = getRequiredBrowserController(entry);

      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableBrowserState(entry, currentState),
      };
    },
    navigateBrowser: async (requestedBrowserKey: string | undefined, targetUrl: string) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { controller } = getRequiredBrowserController(entry);
      const normalizedTargetUrl = targetUrl.trim();
      const resolvedTargetUrl =
        entry.home_url_ref &&
        entry.resolved_home_url &&
        normalizedTargetUrl === entry.home_url_ref
          ? entry.resolved_home_url
          : normalizedTargetUrl;
      const currentState = await controller.navigate(resolvedTargetUrl);

      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableBrowserState(entry, currentState),
      };
    },
    goBackBrowser: async (requestedBrowserKey: string | undefined) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { controller } = getRequiredBrowserController(entry);
      const currentState = await controller.navigateBack();

      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableBrowserState(entry, currentState),
      };
    },
    goForwardBrowser: async (requestedBrowserKey: string | undefined) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { controller } = getRequiredBrowserController(entry);
      const currentState = await controller.navigateForward();

      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableBrowserState(entry, currentState),
      };
    },
    reloadBrowser: async (requestedBrowserKey: string | undefined) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { controller } = getRequiredBrowserController(entry);
      const currentState = await controller.reload();

      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableBrowserState(entry, currentState),
      };
    },
    clickBrowser: async (requestedBrowserKey: string | undefined, selector: string) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { controller } = getRequiredBrowserController(entry);

      const clickResult = await controller.click(selector);
      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableAutomationResult(entry, clickResult),
      };
    },
    fillBrowser: async (
      requestedBrowserKey: string | undefined,
      selector: string,
      value: string,
    ) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { controller } = getRequiredBrowserController(entry);

      const fillResult = await controller.fill(selector, value);
      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableAutomationResult(entry, fillResult),
      };
    },
    extractTextFromBrowser: async (
      requestedBrowserKey: string | undefined,
      selector?: string,
    ) => {
      const entry = resolveBrowserEntry(requestedBrowserKey);

      if (!entry) {
        throw new Error(
          `No browser module is registered for ${requestedBrowserKey ?? getPrimaryBrowserKey()}.`,
        );
      }

      const { controller } = getRequiredBrowserController(entry);

      const extractResult = await controller.extractText(selector);
      return {
        ...cloneBrowserMetadata(entry),
        ...toReadableAutomationResult(entry, extractResult),
      };
    },
    listBrowsers: () =>
      Array.from(browserEntries.values()).map((entry) => ({
        ...cloneBrowserMetadata(entry),
        current_state: (() => {
          const currentState = getSafeBrowserState(entry);
          if (!currentState) {
            return null;
          }

          return toReadableBrowserState(entry, currentState);
        })(),
      })),
    listTerminals: () =>
      Array.from(terminalEntries.values()).map((entry) => ({
        ...cloneTerminalMetadata(entry),
      })),
    getWorkspaceRuntimeState: () => ({
      active_project_key: snapshot.active_project_key,
      active_tab_key: snapshot.active_tab_key,
      active_browser_key: snapshot.active_browser_key,
      active_terminal_key: snapshot.active_terminal_key,
      project_count: snapshot.projects.length,
      browser_count: browserEntries.size,
      terminal_count: terminalEntries.size,
      projects: snapshot.projects,
      browsers: Array.from(browserEntries.values()).map((entry) => ({
        ...cloneBrowserMetadata(entry),
        current_state: (() => {
          const currentState = getSafeBrowserState(entry);
          if (!currentState) {
            return null;
          }

          return toReadableBrowserState(entry, currentState);
        })(),
      })),
      terminals: Array.from(terminalEntries.values()).map((entry) => ({
        ...cloneTerminalMetadata(entry),
      })),
    }),
  };
}
