import type { LauncherTheme, WorkspaceShellState } from "./shared.js";

const query = <T extends Element>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

const applyTheme = (theme: LauncherTheme): void => {
  document.documentElement.setAttribute("data-theme", theme);
};

const initialsFromName = (name: string): string => {
  const chunks = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (chunks.length === 0) return "PR";
  return chunks
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
};

const shortRailLabel = (label: string): string => {
  const compact = label.trim();
  if (compact.length <= 4) return compact.toUpperCase();
  return compact.slice(0, 3).toUpperCase();
};

const applyMetrics = (colA: number, colB: number, showToolRail: boolean): void => {
  const a = query<HTMLElement>("#col-a");
  const b = query<HTMLElement>("#col-b");
  a.style.flexShrink = "0";
  a.style.width = `${colA}px`;
  a.style.flexBasis = `${colA}px`;
  a.style.maxWidth = `${colA}px`;
  if (showToolRail && colB > 0) {
    b.hidden = false;
    b.style.width = `${colB}px`;
    b.style.flexBasis = `${colB}px`;
    b.style.flexShrink = "0";
    a.style.maxWidth = `${colA}px`;
  } else {
    b.hidden = true;
    a.style.maxWidth = "";
  }
};

const renderShell = (s: WorkspaceShellState): void => {
  applyMetrics(s.sidebarMetrics.colA, s.sidebarMetrics.colB, s.sidebarMetrics.showToolRail);
  query<HTMLButtonElement>("#open-workspace-manager").classList.toggle("is-active", s.managerOpen);

  const projHost = query<HTMLElement>("#project-list");
  projHost.innerHTML = "";
  if (s.projects.length === 0) {
    const hint = document.createElement("p");
    hint.className = "project-list-empty";
    hint.textContent = "프로젝트 없음";
    hint.setAttribute("role", "status");
    projHost.appendChild(hint);
  } else {
    for (const p of s.projects) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-pill";
      btn.textContent = initialsFromName(p.name);
      btn.title = p.name;
      btn.setAttribute("aria-label", `프로젝트 ${p.name}`);
      btn.classList.toggle("is-active", p.slug === s.activeSlug);
      btn.addEventListener("click", async () => {
        if (!window.sidebarApi) return;
        await window.sidebarApi.selectProject(p.slug);
      });
      projHost.appendChild(btn);
    }
  }

  const toolHost = query<HTMLElement>("#tool-rail");
  toolHost.innerHTML = "";
  if (s.projectTabRail.length === 0) {
    const hint = document.createElement("p");
    hint.className = "tool-rail-empty";
    hint.textContent = "탭 없음";
    hint.setAttribute("role", "status");
    toolHost.appendChild(hint);
  } else {
    for (const tab of s.projectTabRail) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tool-pill";
      const icon = document.createElement("span");
      icon.className = "tool-pill-icon";
      icon.textContent = shortRailLabel(tab.label);
      const label = document.createElement("span");
      label.className = "tool-pill-label";
      label.textContent = tab.label;
      btn.title = tab.label;
      btn.setAttribute("aria-label", `프로젝트 탭 ${tab.label}`);
      btn.classList.toggle("is-active", tab.tabId === s.activeTabId);
      btn.addEventListener("click", async () => {
        if (!window.sidebarApi) return;
        await window.sidebarApi.selectProjectTab(tab.tabId);
      });
      btn.append(icon, label);
      toolHost.appendChild(btn);
    }
  }

  const tabS = query<HTMLButtonElement>("#tab-symphony");
  tabS.classList.toggle("is-active", s.mainTab === "symphony");
};

const init = async (): Promise<void> => {
  applyTheme("dark");
  applyMetrics(58, 0, false);

  const api = window.sidebarApi;
  if (!api) {
    console.error("sidebar: sidebarApi missing (preload failed?)");
    return;
  }

  const [settings, runtime, shell] = await Promise.all([
    api.getSettings(),
    api.getRuntime(),
    api.getWorkspaceShell()
  ]);
  applyTheme(settings.theme);
  api.onSettingsChanged((s) => applyTheme(s.theme));
  renderShell(shell);

  api.onWorkspaceShellChanged((s) => renderShell(s));
  api.onSidebarMetrics((m) => {
    applyMetrics(m.colA, m.colB, m.showToolRail);
  });

  const symphonyTab = query<HTMLButtonElement>("#tab-symphony");
  symphonyTab.hidden = runtime.mode !== "admin";
  symphonyTab.toggleAttribute("aria-hidden", runtime.mode !== "admin");

  query<HTMLButtonElement>("#open-workspace-manager").addEventListener("click", async () => {
    await api.openWorkspaceManager();
  });

  query<HTMLButtonElement>("#open-settings").addEventListener("click", async () => {
    await api.openSettings();
  });

  symphonyTab.addEventListener("click", async () => {
    if (!symphonyTab.hidden) await api.switchTab("symphony");
  });
};

void init();
