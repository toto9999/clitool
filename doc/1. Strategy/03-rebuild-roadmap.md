# Rebuild Roadmap

## Phase 0. Baseline Reset

- 상태: 완료
- 내용: CLI 기반 루트를 정리하고 `basic_reference` 기반 프런트엔드 셸로 전환

## Phase 1. Platform Decision

- 상태: 진행중
- 제품을 `CLI-first automation workbench`로 명확히 정의
- 글로벌 CLI, 프로젝트 CLI, GUI, AI의 역할 분리 명확화
- 웹앱 단독 구조의 한계를 명시
- Electron 기반 데스크톱 셸 채택 여부 확정
- 터미널/내장 브라우저/모듈 버스의 책임 경계 정의

## Phase 2. Desktop Shell Foundation

- 상태: 진행중
- Electron 메인/프리로드/렌더러 구조 생성
- 안전한 IPC 브리지와 custom protocol 구성
- 메인 윈도우와 view-slot 레이아웃 관리자 구성
- 1차 스켈레톤 산출물:
  - `electron/main/main.cts`
  - `electron/preload/preload.cts`
  - `tsconfig.electron.json`
  - `package.json`의 Electron dev/build/typecheck 스크립트
  - `scripts/launch-electron-dev.cjs`
  - 렌더러에서 preload bridge 연결 상태를 확인하는 최소 화면
- 1차 성공 기준:
  - `npm run dev`로 Vite renderer와 Electron desktop shell이 함께 뜬다
  - preload `ping` IPC가 렌더러에서 호출된다
  - `npm run build`가 renderer와 electron entry를 함께 산출한다
  - `npm run typecheck`가 renderer와 electron 코드를 함께 검사한다

## Phase 3. Terminal Foundation

- `xterm.js` 기반 터미널 렌더러 도입
- `node-pty` 기반 PTY 서비스 구성
- 세션 생성/입력/출력/resize/종료 계약 정의

## Phase 4. Embedded Browser Foundation

- `WebContentsView` 기반 브라우저 surface 구성
- 탭/모듈별 browser session 분리 정책 수립
- navigation, popup, permission, URL 정책 정의

## Phase 5. Control Plane, Module Bus And Observability

- 상태: 진행중
- GUI, Global CLI, Project CLI, Skill, MCP가 공유하는 상위 control plane 설계
- 브라우저/터미널/앱 상태 간 메시지 버스 설계
- 이벤트/명령 스키마 정의
- 모듈 권한과 접근 범위 정의
- `05-system-contracts.yaml` 기준으로 저장/통신 계약 확정
- `06-module-sdk.yaml` 기준으로 모듈 lifecycle/capability/adapter 계약 확정
- `07-control-plane-and-observability.yaml` 기준으로 action catalog, attachment, logging, replay 계약 확정
- `08-external-module-runtime.yaml` 기준으로 multi-language package runtime, runner, transport, observability tier 계약 확정
- `09-ai-usable-module-manifest.yaml` 기준으로 semantic description, capability tag, example, binding policy 계약 확정
- `10-browser-terminal-and-ide-foundation.yaml` 기준으로 browser security, terminal, editor, ide-like tool choice 계약 확정
  - 시스템 브라우저 기반 auth callback 정책 포함
  - provider class별 auth surface/callback/storage/log redaction matrix 포함
- `12-browser-automation-and-playwright-mcp.yaml` 기준으로 visible browser automation, terminal-to-cli entrypoint, Playwright MCP bridge 전략 확정
  - 새 브라우저가 아니라 현재 보이는 browser surface 제어를 제품 요구로 고정
- `13-channel-domain-and-port-routing.yaml` 기준으로 project channel, internal/external domain, one-project-one-ingress-port, Caddy gateway 전략 확정
- `18-global-cli-textual-foundation.yaml` 기준으로 Textual 기반 Global CLI host, `ref/` reference library 분석 기반 재구현, 멀티라인/링크/이미지 입력 편의 계약 확정
- `19-performance-and-optimization-policy.yaml` 기준으로 상태 구조, structural sharing, cache, backpressure, render 경계 전략 확정
- `20-secret-and-credential-management.yaml` 기준으로 secret_ref, host secret service, redaction, export 정책 확정
- `21-permission-and-policy-matrix.yaml` 기준으로 actor별 allow/confirm/deny 권한 기준 확정
- `22-build-packaging-and-update.yaml` 기준으로 packaging, signing, native module rebuild, update 채널 전략 확정
- `23-verification-and-release-gates.yaml` 기준으로 poc gate와 release gate 기준 확정
- `24-trust-and-package-source-policy.yaml` 기준으로 package/binary/skill/mcp/ref source trust 전략 확정
- `17-central-architecture.md` 기준으로 전체 아키텍처 중앙 문서와 상세 계약 문서의 관계를 고정
- 1차 runtime action skeleton 산출물:
  - `batcli action run`
  - local runtime-host control transport
  - `app.ping`
  - `app.logs.tail`
  - `browser.capture-screenshot`
  - `browser.get-state`
  - `browser.navigate`
  - `browser.automation.click`
- 1차 성공 기준:
  - 실행 중인 Electron app에 `batcli action run --action app.ping` 이 응답한다
  - `batcli action run --action app.logs.tail` 이 host runtime log를 반환한다
  - `batcli action run --action browser.capture-screenshot` 이 현재 window 이미지를 파일로 저장한다
  - `batcli action run --action browser.get-state` 가 현재 embedded browser surface 상태를 반환한다
  - `batcli action run --action browser.navigate --url <url>` 이 embedded browser surface를 실제로 이동시킨다
  - `batcli action run --action browser.automation.click --selector <css>` 가 초기 click automation을 수행한다

## Phase 6. Domain Skeleton

- 프로젝트/탭/모듈/레이아웃 타입 정의
- mock 데이터 구조를 도메인 타입으로 정리
- 샘플 상태 저장소 방식 결정
- 새 루트 구조에 맞는 SSOT/DDD 항목 재정의

## Phase 6.5. Governance Recovery

- `batcli workflow` 단계 강제의 현재 루트 적용 방식 정리
- `docs validate`가 확인해야 할 필수 문서 범위 확정
- 문서 선행 갱신 규칙을 새 프런트엔드 구조에 맞게 자동화

## Phase 7. Management Flow

- 프로젝트 목록/상세 편집 흐름 정리
- 생성/수정/삭제 액션 연결
- 저장 전/후 상태 분리

## Phase 8. Runtime Workspace

- 프로젝트 탭 사이드바와 중앙 작업영역 연결
- 탭별 레이아웃 렌더러 구현
- 모듈 슬롯 렌더링 규칙 확정

## Phase 9. Persistence And Contracts

- 로컬 저장 포맷 결정
- 프로젝트 불러오기/저장 연결
- 모듈 카탈로그 계약과 설정 스키마 정의

## Phase 10. Security And Ops Hardening

- Electron security checklist 적용
- permission handler, sandbox, context isolation 강화
- 배포/업데이트/네이티브 모듈 빌드 체계 정리

## Phase 11. UX Polish

- 빈 상태, 오류 상태, 저장 피드백 정리
- 디자인 토큰 정리
- 실제 데이터 기준으로 화면 문구와 구조 다듬기

## 다음 구현 우선순위

1. `14-product-direction.md`, `15-core-user-scenarios.md`, `16-project-operating-model.md`로 제품 중심축을 먼저 고정하기
2. `05-system-contracts.yaml`로 저장 구조, 식별자 규칙, 메시지 계약을 먼저 고정하기
3. `06-module-sdk.yaml`로 새 모듈 추가 규칙과 adapter 계약을 고정하기
4. `07-control-plane-and-observability.yaml`로 GUI/CLI/Skill/MCP 제어면과 로그 계약을 고정하기
5. `08-external-module-runtime.yaml`로 다언어 패키지 실행/관측 표준을 고정하기
6. `09-ai-usable-module-manifest.yaml`로 AI가 실제로 모듈을 선택/추천/연결할 의미 계층을 고정하기
7. `10-browser-terminal-and-ide-foundation.yaml`로 browser, terminal, ide-like 환경의 실제 도구 선택과 보안 한계를 고정하기
8. `18-global-cli-textual-foundation.yaml`로 Textual Global CLI host, `ref/` 라이브러리 분석 기반 재구현, 붙여넣기/첨부 UX를 고정하기
9. `19-performance-and-optimization-policy.yaml`로 상태/참조/캐시/백프레셔 최적화 기준을 고정하기
10. `20-secret-and-credential-management.yaml`로 secret 저장/해석/회전 정책을 고정하기
11. `21-permission-and-policy-matrix.yaml`로 actor별 권한 기준을 고정하기
12. `22-build-packaging-and-update.yaml`로 packaging/signing/update 기준을 고정하기
13. `23-verification-and-release-gates.yaml`로 poc 및 release gate를 고정하기
14. `24-trust-and-package-source-policy.yaml`로 dependency/source trust 정책을 고정하기
15. `12-browser-automation-and-playwright-mcp.yaml`로 현재 보이는 browser surface 자동화 방향을 고정하기
16. `13-channel-domain-and-port-routing.yaml`로 project ingress, channel, port 전략을 고정하기
17. `17-central-architecture.md`로 전체 아키텍처를 중앙 문서에 통합하기
18. `04-runtime-platform-plan.md` 기준으로 Electron 채택과 프로세스 구조를 확정하기
19. `ssot.yaml`, `ddd.md`, `workflow-rules.md`에 제품 중심 용어를 고정하기
20. Electron 메인/프리로드/렌더러 최소 골격을 만들기
21. 중앙 아키텍처 문서에 실제 코드 트리와 Electron skeleton 책임을 반영하기
22. 터미널 PTY 서비스와 브라우저 surface의 최소 PoC를 따로 검증하기
