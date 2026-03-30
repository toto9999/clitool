# CLIBase

`ref/basic_reference`를 기준으로 다시 구성하는 워크스페이스 셸 프로젝트입니다.

현재 루트는 `Vite + React + Mantine` 베이스로 재정비되어 있으며, 이 UI는 장기적으로 Electron 데스크톱 셸 안에서 구동될 렌더러 프로토타입입니다. 제품 방향과 작업 기록은 [doc/README.md](c:\MIDAS\code\clibase\doc\README.md)에 정리합니다.

문서 운영 원칙은 유지합니다. 특히 `batcli workflow start -> to-doc -> to-code` 흐름, `doc/0. Governance/ssot.yaml`, `doc/0. Governance/ddd.md` 선행 갱신 규칙은 이 프로젝트에서도 계속 유효한 기준으로 관리합니다.

## 빠른 시작

```bash
batcli install
batcli dev
batcli tui
```

`Codex` 같은 제한 환경이나 long-running dev 로그를 남기고 싶을 때는 셸 리다이렉트 대신 아래처럼 `batcli` 자체 옵션을 사용합니다.

```bash
batcli dev --log-file .clibase/logs/dev.log
batcli dev --log-file .clibase/logs/dev.log --append-log
```

새 기능을 개발하면서 의존성을 추가할 때도 직접 `npm install` 대신 아래처럼 `batcli` 경유를 기준으로 사용합니다.

```bash
batcli deps add node-pty
batcli deps add some-dev-package --dev
```

배포 빌드는 아래 명령으로 확인합니다.

```bash
batcli build
```

제한된 실행 환경에서 `batcli dev` 경로가 불안정할 때 runtime control endpoint를 확인하려면 아래 smoke 경로를 사용합니다.

```bash
batcli smoke runtime
batcli smoke runtime --timeout-ms 90000
batcli smoke runtime --skip-build
batcli smoke runtime --existing-only
```

`--existing-only`는 이미 떠 있는 Electron 런타임의 control endpoint만 검사할 때 사용합니다.

문서, 타입, 빌드를 한 번에 검증하려면 아래 명령을 사용합니다.

```bash
batcli verify
```

실행 중인 Electron 앱에 첫 runtime action을 보내려면 아래처럼 사용합니다.

```bash
batcli action run --action app.ping
batcli action run --action app.logs.tail --limit 20
batcli action run --action workspace.get-state
batcli action run --action project.open --project_key proj-clibase-main
batcli action run --action project.switch --project_key proj-clibase-lab
batcli action run --action tab.activate --tab_key tab-review-02
batcli action run --action tab.next
batcli action run --action tab.detach --tab_key tab-review-02
batcli action run --action tab.redock --tab_key tab-review-02
batcli action run --action tab.reorder --tab_order tab-review-02,tab-workbench-01
batcli action run --action layout.window-state.update --shell_split_ratio 0.62
batcli action run --action layout.window-state.update --window_key window-proj-clibase-main-main --shell_stack_split_ratio 0.32
batcli action run --action layout.window-state.update --browser_dock_position right

UI drag flow:
- Drag a detached tab into the main redock zone and drop on `Center`, `Left`, `Right`, `Top`, or `Bottom`.
- `Center` keeps current browser edge. Edge targets redock the tab and apply that browser dock position.
batcli action run --action browser.get-state
batcli action run --action browser.navigate --url https://example.com
batcli action run --action browser.navigate.back
batcli action run --action browser.navigate.forward
batcli action run --action browser.navigate.reload
batcli action run --action browser.automation.click --selector a
batcli action run --action browser.automation.fill --selector "#query" --value "clibase"
batcli action run --action browser.automation.extract-text --selector main
batcli action run --action browser.capture-screenshot --output .clibase/artifacts/screenshots/current.png
batcli action run --action terminal.create --terminal_key term-shell-main-01
batcli action run --action terminal.write --terminal_key term-shell-main-01 --text "Get-Location"
batcli action run --action terminal.resize --terminal_key term-shell-main-01 --cols 120 --rows 32
batcli action run --action terminal.logs.tail --terminal_key term-shell-main-01 --limit 20
batcli action run --action terminal.kill --terminal_key term-shell-main-01
```

Textual 기반 interactive Global CLI host는 아래처럼 실행합니다.

```bash
batcli tui
```

현재 `batcli tui`에서 바로 제공하는 건 `workspace sync`, `project.open`, `project.switch`, `tab.activate`, `tab.next`, `browser.get-state`, `browser.navigate`, `browser.navigate.back`, `browser.navigate.forward`, `browser.navigate.reload`, `browser.automation.click`, `browser.automation.fill`, `browser.automation.extract-text`, `terminal.create`, `terminal.write`, `terminal.resize`, `terminal.kill`, `terminal.logs.tail`, `terminal.get-state`, `app.logs.tail` quick action과 project/browser/terminal key autocomplete, filterable quick picker, structured runtime log panel, terminal output panel, live runtime log polling toggle입니다. 레이아웃 관련 stable action은 같은 action catalog에 이미 들어가 있으므로, 필요 시 compose pane에서 `layout.window-state.update`를 바로 호출할 수 있습니다.

현재 Electron 앱 자체도 최소 workbench 형태로 올라와 있습니다.

- 오른쪽: Electron host-owned browser surface
- 왼쪽: renderer-side in-app xterm terminal surface
- 둘 다 같은 `batcli` 중심 runtime/PTY/browser 계약을 공유합니다

문서 강제 흐름은 아래처럼 사용할 수 있습니다.

```bash
batcli workflow start "project shell update"
batcli docs validate
batcli workflow to-code
batcli workflow status
batcli docs touch "updated shell planning docs"
batcli workflow stop
```

전역 명령으로 쓰려면 `npm link` 후 `batcli ...` 형태로 실행할 수 있습니다.

호환용으로 `npm run dev/build/typecheck/verify` alias가 있어도 운영 계약은 `batcli` 기준입니다. 즉 실제 사용 경로는 `batcli ...`를 기본으로 고정합니다.

아직 글로벌 `batcli`가 없는 초기 clone에서는 repo 루트에서 `.\batcli install`로 bootstrap 한 뒤, 이후부터 plain `batcli ...`를 사용합니다. `batcli install`은 의존성 설치 후 `npm link`까지 수행해 글로벌 명령을 연결합니다.

## 기준 경로

- 실행 기준 앱: `./src`
- 초기 durable workspace: `./workspace`
- 참고 레퍼런스: `./ref/basic_reference`
- 기획/설계 문서: `./doc`
- SSOT 기준: `./doc/0. Governance/ssot.yaml`
- DDD 기준: `./doc/0. Governance/ddd.md`
