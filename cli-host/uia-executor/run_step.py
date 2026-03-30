"""
FlaUI-class UIA step runner (Windows, pywinauto UIA backend).
Reads one JSON object from stdin; prints one JSON line to stdout.
"""

from __future__ import annotations

import json
import sys
import traceback


def _fail(message: str, code: int = 1) -> None:
    payload = {"ok": False, "error": message}
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(code)


def _ok(detail: str) -> None:
    sys.stdout.write(json.dumps({"ok": True, "detail": detail}, ensure_ascii=False) + "\n")
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
        elif k == "control_type":
            criteria["control_type"] = v
        elif k in ("class_name", "class"):
            criteria["class_name"] = v
    return criteria


def _find_ctrl(root, criteria: dict, timeout_s: float):
    from pywinauto import timings

    def lookup():
        if not criteria:
            return root
        return root.child_window(**criteria)

    return timings.wait_until_passes(timeout_s, 0.15, lookup)


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
    timeout_ms = int(req.get("timeout_ms") or 5000)
    timeout_s = max(0.5, min(timeout_ms / 1000.0, 120.0))

    if pid is None:
        _fail("pid is required for flaui steps.")

    try:
        pid_int = int(pid)
    except (TypeError, ValueError):
        _fail("pid must be an integer.")

    try:
        from pywinauto import Application
    except ImportError:
        _fail("pywinauto is not installed. pip install -r cli-host/uia-executor/requirements.txt")

    try:
        app = Application(backend="uia").connect(process=pid_int)
        main = app.top_window()
        criteria = _parse_selector(selector)
        ctrl = _find_ctrl(main, criteria, timeout_s)

        if action == "click":
            ctrl.click_input()
            _ok("click")
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
