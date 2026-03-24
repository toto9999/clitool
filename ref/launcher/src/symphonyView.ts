import type { SkillConfig, McpServerConfig, SymphonyConfig, SymphonyStatus } from "./shared.js";

const query = <T extends Element>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`selector not found: ${selector}`);
  return el;
};

const maybeQuery = <T extends Element>(selector: string): T | null =>
  document.querySelector<T>(selector);

// ── Status ──────────────────────────────────────────────

const statusLabel: Record<SymphonyStatus, string> = {
  stopped: "Stopped",
  starting: "Starting...",
  running: "Running",
  error: "Error"
};

const applyStatus = (status: SymphonyStatus): void => {
  const badge = query<HTMLElement>("#status-badge");
  badge.textContent = statusLabel[status];
  badge.className = `status-badge status-${status}`;

  const isRunning = status === "running";
  const isStarting = status === "starting";
  query<HTMLButtonElement>("#btn-start").disabled = isRunning || isStarting;
  query<HTMLButtonElement>("#btn-stop").disabled = !isRunning;
  query<HTMLButtonElement>("#btn-restart").disabled = !isRunning;
};

// ── Render helpers ──────────────────────────────────────

const removeIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

const renderSkill = (skill: SkillConfig): HTMLLIElement => {
  const li = document.createElement("li");
  li.dataset.id = skill.id;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = `item-toggle${skill.enabled ? " is-enabled" : ""}`;
  toggle.title = skill.enabled ? "Disable" : "Enable";
  toggle.setAttribute("aria-label", `${skill.enabled ? "disable" : "enable"} ${skill.name}`);

  const info = document.createElement("div");
  info.className = "item-info";
  info.innerHTML = `<div class="item-name">${skill.name}</div><div class="item-sub">${skill.path}</div>`;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "item-remove";
  remove.title = "Remove";
  remove.setAttribute("aria-label", `remove ${skill.name}`);
  remove.innerHTML = removeIcon;

  li.append(toggle, info, remove);

  toggle.addEventListener("click", async () => {
    if (!window.symphonyApi) return;
    const updated = await window.symphonyApi.toggleSkill(skill.id);
    renderSkillList(updated.skills);
  });

  remove.addEventListener("click", async () => {
    if (!window.symphonyApi) return;
    const updated = await window.symphonyApi.removeSkill(skill.id);
    renderSkillList(updated.skills);
  });

  return li;
};

const renderSkillList = (skills: SkillConfig[]): void => {
  const list = query<HTMLUListElement>("#list-skills");
  const empty = query<HTMLElement>("#empty-skills");
  list.innerHTML = "";
  for (const skill of skills) {
    list.append(renderSkill(skill));
  }
  empty.hidden = skills.length > 0;
};

const renderMcpServer = (server: McpServerConfig): HTMLLIElement => {
  const li = document.createElement("li");
  li.dataset.id = server.id;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = `item-toggle${server.enabled ? " is-enabled" : ""}`;
  toggle.title = server.enabled ? "Disable" : "Enable";
  toggle.setAttribute("aria-label", `${server.enabled ? "disable" : "enable"} ${server.name}`);

  const subText = [server.command, ...server.args].join(" ");
  const info = document.createElement("div");
  info.className = "item-info";
  info.innerHTML = `<div class="item-name">${server.name}</div><div class="item-sub">${subText}</div>`;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "item-remove";
  remove.title = "Remove";
  remove.setAttribute("aria-label", `remove ${server.name}`);
  remove.innerHTML = removeIcon;

  li.append(toggle, info, remove);

  toggle.addEventListener("click", async () => {
    if (!window.symphonyApi) return;
    const updated = await window.symphonyApi.toggleMcpServer(server.id);
    renderMcpList(updated.mcpServers);
  });

  remove.addEventListener("click", async () => {
    if (!window.symphonyApi) return;
    const updated = await window.symphonyApi.removeMcpServer(server.id);
    renderMcpList(updated.mcpServers);
  });

  return li;
};

const renderMcpList = (servers: McpServerConfig[]): void => {
  const list = query<HTMLUListElement>("#list-mcp");
  const empty = query<HTMLElement>("#empty-mcp");
  list.innerHTML = "";
  for (const server of servers) {
    list.append(renderMcpServer(server));
  }
  empty.hidden = servers.length > 0;
};

const applyConfig = (config: SymphonyConfig): void => {
  renderSkillList(config.skills);
  renderMcpList(config.mcpServers);

  const portInput = maybeQuery<HTMLInputElement>("#cli-port");
  const autoStartInput = maybeQuery<HTMLInputElement>("#auto-start");
  if (portInput) portInput.value = String(config.cliPort);
  if (autoStartInput) autoStartInput.checked = config.autoStart;
};

// ── Add form helpers ────────────────────────────────────

const toggleForm = (formId: string, show: boolean): void => {
  const form = maybeQuery<HTMLElement>(`#${formId}`);
  if (form) form.hidden = !show;
};

const clearInputs = (...ids: string[]): void => {
  for (const id of ids) {
    const el = maybeQuery<HTMLInputElement>(`#${id}`);
    if (el) el.value = "";
  }
};

// ── Init ────────────────────────────────────────────────

const applyLauncherTheme = (theme: "dark" | "light"): void => {
  document.documentElement.setAttribute("data-theme", theme);
};

const init = async (): Promise<void> => {
  if (!window.symphonyApi) return;

  const [config, status, settings] = await Promise.all([
    window.symphonyApi.getConfig(),
    window.symphonyApi.getStatus(),
    window.symphonyApi.getSettings()
  ]);

  applyLauncherTheme(settings.theme);
  window.symphonyApi.onSettingsChanged((s) => applyLauncherTheme(s.theme));

  applyConfig(config);
  applyStatus(status);

  // Controls
  query<HTMLButtonElement>("#btn-start").addEventListener("click", async () => {
    applyStatus("starting");
    await window.symphonyApi?.start();
  });

  query<HTMLButtonElement>("#btn-stop").addEventListener("click", async () => {
    await window.symphonyApi?.stop();
  });

  query<HTMLButtonElement>("#btn-restart").addEventListener("click", async () => {
    await window.symphonyApi?.stop();
    applyStatus("starting");
    await window.symphonyApi?.start();
  });

  // Skill form
  query<HTMLButtonElement>("#add-skill-btn").addEventListener("click", () => {
    toggleForm("form-skill", true);
    maybeQuery<HTMLInputElement>("#skill-name")?.focus();
  });

  query<HTMLButtonElement>("#skill-cancel").addEventListener("click", () => {
    toggleForm("form-skill", false);
    clearInputs("skill-name", "skill-path", "skill-desc");
  });

  query<HTMLButtonElement>("#skill-submit").addEventListener("click", async () => {
    const name = (maybeQuery<HTMLInputElement>("#skill-name")?.value ?? "").trim();
    const path = (maybeQuery<HTMLInputElement>("#skill-path")?.value ?? "").trim();
    const description = (maybeQuery<HTMLInputElement>("#skill-desc")?.value ?? "").trim();
    if (!name || !path || !window.symphonyApi) return;
    const updated = await window.symphonyApi.addSkill({ name, path, description });
    renderSkillList(updated.skills);
    toggleForm("form-skill", false);
    clearInputs("skill-name", "skill-path", "skill-desc");
  });

  // MCP form
  query<HTMLButtonElement>("#add-mcp-btn").addEventListener("click", () => {
    toggleForm("form-mcp", true);
    maybeQuery<HTMLInputElement>("#mcp-name")?.focus();
  });

  query<HTMLButtonElement>("#mcp-cancel").addEventListener("click", () => {
    toggleForm("form-mcp", false);
    clearInputs("mcp-name", "mcp-command", "mcp-args");
  });

  query<HTMLButtonElement>("#mcp-submit").addEventListener("click", async () => {
    const name = (maybeQuery<HTMLInputElement>("#mcp-name")?.value ?? "").trim();
    const command = (maybeQuery<HTMLInputElement>("#mcp-command")?.value ?? "").trim();
    const argsRaw = (maybeQuery<HTMLInputElement>("#mcp-args")?.value ?? "").trim();
    const args = argsRaw ? argsRaw.split(/\s+/) : [];
    if (!name || !command || !window.symphonyApi) return;
    const updated = await window.symphonyApi.addMcpServer({ name, command, args });
    renderMcpList(updated.mcpServers);
    toggleForm("form-mcp", false);
    clearInputs("mcp-name", "mcp-command", "mcp-args");
  });

  // CLI Integration save
  query<HTMLButtonElement>("#save-cli").addEventListener("click", async () => {
    const portInput = maybeQuery<HTMLInputElement>("#cli-port");
    const autoStartInput = maybeQuery<HTMLInputElement>("#auto-start");
    if (!portInput || !autoStartInput || !window.symphonyApi) return;
    const cliPort = Math.max(1024, Math.min(65535, Number(portInput.value) || 7777));
    await window.symphonyApi.updateCliSettings({ cliPort, autoStart: autoStartInput.checked });
  });

  // Realtime updates
  window.symphonyApi.onStatusChanged(applyStatus);
  window.symphonyApi.onConfigChanged(applyConfig);
};

void init();
