import type { LayoutTemplate, ProjectWorkspaceConfig } from "./workspace-model.js";

const LAYOUT_OPTIONS: { id: LayoutTemplate; label: string; description: string }[] = [
  { id: "single", label: "단독", description: "하나의 큰 작업 화면" },
  { id: "h2", label: "가로 2분할", description: "좌우 2개 영역" },
  { id: "h3", label: "가로 3분할", description: "가로 중심 3개 영역" },
  { id: "h4", label: "가로 4분할", description: "가로 다중 영역" },
  { id: "v2", label: "세로 2분할", description: "상하 2개 영역" },
  { id: "v3", label: "세로 3분할", description: "상하 3개 영역" },
  { id: "v4", label: "세로 4분할", description: "상하 다중 영역" },
  { id: "grid2x2", label: "2x2", description: "균형형 4칸" }
];

type ManagerPage = "home" | "detail";

type DesignerTab = {
  id: string;
  label: string;
  badge: string;
  summary: string;
  moduleSlots: { title: string; note: string }[];
  uiItems: { title: string; note: string }[];
  behaviorItems: { title: string; note: string }[];
};

type ProjectListItem = {
  slug: string;
  name: string;
  rootPath: string;
  updatedAt: string;
  isLive: boolean;
};

const DESIGNER_TABS: DesignerTab[] = [
  {
    id: "overview",
    label: "Overview",
    badge: "OV",
    summary: "프로젝트 첫 진입용 요약형 탭",
    moduleSlots: [
      { title: "Hero Slot", note: "대표 모듈이나 요약 카드가 놓이는 영역" },
      { title: "Support Slot", note: "보조 정보와 상태가 놓이는 영역" }
    ],
    uiItems: [
      { title: "헤더 영역", note: "탭 상단 제목과 대표 액션 배치 자리" },
      { title: "요약 카드 영역", note: "핵심 정보 카드가 배치되는 자리" }
    ],
    behaviorItems: [
      { title: "기본 진입 탭", note: "프로젝트 첫 진입 화면으로 지정하는 자리" },
      { title: "공통 상태 연결", note: "다른 탭과 상태를 공유할지 정의하는 자리" }
    ]
  },
  {
    id: "analysis",
    label: "Analysis",
    badge: "AN",
    summary: "브라우저, 터미널, 보조 패널을 조합하는 작업형 탭",
    moduleSlots: [
      { title: "Primary Canvas", note: "메인 브라우저 또는 중심 작업 영역" },
      { title: "Support Panel", note: "로그, 속성, 보조 브라우저 영역" },
      { title: "Action Panel", note: "AI, 요약, 실행 패널 영역" }
    ],
    uiItems: [
      { title: "분할 비율", note: "탭 기본 영역 비율을 정의하는 자리" },
      { title: "모듈 헤더", note: "각 모듈 헤더와 접기 규칙을 두는 자리" }
    ],
    behaviorItems: [
      { title: "자동 실행 흐름", note: "탭 진입 시 자동 시작 동작을 두는 자리" },
      { title: "모듈 이벤트 연결", note: "모듈 간 상호작용을 연결하는 자리" }
    ]
  },
  {
    id: "report",
    label: "Report",
    badge: "RP",
    summary: "문서와 PDF 중심의 읽기형 탭",
    moduleSlots: [
      { title: "Viewer Slot", note: "리포트/PDF 메인 뷰어 영역" },
      { title: "Inspector Slot", note: "메모, 비교, 요약 영역" }
    ],
    uiItems: [
      { title: "읽기 모드 UI", note: "읽기 전용 헤더와 도구 영역 자리" },
      { title: "하단 메모 영역", note: "주석과 노트 패널 자리" }
    ],
    behaviorItems: [
      { title: "상태 복원", note: "스크롤과 선택 상태 복원 규칙 자리" },
      { title: "내보내기 동작", note: "리포트 출력/저장 동작 자리" }
    ]
  }
];

const query = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
};

let currentSlug: string | null = null;
let activeProjectSlug: string | null = null;
let draft: ProjectWorkspaceConfig | null = null;
let enforcedDefaultRootPath = "";
let currentPage: ManagerPage = "home";
let selectedDesignerTabId = DESIGNER_TABS[0]?.id ?? "overview";
let projectSearchTerm = "";
let projectListCache: ProjectListItem[] = [];

const cellCount = (layout: LayoutTemplate): number => {
  switch (layout) {
    case "single":
      return 1;
    case "h2":
    case "v2":
      return 2;
    case "h3":
    case "v3":
      return 3;
    case "h4":
    case "v4":
    case "grid2x2":
      return 4;
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
};

const templateGridShape = (layout: LayoutTemplate): { columns: string; rows: string } => {
  switch (layout) {
    case "single":
      return { columns: "minmax(0, 1fr)", rows: "minmax(0, 1fr)" };
    case "h2":
      return { columns: "repeat(2, minmax(0, 1fr))", rows: "minmax(0, 1fr)" };
    case "h3":
      return { columns: "repeat(3, minmax(0, 1fr))", rows: "minmax(0, 1fr)" };
    case "h4":
      return { columns: "repeat(4, minmax(0, 1fr))", rows: "minmax(0, 1fr)" };
    case "v2":
      return { columns: "minmax(0, 1fr)", rows: "repeat(2, minmax(0, 1fr))" };
    case "v3":
      return { columns: "minmax(0, 1fr)", rows: "repeat(3, minmax(0, 1fr))" };
    case "v4":
      return { columns: "minmax(0, 1fr)", rows: "repeat(4, minmax(0, 1fr))" };
    case "grid2x2":
      return { columns: "repeat(2, minmax(0, 1fr))", rows: "repeat(2, minmax(0, 1fr))" };
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
};

const syncCellsToTemplate = (config: ProjectWorkspaceConfig): ProjectWorkspaceConfig => {
  const nextAssignments = [...config.cellAssignments];
  const needed = cellCount(config.layoutTemplate);
  while (nextAssignments.length < needed) nextAssignments.push("");
  nextAssignments.length = needed;
  return { ...config, cellAssignments: nextAssignments };
};

const cloneWorkspace = (config: ProjectWorkspaceConfig): ProjectWorkspaceConfig => ({
  ...config,
  instances: config.instances.map((instance) => ({ ...instance })),
  cellAssignments: [...config.cellAssignments],
  splitRatios: config.splitRatios ? [...config.splitRatios] : undefined
});

const selectedDesignerTab = (): DesignerTab =>
  DESIGNER_TABS.find((tab) => tab.id === selectedDesignerTabId) ?? DESIGNER_TABS[0];

const layoutLabel = (layout: LayoutTemplate): string =>
  LAYOUT_OPTIONS.find((option) => option.id === layout)?.label ?? layout;

const projectInitials = (name: string): string => {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return "PR";
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
};

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
};

const instanceLabel = (instanceKey: string): string => {
  if (!draft) return instanceKey;
  return draft.instances.find((instance) => instance.instanceKey === instanceKey)?.label ?? instanceKey;
};

const domainLabel = (index: number): string =>
  ["Internal Development", "Consumer Insights", "Core Infrastructure", "Research Operations"][index % 4];

const setPage = (page: ManagerPage): void => {
  currentPage = page;
  query<HTMLElement>("#manager-home").hidden = page !== "home";
  query<HTMLElement>("#project-detail").hidden = page !== "detail";
  query<HTMLButtonElement>("#open-selected-btn").disabled = !currentSlug;
};

const setModalOpen = (open: boolean): void => {
  const modal = query<HTMLElement>("#create-modal");
  modal.hidden = !open;
  modal.setAttribute("aria-hidden", String(!open));
  if (open) {
    query<HTMLInputElement>("#new-project-name").focus();
  }
};

const updateHeaderCounts = (projectCount: number, activeSlug: string | null): void => {
  activeProjectSlug = activeSlug;
  query<HTMLElement>("#project-count").textContent = String(projectCount);
  query<HTMLElement>("#live-count").textContent = activeSlug ? "1" : "0";
};

const updateTopbarProjectName = (): void => {
  const active = projectListCache.find((project) => project.slug === activeProjectSlug) ?? null;
  query<HTMLElement>("#topbar-project-name").textContent = active?.name ?? "Project Hub";
};

const renderRecentActivity = (): void => {
  const host = query<HTMLDivElement>("#recent-activity");
  host.innerHTML = "";

  const items = projectListCache.slice(0, 4);
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "activity-item";
    empty.textContent = "프로젝트가 생성되면 최근 활동이 표시됩니다.";
    host.appendChild(empty);
    return;
  }

  for (const project of items) {
    const row = document.createElement("div");
    row.className = "activity-item";

    const dot = document.createElement("span");
    dot.className = "activity-dot";
    dot.classList.toggle("is-active", project.isLive);

    const text = document.createElement("span");
    text.textContent = `${project.slug}.sync`;

    row.append(dot, text);
    host.appendChild(row);
  }
};

const filteredProjects = (): ProjectListItem[] => {
  const keyword = projectSearchTerm.trim().toLowerCase();
  if (!keyword) return projectListCache;
  return projectListCache.filter((project) => {
    const name = project.name.toLowerCase();
    const path = project.rootPath.toLowerCase();
    return name.includes(keyword) || path.includes(keyword) || project.slug.toLowerCase().includes(keyword);
  });
};

const renderProjectCollection = async (preferredSlug?: string | null): Promise<void> => {
  const api = window.workspaceManagerApi;
  if (!api) return;

  const state = await api.getState();
  projectListCache = state.index.projects.map((project) => ({
    slug: project.slug,
    name: project.name,
    rootPath: project.rootPath || enforcedDefaultRootPath || ".",
    updatedAt: project.updatedAt,
    isLive: project.slug === state.index.activeSlug
  }));

  updateHeaderCounts(projectListCache.length, state.index.activeSlug);
  updateTopbarProjectName();
  renderRecentActivity();

  const selectedSlug = preferredSlug ?? currentSlug ?? state.editingSlug ?? state.index.activeSlug;
  const projects = filteredProjects();

  const host = query<HTMLDivElement>("#project-collection");
  host.innerHTML = "";

  if (projects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-collection";
    empty.textContent =
      projectSearchTerm.trim() === ""
        ? "아직 프로젝트가 없습니다. Create New Project 버튼으로 첫 프로젝트를 만들어주세요."
        : "검색 결과가 없습니다.";
    host.appendChild(empty);
    return;
  }

  projects.forEach((project, index) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.classList.toggle("is-selected", project.slug === selectedSlug);

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "card-edit";
    openButton.textContent = "Edit Project";
    openButton.addEventListener("click", () => {
      void openProjectDetail(project.slug);
    });

    const head = document.createElement("div");
    head.className = "card-head";

    const brand = document.createElement("div");
    brand.className = "card-brand";

    const avatar = document.createElement("span");
    avatar.className = "card-avatar";
    avatar.textContent = projectInitials(project.name);

    const copy = document.createElement("div");
    copy.className = "card-copy";
    const title = document.createElement("h3");
    title.textContent = project.name;
    const domain = document.createElement("p");
    domain.className = "card-domain";
    domain.textContent = domainLabel(index);
    copy.append(title, domain);

    brand.append(avatar, copy);

    const trash = document.createElement("button");
    trash.type = "button";
    trash.className = "card-trash";
    trash.textContent = "DEL";
    trash.title = "프로젝트 삭제";
    trash.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!window.workspaceManagerApi) return;
      if (!confirm(`Delete project ${project.slug}?`)) return;
      await window.workspaceManagerApi.deleteProject(project.slug);
      if (currentSlug === project.slug) {
        currentSlug = null;
        draft = null;
      }
      await renderProjectCollection();
    });

    head.append(brand, trash);

    const stats = document.createElement("div");
    stats.className = "card-stats";

    const statA = document.createElement("div");
    statA.className = "card-stat";
    statA.innerHTML = `<span class="card-stat-kicker">Structure</span><strong>${DESIGNER_TABS.length} Tabs</strong><span>Blueprint</span>`;

    const statB = document.createElement("div");
    statB.className = "card-stat";
    statB.innerHTML = `<span class="card-stat-kicker">Architecture</span><strong>Layout</strong><span>Wireframe</span>`;

    stats.append(statA, statB);

    const date = document.createElement("div");
    date.className = "card-date";
    date.textContent = `Last Modified: ${formatDate(project.updatedAt)}`;

    const preview = document.createElement("div");
    preview.className = "card-preview";
    for (let variant = 0; variant < 3; variant += 1) {
      const tile = document.createElement("div");
      tile.className = "card-preview-tile";
      tile.dataset.variant = String((index + variant) % 3);
      preview.appendChild(tile);
    }

    const foot = document.createElement("p");
    foot.className = "card-foot";
    foot.textContent = project.isLive ? "현재 실행 대상으로 지정된 프로젝트입니다." : "설정 페이지에서 탭과 레이아웃을 편집합니다.";

    card.append(head, stats, date, preview, foot, openButton);
    card.addEventListener("click", () => {
      void openProjectDetail(project.slug);
    });
    host.appendChild(card);
  });
};

const renderDesignerTabs = (): void => {
  const host = query<HTMLDivElement>("#designer-tab-rail");
  host.innerHTML = "";

  for (const tab of DESIGNER_TABS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab-chip";
    button.classList.toggle("is-active", tab.id === selectedDesignerTabId);

    const head = document.createElement("div");
    head.className = "tab-chip-head";

    const badge = document.createElement("span");
    badge.className = "tab-chip-badge";
    badge.textContent = tab.badge;

    const copy = document.createElement("div");
    copy.className = "tab-chip-copy";
    const title = document.createElement("strong");
    title.textContent = tab.label;
    const summary = document.createElement("span");
    summary.textContent = tab.summary;
    copy.append(title, summary);

    head.append(badge, copy);
    button.append(head);

    button.addEventListener("click", () => {
      selectedDesignerTabId = tab.id;
      renderDesignerTabs();
      renderSelectedTabSummary();
      renderLayoutPreview();
      renderModuleWireframe();
      renderSettingWireframes();
      updateDetailSummary(
        query<HTMLInputElement>("#f-name").value.trim() || currentSlug || "Project",
        query<HTMLInputElement>("#f-path").value.trim() || enforcedDefaultRootPath || "."
      );
    });

    host.appendChild(button);
  }
};

const renderSelectedTabSummary = (): void => {
  const tab = selectedDesignerTab();
  query<HTMLElement>("#tab-summary-title").textContent = `${tab.label} 탭`;
  query<HTMLElement>("#tab-summary-copy").textContent = tab.summary;
};

const renderLayoutGallery = (): void => {
  const host = query<HTMLDivElement>("#layout-gallery");
  host.innerHTML = "";
  if (!draft) return;

  for (const option of LAYOUT_OPTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layout-option";
    button.classList.toggle("is-active", option.id === draft.layoutTemplate);

    const title = document.createElement("strong");
    title.textContent = option.label;

    const description = document.createElement("span");
    description.textContent = option.description;

    button.append(title, description);
    button.addEventListener("click", () => {
      if (!draft) return;
      draft = syncCellsToTemplate({ ...draft, layoutTemplate: option.id });
      renderLayoutGallery();
      renderLayoutPreview();
      updateDetailSummary(
        query<HTMLInputElement>("#f-name").value.trim() || currentSlug || "Project",
        query<HTMLInputElement>("#f-path").value.trim() || enforcedDefaultRootPath || "."
      );
    });

    host.appendChild(button);
  }
};

const renderLayoutPreview = (): void => {
  const host = query<HTMLDivElement>("#layout-preview");
  host.innerHTML = "";
  if (!draft) return;

  const tab = selectedDesignerTab();
  const shape = templateGridShape(draft.layoutTemplate);
  host.style.gridTemplateColumns = shape.columns;
  host.style.gridTemplateRows = shape.rows;

  for (let index = 0; index < cellCount(draft.layoutTemplate); index += 1) {
    const slot = document.createElement("article");
    slot.className = "layout-slot";

    const assignedKey = draft.cellAssignments[index] ?? "";
    const title = document.createElement("strong");
    title.textContent = assignedKey ? instanceLabel(assignedKey) : `${tab.label} Slot ${index + 1}`;

    const note = document.createElement("span");
    note.textContent = assignedKey ? assignedKey : "선택한 탭 레이아웃에서 이 영역에 모듈이 배치됩니다.";

    slot.append(title, note);
    host.appendChild(slot);
  }
};

const renderModuleWireframe = (): void => {
  const host = query<HTMLDivElement>("#module-wireframe");
  host.innerHTML = "";
  if (!draft) return;

  if (draft.instances.length > 0) {
    for (const instance of draft.instances) {
      const card = document.createElement("article");
      card.className = "module-card";
      const title = document.createElement("strong");
      title.textContent = instance.label;
      const note = document.createElement("span");
      note.textContent = `${instance.kind} · ${instance.instanceKey}`;
      card.append(title, note);
      host.appendChild(card);
    }
    return;
  }

  for (const slot of selectedDesignerTab().moduleSlots) {
    const card = document.createElement("article");
    card.className = "module-card";
    const title = document.createElement("strong");
    title.textContent = slot.title;
    const note = document.createElement("span");
    note.textContent = slot.note;
    card.append(title, note);
    host.appendChild(card);
  }
};

const renderSettingWireframes = (): void => {
  const uiHost = query<HTMLDivElement>("#ui-setting-grid");
  const behaviorHost = query<HTMLDivElement>("#behavior-setting-grid");
  uiHost.innerHTML = "";
  behaviorHost.innerHTML = "";

  const tab = selectedDesignerTab();

  for (const item of tab.uiItems) {
    const card = document.createElement("article");
    card.className = "setting-card";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const note = document.createElement("span");
    note.textContent = item.note;
    card.append(title, note);
    uiHost.appendChild(card);
  }

  for (const item of tab.behaviorItems) {
    const card = document.createElement("article");
    card.className = "setting-card";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const note = document.createElement("span");
    note.textContent = item.note;
    card.append(title, note);
    behaviorHost.appendChild(card);
  }
};

const updateDetailSummary = (name: string, rootPath: string): void => {
  if (!draft || !currentSlug) return;
  const isLive = currentSlug === activeProjectSlug;
  const tab = selectedDesignerTab();
  query<HTMLElement>("#detail-project-name").textContent = name;
  query<HTMLElement>("#detail-project-meta").textContent = `${
    isLive ? "현재 실행 대상으로 지정됨" : "설정 편집 전용"
  } · ${rootPath || enforcedDefaultRootPath || "."}`;
  query<HTMLElement>("#shell-tab-chip").textContent = `${tab.label} 탭 레일`;
  query<HTMLElement>("#detail-layout-meta").textContent = `${layoutLabel(draft.layoutTemplate)} · ${cellCount(
    draft.layoutTemplate
  )} slots`;
  query<HTMLElement>(
    "#shell-canvas-caption"
  ).textContent = `${tab.label} 탭에서 선택한 레이아웃이 실제 작업 화면 배치를 결정합니다.`;
};

const openProjectDetail = async (slug: string): Promise<void> => {
  const api = window.workspaceManagerApi;
  if (!api) return;

  const [state, selection] = await Promise.all([api.getState(), api.selectProject(slug)]);
  currentSlug = slug;
  activeProjectSlug = state.index.activeSlug;
  draft = syncCellsToTemplate(cloneWorkspace(selection.workspace));
  selectedDesignerTabId = DESIGNER_TABS[0]?.id ?? "overview";

  query<HTMLInputElement>("#f-name").value = selection.record.name;
  query<HTMLInputElement>("#f-path").value = selection.record.rootPath;

  renderDesignerTabs();
  renderSelectedTabSummary();
  renderLayoutGallery();
  renderLayoutPreview();
  renderModuleWireframe();
  renderSettingWireframes();
  updateDetailSummary(selection.record.name, selection.record.rootPath);
  setPage("detail");
  await renderProjectCollection(slug);
};

const saveCurrentProject = async (): Promise<void> => {
  const api = window.workspaceManagerApi;
  if (!api || !currentSlug || !draft) return;

  const name = query<HTMLInputElement>("#f-name").value.trim() || currentSlug;
  const rootPath = query<HTMLInputElement>("#f-path").value.trim() || enforcedDefaultRootPath || ".";
  draft = syncCellsToTemplate({ ...draft });

  await api.saveWorkspace(currentSlug, draft);
  const state = await api.getState();
  const nextIndex = {
    ...state.index,
    projects: state.index.projects.map((project) =>
      project.slug === currentSlug
        ? {
            ...project,
            name,
            rootPath,
            updatedAt: new Date().toISOString()
          }
        : project
    )
  };
  await api.saveIndex(nextIndex);
  await openProjectDetail(currentSlug);
};

const deleteCurrentProject = async (): Promise<void> => {
  const api = window.workspaceManagerApi;
  if (!api || !currentSlug) return;
  if (!confirm(`Delete project ${currentSlug}?`)) return;

  await api.deleteProject(currentSlug);
  currentSlug = null;
  draft = null;
  setPage("home");
  await renderProjectCollection();
};

const createProject = async (): Promise<void> => {
  const api = window.workspaceManagerApi;
  if (!api) return;

  const name = query<HTMLInputElement>("#new-project-name").value.trim() || "New Project";
  const rootPath = query<HTMLInputElement>("#new-project-path").value.trim() || enforcedDefaultRootPath || ".";
  const record = await api.createProject({ name, rootPath });

  query<HTMLInputElement>("#new-project-name").value = "";
  query<HTMLInputElement>("#new-project-path").value = enforcedDefaultRootPath || ".";
  setModalOpen(false);
  await openProjectDetail(record.slug);
};

const init = async (): Promise<void> => {
  const api = window.workspaceManagerApi;
  if (!api) return;

  document.documentElement.setAttribute("data-theme", "dark");
  const initialState = await api.getState();
  enforcedDefaultRootPath = initialState.defaultRootPath;
  activeProjectSlug = initialState.index.activeSlug;
  currentSlug = initialState.editingSlug ?? initialState.index.activeSlug;

  query<HTMLInputElement>("#new-project-path").value = enforcedDefaultRootPath || ".";

  setPage("home");
  setModalOpen(false);

  query<HTMLButtonElement>("#open-create-modal").addEventListener("click", () => {
    query<HTMLInputElement>("#new-project-name").value = "";
    query<HTMLInputElement>("#new-project-path").value = enforcedDefaultRootPath || ".";
    setModalOpen(true);
  });

  query<HTMLButtonElement>("#close-create-modal").addEventListener("click", () => {
    setModalOpen(false);
  });

  query<HTMLButtonElement>("#cancel-create-modal").addEventListener("click", () => {
    setModalOpen(false);
  });

  query<HTMLElement>("#create-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      setModalOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setModalOpen(false);
    }
  });

  query<HTMLInputElement>("#project-search").addEventListener("input", (event) => {
    projectSearchTerm = (event.target as HTMLInputElement).value;
    void renderProjectCollection(currentSlug);
  });

  query<HTMLButtonElement>("#create-project").addEventListener("click", () => {
    void createProject();
  });

  query<HTMLButtonElement>("#back-to-home").addEventListener("click", () => {
    setPage("home");
    void renderProjectCollection(currentSlug);
  });

  query<HTMLButtonElement>("#save-btn").addEventListener("click", () => {
    void saveCurrentProject();
  });

  query<HTMLButtonElement>("#delete-btn").addEventListener("click", () => {
    void deleteCurrentProject();
  });

  query<HTMLButtonElement>("#open-selected-btn").addEventListener("click", () => {
    if (!currentSlug) return;
    void api.openProject(currentSlug);
  });

  api.onTheme((theme) => {
    document.documentElement.setAttribute("data-theme", theme);
  });

  await renderProjectCollection(currentSlug);
};

declare global {
  interface Window {
    workspaceManagerApi?: import("./workspacePreload.js").WorkspaceManagerApi;
  }
}

void init();
