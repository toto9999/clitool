/**
 * Converts a buffered UiaPeek SignalR recording session into flaui.* macro steps.
 * Heuristic: Mouse Down/Click → flaui.click; printable Keyboard Down → merged
 * flaui.set_text (default) or flaui.type per selector. set_text matches “clear then
 * type” when the final typed characters are all that was captured.
 */

import { buildSelectorFromHints, extractRecordingUiHints } from "./uiaRecordingHints";

export type SessionMacroStep = {
  step_key: string;
  action_name: string;
  selector: string;
  value: string;
  timeout_ms: null;
  continue_on_error: boolean;
  extra_args: string[];
};

const MAX_EVENTS = 1200;

function unwrapInnerValue(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const root = payload as Record<string, unknown>;
  const inner = root.value;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>;
  }
  return root;
}

function getTriggerNode(inner: Record<string, unknown>): unknown {
  const chain = inner.chain;
  if (chain && typeof chain === "object") {
    const c = chain as Record<string, unknown>;
    const path = c.path;
    if (Array.isArray(path) && path.length > 0) {
      const reversed = [...path].reverse();
      const trigger = reversed.find(
        (p) =>
          p &&
          typeof p === "object" &&
          (p as Record<string, unknown>).isTriggerElement === true,
      );
      return trigger ?? path[path.length - 1];
    }
  }
  return inner;
}

function selectorForInner(inner: Record<string, unknown>): string | null {
  const trigger = getTriggerNode(inner);
  const hints =
    trigger && typeof trigger === "object"
      ? extractRecordingUiHints(trigger)
      : extractRecordingUiHints(inner);
  return buildSelectorFromHints(hints);
}

function readStringProp(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") {
    return null;
  }
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  }
  return null;
}

function readKeyboardChar(inner: Record<string, unknown>): string | null {
  const value = inner.value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const key = readStringProp(v, ["key", "Key", "character", "Character"]);
    if (key && key.length === 1) {
      return key;
    }
    if (key && key === "Enter") {
      return "\n";
    }
    if (key && key === "Tab") {
      return "\t";
    }
  }
  return null;
}

function normalizeType(inner: Record<string, unknown>): string {
  return String(inner.type ?? inner.Type ?? "").toLowerCase();
}

function normalizeEvent(inner: Record<string, unknown>): string {
  return String(inner.event ?? inner.Event ?? "").toLowerCase();
}

function pushStep(
  out: SessionMacroStep[],
  action: "flaui.click" | "flaui.type" | "flaui.set_text",
  selector: string,
  value: string,
) {
  const n = out.length + 1;
  const stepKey = `step-${String(n).padStart(2, "0")}`;
  out.push({
    step_key: stepKey,
    action_name: action,
    selector,
    value,
    timeout_ms: null,
    continue_on_error: false,
    extra_args: [],
  });
}

export type MergedFieldAction = "type" | "set_text";

/**
 * Turn recorded payloads into flaui macro steps (click / type or set_text). Mouse move and
 * events without a resolvable selector are skipped.
 */
export function recordingPayloadsToMacroSteps(
  payloads: unknown[],
  options?: { maxSteps?: number; mergedFieldAction?: MergedFieldAction },
): SessionMacroStep[] {
  const capped = payloads.slice(-MAX_EVENTS);
  const maxSteps = Math.min(options?.maxSteps ?? 400, 500);
  const mergedFieldAction: MergedFieldAction = options?.mergedFieldAction ?? "set_text";

  const out: SessionMacroStep[] = [];
  let typeBuffer = "";
  let typeSelector: string | null = null;

  const flushType = () => {
    if (!typeBuffer || !typeSelector) {
      typeBuffer = "";
      typeSelector = null;
      return;
    }
    if (out.length >= maxSteps) {
      typeBuffer = "";
      typeSelector = null;
      return;
    }
    const actionName = mergedFieldAction === "set_text" ? "flaui.set_text" : "flaui.type";
    pushStep(out, actionName, typeSelector, typeBuffer);
    typeBuffer = "";
    typeSelector = null;
  };

  for (const payload of capped) {
    if (out.length >= maxSteps) {
      break;
    }

    const inner = unwrapInnerValue(payload);
    if (!inner) {
      continue;
    }

    const t = normalizeType(inner);
    const ev = normalizeEvent(inner);

    if (t.includes("mouse") && (ev === "down" || ev === "click")) {
      flushType();
      const sel = selectorForInner(inner);
      if (!sel) {
        continue;
      }
      pushStep(out, "flaui.click", sel, "");
      continue;
    }

    if (t.includes("keyboard") && (ev === "down" || ev === "key down")) {
      const ch = readKeyboardChar(inner);
      const sel = selectorForInner(inner);
      if (!ch || !sel) {
        continue;
      }
      if (typeSelector === null) {
        typeSelector = sel;
        typeBuffer = ch;
      } else if (sel === typeSelector) {
        typeBuffer += ch;
      } else {
        flushType();
        typeSelector = sel;
        typeBuffer = ch;
      }
      continue;
    }
  }

  flushType();

  return out;
}
