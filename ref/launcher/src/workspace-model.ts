/** Tool plugin kinds (shared implementation; many instances per project). */
export type ToolKind = "browser" | "terminal";

/** Layout templates for the work area (C). Cell count is fixed per template. */
export type LayoutTemplate =
  | "single"
  | "h2"
  | "h3"
  | "h4"
  | "v2"
  | "v3"
  | "v4"
  | "grid2x2";

export type ToolInstanceConfig = {
  instanceKey: string;
  kind: ToolKind;
  label: string;
  /** browser only */
  initialUrl?: string;
};

export type ProjectWorkspaceConfig = {
  layoutTemplate: LayoutTemplate;
  instances: ToolInstanceConfig[];
  /** One entry per cell; empty string = empty cell */
  cellAssignments: string[];
  /** For horizontal or vertical multi-cell templates: (cellCount - 1) weights; default equal */
  splitRatios?: number[];
};

export type ProjectRecord = {
  slug: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectsIndexFile = {
  activeSlug: string | null;
  projects: ProjectRecord[];
};

export type Rect = { x: number; y: number; width: number; height: number };

export function cellCountForTemplate(template: LayoutTemplate): number {
  switch (template) {
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
      return 4;
    case "grid2x2":
      return 4;
    default: {
      const _exhaustive: never = template;
      return _exhaustive;
    }
  }
}

function normalizeRatios(count: number, ratios: number[] | undefined): number[] {
  if (count <= 1) {
    return [];
  }
  const need = count - 1;
  const base =
    ratios && ratios.length === need && ratios.every((r) => r > 0)
      ? ratios
      : Array.from({ length: need }, () => 1);
  const sum = base.reduce((a, b) => a + b, 0);
  return base.map((r) => r / sum);
}

/** Partitions 1.0 by normalized weights; returns segment sizes summing to total. */
function splitTotal(total: number, weights: number[]): number[] {
  if (weights.length === 0) {
    return [total];
  }
  const wsum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => (total * w) / wsum);
  const drift = total - parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] += drift;
  return parts;
}

/**
 * Returns cell rectangles in index order (left-to-right for h*, top-to-bottom for v*,
 * row-major for grid2x2).
 */
export function computeWorkAreaCells(
  workArea: Rect,
  template: LayoutTemplate,
  splitRatios?: number[]
): Rect[] {
  const { x, y, width, height } = workArea;
  const n = cellCountForTemplate(template);

  if (template === "single") {
    return [{ x, y, width, height }];
  }

  if (template.startsWith("h")) {
    const weights = normalizeRatios(n, splitRatios);
    const segments = splitTotal(width, weights);
    const rects: Rect[] = [];
    let cx = x;
    for (let i = 0; i < n; i += 1) {
      const w = segments[i];
      rects.push({ x: cx, y, width: w, height });
      cx += w;
    }
    return rects;
  }

  if (template.startsWith("v")) {
    const weights = normalizeRatios(n, splitRatios);
    const segments = splitTotal(height, weights);
    const rects: Rect[] = [];
    let cy = y;
    for (let i = 0; i < n; i += 1) {
      const h = segments[i];
      rects.push({ x, y: cy, width, height: h });
      cy += h;
    }
    return rects;
  }

  if (template === "grid2x2") {
    const hw = width / 2;
    const hh = height / 2;
    const w2 = width - hw;
    const h2 = height - hh;
    return [
      { x, y, width: hw, height: hh },
      { x: x + hw, y, width: w2, height: hh },
      { x, y: y + hh, width: hw, height: h2 },
      { x: x + hw, y: y + hh, width: w2, height: h2 }
    ];
  }

  return [{ x, y, width, height }];
}

export function defaultWorkspaceConfig(): ProjectWorkspaceConfig {
  return {
    layoutTemplate: "single",
    instances: [],
    cellAssignments: [""]
  };
}

export function validateWorkspaceConfig(config: ProjectWorkspaceConfig): string | null {
  const n = cellCountForTemplate(config.layoutTemplate);
  if (config.cellAssignments.length !== n) {
    return `cellAssignments length must be ${n} for template ${config.layoutTemplate}`;
  }
  const keys = new Set(config.instances.map((i) => i.instanceKey));
  for (const c of config.cellAssignments) {
    if (c !== "" && !keys.has(c)) {
      return `Unknown instanceKey in cell: ${c}`;
    }
  }
  for (const inst of config.instances) {
    if (!inst.instanceKey || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(inst.instanceKey)) {
      return `Invalid instanceKey: ${inst.instanceKey}`;
    }
    if (inst.kind === "browser" && inst.initialUrl !== undefined && inst.initialUrl.length > 8000) {
      return "initialUrl too long";
    }
  }
  const ratioNeed = Math.max(0, n - 1);
  if (config.splitRatios !== undefined && config.splitRatios.length !== ratioNeed) {
    return `splitRatios must have length ${ratioNeed}`;
  }
  return null;
}
