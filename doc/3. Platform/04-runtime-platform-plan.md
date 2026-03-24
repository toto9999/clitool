# Runtime Platform Plan

## 문제 정의

현재 루트는 `Vite + React` 렌더러 프로토타입으로는 충분하지만, 제품이 실제로 요구하는 아래 기능은 브라우저에 띄운 일반 SPA만으로 해결되지 않는다.

- 앱 안에서 OS 셸 기반 터미널을 실행해야 한다.
- 앱 안에서 외부 웹페이지를 브라우저처럼 띄워야 한다.
- 브라우저 모듈, 터미널 모듈, 앱 상태가 서로 통신해야 한다.
- GUI, Global CLI, Project CLI, Skill, MCP가 같은 제어 계약으로 앱을 움직여야 한다.
- Global CLI는 멀티라인 작성, 링크/이미지 붙여넣기, reference CLI 분석 기반 재구현에 유리한 실제 power-user surface여야 한다.
- 외부 웹 콘텐츠에는 로컬 권한을 직접 주지 않으면서도 앱 전체는 네이티브 기능을 사용해야 한다.

## 왜 일반 웹앱만으로는 부족한가

- 브라우저 렌더러는 OS PTY를 직접 생성할 수 없다. 실제 셸 세션은 브라우저 바깥의 프로세스가 필요하다.
- 일반 웹앱의 내장 브라우저는 결국 `iframe` 수준 제약을 받기 쉬워, 대상 사이트의 보안 정책에 막힐 가능성이 높다.
- 모듈 간 통신이 네이티브 기능까지 포함하면, 단순 프런트엔드 상태관리보다 강한 프로세스 경계와 권한 경계가 필요하다.

위 판단은 현재 제품 요구를 기준으로 한 설계 추론이다.

## 추천 방향

### 결론

이 프로젝트의 주 런타임은 `Electron + React Renderer`로 가는 것이 가장 현실적이다.

전체 구조의 중앙화된 요약과 계층 관계는 `17-central-architecture.md`에서 함께 관리한다.

구체적인 browser, terminal, editor, package runtime 선택과 보안 경계는 `10-browser-terminal-and-ide-foundation.yaml`에서 더 상세히 고정한다.

### 이유

- Electron 공식 문서는 원격 콘텐츠 임베드 방식으로 `<iframe>`, `<webview>`, `WebContentsView`를 설명하고, 원격 콘텐츠를 메인 프로세스에서 생성/제어/배치하려면 `WebContentsView`가 가장 적합한 방향이다.
- Electron 공식 문서는 `<webview>` 태그보다 `WebContentsView`를 고려하라고 안내한다.
- Electron은 `utilityProcess`로 Node.js와 message port가 가능한 별도 프로세스를 둘 수 있어, 권한이 필요한 런타임 서비스를 UI와 분리하기 쉽다.
- `node-pty`와 `xterm.js` 조합은 PTY 기반 터미널을 앱 안에 넣는 현실적인 기본 선택지다.

## 대안 검토

### 1. 순수 웹앱 유지

- 장점: 시작이 빠르다.
- 단점: 로컬 터미널, 강한 브라우저 임베드 제어, 프로세스 격리를 만족시키기 어렵다.
- 판단: 현재 요구사항에는 부적합.

### 2. Tauri

- 장점: 권한 모델이 명확하고 sidecar 실행 정책을 세밀하게 관리할 수 있다.
- 단점: 현재 요구사항은 다중 브라우저 surface 제어와 PTY/브리지 통합이 핵심인데, 우리 팀의 현재 코드/스택 기준으로는 Electron보다 초기 구현 난도가 높을 가능성이 크다.
- 판단: 장기 대안 후보는 될 수 있지만, 현재 MVP 기준 추천안은 아님.

이 비교는 공식 문서와 현재 코드베이스 상황을 바탕으로 한 추론이다.

## 목표 아키텍처

### 1. Renderer UI

- 기술: `React + Vite + Mantine`
- 역할: 프로젝트 관리, 프로젝트 편집, 작업공간 UI 렌더링
- 제약: OS 권한 직접 접근 금지

### 2. Runtime Host

- 기술: `Electron Main + Preload`
- 역할: 창 생성, view 배치, IPC 라우팅, 권한 정책, 세션 정책

### 3. Terminal Service

- 기술: `node-pty` + 가능하면 Electron `utilityProcess` 또는 별도 Node 서비스
- 역할:
  - terminal session create
  - stdin write
  - stdout/stderr stream
  - resize
  - exit/kill

### 4. Browser Service

- 기술: `WebContentsView`
- 역할:
  - browser module 인스턴스 생성
  - URL 로드/탐색 제어
  - 탭별 session 분리
  - popup/navigation/permission 제어

### 5. Module Bus

- 역할:
  - 브라우저 -> 앱 이벤트
  - 터미널 -> 앱 이벤트
  - 앱 -> 브라우저 명령
  - 앱 -> 터미널 명령
  - 브라우저 <-> 터미널 간 간접 메시지 중계

### 6. Control Plane

- 역할:
  - GUI, Global CLI, Project CLI, Skill, MCP 입력을 하나의 action catalog로 통합
  - project scope와 policy를 기준으로 실행 허용 여부 판단
  - action을 host service나 module bus command로 투영

### 7. Observability Pipeline

- 역할:
  - action log, event log, audit log 기록
  - trace 단위 분석과 replay 준비
  - 실패 패턴과 attachment 사용 현황 분석

### 8. External Package Runner Layer

- 역할:
  - Python, Node, Go, shell, renderer bundle, remote service 기반 패키지 실행
  - runner/transport 차이를 adapter로 흡수
  - 조용한 라이브러리도 최소 lifecycle 이벤트를 생성하도록 정규화

## 필요한 기반 작업

## A. 플랫폼 전환

- Electron 프로젝트 구조 추가
- `main`, `preload`, `renderer` 책임 분리
- 개발 시 `Vite renderer + Electron main` 동시 실행 구조 만들기
- 배포 시 데스크톱 번들 생성 구조 만들기

## B. 보안 기본선

- remote content용 renderer에 `nodeIntegration` 비활성화
- `contextIsolation` 유지
- sandbox 유지
- raw IPC를 직접 renderer에 노출하지 않고 preload에서 최소 API만 노출
- navigation, popup, permission 요청 제어
- 필요 시 custom protocol 사용 검토

## C. 터미널 기반

- `xterm.js` 렌더러 도입
- `node-pty` 빌드/배포 체인 확인
- Windows PowerShell/Pwsh 기본 셸 전략 정리
- session lifecycle API 설계
- scrollback, resize, reconnect, kill, logging 정책 설계

## D. 브라우저 기반

- `WebContentsView` 기반 browser module PoC
- 프로젝트 탭/모듈 슬롯과 native view bounds 동기화
- session partition 정책
- 주소 이동, 뒤로가기, 새창, 다운로드, 권한 요청 정책
- 외부 로그인 페이지나 복잡한 사이트 대응 범위 정의
- OAuth/Google 로그인/민감 인증은 기본적으로 시스템 브라우저와 공식 native-app flow로 분리
- provider class별 callback mode, auth session state, token redaction 규약 정의
- visible browser surface를 Playwright MCP나 project cli로 제어할 때의 bridge 전략 정의
- workspace gateway와 project ingress를 분리하고, project별 단일 ingress port 전략 정의

## E. 모듈 통신 기반

- typed IPC event schema 정의
- module id / tab id / project id 기반 routing 설계
- terminal output을 브라우저 입력이나 앱 상태로 넘기는 규칙 정의
- 브라우저에서 선택한 데이터나 URL을 다른 모듈로 전달하는 규칙 정의

## F. 상태/저장 기반

- 프로젝트/탭/모듈/레이아웃 저장 포맷 정의
- 런타임 module instance와 persisted config 매핑
- 브라우저/터미널 세션의 복원 전략 정의

## G. 운영 기반

- Electron 버전 업그레이드 전략
- `node-pty` 네이티브 모듈 빌드 의존성 관리
- 개발 환경 요구사항 문서화
- crash logging과 diagnostics 설계

## H. Control Plane 기반

- action catalog와 controller projection 규칙 정의
- Global CLI와 GUI가 같은 contract key를 쓰도록 강제
- Skill registry, MCP registry, project attachment 저장 구조 정의
- policy engine과 confirmation rule 정의

## I. Observability 기반

- yaml stream 기반 action/event/audit log bucket 설계
- trace, causation, replay 식별 규약 정의
- 분석 projection과 replay scaffolding 설계

## J. External Runtime 기반

- runtime profile과 package manifest 저장 구조 정의
- stdio/ipc/http/websocket 기반 실행 transport 규약 정의
- observability tier와 synthetic lifecycle event 규약 정의
- 설치/healthcheck/handshake/failure normalization 정의

## K. Global CLI UX 기반

- Textual 기반의 authoritative Global CLI host 구조 정의
- 현재 React `GlobalCLIPanel`을 임시 관찰/프로토타입 surface로 한정
- 멀티라인 compose, bracketed paste, 링크 붙여넣기, 이미지/노트북 첨부 ingestion 전략 정의
- `ref/` 아래의 reference CLI/library를 분석 기준으로 두고 제품 코드를 별도 구현하는 정책 정의
- Global CLI와 GUI가 같은 control plane action을 dispatch하도록 보장

## 우선순위 계획

### Step 1. 아키텍처 PoC

- Electron 메인 윈도우에서 현재 React 앱을 띄운다.
- preload를 통해 최소 ping IPC만 연결한다.
- 성공 기준: 데스크톱 셸 안에서 현재 UI가 뜬다.

### Step 2. Terminal PoC

- `xterm.js + node-pty`로 단일 터미널 세션을 띄운다.
- 성공 기준: 입력/출력/resize가 된다.

### Step 3. Browser PoC

- `WebContentsView` 기반 단일 브라우저 surface를 띄운다.
- 성공 기준: 안전한 정책 아래 URL 로드와 탐색 이벤트를 제어할 수 있다.

### Step 4. Control Plane PoC

- GUI와 CLI가 같은 action을 dispatch하는 최소 흐름을 만든다.
- 성공 기준: 하나의 `project.save` 또는 `module.command`가 GUI와 CLI에서 모두 같은 dispatcher를 탄다.

### Step 5. Module Bus PoC

- 터미널/브라우저/앱 간 최소 이벤트 한두 개를 연결한다.
- 예시:
  - 앱이 터미널에 명령 전송
  - 브라우저 현재 URL을 앱 상태에 반영
  - 앱이 브라우저 이동 명령 전송

### Step 6. Workspace Integration

- 프로젝트 탭 레이아웃과 terminal/browser module 인스턴스를 연결한다.

## 지금 당장 문서 기준으로 막아야 할 착각

- 현재 `npm run dev`로 뜨는 React 앱만 완성해도 제품 요구가 충족되는 것은 아니다.
- browser module을 단순 `iframe`으로 생각하면 안 된다.
- `어느 사이트나 100% 문제 없이`를 목표 문구로 쓰면 안 된다.
- terminal module을 “터미널처럼 보이는 UI”로만 구현하면 안 된다.
- 모듈 간 통신은 임시 전역 상태 공유로 끝내면 안 된다.
- GUI 전용 숨은 동작과 CLI 전용 숨은 동작을 따로 만들면 안 된다.
- Skill이나 MCP를 프로젝트 밖의 임시 스크립트처럼 붙이면 안 된다.
- 로그와 replay를 나중에 붙일 수 있다고 생각하면 안 된다.
- 외부 라이브러리를 언어별 예외 처리로 직접 호출하면 안 된다.
- 로그가 없는 라이브러리라고 해서 실행 중간상태를 완전히 포기하면 안 된다.

## 구현 순서 제안

1. `05-system-contracts.yaml`로 저장 구조와 메시지 계약 고정
2. `06-module-sdk.yaml`로 모듈 lifecycle과 adapter 계약 고정
3. `07-control-plane-and-observability.yaml`로 control plane, attachment, 로그 계약 고정
4. `08-external-module-runtime.yaml`로 external package runtime와 observability tier 계약 고정
5. `10-browser-terminal-and-ide-foundation.yaml`로 browser security, terminal, ide-like tool choice를 고정
6. Electron 채택과 프로세스 구조를 SSOT에 고정
7. Electron skeleton 작업
8. Terminal PoC
9. Browser PoC
10. Control Plane and ModuleBus PoC
11. External Package Runner PoC
12. Monaco editor shell PoC
13. 그 후 프로젝트/탭/레이아웃 UI 연결

## 참고 근거

- Electron Web Embeds: https://www.electronjs.org/docs/latest/tutorial/web-embeds
- Electron Security: https://www.electronjs.org/docs/latest/tutorial/security
- Electron WebContentsView migration note: https://www.electronjs.org/blog/migrate-to-webcontentsview
- Electron utilityProcess: https://www.electronjs.org/docs/latest/api/utility-process
- xterm.js docs: https://xtermjs.org/docs/
- node-pty: https://github.com/microsoft/node-pty
- Tauri permissions: https://v2.tauri.app/security/permissions/
- Tauri sidecar: https://v2.tauri.app/develop/sidecar/
