# Central Architecture

## 목적

이 문서는 `clibase` 전체 아키텍처를 한 곳에서 중앙화해 관리하는 마스터 문서다.

- 제품 정체성
- 주요 계층
- 제어 흐름
- 저장 구조
- 런타임 서비스
- 외부 노출 구조
- 보안 경계

가 이 문서에서 한 번에 이해되어야 한다.

세부 계약은 다른 문서로 분리할 수 있지만, 전체 구조 변경이 생기면 이 문서를 먼저 갱신해야 한다.

## 이 문서의 사용 목적

이 문서는 단순 개념 문서가 아니다.

- 새 AI 세션이 빠르게 코드베이스를 파악하는 부트스트랩 문서
- 사람 개발자가 현재 구현 상태와 목표 구조를 동시에 이해하는 기준 문서
- 구조 변경 시 가장 먼저 갱신해야 하는 중앙 문서

즉 이 문서 하나만 읽어도

- 지금 코드가 어디에 있는지
- 어떤 파일이 무엇을 담당하는지
- 현재 구현 상태가 어디까지인지
- 목표 구조가 어디로 가는지
- 어떤 흐름으로 코드를 읽어야 하는지

를 빠르게 파악할 수 있어야 한다.

## 제품 아키텍처 한 줄 요약

`clibase`는 글로벌 CLI를 기준 제어면으로 삼고, 프로젝트 CLI, GUI, AI, Skill, MCP가 같은 control plane과 같은 계약을 통해 프로젝트를 제어하는 Electron 기반 automation workbench다.

## 아키텍처 북극성

- 제어는 분산되지 않고 `Global CLI Base`를 중심으로 모인다.
- 프로젝트는 저장 단위이자 실행 단위이자 자동화 단위다.
- GUI와 AI는 별도 특권 시스템이 아니라 같은 action/CLI 계층의 다른 surface다.
- 새 기능은 중앙 제어 계약에 연결되어야만 제품 기능으로 간주된다.
- 전체 시스템은 하나의 문서에서 설명 가능해야 한다.

## 계층 구조

### 1. Product Direction Layer

- `14-product-direction.md`
- `16-project-operating-model.md`
- `15-core-user-scenarios.md`

역할:
- 제품의 정체성
- 주 사용자
- 운영 방식
- 대표 사용 시나리오

### 2. Governance Layer

- `ssot.yaml`
- `ddd.md`
- `workflow-rules.md`

역할:
- 용어 고정
- 필수 문서 범위
- 문서 우선 개발 강제

### 3. Architecture Layer

- `17-central-architecture.md`

역할:
- 전체 아키텍처를 중앙화된 한 문서로 유지
- 세부 플랫폼 문서들의 관계와 경계를 요약

### 4. Platform Contract Layer

- `04-runtime-platform-plan.md`
- `05-system-contracts.yaml`
- `06-module-sdk.yaml`
- `07-control-plane-and-observability.yaml`
- `08-external-module-runtime.yaml`
- `09-ai-usable-module-manifest.yaml`
- `10-browser-terminal-and-ide-foundation.yaml`
- `11-auth-provider-templates.yaml`
- `12-browser-automation-and-playwright-mcp.yaml`
- `13-channel-domain-and-port-routing.yaml`
- `18-global-cli-textual-foundation.yaml`
- `19-performance-and-optimization-policy.yaml`
- `20-secret-and-credential-management.yaml`
- `21-permission-and-policy-matrix.yaml`
- `22-build-packaging-and-update.yaml`
- `23-verification-and-release-gates.yaml`
- `24-trust-and-package-source-policy.yaml`
- `25-project-aware-layout-and-windowing.yaml`
- `26-interaction-and-docking-foundation.yaml`
- `27-ui-engineering-governance.yaml`
- `28-desktop-uia-macro-verification.yaml`

역할:
- 저장/통신/실행/보안/관찰/라우팅/레이아웃-상호작용 품질 계약

## 현재 코드베이스 스냅샷

현재 루트는 `Electron Main + Preload + Vite React Renderer + local runtime action skeleton` 이 구현된 상태다.

- 현재 실제 실행 구조: `Electron desktop shell skeleton + Vite renderer`
- 목표 실행 구조: `Electron Main + Preload + React Renderer`
- 현재 코드의 핵심 목적: 문서 강제 시스템 유지, `batcli` 중심 개발 진입점 확보, Electron host 최소 골격과 첫 runtime action 경로 확보, 그리고 terminal/runtime/project switch 핵심 제어면을 `batcli`로 끌어올리는 것

## 현재 실제 코드 트리

```text
clibase/                                  # 현재 프로젝트 루트
  AGENTS.md                               # 에이전트 작업용 짧은 맵(하네스/검증/문서 진입점)
  bin/                                    # 로컬 CLI와 문서 workflow 도구
    batcli.js                             # workflow와 install/dev/build/typecheck/verify를 수행하는 Global CLI 엔트리 (Windows에서 batcli install 시 .clibase/python/uia-executor venv, .clibase/dotnet .NET shared runtime, 그리고 선택적 vendor/uia-peek/UiaPeek.exe batcli uia-peek download까지; --no-uia-peek로 생략)
  batcli.cmd                              # Windows repo-root bootstrap wrapper
  batcli.ps1                              # PowerShell repo-root bootstrap wrapper
  cli-host/                               # Global CLI의 interactive host 구현
    textual/                              # Python Textual 기반 TUI host
      app.py                              # batcli action catalog를 사용하는 첫 Textual shell과 live runtime log/quick picker surface
      requirements.txt                    # Textual host Python dependency seed
    uia-executor/                         # Windows UIA 매크로 스텝 실행기 (pywinauto; flaui.* 스텝)
      run_step.py                         # stdin JSON 한 건 → PID 기준 UIA 액션
      requirements.txt                    # pywinauto 등
  doc/                                    # 중앙화된 제품/아키텍처/계약 문서
    0. Governance/                        # SSOT, DDD, workflow 강제 규칙
    1. Strategy/                          # 제품 방향, 운영 모델, 로드맵
    2. Product/                           # IA, 사용자 시나리오, 레퍼런스 해석
    3. Platform/                          # 런타임/저장/통신/보안/라우팅 계약
    9. Worklog/                           # 세션 작업 로그
  electron/                               # 데스크톱 셸 진입 코드
    host-services/                        # host-owned runtime service skeleton
      browser/                            # embedded browser surface와 초기 automation backend
        browser-surface.cts               # WebContentsView child surface, navigate/get-state/click 구현과 per-window browser dock bounds 해석
      terminal/                           # host-owned terminal session runtime
        terminal-service.cts              # terminal.create/write/resize/kill/logs.tail와 terminal output ring 관리
      uia-macro/                          # external EXE verification target + UIA macro runtime
        uia-macro-service.cts             # uia.target/uia.macro save-list-run과 YAML macro 저장소 관리
        uiapeek-resolve.cts               # UiaPeek CLI·HTTP 호스트(UiaPeek.exe) 경로 해석
        uiapeek-runtime-download.cts      # GitHub 릴리스에서 UiaPeek.exe를 userData로 내려받기·vendor 경로
        uiapeek-http-launcher.cts         # 녹화 시작 전 localhost:9955 ping 실패 시 UiaPeek.exe 기동
        uiapeek-recording-bridge.cts      # UiaPeek SignalR hub: StartRecordingSession / ReceiveRecordingEvent
        windows-host-window-constraint.cts # Windows: PID tree + HWND lock via WM_GETMINMAXINFO subclass
      runtime-registry/                   # project/tab/module ownership과 live surface registry
        runtime-registry.cts              # workspace 모듈 메타데이터와 attached browser/terminal target을 연결
      runtime-control/                    # local runtime action transport and host log skeleton
        runtime-control-server.cts        # batcli action run 요청을 받아 host action으로 실행
        durable-log-store.cts             # workspace/logs action/event/audit yaml bucket writer
        runtime-logging.cts               # bounded in-memory runtime log와 readable log key 생성
      workspace/                          # durable workspace yaml bootstrap과 load
        workspace-store.cts               # workspace/와 workspace-state/를 bootstrap/load하고 active project, browser, terminal, window placement 구성을 해석
    main/                                 # Electron main process
      main.cts                            # BrowserWindow 생성과 dev/prod renderer 로드
    preload/                              # 안전한 renderer bridge
      preload.cts                         # 최소 clibaseDesktop bridge 노출
  shared/                                 # cli와 runtime host가 함께 쓰는 로컬 계약
    runtime-control.cjs                   # local named pipe/socket endpoint 계산
  scripts/                                # 실행 bootstrap 보조 스크립트
    ensure-uiapeek.mjs                    # batcli uia-peek download: g4-api/uia-peek 릴리스 zip에서 UiaPeek.exe를 vendor/uia-peek/에 복사
    ensure-dotnet-aspnetcore-runtime.mjs # batcli install / batcli uia-peek install-runtime: UiaPeek용 .NET 8 AspNetCore+WindowsDesktop shared runtime을 .clibase/dotnet 아래로 보장
    uia-peek-http-ping.mjs                # batcli uia-peek ping: localhost 허브 GET /api/v4/g4/ping (Electron과 동일 프로브)
    run-electron-dev.cjs                  # renderer dev server와 fresh electron build 산출물을 기다린 뒤 desktop shell을 실행
    launch-electron-dev.cjs               # Codex/Windows 환경에서 Electron Node 모드 shadowing을 제거하고 desktop shell 실행
  src/                                    # 현재 실제 최소 렌더러 부트스트랩 코드
    main.tsx                              # React 렌더러 진입점
    vite-env.d.ts                         # Vite와 preload bridge 타입 선언
    app/                                  # 앱 루트 코드
      App.tsx                             # IDE형 top tab strip, previous/next tab cycling, explicit redock and append drop targets, edge-based redock drop target grid, persisted split shell plus nested shell-stack split, browser dock target controls, left-side Verification tab(상단 EXE/UIA macro/UiaPeek SignalR recording + 하단 PTY terminal), browser lane, and in-app xterm terminal surface
    styles/                               # 최소 전역 스타일
      index.css                           # workbench shell, status cards, and xterm terminal surface 스타일
  ref/                                    # 비교 기준과 업스트림 CLI 레퍼런스 보관소
    basic_reference/                      # 현재 UI 재구성의 기준 레퍼런스
  workspace/                              # 초기 durable workspace yaml 시드
    app.yaml                              # global cli 기본값
    cli-profiles.yaml                     # reusable cli profiles
    browser-seeds.yaml                    # seed:// 별칭과 브라우저 seed 페이지 매핑 레지스트리
    module-catalog.yaml                   # built-in module catalog seed
    projects-index.yaml                   # 프로젝트 목록과 기본 진입 프로젝트
    projects/                             # 프로젝트별 yaml 저장
    logs/                                 # action/event/audit yaml bucket 저장소
  package.json                            # npm 스크립트와 의존성 정의
  tsconfig.electron.json                  # Electron main/preload compile 경계
  vite.config.ts                          # Vite 설정
  tsconfig.json                           # TypeScript 설정
  README.md                               # 루트 프로젝트 안내
```

위 트리는 현재 실제로 의미 있게 사용하는 코드 파일 기준이다. 이전 프로토타입에서 남은 빈 디렉터리가 일부 디스크에 남아 있더라도, 활성 코드 구조는 위 목록을 기준으로 본다.

## 하네스 엔지니어링 준수 상태 (2026-03-30)

- 녹색:
  - 문서 우선 phase 게이트(`batcli workflow` + `docs validate`)가 실제 CLI에 연결되어 있다.
  - `batcli` 중심 제어면과 runtime action 경로(`app/browser/terminal/workspace`)가 동작한다.
  - smoke/runtime 확인 경로와 worklog 기록 규칙이 존재한다.
- 황색:
  - 시나리오 기반 E2E harness(탭/브라우저/터미널 복합 플로우)의 자동 회귀 범위는 아직 제한적이다.
  - 에이전트 작업 진입점 문서는 이제 `AGENTS.md`를 기준으로 시작했으며, 앞으로 검증 자동화 커버리지와 함께 계속 강화해야 한다.

## 현재 코드 파일 책임 맵

### 런타임/부트스트랩

- `package.json`
  - 현재 실행 스크립트와 `batcli` bin 등록
  - `dev/build/typecheck/verify`가 `batcli`를 통해 들어오도록 고정
  - Electron compile과 renderer build 스크립트 포함
- `bin/batcli.js`
  - 현재 `batcli` executable의 구현
  - 현재는 workflow/docs 기능, install/dev/build/typecheck/verify, smoke runtime, smoke verification, action run 진입점이 들어간 상태
  - `batcli dev --log-file ...`로 long-running dev output을 batcli-managed file sink로 남길 수 있다
  - `batcli smoke runtime`은 제한 환경에서 `dev` 체인(vite/concurrently) 없이 dist renderer 기반 Electron을 올리고 `app.ping`으로 runtime control endpoint readiness를 확인한다
  - `batcli smoke runtime --existing-only`는 이미 실행 중인 endpoint만 검증하는 모드다
  - `batcli smoke verification`(Windows)은 **진입 시** `ensureUiaExecutorInstalled`·`ensureUiaPeekVendorInstalled` 후 `app.ping`이 없으면 `dist` 빌드(필요 시)와 **detached** Electron 기동으로 런타임을 맞춘다. 이후 기본 흐름은 `uia.target.launch` → `uia.recording.start/stop` → `uia.recording.session.save_macro` → `uia.macro.run` → 정리다. `--static-only`면 YAML 스텝만 저장/실행한다. `--cli-auto`는 `tools/uia-recording-test-host/app.py`(Tkinter)를 타깃으로 등록하고 녹화 중 FlaUI로 `Name:Recording test click` 클릭을 주입한다. 구현은 `scripts/uia-verification-smoke.mjs`와 `bin/batcli.js`의 `ensureVerificationRuntimeBootstrap`이다
  - product dependency add/update도 `batcli deps add ...`로 끌어올리는 기준 진입점
  - 장기적으로 Global CLI product command entrypoint로 확장될 대상
  - install
  - deps add
  - dev
  - smoke runtime
  - smoke verification
  - build
  - typecheck
  - verify
    - `batcli verify`는 **repo_static** 게이트(문서·타입체크·빌드 등)에 해당한다. VM·인터랙티브 화면·GenNX 실제 기동은 **gennx_guest_runtime** 티어로 별도 정의한다(`23-verification-and-release-gates.yaml`의 `verification_tiers`). VM 랩: Hyper-V 호스트에서 `batcli vm gennx verify-guest`(WinRM으로 게스트에서 `batcli uia gennx verify` 실행). 단일 세션: `batcli uia gennx verify`(`scripts/gennx-runtime-verify.mjs`).
  - action run
  - workflow start/to-doc/to-code/status/stop
  - docs validate/touch
- `batcli.cmd`, `batcli.ps1`
  - 초기 clone에서 repo 루트에서 batcli bootstrap을 가능하게 하는 wrapper
  - `batcli install` 이후 global link가 잡히면 plain `batcli` 사용을 기준으로 함
- `cli-host/textual/app.py`
  - `batcli tui`로 실행되는 첫 Textual interactive host
  - action name input, multiline YAML payload compose, project/browser context input, quick action 버튼, result pane, structured runtime log pane 제공
  - manual tail과 live polling toggle을 통한 runtime log 관찰 제공
  - workspace 기반 project/browser quick picker와 project/browser key autocomplete 제공
  - project/browser quick picker search and filter input 제공
  - browser.get-state, browser.navigate, browser.navigate.back, browser.navigate.forward, browser.navigate.reload, browser.automation.click, browser.automation.fill, browser.automation.extract-text quick action 제공
  - 내부적으로 같은 `batcli action run` action catalog를 사용
- `shared/runtime-control.cjs`
  - batcli와 electron host가 같은 local control endpoint를 계산
- `electron/host-services/workspace/workspace-store.cts`
  - `workspace/`와 `workspace-state/` 루트를 해석하고 부족한 yaml을 bootstrap
  - `workspace/browser-seeds.yaml`에서 seed:// 별칭을 읽어 브라우저 home_url을 사람이 읽기 쉬운 ref 기반으로 해석
  - active project, active tab, browser module, terminal module 메타데이터를 load
  - project.open/project.switch를 위한 runtime-index mutation과 snapshot reload를 담당
  - per-window `display_key`, `bounds`, `layout_state`를 narrow mutation path로 갱신
- `electron/host-services/runtime-registry/runtime-registry.cts`
  - workspace에서 읽은 project/tab/module ownership과 live browser/terminal target을 연결
  - registry-backed `browser.get-state`, `browser.navigate`, `browser.navigate.back`, `browser.navigate.forward`, `browser.navigate.reload`, `browser.automation.click`, `browser.automation.fill`, `browser.automation.extract-text`, `terminal.get-state` 해석 제공
- `electron/host-services/browser/browser-surface.cts`
  - main window 안의 `WebContentsView` child surface 생성
  - registry가 지정한 `browser_key`와 initial url을 기준으로 surface 생성
  - `browser.get-state`, `browser.navigate`, `browser.navigate.back`, `browser.navigate.forward`, `browser.navigate.reload`, `browser.automation.click`, `browser.automation.fill`, `browser.automation.extract-text`의 첫 backend 제공
- `electron/host-services/terminal/terminal-service.cts`
  - host-owned terminal session runtime
  - 현재는 `node-pty` 기반 PTY 세션 backend를 사용
  - `terminal.create`, `terminal.write`, `terminal.resize`, `terminal.kill`, `terminal.logs.tail`, `terminal.get-state`의 첫 backend 제공
- `electron/host-services/uia-macro/uia-macro-service.cts`
  - local EXE verification target launcher와 UIA 매크로 단계 실행 경로를 제공
  - 제품 방향: 안정적 재실행·실행 엔진의 중심은 FlaUI 계열; UiaPeek은 Peek/Record·셀렉터 확인용 보조 도구 (`28-desktop-uia-macro-verification.yaml`의 desktop_uia_tooling_roles)
  - `flaui.*` 스텝은 리포 루트 기준 `cli-host/uia-executor/run_step.py`(pywinauto UIA)로 실행; `uiapeek.*` 스텝은 비어 있는 `executable_path`일 때 환경·PATH·일반 설치 경로로 UiaPeek CLI를 해석해 실행. 저장된 `uia_adapter.executable_path`·`CLIBASE_UIAPEEK_EXE`가 우선. Python은 `CLIBASE_PYTHON`·`python_executable`·리포 루트 `.clibase/python/uia-executor/Scripts/python.exe`(존재 시)·`python` 순
  - `workspace/uia-macros.yaml` 기반 target/macro 저장, 조회, 실행 결과를 관리
  - target별 `host_reference_frame`(기준 width/height, coordinate_space, placement_mode)로 녹화·재생 좌표 정규화 틀을 저장
  - `uia.target.*`, `uia.macro.*` 제어면의 첫 backend 제공
- `electron/host-services/uia-macro/uiapeek-recording-bridge.cts`
  - UiaPeek SignalR hub에 연결하고 `ReceiveRecordingEvent`를 메인 프로세스에서 버퍼링·브로드캐스트
  - `uia.recording.start` / `uia.recording.stop` / `uia.recording.state`와 preload `startUiaRecording` 등이 동일 브리지를 사용
- `electron/host-services/runtime-control/runtime-control-server.cts`
  - local named pipe/socket server를 열어 batcli action run을 수신
  - app.ping, app.logs.tail, workspace.get-state, project.open, project.switch, browser.get-state, browser.navigate, browser.navigate.back, browser.navigate.forward, browser.navigate.reload, browser.automation.click, browser.automation.fill, browser.automation.extract-text, browser.capture-screenshot, terminal.create, terminal.write, terminal.resize, terminal.kill, terminal.logs.tail, terminal.get-state, uia.registry.get, uia.adapter.update, uia.target.save, uia.target.launch, uia.target.stop, uia.target.state, uia.macro.save, uia.macro.list, uia.macro.delete, uia.macro.run, uia.recording.start, uia.recording.stop, uia.recording.state을 host action으로 실행
- `electron/host-services/runtime-control/durable-log-store.cts`
  - `workspace/logs/actions`, `workspace/logs/events`, `workspace/logs/audit` 아래 append-only yaml bucket을 관리
  - readable action/event/audit key 생성과 버킷 rotation을 담당
- `electron/host-services/runtime-control/runtime-logging.cts`
  - host runtime log를 메모리에 유지
  - app.logs.tail 응답의 데이터 원본 역할
- `electron/main/main.cts`
  - Electron BrowserWindow 생성
  - dev server 또는 built renderer 로드
  - preload 연결과 workspace/terminal IPC handler 등록
  - workspace store, runtime registry, local runtime control server, embedded browser surface bootstrapping
  - detached window placement를 same-display 우선, nearest-display fallback으로 normalize
- `electron/preload/preload.cts`
  - `clibaseDesktop` bridge 노출
  - renderer가 main process ping, workspace state, terminal create/write/resize/log tail, terminal stream subscription에 접근하게 함
- `scripts/launch-electron-dev.cjs`
  - `ELECTRON_RUN_AS_NODE`가 잡힌 환경에서도 Electron binary를 앱 모드로 실행
  - `batcli dev` 경로의 Electron launch를 안정화
- `scripts/run-electron-dev.cjs`
  - renderer port와 fresh `dist-electron` 산출물을 함께 기다린 뒤 Electron을 띄운다
  - stale build를 보고 예전 main/preload로 부팅되는 dev race를 막는다
- `src/main.tsx`
  - React 렌더러 진입점
  - `App` 마운트와 xterm css 로드

### 앱 루트

- `src/app/App.tsx`
  - Electron preload bridge 연결 상태 표시
  - workspace summary와 active browser/terminal target 표시
  - IDE형 top tab strip, detached tab redock zone, bottom next-tab flow의 첫 foundation 제공
  - previous/next tab keyboard cycling, explicit strip append drop slot, detached-window return CTA 제공
  - persisted shell split ratio를 따르는 workbench shell과 host browser lane을 렌더
  - split handle double-click reset을 통해 documented default ratio 복원
  - renderer-side in-app xterm terminal surface를 통해 PTY output과 입력을 연결
  - renderer-only preview와 desktop shell connected 상태를 구분

### 스타일

- `src/styles/index.css`
  - 최소 전역 reset과 재시작 상태 화면 스타일

## 현재 구현 상태와 목표 구조의 차이

### 현재 실제 구현

- 문서 우선 workflow 강제
- batcli 중심 install/dev/build/typecheck/verify 진입점
- batcli tui Textual host skeleton
- workspace 기반 project/browser quick picker
- workspace 기반 terminal quick picker
- workspace 기반 project/browser search and filter picker
- workspace 기반 terminal search and filter picker
- project_key / browser_key / terminal_key autocomplete
- project open/switch action
- tab.activate / tab.next action
- tab.previous action
- tab.detach / tab.redock / tab.reorder action
- keyboard-driven previous/next tab cycling
- explicit strip append drop slot and detached-window return action
- batcli tui navigate/click quick actions
- batcli tui fill/extract quick actions
- batcli tui terminal create/write/resize/kill/tail quick actions
- batcli tui structured runtime log panel
- batcli tui terminal output panel
- batcli tui live runtime log polling toggle
- browser back/forward/reload actions
- preload terminal bridge
- renderer-side in-app xterm terminal surface
- workspace-aware terminal session summary inside the Electron renderer
- renderer-side top tab strip, explicit redock overlay, and next-tab navigation foundation
- persisted per-window shell split ratio with host browser bounds synchronization
- batcli layout.window-state.update action
- batcli action run skeleton
- deterministic Vite dev port 고정
- Electron main/preload skeleton
- `workspace/` durable yaml seed
- workspace bootstrap/load
- runtime registry
- embedded `WebContentsView` browser surface
- workspace.get-state
- active project tab summaries in workspace state
- browser.get-state / browser.navigate / browser.automation.click
- terminal.create / terminal.write / terminal.resize / terminal.kill / terminal.logs.tail / terminal.get-state
- uia.registry.get / uia.adapter.update / uia.target.save / uia.target.launch / uia.target.stop / uia.target.state / uia.macro.save / uia.macro.list / uia.macro.delete / uia.macro.run / uia.recording.start / uia.recording.stop / uia.recording.state
- durable yaml action/event/audit log bucket append
- local runtime control server
- bounded in-memory host runtime log
- Vite + React renderer skeleton
- preload ping bridge 상태 화면
- 이전 mock 라우트와 프로토타입 UI 제거

### 아직 미구현

- 실제 Project persistence loader/writer
- Control Plane dispatcher
- Module Bus
- Project management/editor/workspace renderer
- 다중 WebContentsView browser module 관리
- project-aware layout/module canvas
- advanced detachable tab window manager and richer dock targets
- External runtime runner
- Skill/MCP bridge

### 해석 규칙

- `src/`는 현재 UI prototype tree
- `electron/`은 현재 desktop shell skeleton tree
- `doc/3. Platform/*`은 목표 시스템 contract tree
- 새 세션의 AI는 현재 코드와 목표 계약을 동시에 봐야 한다

## 현재 코드 읽기 순서

새 세션에서 가장 빠르게 파악하려면 아래 순서로 읽는다.

1. `doc/3. Platform/17-central-architecture.md`
2. `package.json`
3. `bin/batcli.js`
4. `cli-host/textual/app.py`
5. `shared/runtime-control.cjs`
6. `electron/host-services/workspace/workspace-store.cts`
7. `electron/host-services/runtime-registry/runtime-registry.cts`
8. `electron/host-services/browser/browser-surface.cts`
9. `electron/host-services/terminal/terminal-service.cts`
10. `electron/host-services/runtime-control/durable-log-store.cts`
11. `electron/host-services/runtime-control/runtime-control-server.cts`
12. `electron/host-services/runtime-control/runtime-logging.cts`
13. `electron/main/main.cts`
14. `electron/preload/preload.cts`
15. `scripts/run-electron-dev.cjs`
16. `scripts/launch-electron-dev.cjs`
17. `src/main.tsx`
18. `src/app/App.tsx`
19. `src/styles/index.css`
19. 그 다음 필요한 세부 계약 문서

## 현재 코드 플로우

### 현재 실제 UI 부트 플로우

```text
desktop shell
  -> electron/main/main.cts
    -> browser-surface child view
    -> preload bridge
      -> src/main.tsx
        -> App.tsx
          -> electron status skeleton
```

### 현재 실제 runtime action 플로우

```text
batcli action run
  -> shared/runtime-control.cjs
    -> local named pipe or socket
      -> runtime-control-server
  -> host action executor
          -> app.ping / app.logs.tail / workspace.get-state / project.open / project.switch / tab.activate / tab.next / tab.previous / tab.detach / tab.redock / tab.reorder / layout.window-state.update / browser.get-state / browser.navigate / browser.navigate.back / browser.navigate.forward / browser.navigate.reload / browser.automation.click / browser.automation.fill / browser.automation.extract-text / browser.capture-screenshot / terminal.create / terminal.write / terminal.resize / terminal.kill / terminal.logs.tail / terminal.get-state / uia.registry.get / uia.adapter.update / uia.target.save / uia.target.launch / uia.target.stop / uia.target.state / uia.macro.save / uia.macro.list / uia.macro.delete / uia.macro.run / uia.recording.start / uia.recording.stop / uia.recording.state
  -> durable action/event/audit yaml bucket append
```

### 현재 실제 문서 workflow 플로우

```text
developer or ai
  -> batcli workflow start
  -> batcli workflow to-doc
  -> update docs
  -> batcli docs validate
  -> batcli workflow to-code
  -> implement code
  -> batcli docs touch
  -> batcli workflow stop
```

## 목표 코드 구조

현재는 구현 전이므로 아래는 목표 구조다.

```text
clibase/
  electron/
    main/
    preload/
    host-services/
      browser/
      terminal/
      control-plane/
      external-runtime/
      routing/
  cli-host/
    textual/
      app/
      widgets/
      services/
  src/
    renderer/
      app/
      modules/
      panels/
      pages/
      state/
  ref/
    basic_reference/
    cli/
    analysis/
    examples/
  workspace/
  workspace-state/
```

## 목표 런타임 플로우

```text
Global CLI / Project CLI / GUI / AI / Skill / MCP
  -> Control Plane
    -> policy + scope + effective CLI resolution
    -> Runtime Host / Module Adapter / MCP Bridge / Skill Runner / External Runtime
      -> Browser / Terminal / Project services
        -> ActionLog / EventLog / AuditLog
```

## 목표 브라우저/터미널 제어 플로우

```text
terminal command or gui action or ai action
  -> project cli action
    -> control plane
      -> browser automation executor or terminal executor
        -> visible browser surface / pty session
          -> normalized logs
```

## AI 세션 부트스트랩 규칙

새 세션의 AI는 다음을 항상 구분해야 한다.

### 1. 실제 코드와 목표 계약을 구분한다

- `src/`는 현재 구현
- `electron/`은 현재 desktop shell 구현
- `doc/3. Platform/*`은 목표 계약

### 2. 현재 없는 것을 있다고 가정하지 않는다

- Electron host 최소 skeleton은 코드에 있다
- module bus도 아직 없다
- 현재 terminal runtime core는 `node-pty` 기반 PTY backend를 가지며, renderer-side in-app xterm surface도 연결돼 있다
- workspace bootstrap/load와 runtime registry는 있으나 durable browser session persistence, full control plane dispatch, full CDP bridge는 아직 없다
- 현재 renderer에는 초기 workbench UI와 in-app terminal surface가 있으나, 최종 project-aware workspace canvas는 아직 없다
- initial Textual 기반 Global CLI host는 있으나 attachment ingestion, project cli derivation, session tabs, full TUI workflow는 아직 없다
- runtime action subset은 있으나 full control plane과 module bus는 아직 없다
- browser surface는 host-owned child view이며 current screenshot path does not yet capture that child view together with the renderer perfectly

### 3. 새 기능을 넣을 때 먼저 확인할 것

- 이 기능이 global cli / project cli로 제어되는가
- 이 기능이 control plane action으로 투영되는가
- 이 기능이 현재 코드에서는 어느 파일에 surface를 가져야 하는가
- 이 기능의 목표 런타임 위치는 renderer인지 host인지

## 이 문서가 반드시 최신이어야 하는 항목

- 현재 실제 코드 트리
- 핵심 파일 책임
- 현재 구현 상태 vs 목표 구조
- 현재 UI 플로우와 목표 런타임 플로우
- 새 세션 AI의 읽기 순서

이 중 하나라도 바뀌면 이 문서를 먼저 갱신한다.

## 핵심 엔티티와 책임

### Global CLI Base

- 전체 제품의 기준 제어면
- 모든 안정된 기능은 여기에 투영 가능해야 한다
- 프로젝트별 CLI 파생의 기준이 된다
- 공식 실행 namespace는 `batcli`다
- 현재 코드 기준으로 install/dev/build/typecheck/verify도 이 진입점을 통한다
- 현재 코드 기준으로 첫 host action subset도 이 진입점을 통한다

### Project

- 최상위 운영 단위
- 설정, 실행, 자동화, 관찰, 라우팅이 한곳에 모인다

### Project CLI Context

- 글로벌 CLI에서 파생된 프로젝트별 effective CLI
- 프로젝트마다 다른 env, auth, attachment, channel, runtime을 반영한다

### Control Plane

- GUI, Global CLI, Project CLI, Skill, MCP, AI가 공통 action으로 들어오는 상위 제어 계층
- 정책 평가, 라우팅, 로그 기록의 중심

### Runtime Host

- Electron Main + Preload 기반 데스크톱 셸
- 브라우저/터미널/IPC/보안 경계를 소유한다

### Module System

- Browser, Terminal, PDF, AI Assistant, 외부 런타임 모듈 등
- 공통 카탈로그와 SDK 계약으로 관리된다

## 제어 흐름

### 표준 흐름

1. 사용자는 Global CLI, Project CLI, GUI, 터미널, Skill, MCP, AI 중 하나에서 action을 시작한다.
2. 모든 요청은 `Control Plane`으로 들어간다.
3. `Control Plane`은 policy, scope, effective CLI, attachment, target을 해석한다.
4. 요청은 `Runtime Host`, `Module Adapter`, `Skill Runner`, `MCP Bridge`, `External Runtime` 중 적절한 실행 계층으로 전달된다.
5. 결과는 `ActionLog`, `EventLog`, `AuditLog`에 남는다.
6. GUI와 AI는 같은 결과를 관찰하고 다음 동작을 이어간다.

### 중요한 원칙

- GUI는 direct call을 하지 않는다.
- AI는 hidden API를 쓰지 않는다.
- 터미널도 raw shell shortcut이 아니라 stable action으로 들어와야 한다.

## 런타임 구조

### Desktop Shell

- Host: Electron
- Renderer: React + Vite
- Browser Surface: WebContentsView
- Browser Surface Mount Rule: renderer declares the visible host slot and Electron mounts the `WebContentsView` into that exact slot so browser chrome does not get hidden behind the native view
- Terminal: xterm.js + node-pty

### Global CLI UX

- Authoritative interactive Global CLI host: Textual
- Authoritative executable namespace: `batcli`
- Current `batcli` implementation includes a Node.js bootstrap/runtime shell and an initial `batcli tui` Textual host skeleton
- Current renderer has no separate CLI panel; `src/app/App.tsx` now shows an initial workbench shell with a top tab strip, explicit redock zone, persisted split shell, workspace summary, and an in-app xterm terminal surface
- Key UX requirements:
  - multiline compose
  - safe large paste
  - link normalization
  - image and notebook attachment ingestion
  - `ref/`에 둔 reference CLI를 분석하고 제품 코드를 별도로 구현하는 흐름

### Optimization Baseline

- Renderer state uses normalized structures and structural sharing
- Raw browser, terminal, and log streams are projected behind backpressure gates before reaching UI state
- Caches require explicit invalidation and bounded ownership
- Measured hotspots are optimized first; blanket memoization is not the default strategy

### Ops And Delivery Baseline

- Secrets resolve only through a host-owned secret service and never live in project YAML
- All actors share one permission matrix and policy engine
- Packaging, signing, and update behavior are defined before release automation is implemented
- PoC gates and release gates block rollout when foundational claims are unproven
- External dependency sources need explicit provenance and trust level

### Browser

- 일반 웹콘텐츠는 sandboxed browser surface에서 열린다
- 보안 민감 auth는 시스템 브라우저 우선
- 현재 보이는 browser surface 자동화는 host-owned bridge를 통해서만 허용

### Terminal

- 실제 PTY 세션 기반
- 앱 전체 제어를 위한 CLI 진입점 역할

### External Runtime

- Python, Node, Go, shell, renderer bundle, remote service 지원
- runner와 transport 차이는 adapter로 흡수
- 일부 upstream CLI와 helper library는 `ref/` 아래 reference asset으로 유지하고, 제품 코드는 이를 참고해 별도로 구현

## 저장 구조

### Durable

- `workspace/`
- 앱 설정, CLI profile, runtime profile, module catalog, projects, attachments, logs, channels

### Volatile

- `workspace-state/`
- 세션, auth-state, view-state, IDE-state, projection cache

### 프로젝트 저장의 핵심

- 프로젝트 메타데이터
- 탭과 레이아웃
- 모듈 인스턴스
- 프로젝트 CLI 파생
- Skill/MCP attachment
- auth provider 선택
- ingress/channel 라우팅
- 로그와 분석 기반

## 외부 노출 구조

### Workspace Gateway

- 기본 gateway는 Caddy
- workspace 전체의 host/path 라우팅을 관리

### Project Ingress

- 한 프로젝트는 하나의 canonical ingress port를 가진다
- 여러 기능은 path prefix 채널로 나눈다

### Project Channel

- `/app`
- `/api`
- `/mcp`
- `/auth`
- `/events`

같은 방식으로 프로젝트 기능을 정리한다.

## 보안 경계

- 원격 웹 콘텐츠에는 node/electron 권한을 직접 주지 않는다
- OAuth/민감 인증은 시스템 브라우저 우선
- 토큰/secret은 host-managed secret storage와 ref로 관리
- 브라우저 자동화는 현재 보이는 surface에 대한 host-owned bridge가 있을 때만 full automation 허용
- public port sprawl을 금지하고 one-project-one-ingress로 정리한다

## AI와의 관계

- AI는 제품 바깥의 특별한 존재가 아니다
- 같은 action catalog, 같은 CLI/action 계층을 사용한다
- 새 기능이 들어와도 CLI projection과 AI manifest가 있으면 제어 가능해야 한다

## 이 문서와 세부 문서의 관계

- 이 문서는 전체 구조를 중앙화한 master map이다
- 세부 문서는 구체 계약과 예외 규칙을 가진다
- 구조 변경 시:
  1. 이 문서를 먼저 갱신
  2. 관련 세부 계약 문서를 갱신
  3. SSOT/DDD 용어와 규칙을 맞춘다

## 변경이 이 문서를 반드시 갱신해야 하는 경우

- 제어 계층이 바뀔 때
- 프로젝트의 역할이 바뀔 때
- GUI/CLI/AI 관계가 바뀔 때
- 브라우저/터미널/Runtime Host 책임이 바뀔 때
- 저장 구조나 라우팅 구조가 크게 바뀔 때
- 새 핵심 아키텍처 계층이 추가될 때

## 현재 아키텍처 해석

- 이 제품은 GUI-centric desktop app이 아니다
- 이 제품은 CLI-first automation workbench다
- GUI, AI, Skill, MCP는 같은 시스템을 다루는 surface다
- 프로젝트는 그 시스템이 실제로 운영되는 핵심 단위다
## VM Guest App CLI

- visible guest product launch/inspection operator contract는 `batcli vm guest app launch-visible|capture-visible|verify-runtime|resolve-config`로 정리한다
- 현재 first-class `--app` 값은 `gennx`이며, 기존 `batcli vm gennx ...`는 호환 alias로만 유지한다
- `launch-visible`, `capture-visible`, `verify-runtime`는 공통으로 `--no-auto-elevate`를 받아 deterministic permission failure를 반환할 수 있어야 한다
- guest product commands는 profiled `guest_winrm_host`가 있고 Hyper-V 권한이 없는 셸이면 먼저 WinRM-only path로 폴백해서 불필요한 UAC를 만들지 않아야 한다
- interactive `launch-visible`는 visible desktop 전제가 필요하므로 `batcli vm guest session ensure-visible`를 내부에서 호출해 guest 로그인 상태를 먼저 맞춰야 한다
- GenNX `left menu -> New Project` 재현은 일반 launch/capture와 분리해 `batcli vm guest diagnose-gennx-new-project`로 유지한다

## VM Guest Session CLI

- visible guest login/session control도 `batcli vm guest session status|ensure-visible --vm_profile_key vm-...`로 정리한다
- `ensure-visible`는 profiled guest credential로 AutoAdminLogon을 설정하고 guest reboot 후 explorer shell까지 확인하는 lab automation contract다
- guest session commands도 Hyper-V 권한이 없고 profiled `guest_winrm_host`가 reachable하면 WinRM-only path로 guest visible-session 보장을 계속 진행해야 한다
- Windows operator surface는 `batcli.cmd`를 통해 `batcli ...`를 직접 실행하는 쪽을 기본으로 삼고, PowerShell wrapper는 구현 세부로만 남긴다

## VM Hyper-V And Network CLI

- visible guest automation 전에 필요한 VM 전원/콘솔/네트워크 복구도 `batcli` 계약으로 노출한다
- Hyper-V plane은 `batcli vm hyperv ensure-running|connect|guest-ip --vm_profile_key vm-...`로 정리한다
- guest reachability plane은 `batcli vm network diagnose|repair --vm_profile_key vm-...`로 정리한다
- `network repair`는 profiled Internal switch/NAT, VM adapter VLAN/isolation, guest static IPv4 + WinRM/firewall baseline을 한 번에 재적용하는 복구 엔트리다
- Hyper-V 또는 host network mutation이 필요한 명령은 공통으로 `--no-auto-elevate`를 받아 deterministic permission failure를 반환할 수 있어야 한다
- Windows operator surface는 `batcli.cmd`를 기본으로 삼되, guest-only automation은 WinRM fallback으로 UAC 자체를 피하고 host mutation 명령만 필요한 경우에만 one-shot elevation을 사용한다
