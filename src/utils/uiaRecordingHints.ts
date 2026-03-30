/**
 * Heuristics for turning UiaPeek SignalR payloads into macro step drafts.
 */

export type RecordingUiHints = {
  automation_id?: string;
  name?: string;
  control_type?: string;
};

export function extractRecordingUiHints(payload: unknown): RecordingUiHints {
  const hints: RecordingUiHints = {};

  function visit(node: unknown, depth: number) {
    if (depth > 24 || node === null || node === undefined) {
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1);
      }
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string" && value.trim()) {
        const kl = key.toLowerCase();
        if (kl.includes("automationid")) {
          hints.automation_id = value.trim();
        } else if (kl === "name" && !hints.name) {
          hints.name = value.trim();
        } else if (
          (kl === "controltype" || kl.endsWith("controltype")) &&
          !kl.includes("localized")
        ) {
          hints.control_type = value.trim();
        }
      } else {
        visit(value, depth + 1);
      }
    }
  }

  visit(payload, 0);
  return hints;
}

export function buildSelectorFromHints(hints: RecordingUiHints): string | null {
  const parts: string[] = [];
  if (hints.automation_id?.trim()) {
    parts.push(`AutomationId:${hints.automation_id.trim()}`);
  }
  if (hints.name?.trim()) {
    parts.push(`Name:${hints.name.trim()}`);
  }
  if (hints.control_type?.trim()) {
    parts.push(`ControlType:${hints.control_type.trim()}`);
  }
  return parts.length > 0 ? parts.join(";") : null;
}

export function formatMacroStepRecordYaml(
  stepKey: string,
  actionName: string,
  selector: string,
): string {
  const escaped = selector.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    `- step_key: ${stepKey}`,
    `  action_name: ${actionName}`,
    `  selector: "${escaped}"`,
    `  value: ""`,
    `  timeout_ms: null`,
    `  continue_on_error: false`,
    `  extra_args: []`,
  ].join("\n");
}

export function appendYamlMacroStep(currentYaml: string, stepYaml: string): string {
  const base = currentYaml.trimEnd();
  const next = stepYaml.trim();
  if (!base) {
    return `${next}\n`;
  }
  return `${base}\n${next}\n`;
}

export function nextRecordingStepKey(existingYaml: string): string {
  const matches = existingYaml.match(/\bstep_key:\s*(step-[\w-]+)/g) ?? [];
  const n = matches.length + 1;
  return `step-rec-${String(n).padStart(2, "0")}`;
}
