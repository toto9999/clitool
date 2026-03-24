import fs from "node:fs";
import path from "node:path";
import type { ProjectRecord, ProjectWorkspaceConfig, ProjectsIndexFile } from "./workspace-model.js";
import { cellCountForTemplate, defaultWorkspaceConfig, validateWorkspaceConfig } from "./workspace-model.js";

const PROJECTS_FILE = "projects.json";

export function defaultProjectRootPath(root: string): string {
  return path.resolve(root, "..", "..", ".cursor");
}

function isLegacyBootstrapProject(project: ProjectRecord, root: string): boolean {
  return (
    project.slug === "default" &&
    (project.name === "Default" ||
      project.name === "clibase .cursor" ||
      project.rootPath === "." ||
      project.rootPath === defaultProjectRootPath(root))
  );
}

export function projectsIndexPath(root: string): string {
  return path.join(root, PROJECTS_FILE);
}

export function projectWorkspacePath(root: string, slug: string): string {
  return path.join(root, `project.${slug}.workspace.json`);
}

export function loadProjectsIndex(root: string): ProjectsIndexFile {
  const p = projectsIndexPath(root);
  if (!fs.existsSync(p)) {
    return { activeSlug: null, projects: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
    if (!raw || typeof raw !== "object") {
      return { activeSlug: null, projects: [] };
    }
    const o = raw as Record<string, unknown>;
    const projects = Array.isArray(o.projects) ? o.projects : [];
    const activeSlug = typeof o.activeSlug === "string" ? o.activeSlug : null;
    const list: ProjectRecord[] = [];
    for (const item of projects) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      if (
        typeof r.slug === "string" &&
        typeof r.name === "string" &&
        typeof r.rootPath === "string" &&
        typeof r.createdAt === "string" &&
        typeof r.updatedAt === "string"
      ) {
        list.push({
          slug: r.slug,
          name: r.name,
          rootPath: r.rootPath,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        });
      }
    }
    return { activeSlug, projects: list };
  } catch {
    return { activeSlug: null, projects: [] };
  }
}

export function saveProjectsIndex(root: string, index: ProjectsIndexFile): void {
  fs.writeFileSync(projectsIndexPath(root), JSON.stringify(index, null, 2), "utf-8");
}

export function loadProjectWorkspace(root: string, slug: string): ProjectWorkspaceConfig | null {
  const p = projectWorkspacePath(root, slug);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const o = raw as Record<string, unknown>;
    const layoutTemplate = o.layoutTemplate;
    const instances = o.instances;
    const cellAssignments = o.cellAssignments;
    const splitRatios = o.splitRatios;
    if (typeof layoutTemplate !== "string" || !Array.isArray(instances) || !Array.isArray(cellAssignments)) {
      return null;
    }
    const instList: ProjectWorkspaceConfig["instances"] = [];
    for (const it of instances) {
      if (!it || typeof it !== "object") continue;
      const u = it as Record<string, unknown>;
      if (typeof u.instanceKey === "string" && (u.kind === "browser" || u.kind === "terminal")) {
        instList.push({
          instanceKey: u.instanceKey,
          kind: u.kind,
          label: typeof u.label === "string" ? u.label : u.instanceKey,
          initialUrl: typeof u.initialUrl === "string" ? u.initialUrl : undefined
        });
      }
    }
    const config: ProjectWorkspaceConfig = {
      layoutTemplate: layoutTemplate as ProjectWorkspaceConfig["layoutTemplate"],
      instances: instList,
      cellAssignments: cellAssignments.map((c) => (typeof c === "string" ? c : "")),
      splitRatios: Array.isArray(splitRatios)
        ? splitRatios.filter((x): x is number => typeof x === "number" && x > 0)
        : undefined
    };
    const err = validateWorkspaceConfig(config);
    return err ? null : config;
  } catch {
    return null;
  }
}

export function saveProjectWorkspace(root: string, slug: string, config: ProjectWorkspaceConfig): void {
  const err = validateWorkspaceConfig(config);
  if (err) {
    throw new Error(err);
  }
  fs.writeFileSync(projectWorkspacePath(root, slug), JSON.stringify(config, null, 2), "utf-8");
}

export function slugifyName(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.length > 0 ? s.slice(0, 48) : "project";
}

export function uniqueSlug(root: string, base: string): string {
  const index = loadProjectsIndex(root);
  const taken = new Set(index.projects.map((p) => p.slug));
  if (!taken.has(base)) {
    return base;
  }
  let i = 2;
  while (taken.has(`${base}-${i}`)) {
    i += 1;
  }
  return `${base}-${i}`;
}

/** Normalizes legacy bootstrap data and ensures every saved project has a workspace file. */
export function ensureWorkspaceBootstrap(root: string): ProjectsIndexFile {
  let index = loadProjectsIndex(root);

  const filteredProjects = index.projects.filter((project) => !isLegacyBootstrapProject(project, root));
  const activeSlug =
    index.activeSlug && filteredProjects.some((project) => project.slug === index.activeSlug)
      ? index.activeSlug
      : filteredProjects[0]?.slug ?? null;

  const nextIndex: ProjectsIndexFile = {
    activeSlug,
    projects: filteredProjects
  };

  if (
    nextIndex.activeSlug !== index.activeSlug ||
    nextIndex.projects.length !== index.projects.length ||
    nextIndex.projects.some((project, idx) => project !== index.projects[idx])
  ) {
    saveProjectsIndex(root, nextIndex);
  }

  if (filteredProjects.length !== index.projects.length) {
    try {
      fs.unlinkSync(projectWorkspacePath(root, "default"));
    } catch {
      /* ignore legacy bootstrap cleanup */
    }
  }

  for (const project of filteredProjects) {
    if (!loadProjectWorkspace(root, project.slug)) {
      saveProjectWorkspace(root, project.slug, defaultWorkspaceConfig());
    }
  }

  return nextIndex;
}

export function alignCellAssignmentsToTemplate(config: ProjectWorkspaceConfig): ProjectWorkspaceConfig {
  const n = cellCountForTemplate(config.layoutTemplate);
  const next = [...config.cellAssignments];
  while (next.length < n) {
    next.push("");
  }
  if (next.length > n) {
    next.length = n;
  }
  return { ...config, cellAssignments: next };
}
