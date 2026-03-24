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

역할:
- 저장/통신/실행/보안/관찰/라우팅 계약

## 현재 코드베이스 스냅샷

현재 루트는 `Electron Main + Preload + Vite React Renderer + local runtime action skeleton` 이 구현된 상태다.

- 현재 실제 실행 구조: `Electron desktop shell skeleton + Vite renderer`
- 목표 실행 구조: `Electron Main + Preload + React Renderer`
- 현재 코드의 핵심 목적: 문서 강제 시스템 유지, `batcli` 중심 개발 진입점 확보, Electron host 최소 골격과 첫 runtime action 경로 확보

## 현재 실제 코드 트리

```text
clibase/                                  # 현재 프로젝트 루트
  bin/                                    # 로컬 CLI와 문서 workflow 도구
    batcli.js                             # workflow와 install/dev/build/typecheck/verify를 수행하는 Global CLI 엔트리
  batcli.cmd                              # Windows repo-root bootstrap wrapper
  batcli.ps1                              # PowerShell repo-root bootstrap wrapper
  doc/                                    # 중앙화된 제품/아키텍처/계약 문서
    0. Governance/                        # SSOT, DDD, workflow 강제 규칙
    1. Strategy/                          # 제품 방향, 운영 모델, 로드맵
    2. Product/                           # IA, 사용자 시나리오, 레퍼런스 해석
    3. Platform/                          # 런타임/저장/통신/보안/라우팅 계약
    9. Worklog/                           # 세션 작업 로그
  electron/                               # 데스크톱 셸 진입 코드
    host-services/                        # host-owned runtime service skeleton
      browser/                            # embedded browser surface와 초기 automation backend
        browser-surface.cts               # WebContentsView child surface, navigate/get-state/click 구현
      runtime-control/                    # local runtime action transport and host log skeleton
        runtime-control-server.cts        # batcli action run 요청을 받아 host action으로 실행
        runtime-logging.cts               # bounded in-memory runtime log와 readable log key 생성
    main/                                 # Electron main process
      main.cts                            # BrowserWindow 생성과 dev/prod renderer 로드
    preload/                              # 안전한 renderer bridge
      preload.cts                         # 최소 clibaseDesktop bridge 노출
  shared/                                 # cli와 runtime host가 함께 쓰는 로컬 계약
    runtime-control.cjs                   # local named pipe/socket endpoint 계산
  scripts/                                # 실행 bootstrap 보조 스크립트
    launch-electron-dev.cjs               # Codex/Windows 환경에서 Electron Node 모드 shadowing을 제거하고 desktop shell 실행
  src/                                    # 현재 실제 최소 렌더러 부트스트랩 코드
    main.tsx                              # React 렌더러 진입점
    vite-env.d.ts                         # Vite와 preload bridge 타입 선언
    app/                                  # 앱 루트 코드
      App.tsx                             # Electron bridge 연결 상태를 보여 주는 최소 화면
    styles/                               # 최소 전역 스타일
      index.css                           # skeleton 상태 화면 스타일
  ref/                                    # 비교 기준과 업스트림 CLI 레퍼런스 보관소
    basic_reference/                      # 현재 UI 재구성의 기준 레퍼런스
  package.json                            # npm 스크립트와 의존성 정의
  tsconfig.electron.json                  # Electron main/preload compile 경계
  vite.config.ts                          # Vite 설정
  tsconfig.json                           # TypeScript 설정
  README.md                               # 루트 프로젝트 안내
```

위 트리는 현재 실제로 의미 있게 사용하는 코드 파일 기준이다. 이전 프로토타입에서 남은 빈 디렉터리가 일부 디스크에 남아 있더라도, 활성 코드 구조는 위 목록을 기준으로 본다.

## 현재 코드 파일 책임 맵

### 런타임/부트스트랩

- `package.json`
  - 현재 실행 스크립트와 `batcli` bin 등록
  - `dev/build/typecheck/verify`가 `batcli`를 통해 들어오도록 고정
  - Electron compile과 renderer build 스크립트 포함
- `bin/batcli.js`
  - 현재 `batcli` executable의 구현
  - 현재는 workflow/docs 기능, install/dev/build/typecheck/verify, action run 진입점이 들어간 상태
  - 장기적으로 Global CLI product command entrypoint로 확장될 대상
  - install
  - dev
  - build
  - typecheck
  - verify
  - action run
  - workflow start/to-doc/to-code/status/stop
  - docs validate/touch
- `batcli.cmd`, `batcli.ps1`
  - 초기 clone에서 repo 루트에서 batcli bootstrap을 가능하게 하는 wrapper
  - `batcli install` 이후 global link가 잡히면 plain `batcli` 사용을 기준으로 함
- `shared/runtime-control.cjs`
  - batcli와 electron host가 같은 local control endpoint를 계산
- `electron/host-services/browser/browser-surface.cts`
  - main window 안의 `WebContentsView` child surface 생성
  - `browser.get-state`, `browser.navigate`, `browser.automation.click`의 첫 backend 제공
- `electron/host-services/runtime-control/runtime-control-server.cts`
  - local named pipe/socket server를 열어 batcli action run을 수신
  - app.ping, app.logs.tail, browser.get-state, browser.navigate, browser.automation.click, browser.capture-screenshot를 host action으로 실행
- `electron/host-services/runtime-control/runtime-logging.cts`
  - host runtime log를 메모리에 유지
  - app.logs.tail 응답의 데이터 원본 역할
- `electron/main/main.cts`
  - Electron BrowserWindow 생성
  - dev server 또는 built renderer 로드
  - preload 연결과 최소 IPC handler 등록
  - local runtime control server와 embedded browser surface bootstrapping
- `electron/preload/preload.cts`
  - `clibaseDesktop` bridge 노출
  - renderer가 main process ping 상태를 조회할 수 있게 함
- `scripts/launch-electron-dev.cjs`
  - `ELECTRON_RUN_AS_NODE`가 잡힌 환경에서도 Electron binary를 앱 모드로 실행
  - `batcli dev` 경로의 Electron launch를 안정화
- `src/main.tsx`
  - React 렌더러 진입점
  - `App` 마운트

### 앱 루트

- `src/app/App.tsx`
  - Electron preload bridge 연결 상태 표시
  - renderer-only preview와 desktop shell connected 상태를 구분

### 스타일

- `src/styles/index.css`
  - 최소 전역 reset과 재시작 상태 화면 스타일

## 현재 구현 상태와 목표 구조의 차이

### 현재 실제 구현

- 문서 우선 workflow 강제
- batcli 중심 install/dev/build/typecheck/verify 진입점
- batcli action run skeleton
- Electron main/preload skeleton
- embedded `WebContentsView` browser surface
- browser.get-state / browser.navigate / browser.automation.click
- local runtime control server
- bounded in-memory host runtime log
- Vite + React renderer skeleton
- preload ping bridge 상태 화면
- 이전 mock 라우트와 프로토타입 UI 제거

### 아직 미구현

- Runtime Host
- 실제 Project persistence loader/writer
- Control Plane dispatcher
- Module Bus
- TextualCLIHost
- Project management/editor/workspace renderer
- Terminal PTY
- 다중 WebContentsView browser module 관리
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
4. `shared/runtime-control.cjs`
5. `electron/host-services/browser/browser-surface.cts`
6. `electron/host-services/runtime-control/runtime-control-server.cts`
7. `electron/host-services/runtime-control/runtime-logging.cts`
8. `electron/main/main.cts`
9. `electron/preload/preload.cts`
10. `scripts/launch-electron-dev.cjs`
11. `src/main.tsx`
12. `src/app/App.tsx`
13. `src/styles/index.css`
14. 그 다음 필요한 세부 계약 문서

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
          -> app.ping / app.logs.tail / browser.get-state / browser.navigate / browser.automation.click / browser.capture-screenshot
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
- PTY/module bus도 아직 없다
- browser surface는 있으나 다중 browser module 관리, durable browser session persistence, full CDP bridge는 아직 없다
- 현재 renderer에는 실제 workspace UI가 없다
- Textual 기반 Global CLI host는 아직 코드에 없다
- runtime action subset은 있으나 full control plane, durable yaml log, module bus는 아직 없다

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
- Terminal: xterm.js + node-pty

### Global CLI UX

- Authoritative interactive Global CLI host: Textual
- Authoritative executable namespace: `batcli`
- Current renderer has no separate CLI panel; `src/app/App.tsx` only shows desktop skeleton status
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
