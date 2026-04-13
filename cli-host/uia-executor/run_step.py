"""
FlaUI-class UIA step runner (Windows, pywinauto UIA backend).
Reads one JSON object from stdin; prints one JSON line to stdout.
"""

from __future__ import annotations

import json
import sys
import traceback


TRUTHY_VALUES = {"1", "true", "yes", "on"}
FALSY_VALUES = {"0", "false", "no", "off"}


def _fail(message: str, code: int = 1) -> None:
    payload = {"ok": False, "error": message}
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(code)


def _ok(detail: str, **extra: object) -> None:
    payload: dict = {"ok": True, "detail": detail}
    for k, v in extra.items():
        if v is not None:
            payload[k] = v
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _parse_selector(selector: str) -> dict:
    if not selector or not str(selector).strip():
        return {}
    criteria: dict = {}
    for part in str(selector).split(";"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        key, val = part.split(":", 1)
        k = key.strip().lower().replace("-", "_")
        v = val.strip()
        if k in ("automation_id", "auto_id"):
            criteria["auto_id"] = v
        elif k in ("name", "title"):
            criteria["title"] = v
        elif k in ("control_type", "controltype"):
            criteria["control_type"] = v
        elif k in ("class_name", "class"):
            criteria["class_name"] = v
        elif k in ("instance", "index", "nth"):
            try:
                criteria["instance"] = max(1, int(v))
            except ValueError:
                continue
    return criteria


def _find_ctrl(root, criteria: dict, timeout_s: float):
    from pywinauto import timings

    def _resolve_spec(spec):
        resolver = getattr(spec, "wrapper_object", None)
        if callable(resolver):
            return resolver()
        return spec

    def lookup():
        if not criteria:
            return root
        if "instance" not in criteria:
            try:
                return _resolve_spec(root.child_window(**criteria))
            except Exception:
                base_criteria = dict(criteria)
                matches = root.descendants(**base_criteria)
                if not matches:
                    raise LookupError(f"no element matched {base_criteria!r}")
                return matches[0]
        picked_index = int(criteria["instance"]) - 1
        base_criteria = {k: v for k, v in criteria.items() if k != "instance"}
        matches = root.descendants(**base_criteria)
        if not matches:
            raise LookupError(f"no element matched {base_criteria!r}")
        if picked_index < 0 or picked_index >= len(matches):
            raise LookupError(
                f"instance {picked_index + 1} out of range for {base_criteria!r}; matched {len(matches)} elements"
            )
        return matches[picked_index]

    return timings.wait_until_passes(timeout_s, 0.15, lookup)


def _wrapper(ctrl):
    wo = getattr(ctrl, "wrapper_object", None)
    if callable(wo):
        try:
            return wo()
        except Exception:
            pass
    return ctrl


def _read_control_text(ctrl) -> str:
    w = _wrapper(ctrl)
    try:
        iface = getattr(w, "iface_value", None)
        if iface is not None:
            cur = iface.CurrentValue
            if cur is not None and str(cur).strip() != "":
                return str(cur).strip()
    except Exception:
        pass
    try:
        getter = getattr(w, "get_value", None)
        if callable(getter):
            v = getter()
            if v is not None and str(v).strip() != "":
                return str(v).strip()
    except Exception:
        pass
    try:
        return (w.window_text() or "").strip()
    except Exception:
        return ""


def _control_type_name(ctrl) -> str:
    try:
        return str(getattr(ctrl.element_info, "control_type", "") or "")
    except Exception:
        return ""


def _read_selected_state(ctrl) -> bool | None:
    w = _wrapper(ctrl)
    for method_name in ("is_selected", "get_toggle_state"):
        try:
            method = getattr(w, method_name, None)
            if callable(method):
                value = method()
                if value is not None:
                    return bool(value)
        except Exception:
            pass
    for iface_name in ("iface_selection_item", "iface_toggle"):
        try:
            iface = getattr(w, iface_name, None)
            if iface is not None:
                current = getattr(iface, "CurrentIsSelected", None)
                if current is not None:
                    return bool(current)
                toggle_state = getattr(iface, "CurrentToggleState", None)
                if toggle_state is not None:
                    return bool(toggle_state)
        except Exception:
            pass
    return None


def _parse_expected_bool(value: str) -> bool | None:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    if normalized in TRUTHY_VALUES:
        return True
    if normalized in FALSY_VALUES:
        return False
    return None


def _semantic_activate(ctrl) -> str | None:
    w = _wrapper(ctrl)
    control_type = _control_type_name(w)

    if control_type in {"TabItem", "ListItem", "TreeItem"}:
        for method_name in ("select",):
            try:
                method = getattr(w, method_name, None)
                if callable(method):
                    method()
                    return "select"
            except Exception:
                pass

    if control_type in {"Button", "MenuItem", "SplitButton", "TabItem"}:
        for method_name in ("invoke", "click", "press"):
            try:
                method = getattr(w, method_name, None)
                if callable(method):
                    method()
                    return method_name
            except Exception:
                pass

    return None


def main() -> None:
    if sys.platform != "win32":
        _fail("This UIA executor runs on Windows only.")

    try:
        raw = sys.stdin.read()
        req = json.loads(raw)
    except Exception as exc:
        _fail(f"invalid stdin json: {exc}")

    action = str(req.get("action", "")).strip().lower()
    selector = str(req.get("selector", ""))
    value = str(req.get("value", ""))
    pid = req.get("pid")
    window_title = str(req.get("window_title") or req.get("uia_window_title") or "").strip()
    timeout_ms = int(req.get("timeout_ms") or 5000)
    timeout_s = max(0.5, min(timeout_ms / 1000.0, 120.0))

    pid_int: int | None = None
    if pid is not None and pid != "":
        try:
            pid_int = int(pid)
        except (TypeError, ValueError):
            _fail("pid must be an integer.")

    if not window_title and pid_int is None:
        _fail("pid is required for flaui steps unless window_title is set.")

    try:
        from pywinauto import Application
    except ImportError:
        _fail("pywinauto is not installed. pip install -r cli-host/uia-executor/requirements.txt")

    try:
        if window_title:
            from pywinauto import findwindows

            els = findwindows.find_elements(
                backend="uia",
                title_re=window_title,
                visible_only=False,
            )
            if not els:
                _fail(f"no top-level window matched title_re={window_title!r}")
            picked = els[0]
            if len(els) > 1:
                if pid_int is not None:
                    for el in els:
                        if el.process_id == pid_int:
                            picked = el
                            break
                    else:
                        # PyInstaller: launcher PID may not own the Tk window; prefer newest process.
                        picked = max(els, key=lambda e: e.process_id)
                else:
                    picked = max(els, key=lambda e: e.process_id)
            app = Application(backend="uia").connect(
                process=picked.process_id,
                timeout=min(timeout_s, 60.0),
            )
        else:
            app = Application(backend="uia").connect(
                process=pid_int,
                timeout=min(timeout_s, 60.0),
            )
        main = app.top_window()
        criteria = _parse_selector(selector)
        ctrl = _find_ctrl(main, criteria, timeout_s)

        if action == "click":
            activation = _semantic_activate(ctrl)
            if activation is None:
                ctrl.click_input()
                activation = "click_input"
            _ok("click", activation=activation)
        elif action in ("type", "type_keys"):
            ctrl.type_keys(value, with_spaces=True)
            _ok("type_keys")
        elif action in ("set_text", "set_edit_text"):
            try:
                ctrl.set_edit_text(value)
            except Exception:
                ctrl.type_keys(value, with_spaces=True)
            _ok("set_text")
        elif action == "invoke":
            ctrl.invoke()
            _ok("invoke")
        elif action in ("get_text", "read_text", "get_value"):
            text = _read_control_text(ctrl)
            expect = (value or "").strip()
            if expect and text != expect:
                _fail(f"get_text mismatch: expected {expect!r}, got {text!r}")
            _ok("get_text", text=text)
        elif action in ("get_selected", "read_selected", "is_selected"):
            selected = _read_selected_state(ctrl)
            if selected is None:
                _fail("selection state is not available for this control.")
            expect_bool = _parse_expected_bool(value)
            if expect_bool is None and (value or "").strip():
                _fail("get_selected expects value true/false/1/0 when provided.")
            if expect_bool is not None and selected is not expect_bool:
                _fail(
                    f"get_selected mismatch: expected {expect_bool!r}, got {selected!r}"
                )
            _ok("get_selected", selected=selected)
        else:
            _fail(f"unsupported action: {action}")
    except SystemExit:
        raise
    except Exception as exc:
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        _fail(str(exc))


if __name__ == "__main__":
    main()
