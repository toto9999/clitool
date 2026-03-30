from __future__ import annotations

import asyncio
import contextlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any

import yaml
from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.css.query import NoMatches
from textual.suggester import SuggestFromList
from textual.widgets import Button, Footer, Header, Input, MarkdownViewer, RichLog, Static, TextArea

STARTER_ACTIONS = [
    "workspace.get-state",
    "project.open",
    "project.switch",
    "app.ping",
    "app.logs.tail",
    "browser.get-state",
    "browser.navigate",
    "browser.navigate.back",
    "browser.navigate.forward",
    "browser.navigate.reload",
    "browser.automation.click",
    "browser.automation.fill",
    "browser.automation.extract-text",
    "terminal.create",
    "terminal.get-state",
    "terminal.write",
    "terminal.resize",
    "terminal.logs.tail",
    "terminal.kill",
]

HELP_MARKDOWN = """\
# CLIBase Textual Host

`batcli tui` is the first interactive Textual host under the authoritative `batcli` namespace.

## Starter actions

- `workspace.get-state`
- `project.open`
- `project.switch`
- `app.ping`
- `browser.get-state`
- `browser.navigate`
- `browser.navigate.back`
- `browser.navigate.forward`
- `browser.navigate.reload`
- `browser.automation.click`
- `browser.automation.fill`
- `browser.automation.extract-text`
- `terminal.create`
- `terminal.get-state`
- `terminal.write`
- `terminal.resize`
- `terminal.logs.tail`
- `terminal.kill`
- `app.logs.tail`

## Context inputs

- `project_key`, `browser_key`, and `terminal_key` have autocomplete suggestions.
- `Workspace sync` refreshes the quick pickers from `workspace.get-state`.
- Project, browser, and terminal pickers can be filtered by readable text.
- Clicking a project, browser, or terminal in the sidebar fills the context inputs.
- Runtime logs can be refreshed manually or tailed live with a visible toggle.
- Terminal output can be tailed into a dedicated terminal pane.

## Payload format

Write a flat YAML mapping in the compose pane.

```yaml
browser_key: browser-surface-main
terminal_key: term-shell-main-01
url: https://example.com
selector: "#go"
value: "hello from batcli"
text: "Get-Location"
cols: 120
rows: 32
limit: 20
```

## Notes

- Start the Electron shell first with `batcli dev`.
- The current skeleton supports flat scalar payload values only.
- Action responses go to the result pane.
- `app.logs.tail` renders into the separate runtime log pane.
"""


class ClibaseTextualHost(App[None]):
    CSS = """
    Screen {
        layout: vertical;
        background: #07111c;
        color: #e8f1fb;
    }

    #shell {
        height: 1fr;
    }

    #sidebar {
        width: 42;
        min-width: 36;
        border: round #1b385b;
        padding: 1;
        background: #0a1828;
    }

    .sidebar-title {
        margin-top: 1;
        margin-bottom: 1;
        text-style: bold;
        color: #86bff8;
    }

    .filter-input {
        margin-bottom: 1;
    }

    #workspace-summary {
        border: round #214b7a;
        padding: 1;
        background: #08111d;
        margin-bottom: 1;
        height: 8;
    }

    #project-picker,
    #browser-picker,
    #terminal-picker {
        border: round #214b7a;
        background: #08111d;
        padding: 1;
        height: 9;
        margin-bottom: 1;
    }

    .picker-button {
        width: 1fr;
        margin-bottom: 1;
    }

    #help-view {
        height: 1fr;
        border: round #214b7a;
    }

    #main-pane {
        width: 1fr;
        padding: 1;
    }

    #action-input {
        margin-bottom: 1;
    }

    #context-row,
    #helper-row,
    #terminal-row,
    #button-bar-top,
    #button-bar-bottom,
    #button-bar-terminal {
        height: auto;
        margin-bottom: 1;
    }

    #context-row Input,
    #helper-row Input,
    #terminal-row Input {
        width: 1fr;
        margin-right: 1;
    }

    #button-bar-top Button,
    #button-bar-bottom Button,
    #button-bar-terminal Button {
        margin-right: 1;
    }

    #payload-editor {
        height: 12;
        min-height: 8;
        border: round #214b7a;
        margin-bottom: 1;
    }

    #log-row {
        height: 1fr;
    }

    #result-log,
    #runtime-log,
    #terminal-log {
        width: 1fr;
        height: 1fr;
        border: round #214b7a;
        padding: 0 1;
        background: #08111d;
    }

    #result-log {
        margin-right: 1;
    }

    #side-log-column {
        width: 1fr;
        height: 1fr;
    }

    #runtime-log {
        margin-bottom: 1;
    }
    """

    BINDINGS = [
        ("ctrl+r", "run_current", "Run action"),
        ("ctrl+1", "refresh_workspace", "Workspace"),
        ("ctrl+2", "ping_app", "Ping"),
        ("ctrl+3", "show_browser", "Browser"),
        ("ctrl+4", "navigate_current_browser", "Navigate"),
        ("ctrl+5", "click_current_browser", "Click"),
        ("ctrl+6", "fill_current_browser", "Fill"),
        ("ctrl+7", "extract_current_browser", "Extract"),
        ("ctrl+8", "tail_logs", "Logs"),
        ("ctrl+l", "clear_log", "Clear logs"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.workspace_result: dict[str, Any] | None = None
        self.project_records: list[dict[str, Any]] = []
        self.browser_records: list[dict[str, Any]] = []
        self.terminal_records: list[dict[str, Any]] = []
        self.runtime_log_seen_keys: set[str] = set()
        self.runtime_log_polling_enabled = False
        self.runtime_log_poll_task: asyncio.Task[None] | None = None
        self.runtime_log_poll_interval_seconds = 2.0

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)

        with Horizontal(id="shell"):
            with Vertical(id="sidebar"):
                yield Button("Workspace sync", id="refresh-workspace")
                yield Static("workspace not loaded", id="workspace-summary")
                yield Static("Projects", classes="sidebar-title")
                yield Input(
                    placeholder="filter projects",
                    id="project-filter-input",
                    classes="filter-input",
                )
                yield VerticalScroll(id="project-picker")
                yield Static("Browsers", classes="sidebar-title")
                yield Input(
                    placeholder="filter browsers",
                    id="browser-filter-input",
                    classes="filter-input",
                )
                yield VerticalScroll(id="browser-picker")
                yield Static("Terminals", classes="sidebar-title")
                yield Input(
                    placeholder="filter terminals",
                    id="terminal-filter-input",
                    classes="filter-input",
                )
                yield VerticalScroll(id="terminal-picker")
                yield MarkdownViewer(
                    HELP_MARKDOWN,
                    id="help-view",
                    show_table_of_contents=False,
                )

            with Vertical(id="main-pane"):
                yield Input(
                    value="workspace.get-state",
                    placeholder="Action name",
                    id="action-input",
                    suggester=SuggestFromList(STARTER_ACTIONS, case_sensitive=False),
                )
                with Horizontal(id="context-row"):
                    yield Input(
                        placeholder="project_key",
                        id="project-key-input",
                    )
                    yield Input(
                        placeholder="browser_key",
                        id="browser-key-input",
                    )
                    yield Input(
                        placeholder="terminal_key",
                        id="terminal-key-input",
                    )
                with Horizontal(id="helper-row"):
                    yield Input(
                        placeholder="url for browser.navigate",
                        id="url-input",
                    )
                    yield Input(
                        placeholder="selector for click/fill/extract",
                        id="selector-input",
                    )
                    yield Input(
                        placeholder="value for browser.automation.fill",
                        id="fill-value-input",
                    )
                with Horizontal(id="terminal-row"):
                    yield Input(
                        placeholder="text for terminal.write",
                        id="terminal-text-input",
                    )
                    yield Input(
                        placeholder="cols",
                        id="terminal-cols-input",
                        value="120",
                    )
                    yield Input(
                        placeholder="rows",
                        id="terminal-rows-input",
                        value="32",
                    )
                yield TextArea("", id="payload-editor")
                with Horizontal(id="button-bar-top"):
                    yield Button("Run current", id="run-current")
                    yield Button("Workspace", id="run-workspace")
                    yield Button("Open project", id="run-project-open")
                    yield Button("Ping", id="run-ping")
                    yield Button("Browser", id="run-browser")
                    yield Button("Navigate", id="run-navigate")
                    yield Button("Back", id="run-back")
                    yield Button("Forward", id="run-forward")
                    yield Button("Reload", id="run-reload")
                with Horizontal(id="button-bar-bottom"):
                    yield Button("Click", id="run-click")
                    yield Button("Fill", id="run-fill")
                    yield Button("Extract", id="run-extract")
                    yield Button("Logs", id="run-logs")
                    yield Button("Live logs: off", id="toggle-live-logs")
                with Horizontal(id="button-bar-terminal"):
                    yield Button("Terminal create", id="run-terminal-create")
                    yield Button("Terminal state", id="run-terminal-state")
                    yield Button("Terminal write", id="run-terminal-write")
                    yield Button("Terminal resize", id="run-terminal-resize")
                    yield Button("Terminal tail", id="run-terminal-logs")
                    yield Button("Terminal kill", id="run-terminal-kill")
                with Horizontal(id="log-row"):
                    yield RichLog(
                        id="result-log",
                        wrap=True,
                        markup=False,
                        highlight=False,
                    )
                    with Vertical(id="side-log-column"):
                        yield RichLog(
                            id="runtime-log",
                            wrap=True,
                            markup=False,
                            highlight=False,
                        )
                        yield RichLog(
                            id="terminal-log",
                            wrap=True,
                            markup=False,
                            highlight=False,
                        )

        yield Footer()

    async def on_mount(self) -> None:
        self.title = "CLIBase Textual Host"
        self.sub_title = "batcli tui"
        self.query_one("#payload-editor", TextArea).text = ""
        self._write_result_log(
            "Textual host ready. Start the desktop shell with `batcli dev`, then sync workspace.",
        )
        self._write_runtime_log("runtime log panel ready. Run `app.logs.tail` to inspect host logs.")
        self._write_terminal_log("terminal log panel ready. Run `terminal.logs.tail` after creating a terminal.")
        self.query_one("#action-input", Input).focus()
        self._update_live_logs_button()
        self.runtime_log_poll_task = asyncio.create_task(self._runtime_log_poll_loop())
        await self._refresh_workspace_state(show_result=False)

    async def on_unmount(self) -> None:
        if self.runtime_log_poll_task:
            self.runtime_log_poll_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.runtime_log_poll_task

    async def action_run_current(self) -> None:
        await self._run_from_inputs()

    async def action_refresh_workspace(self) -> None:
        await self._refresh_workspace_state(show_result=True)

    async def action_open_current_project(self) -> None:
        project_key = self._current_project_key()

        if not project_key:
            self._write_result_log("[error] project_key is required for project.open")
            return

        await self._run_preset_action(
            "project.open",
            {
                "project_key": project_key,
            },
        )

    async def action_ping_app(self) -> None:
        await self._run_preset_action("app.ping", {})

    async def action_show_browser(self) -> None:
        browser_key = self._current_browser_key()
        payload = {"browser_key": browser_key} if browser_key else {}
        await self._run_preset_action("browser.get-state", payload)

    async def action_go_back_current_browser(self) -> None:
        await self._run_browser_history_action("browser.navigate.back")

    async def action_go_forward_current_browser(self) -> None:
        await self._run_browser_history_action("browser.navigate.forward")

    async def action_reload_current_browser(self) -> None:
        await self._run_browser_history_action("browser.navigate.reload")

    async def action_navigate_current_browser(self) -> None:
        browser_key = self._current_browser_key()
        url = self.query_one("#url-input", Input).value.strip()

        if not browser_key:
            self._write_result_log("[error] browser_key is required for navigate")
            return

        if not url:
            self._write_result_log("[error] url is required for navigate")
            return

        await self._run_preset_action(
            "browser.navigate",
            {
                "browser_key": browser_key,
                "url": url,
            },
        )

    async def action_click_current_browser(self) -> None:
        browser_key = self._current_browser_key()
        selector = self.query_one("#selector-input", Input).value.strip()

        if not browser_key:
            self._write_result_log("[error] browser_key is required for click")
            return

        if not selector:
            self._write_result_log("[error] selector is required for click")
            return

        await self._run_preset_action(
            "browser.automation.click",
            {
                "browser_key": browser_key,
                "selector": selector,
            },
        )

    async def action_fill_current_browser(self) -> None:
        browser_key = self._current_browser_key()
        selector = self.query_one("#selector-input", Input).value.strip()
        value = self.query_one("#fill-value-input", Input).value

        if not browser_key:
            self._write_result_log("[error] browser_key is required for fill")
            return

        if not selector:
            self._write_result_log("[error] selector is required for fill")
            return

        await self._run_preset_action(
            "browser.automation.fill",
            {
                "browser_key": browser_key,
                "selector": selector,
                "value": value,
            },
        )

    async def action_extract_current_browser(self) -> None:
        browser_key = self._current_browser_key()
        selector = self.query_one("#selector-input", Input).value.strip()

        if not browser_key:
            self._write_result_log("[error] browser_key is required for extract")
            return

        payload: dict[str, Any] = {"browser_key": browser_key}
        if selector:
            payload["selector"] = selector

        await self._run_preset_action("browser.automation.extract-text", payload)

    async def action_show_terminal(self) -> None:
        terminal_key = self._current_terminal_key()
        payload = {"terminal_key": terminal_key} if terminal_key else {}
        await self._run_preset_action("terminal.get-state", payload)

    async def action_create_current_terminal(self) -> None:
        terminal_key = self._current_terminal_key()

        if not terminal_key:
            self._write_result_log("[error] terminal_key is required for terminal.create")
            return

        await self._run_preset_action(
            "terminal.create",
            {
                "terminal_key": terminal_key,
            },
        )

    async def action_write_current_terminal(self) -> None:
        terminal_key = self._current_terminal_key()
        text = self.query_one("#terminal-text-input", Input).value

        if not terminal_key:
            self._write_result_log("[error] terminal_key is required for terminal.write")
            return

        if not text:
            self._write_result_log("[error] text is required for terminal.write")
            return

        await self._run_preset_action(
            "terminal.write",
            {
                "terminal_key": terminal_key,
                "text": text,
                "append_newline": True,
            },
        )

    async def action_resize_current_terminal(self) -> None:
        terminal_key = self._current_terminal_key()
        cols = self.query_one("#terminal-cols-input", Input).value.strip()
        rows = self.query_one("#terminal-rows-input", Input).value.strip()

        if not terminal_key:
            self._write_result_log("[error] terminal_key is required for terminal.resize")
            return

        await self._run_preset_action(
            "terminal.resize",
            {
                "terminal_key": terminal_key,
                "cols": int(cols or "120"),
                "rows": int(rows or "32"),
            },
        )

    async def action_tail_terminal_logs(self) -> None:
        await self._refresh_terminal_logs(
            limit=40,
            reset_panel=True,
            write_result=True,
            write_command=True,
        )

    async def action_kill_current_terminal(self) -> None:
        terminal_key = self._current_terminal_key()

        if not terminal_key:
            self._write_result_log("[error] terminal_key is required for terminal.kill")
            return

        await self._run_preset_action(
            "terminal.kill",
            {
                "terminal_key": terminal_key,
            },
        )

    async def action_tail_logs(self) -> None:
        await self._refresh_runtime_logs(
            limit=20,
            reset_panel=True,
            write_result=True,
            write_command=True,
        )

    async def action_toggle_live_logs(self) -> None:
        self.runtime_log_polling_enabled = not self.runtime_log_polling_enabled
        self._update_live_logs_button()

        if self.runtime_log_polling_enabled:
            self._write_result_log("live runtime log polling enabled")
            await self._refresh_runtime_logs(
                limit=40,
                reset_panel=False,
                write_result=False,
                write_command=False,
            )
            return

        self._write_result_log("live runtime log polling disabled")

    def action_clear_log(self) -> None:
        self.query_one("#result-log", RichLog).clear()
        self.query_one("#runtime-log", RichLog).clear()
        self.query_one("#terminal-log", RichLog).clear()
        self.runtime_log_seen_keys.clear()
        self._write_result_log("result, runtime, and terminal logs cleared")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id or ""

        if button_id == "run-current":
            await self._run_from_inputs()
            return

        if button_id in {"refresh-workspace", "run-workspace"}:
            await self.action_refresh_workspace()
            return

        if button_id == "run-project-open":
            await self.action_open_current_project()
            return

        if button_id == "run-ping":
            await self.action_ping_app()
            return

        if button_id == "run-browser":
            await self.action_show_browser()
            return

        if button_id == "run-navigate":
            await self.action_navigate_current_browser()
            return

        if button_id == "run-back":
            await self.action_go_back_current_browser()
            return

        if button_id == "run-forward":
            await self.action_go_forward_current_browser()
            return

        if button_id == "run-reload":
            await self.action_reload_current_browser()
            return

        if button_id == "run-click":
            await self.action_click_current_browser()
            return

        if button_id == "run-fill":
            await self.action_fill_current_browser()
            return

        if button_id == "run-extract":
            await self.action_extract_current_browser()
            return

        if button_id == "run-logs":
            await self.action_tail_logs()
            return

        if button_id == "run-terminal-create":
            await self.action_create_current_terminal()
            return

        if button_id == "run-terminal-state":
            await self.action_show_terminal()
            return

        if button_id == "run-terminal-write":
            await self.action_write_current_terminal()
            return

        if button_id == "run-terminal-resize":
            await self.action_resize_current_terminal()
            return

        if button_id == "run-terminal-logs":
            await self.action_tail_terminal_logs()
            return

        if button_id == "run-terminal-kill":
            await self.action_kill_current_terminal()
            return

        if button_id == "toggle-live-logs":
            await self.action_toggle_live_logs()
            return

        if button_id.startswith("pick-project--"):
            project_key = button_id.removeprefix("pick-project--")
            await self._apply_project_selection(project_key)
            self._write_result_log(f"selected project: {project_key}")
            return

        if button_id.startswith("pick-browser--"):
            browser_key = button_id.removeprefix("pick-browser--")
            await self._apply_browser_selection(browser_key)
            self._write_result_log(f"selected browser: {browser_key}")
            return

        if button_id.startswith("pick-terminal--"):
            terminal_key = button_id.removeprefix("pick-terminal--")
            await self._apply_terminal_selection(terminal_key)
            self._write_result_log(f"selected terminal: {terminal_key}")
            return

    async def on_input_changed(self, event: Input.Changed) -> None:
        input_id = event.input.id or ""

        if input_id in {
            "project-key-input",
            "browser-key-input",
            "terminal-key-input",
            "project-filter-input",
            "browser-filter-input",
            "terminal-filter-input",
        }:
            self._apply_suggesters()
            await self._refresh_picker_widgets()

    async def _run_from_inputs(self) -> None:
        action_name = self.query_one("#action-input", Input).value.strip()
        payload_text = self.query_one("#payload-editor", TextArea).text

        if not action_name:
            self._write_result_log("[error] action name is required")
            return

        try:
            payload = self._parse_payload(payload_text)
        except Exception as error:  # noqa: BLE001
            self._write_result_log(f"[error] {error}")
            return

        await self._run_preset_action(action_name, payload)

    async def _run_preset_action(self, action_name: str, payload: dict[str, Any]) -> None:
        if action_name == "app.logs.tail":
            limit = payload.get("limit", 20)
            try:
                numeric_limit = int(limit)
            except (TypeError, ValueError):
                numeric_limit = 20

            await self._refresh_runtime_logs(
                limit=numeric_limit,
                reset_panel=True,
                write_result=True,
                write_command=True,
            )
            return

        if action_name == "terminal.logs.tail":
            limit = payload.get("limit", 40)
            try:
                numeric_limit = int(limit)
            except (TypeError, ValueError):
                numeric_limit = 40

            await self._refresh_terminal_logs(
                limit=numeric_limit,
                reset_panel=True,
                write_result=True,
                write_command=True,
            )
            return

        self._set_action_inputs(action_name, payload)
        rendered_command = self._render_command_preview(action_name, payload)
        self._write_result_log(f"$ {rendered_command}")

        try:
            response = await asyncio.to_thread(
                self._run_action_sync,
                action_name,
                payload,
            )
        except Exception as error:  # noqa: BLE001
            self._write_result_log(f"[error] {error}")
            return

        self._write_yaml(response)

        if action_name in {"workspace.get-state", "project.open", "project.switch"} and response.get("status") == "success":
            await self._consume_workspace_result(response)

    async def _run_browser_history_action(self, action_name: str) -> None:
        browser_key = self._current_browser_key()

        if not browser_key:
            self._write_result_log(f"[error] browser_key is required for {action_name}")
            return

        await self._run_preset_action(
            action_name,
            {
                "browser_key": browser_key,
            },
        )

    def _run_action_sync(self, action_name: str, payload: dict[str, Any]) -> Any:
        batcli_entry = os.environ.get("CLIBASE_BATCLI_ENTRY", "").strip()
        node_executable = os.environ.get("CLIBASE_NODE_EXE", "").strip()
        repo_root = os.environ.get("CLIBASE_REPO_ROOT", "").strip() or str(
            Path(__file__).resolve().parents[2]
        )

        if not batcli_entry or not node_executable:
            raise RuntimeError(
                "Missing CLIBASE_BATCLI_ENTRY or CLIBASE_NODE_EXE. Launch through `batcli tui`.",
            )

        command = [
            node_executable,
            batcli_entry,
            "action",
            "run",
            "--action",
            action_name,
            "--output-format",
            "json",
        ]
        command.extend(self._payload_to_args(payload))

        completed = subprocess.run(
            command,
            cwd=repo_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )

        if completed.returncode != 0:
            stderr = completed.stderr.strip()
            stdout = completed.stdout.strip()
            raise RuntimeError(stderr or stdout or f"action failed with code {completed.returncode}")

        try:
            return json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            raise RuntimeError(
                f"Unable to parse batcli JSON output: {error}\n{completed.stdout}"
            ) from error

    async def _refresh_workspace_state(self, show_result: bool) -> None:
        response = await asyncio.to_thread(self._run_action_sync, "workspace.get-state", {})
        await self._consume_workspace_result(response)
        if show_result:
            self._write_yaml(response)
        else:
            self._write_result_log("workspace synced")

    async def _refresh_runtime_logs(
        self,
        *,
        limit: int,
        reset_panel: bool,
        write_result: bool,
        write_command: bool,
    ) -> bool:
        payload = {"limit": limit}
        self._set_action_inputs("app.logs.tail", payload)

        if write_command:
            rendered_command = self._render_command_preview("app.logs.tail", payload)
            self._write_result_log(f"$ {rendered_command}")

        try:
            response = await asyncio.to_thread(
                self._run_action_sync,
                "app.logs.tail",
                payload,
            )
        except Exception as error:  # noqa: BLE001
            self._write_result_log(f"[error] {error}")
            return False

        if response.get("status") == "success":
            returned_count = self._consume_runtime_logs(response, reset_panel=reset_panel)

            if write_result:
                self._write_yaml(
                    {
                        "status": response.get("status"),
                        "action_name": response.get("action_name"),
                        "responded_at": response.get("responded_at"),
                        "result": {
                            "returned_count": returned_count,
                            "rendered_to": "runtime-log",
                            "reset_panel": reset_panel,
                        },
                    }
                )

            return True

        if write_result:
            self._write_yaml(response)

        return False

    async def _refresh_terminal_logs(
        self,
        *,
        limit: int,
        reset_panel: bool,
        write_result: bool,
        write_command: bool,
    ) -> bool:
        terminal_key = self._current_terminal_key()
        payload: dict[str, Any] = {"limit": limit}
        if terminal_key:
            payload["terminal_key"] = terminal_key
        self._set_action_inputs("terminal.logs.tail", payload)

        if write_command:
            rendered_command = self._render_command_preview("terminal.logs.tail", payload)
            self._write_result_log(f"$ {rendered_command}")

        try:
            response = await asyncio.to_thread(
                self._run_action_sync,
                "terminal.logs.tail",
                payload,
            )
        except Exception as error:  # noqa: BLE001
            self._write_result_log(f"[error] {error}")
            return False

        if response.get("status") == "success":
            returned_count = self._consume_terminal_logs(response, reset_panel=reset_panel)

            if write_result:
                self._write_yaml(
                    {
                        "status": response.get("status"),
                        "action_name": response.get("action_name"),
                        "responded_at": response.get("responded_at"),
                        "result": {
                            "returned_count": returned_count,
                            "rendered_to": "terminal-log",
                            "reset_panel": reset_panel,
                        },
                    }
                )

            return True

        if write_result:
            self._write_yaml(response)

        return False

    async def _runtime_log_poll_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self.runtime_log_poll_interval_seconds)

                if not self.runtime_log_polling_enabled:
                    continue

                success = await self._refresh_runtime_logs(
                    limit=40,
                    reset_panel=False,
                    write_result=False,
                    write_command=False,
                )

                if success:
                    continue

                self.runtime_log_polling_enabled = False
                self._update_live_logs_button()
                self._write_result_log("live runtime log polling paused after refresh failure")
        except asyncio.CancelledError:
            return

    async def _consume_workspace_result(self, response: dict[str, Any]) -> None:
        result = response.get("result") or {}
        workspace = result.get("workspace") or {}
        runtime_registry = result.get("runtime_registry") or {}

        self.workspace_result = response
        self.project_records = list(workspace.get("projects") or [])
        self.browser_records = list(runtime_registry.get("browsers") or [])
        self.terminal_records = list(runtime_registry.get("terminals") or [])

        active_project_key = str(workspace.get("active_project_key") or "").strip()
        active_browser_key = ""
        active_terminal_key = ""
        if self.browser_records:
            active_browser_key = str(self.browser_records[0].get("browser_key") or "").strip()
        if self.terminal_records:
            active_terminal_key = str(self.terminal_records[0].get("terminal_key") or "").strip()

        if active_project_key:
            self.query_one("#project-key-input", Input).value = active_project_key

        if active_browser_key:
            self.query_one("#browser-key-input", Input).value = active_browser_key

        if active_terminal_key:
            self.query_one("#terminal-key-input", Input).value = active_terminal_key

        self._apply_suggesters()
        self._update_workspace_summary(workspace, runtime_registry)
        await self._refresh_picker_widgets()

    def _consume_runtime_logs(self, response: dict[str, Any], *, reset_panel: bool) -> int:
        result = response.get("result") or {}
        entries = result.get("entries") or []

        runtime_log = self.query_one("#runtime-log", RichLog)

        if reset_panel:
            runtime_log.clear()
            self.runtime_log_seen_keys.clear()

        if not entries:
            if reset_panel:
                runtime_log.write("no runtime logs returned")
            return 0

        rendered_count = 0
        for entry in entries:
            log_key = str(entry.get("log_key") or "").strip()

            if not reset_panel and log_key and log_key in self.runtime_log_seen_keys:
                continue

            self._write_runtime_entry(entry)
            rendered_count += 1

            if log_key:
                self.runtime_log_seen_keys.add(log_key)

        return rendered_count

    def _consume_terminal_logs(self, response: dict[str, Any], *, reset_panel: bool) -> int:
        result = response.get("result") or {}
        entries = result.get("entries") or []

        terminal_log = self.query_one("#terminal-log", RichLog)

        if reset_panel:
            terminal_log.clear()

        if not entries:
            if reset_panel:
                terminal_log.write("no terminal output returned")
            return 0

        for entry in entries:
            self._write_terminal_entry(entry)

        return len(entries)

    def _apply_suggesters(self) -> None:
        try:
            project_input = self.query_one("#project-key-input", Input)
            browser_input = self.query_one("#browser-key-input", Input)
            terminal_input = self.query_one("#terminal-key-input", Input)
        except NoMatches:
            return

        project_keys = [
            str(project.get("project_key") or "").strip()
            for project in self._filtered_project_records()
            if str(project.get("project_key") or "").strip()
        ]
        browser_keys = [
            str(browser.get("browser_key") or "").strip()
            for browser in self._filtered_browser_records()
            if str(browser.get("browser_key") or "").strip()
        ]
        terminal_keys = [
            str(terminal.get("terminal_key") or "").strip()
            for terminal in self._filtered_terminal_records()
            if str(terminal.get("terminal_key") or "").strip()
        ]

        project_input.suggester = SuggestFromList(
            project_keys or [""],
            case_sensitive=False,
        )
        browser_input.suggester = SuggestFromList(
            browser_keys or [""],
            case_sensitive=False,
        )
        terminal_input.suggester = SuggestFromList(
            terminal_keys or [""],
            case_sensitive=False,
        )

    def _update_workspace_summary(
        self,
        workspace: dict[str, Any],
        runtime_registry: dict[str, Any],
    ) -> None:
        summary_lines = [
            f"active_project: {workspace.get('active_project_key', '-')}",
            f"active_tab: {workspace.get('active_tab_key', '-')}",
            f"projects: {workspace.get('project_count', 0)}",
            f"browsers: {runtime_registry.get('browser_count', 0)}",
            f"terminals: {runtime_registry.get('terminal_count', 0)}",
        ]
        self.query_one("#workspace-summary", Static).update("\n".join(summary_lines))

    async def _refresh_picker_widgets(self) -> None:
        try:
            self.query_one("#project-picker", VerticalScroll)
            self.query_one("#browser-picker", VerticalScroll)
            self.query_one("#terminal-picker", VerticalScroll)
        except NoMatches:
            return

        await self._render_project_picker()
        await self._render_browser_picker()
        await self._render_terminal_picker()

    async def _render_project_picker(self) -> None:
        container = self.query_one("#project-picker", VerticalScroll)
        await container.remove_children()

        filtered_projects = self._filtered_project_records()
        if not filtered_projects:
            await container.mount(Static("No projects match the current filter."))
            return

        selected_project_key = self._current_project_key()

        for project in filtered_projects:
            project_key = str(project.get("project_key") or "").strip()
            project_name = str(project.get("project_name") or project_key).strip()
            label = f"{project_name} [{project_key}]"
            if project_key == selected_project_key:
                label = f"* {label}"
            await container.mount(
                Button(
                    label,
                    id=f"pick-project--{project_key}",
                    classes="picker-button",
                )
            )

    async def _render_browser_picker(self) -> None:
        container = self.query_one("#browser-picker", VerticalScroll)
        await container.remove_children()

        filtered_browsers = self._filtered_browser_records()
        if not filtered_browsers:
            await container.mount(Static("No browsers match the selected project/filter."))
            return

        selected_browser_key = self._current_browser_key()

        for browser in filtered_browsers:
            browser_key = str(browser.get("browser_key") or "").strip()
            module_name = str(browser.get("module_name") or browser_key).strip()
            label = f"{module_name} [{browser_key}]"
            if browser_key == selected_browser_key:
                label = f"* {label}"
            await container.mount(
                Button(
                    label,
                    id=f"pick-browser--{browser_key}",
                    classes="picker-button",
                )
            )

    async def _render_terminal_picker(self) -> None:
        container = self.query_one("#terminal-picker", VerticalScroll)
        await container.remove_children()

        filtered_terminals = self._filtered_terminal_records()
        if not filtered_terminals:
            await container.mount(Static("No terminals match the selected project/filter."))
            return

        selected_terminal_key = self._current_terminal_key()

        for terminal in filtered_terminals:
            terminal_key = str(terminal.get("terminal_key") or "").strip()
            module_name = str(terminal.get("module_name") or terminal_key).strip()
            label = f"{module_name} [{terminal_key}]"
            if terminal_key == selected_terminal_key:
                label = f"* {label}"
            await container.mount(
                Button(
                    label,
                    id=f"pick-terminal--{terminal_key}",
                    classes="picker-button",
                )
            )

    def _filtered_project_records(self) -> list[dict[str, Any]]:
        filter_text = self._current_project_filter()
        if not filter_text:
            return self.project_records

        return [
            project
            for project in self.project_records
            if self._matches_filter(
                filter_text,
                project.get("project_key"),
                project.get("project_name"),
            )
        ]

    def _filtered_browser_records(self) -> list[dict[str, Any]]:
        current_project_key = self._current_project_key()
        filter_text = self._current_browser_filter()

        filtered = self.browser_records
        if current_project_key:
            filtered = [
                browser
                for browser in filtered
                if str(browser.get("project_key") or "").strip() == current_project_key
            ]

        if filter_text:
            filtered = [
                browser
                for browser in filtered
                if self._matches_filter(
                    filter_text,
                    browser.get("browser_key"),
                    browser.get("module_name"),
                    browser.get("project_key"),
                    browser.get("project_name"),
                    browser.get("tab_key"),
                    browser.get("tab_name"),
                    browser.get("home_url"),
                )
            ]

        return filtered

    def _filtered_terminal_records(self) -> list[dict[str, Any]]:
        current_project_key = self._current_project_key()
        filter_text = self._current_terminal_filter()

        filtered = self.terminal_records
        if current_project_key:
            filtered = [
                terminal
                for terminal in filtered
                if str(terminal.get("project_key") or "").strip() == current_project_key
            ]

        if filter_text:
            filtered = [
                terminal
                for terminal in filtered
                if self._matches_filter(
                    filter_text,
                    terminal.get("terminal_key"),
                    terminal.get("module_name"),
                    terminal.get("project_key"),
                    terminal.get("project_name"),
                    terminal.get("tab_key"),
                    terminal.get("tab_name"),
                    terminal.get("startup_path"),
                )
            ]

        return filtered

    async def _apply_project_selection(self, project_key: str) -> None:
        self.query_one("#project-key-input", Input).value = project_key
        filtered_browsers = self._filtered_browser_records()
        if filtered_browsers:
            first_browser_key = str(filtered_browsers[0].get("browser_key") or "").strip()
            if first_browser_key:
                self.query_one("#browser-key-input", Input).value = first_browser_key
        filtered_terminals = self._filtered_terminal_records()
        if filtered_terminals:
            first_terminal_key = str(filtered_terminals[0].get("terminal_key") or "").strip()
            if first_terminal_key:
                self.query_one("#terminal-key-input", Input).value = first_terminal_key
        self._apply_suggesters()
        await self._refresh_picker_widgets()

    async def _apply_browser_selection(self, browser_key: str) -> None:
        matching_browser = next(
            (
                browser
                for browser in self.browser_records
                if str(browser.get("browser_key") or "").strip() == browser_key
            ),
            None,
        )

        if matching_browser:
            project_key = str(matching_browser.get("project_key") or "").strip()
            if project_key:
                self.query_one("#project-key-input", Input).value = project_key

        self.query_one("#browser-key-input", Input).value = browser_key
        self._apply_suggesters()
        await self._refresh_picker_widgets()

    async def _apply_terminal_selection(self, terminal_key: str) -> None:
        matching_terminal = next(
            (
                terminal
                for terminal in self.terminal_records
                if str(terminal.get("terminal_key") or "").strip() == terminal_key
            ),
            None,
        )

        if matching_terminal:
            project_key = str(matching_terminal.get("project_key") or "").strip()
            if project_key:
                self.query_one("#project-key-input", Input).value = project_key

        self.query_one("#terminal-key-input", Input).value = terminal_key
        self._apply_suggesters()
        await self._refresh_picker_widgets()

    def _current_project_key(self) -> str:
        return self._read_input_value("#project-key-input").strip()

    def _current_browser_key(self) -> str:
        return self._read_input_value("#browser-key-input").strip()

    def _current_terminal_key(self) -> str:
        return self._read_input_value("#terminal-key-input").strip()

    def _current_project_filter(self) -> str:
        return self._read_input_value("#project-filter-input").strip().casefold()

    def _current_browser_filter(self) -> str:
        return self._read_input_value("#browser-filter-input").strip().casefold()

    def _current_terminal_filter(self) -> str:
        return self._read_input_value("#terminal-filter-input").strip().casefold()

    def _read_input_value(self, selector: str) -> str:
        try:
            return self.query_one(selector, Input).value
        except NoMatches:
            return ""

    def _matches_filter(self, filter_text: str, *candidates: Any) -> bool:
        normalized_candidates = [
            str(candidate).casefold()
            for candidate in candidates
            if candidate is not None and str(candidate).strip()
        ]
        return any(filter_text in candidate for candidate in normalized_candidates)

    def _set_action_inputs(self, action_name: str, payload: dict[str, Any]) -> None:
        self.query_one("#action-input", Input).value = action_name
        self.query_one("#payload-editor", TextArea).text = self._format_payload(payload)

        project_key = str(payload.get("project_key") or "").strip()
        browser_key = str(payload.get("browser_key") or "").strip()
        terminal_key = str(payload.get("terminal_key") or "").strip()
        url = str(payload.get("url") or "").strip()
        selector = str(payload.get("selector") or "").strip()
        terminal_text = str(payload.get("text") or "").strip()
        cols = str(payload.get("cols") or "").strip()
        rows = str(payload.get("rows") or "").strip()

        if project_key:
            self.query_one("#project-key-input", Input).value = project_key
        if browser_key:
            self.query_one("#browser-key-input", Input).value = browser_key
        if terminal_key:
            self.query_one("#terminal-key-input", Input).value = terminal_key
        if url:
            self.query_one("#url-input", Input).value = url
        if selector:
            self.query_one("#selector-input", Input).value = selector
        if "value" in payload:
            self.query_one("#fill-value-input", Input).value = str(payload.get("value") or "")
        if terminal_text:
            self.query_one("#terminal-text-input", Input).value = terminal_text
        if cols:
            self.query_one("#terminal-cols-input", Input).value = cols
        if rows:
            self.query_one("#terminal-rows-input", Input).value = rows

    def _render_command_preview(self, action_name: str, payload: dict[str, Any]) -> str:
        parts = ["batcli", "action", "run", "--action", action_name]
        for key, value in payload.items():
            if value is None:
                continue
            parts.extend([f"--{key}", str(value)])
        return " ".join(parts)

    def _parse_payload(self, payload_text: str) -> dict[str, Any]:
        if not payload_text.strip():
            return {}

        loaded = yaml.safe_load(payload_text)
        if loaded is None:
            return {}

        if not isinstance(loaded, dict):
            raise RuntimeError("Payload must be a YAML mapping.")

        return loaded

    def _format_payload(self, payload: dict[str, Any]) -> str:
        if not payload:
            return ""

        return yaml.safe_dump(
            payload,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        )

    def _payload_to_args(self, payload: dict[str, Any]) -> list[str]:
        args: list[str] = []

        for key, value in payload.items():
            if value is None:
                continue

            if isinstance(value, bool):
                args.extend([f"--{key}", "true" if value else "false"])
                continue

            if isinstance(value, (str, int, float)):
                args.extend([f"--{key}", str(value)])
                continue

            raise RuntimeError(
                f"Current Textual host supports flat scalar payloads only. Unsupported key: {key}",
            )

        return args

    def _write_result_log(self, line: str) -> None:
        self.query_one("#result-log", RichLog).write(line)

    def _write_runtime_log(self, line: str) -> None:
        self.query_one("#runtime-log", RichLog).write(line)

    def _write_terminal_log(self, line: str) -> None:
        self.query_one("#terminal-log", RichLog).write(line)

    def _write_runtime_entry(self, entry: dict[str, Any]) -> None:
        created_at = str(entry.get("created_at") or "").replace("T", " ").replace("Z", "")
        level = str(entry.get("level") or "info").upper()
        message = str(entry.get("message") or "")
        log_key = str(entry.get("log_key") or "")
        detail = entry.get("detail") or {}

        header = f"{created_at} [{level}] {message}"
        if log_key:
            header = f"{header} ({log_key})"

        self._write_runtime_log(header)

        if isinstance(detail, dict):
            for key, value in detail.items():
                self._write_runtime_log(f"  {key}: {value}")

        self._write_runtime_log("")

    def _write_terminal_entry(self, entry: dict[str, Any]) -> None:
        created_at = str(entry.get("created_at") or "").replace("T", " ").replace("Z", "")
        stream = str(entry.get("stream") or "system").upper()
        text = str(entry.get("text") or "")
        output_key = str(entry.get("output_key") or "")
        header = f"{created_at} [{stream}]"

        if output_key:
            header = f"{header} ({output_key})"

        self._write_terminal_log(header)
        for line in text.splitlines() or [""]:
            self._write_terminal_log(f"  {line}")
        self._write_terminal_log("")

    def _update_live_logs_button(self) -> None:
        with contextlib.suppress(NoMatches):
            button = self.query_one("#toggle-live-logs", Button)
            button.label = (
                "Live logs: on"
                if self.runtime_log_polling_enabled
                else "Live logs: off"
            )

    def _write_yaml(self, value: Any) -> None:
        rendered = yaml.safe_dump(
            value,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        ).rstrip()
        self.query_one("#result-log", RichLog).write(rendered)


if __name__ == "__main__":
    ClibaseTextualHost().run()
