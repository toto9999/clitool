import type { LauncherTheme, WorkspaceShellState } from "./shared.js";

type RuntimeLayoutKind = "single" | "dual" | "three" | "quad";

type WireframeLayout = {
  tabId: string;
  name: string;
  kind: RuntimeLayoutKind;
  slots: { title: string; note: string; chip: string }[];
};

const DEFAULT_LAYOUTS: WireframeLayout[] = [
  {
    tabId: "overview",
    name: "Overview",
    kind: "single",
    slots: [{ title: "Hero Slot", note: "프로젝트 기본 상태와 핵심 위젯이 들어갈 자리", chip: "Single" }]
  },
  {
    tabId: "analysis",
    name: "Analysis",
    kind: "three",
    slots: [
      { title: "Primary Canvas", note: "메인 분석 화면 또는 브라우저 중심 슬롯", chip: "Primary" },
      { title: "Support Panel", note: "보조 도구 또는 로그 슬롯", chip: "Support" },
      { title: "Action Panel", note: "AI/속성/요약 영역 같은 보조 슬롯", chip: "Support" }
    ]
  },
  {
    tabId: "report",
    name: "Report",
    kind: "dual",
    slots: [
      { title: "Preview Slot", note: "문서/PDF/리포트 뷰어 자리", chip: "Viewer" },
      { title: "Notes Slot", note: "요약, 비교, 내보내기 도구 자리", chip: "Inspector" }
    ]
  },
  {
    tabId: "board",
    name: "Board",
    kind: "quad",
    slots: [
      { title: "Slot A", note: "상단 왼쪽 모듈 자리", chip: "A" },
      { title: "Slot B", note: "상단 오른쪽 모듈 자리", chip: "B" },
      { title: "Slot C", note: "하단 왼쪽 모듈 자리", chip: "C" },
      { title: "Slot D", note: "하단 오른쪽 모듈 자리", chip: "D" }
    ]
  }
];

const query = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing ${selector}`);
  return element;
};

const applyTheme = (theme: LauncherTheme): void => {
  document.documentElement.setAttribute("data-theme", theme);
};

const labelToTabId = (label: string): string => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

const resolveLayouts = (state: WorkspaceShellState): WireframeLayout[] => {
  if (state.projectTabRail.length === 0) {
    return DEFAULT_LAYOUTS.slice(0, 3);
  }

  return state.projectTabRail.map((tab, index) => {
    const base = DEFAULT_LAYOUTS[index % DEFAULT_LAYOUTS.length];
    return {
      ...base,
      tabId: tab.tabId || labelToTabId(tab.label),
      name: tab.label
    };
  });
};

const render = (state: WorkspaceShellState): void => {
  const projectName = state.activeProjectName ?? "No Project Selected";
  const layouts = resolveLayouts(state);
  const activeTabId = state.activeTabId ?? layouts[0]?.tabId ?? null;
  const activeLayout = layouts.find((layout) => layout.tabId === activeTabId) ?? layouts[0];

  query<HTMLElement>("#runtime-project-name").textContent = projectName;
  query<HTMLElement>("#runtime-active-tab").textContent = activeLayout?.name ?? "Wireframe";
  query<HTMLElement>("#runtime-tab-caption").textContent = activeLayout
    ? `${activeLayout.name} 탭 기준의 작업 영역 구조를 보여주는 와이어프레임입니다.`
    : "프로젝트를 선택하면 탭과 작업 영역 배치가 표시됩니다.";
  query<HTMLElement>("#runtime-layout-name").textContent = activeLayout
    ? `${activeLayout.name} / ${activeLayout.kind}`
    : "Single Canvas";

  const preview = query<HTMLElement>("#runtime-tab-preview");
  preview.innerHTML = "";
  for (const layout of layouts) {
    const chip = document.createElement("span");
    chip.className = "tab-preview-item";
    chip.classList.toggle("is-active", layout.tabId === activeLayout?.tabId);
    chip.textContent = layout.name;
    preview.appendChild(chip);
  }

  const grid = query<HTMLElement>("#runtime-slot-grid");
  grid.className = `slot-grid layout-${activeLayout?.kind ?? "single"}`;
  grid.innerHTML = "";

  for (const slot of activeLayout?.slots ?? []) {
    const card = document.createElement("article");
    card.className = "slot-card";

    const chip = document.createElement("span");
    chip.className = "slot-chip";
    chip.textContent = slot.chip;

    const title = document.createElement("strong");
    title.textContent = slot.title;

    const note = document.createElement("p");
    note.textContent = slot.note;

    card.append(chip, title, note);
    grid.appendChild(card);
  }
};

const init = async (): Promise<void> => {
  const api = window.workspaceRuntimeApi;
  if (!api) return;

  const [settings, shell] = await Promise.all([api.getSettings(), api.getWorkspaceShell()]);
  applyTheme(settings.theme);
  render(shell);

  api.onSettingsChanged((next) => applyTheme(next.theme));
  api.onWorkspaceShellChanged((next) => render(next));
};

declare global {
  interface Window {
    workspaceRuntimeApi?: import("./workspaceRuntimePreload.js").WorkspaceRuntimeApi;
  }
}

void init();
