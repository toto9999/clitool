import type { LauncherSettings, LauncherTheme } from "./shared.js";

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`selector not found: ${selector}`);
  }
  return element;
};

const applyTheme = (theme: LauncherTheme): void => {
  document.documentElement.setAttribute("data-theme", theme);
  const darkBtn = query<HTMLButtonElement>("#theme-dark");
  const lightBtn = query<HTMLButtonElement>("#theme-light");
  darkBtn.setAttribute("aria-pressed", String(theme === "dark"));
  lightBtn.setAttribute("aria-pressed", String(theme === "light"));
};

const closeModal = async (): Promise<void> => {
  await window.settingsApi?.close();
};

const init = async (): Promise<void> => {
  if (!window.settingsApi) {
    return;
  }

  const diag = await window.settingsApi.getDiagnostics();
  const diagSection = document.querySelector<HTMLElement>("#admin-diagnostics");
  if (diagSection && diag) {
    diagSection.hidden = false;
    const modeEl = document.querySelector<HTMLElement>("#diag-mode");
    const urlEl = document.querySelector<HTMLElement>("#diag-url");
    if (modeEl) {
      modeEl.textContent = diag.mode;
    }
    if (urlEl) {
      urlEl.textContent = diag.browserUrl;
    }
  }

  const current = await window.settingsApi.getSettings();
  applyTheme(current.theme);

  query<HTMLButtonElement>("#theme-dark").addEventListener("click", async () => {
    if (!window.settingsApi) {
      return;
    }
    const updated = await window.settingsApi.setTheme("dark");
    applyTheme(updated.theme);
  });

  query<HTMLButtonElement>("#theme-light").addEventListener("click", async () => {
    if (!window.settingsApi) {
      return;
    }
    const updated = await window.settingsApi.setTheme("light");
    applyTheme(updated.theme);
  });

  query<HTMLButtonElement>("#close-settings").addEventListener("click", closeModal);

  query<HTMLDivElement>("#backdrop").addEventListener("click", closeModal);

  window.settingsApi.onSettingsChanged((next) => {
    applyTheme(next.theme);
  });
};

void init();
