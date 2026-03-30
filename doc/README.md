# Documentation Index

`doc/`는 이 프로젝트를 다시 만드는 동안의 기준 문서 저장소입니다. 문서는 카테고리별 번호 폴더로 관리합니다.

## 읽는 순서

1. `../AGENTS.md`
2. `../AGENT.md`
3. `0. Governance/ssot.yaml`
4. `0. Governance/ddd.md`
5. `0. Governance/agent-governance.md`
6. `0. Governance/workflow-rules.md`
7. `1. Strategy/00-project-charter.md`
8. `1. Strategy/14-product-direction.md`
9. `1. Strategy/16-project-operating-model.md`
10. `2. Product/15-core-user-scenarios.md`
11. `1. Strategy/03-rebuild-roadmap.md`
12. `2. Product/01-reference-baseline.md`
13. `2. Product/02-product-ia.md`
14. `3. Platform/04-runtime-platform-plan.md`
15. `3. Platform/17-central-architecture.md`
16. `3. Platform/05-system-contracts.yaml`
17. `3. Platform/06-module-sdk.yaml`
18. `3. Platform/07-control-plane-and-observability.yaml`
19. `3. Platform/08-external-module-runtime.yaml`
20. `3. Platform/09-ai-usable-module-manifest.yaml`
21. `3. Platform/10-browser-terminal-and-ide-foundation.yaml`
22. `3. Platform/11-auth-provider-templates.yaml`
23. `3. Platform/12-browser-automation-and-playwright-mcp.yaml`
24. `3. Platform/13-channel-domain-and-port-routing.yaml`
25. `3. Platform/18-global-cli-textual-foundation.yaml`
26. `3. Platform/19-performance-and-optimization-policy.yaml`
27. `3. Platform/20-secret-and-credential-management.yaml`
28. `3. Platform/21-permission-and-policy-matrix.yaml`
29. `3. Platform/22-build-packaging-and-update.yaml`
30. `3. Platform/23-verification-and-release-gates.yaml`
31. `3. Platform/24-trust-and-package-source-policy.yaml`
32. `3. Platform/25-project-aware-layout-and-windowing.yaml`
33. `3. Platform/26-interaction-and-docking-foundation.yaml`
34. `3. Platform/27-ui-engineering-governance.yaml`
35. `3. Platform/28-desktop-uia-macro-verification.yaml`
36. `9. Worklog/99-worklog.md`

## 폴더 구조

- `0. Governance`: SSOT, DDD, workflow 규칙
- `1. Strategy`: 프로젝트 목표와 단계 계획
- `2. Product`: 제품 구조와 레퍼런스 정리
- `3. Platform`: 런타임 플랫폼과 시스템 계약
- `9. Worklog`: 세션 로그

## 운영 원칙

- Global CLI의 공식 실행 이름은 `batcli`로 고정합니다.
- 에이전트 작업 규칙은 루트 `AGENTS.md`를 짧은 맵으로 유지하고, 상세 계약은 `doc/` 하위 문서에서 관리합니다.
- 에이전트 호환 진입점(`AGENT.md`)과 상세 하네스 규약(`0. Governance/agent-governance.md`)을 함께 유지해, 어떤 도구에서도 같은 운영 규칙을 읽게 합니다.
- 방향이 바뀌면 `1. Strategy/00-project-charter.md`, `1. Strategy/14-product-direction.md`, `1. Strategy/16-project-operating-model.md`, `2. Product/15-core-user-scenarios.md`, `2. Product/02-product-ia.md`를 먼저 갱신합니다.
- 구조나 용어가 바뀌면 `0. Governance/ssot.yaml`과 `0. Governance/ddd.md`를 먼저 갱신합니다.
- 런타임 플랫폼이나 네이티브 기능 범위가 바뀌면 `3. Platform/04-runtime-platform-plan.md`를 먼저 갱신합니다.
- 전체 아키텍처 구조가 바뀌면 `3. Platform/17-central-architecture.md`를 먼저 갱신합니다.
- 저장 구조, 식별자 규칙, 모듈 계약, 통신 규약이 바뀌면 `3. Platform/05-system-contracts.yaml`을 먼저 갱신합니다.
- 새 모듈 타입의 capability, lifecycle, adapter 요구사항이 바뀌면 `3. Platform/06-module-sdk.yaml`을 먼저 갱신합니다.
- GUI/CLI/Skill/MCP 제어 규약, action log, audit log, replay 규약이 바뀌면 `3. Platform/07-control-plane-and-observability.yaml`을 먼저 갱신합니다.
- 외부 패키지 실행 방식, runner/transport, observability tier 규약이 바뀌면 `3. Platform/08-external-module-runtime.yaml`을 먼저 갱신합니다.
- AI 설명 계층, capability tag, example I/O, binding recommendation 규약이 바뀌면 `3. Platform/09-ai-usable-module-manifest.yaml`을 먼저 갱신합니다.
- 브라우저 보안 경계, 터미널/에디터/IDE 유사 환경 선택이 바뀌면 `3. Platform/10-browser-terminal-and-ide-foundation.yaml`을 먼저 갱신합니다.
- auth provider, callback mode, scope class, redirect 등록 템플릿이 바뀌면 `3. Platform/11-auth-provider-templates.yaml`을 먼저 갱신합니다.
- 내장 브라우저 자동화, Playwright MCP 연결, 터미널에서의 브라우저 제어 계약이 바뀌면 `3. Platform/12-browser-automation-and-playwright-mcp.yaml`을 먼저 갱신합니다.
- 프로젝트 채널, 내부/외부 도메인, 프로젝트 ingress port, Caddy gateway 라우팅 규약이 바뀌면 `3. Platform/13-channel-domain-and-port-routing.yaml`을 먼저 갱신합니다.
- Global CLI UX, Textual 채택, `ref/` 기반 레퍼런스 CLI 분석/재구현 정책, 멀티라인/링크/이미지 붙여넣기 편의 규약이 바뀌면 `3. Platform/18-global-cli-textual-foundation.yaml`을 먼저 갱신합니다.
- 상태 구조, shallow reference 전략, 캐시 계층, 렌더링 경계, stream backpressure, 성능 기본 정책이 바뀌면 `3. Platform/19-performance-and-optimization-policy.yaml`을 먼저 갱신합니다.
- secret_ref, 토큰 저장, redaction, export/import secret 정책이 바뀌면 `3. Platform/20-secret-and-credential-management.yaml`을 먼저 갱신합니다.
- control surface별 허용/확인/거부 권한 정책이 바뀌면 `3. Platform/21-permission-and-policy-matrix.yaml`을 먼저 갱신합니다.
- Electron 패키징, 코드사인, native module rebuild, update 채널 정책이 바뀌면 `3. Platform/22-build-packaging-and-update.yaml`을 먼저 갱신합니다.
- PoC gate, release gate, smoke checklist 기준이 바뀌면 `3. Platform/23-verification-and-release-gates.yaml`을 먼저 갱신합니다.
- 외부 패키지, 바이너리, Skill, MCP, ref source trust 기준이 바뀌면 `3. Platform/24-trust-and-package-source-policy.yaml`을 먼저 갱신합니다.
- 프로젝트 탭 배치, cross-tab 통신, detached window, 멀티모니터 배치 정책이 바뀌면 `3. Platform/25-project-aware-layout-and-windowing.yaml`을 먼저 갱신합니다.
- split resize, redock zone, pane restore, focus movement 같은 상호작용 기반이 바뀌면 `3. Platform/26-interaction-and-docking-foundation.yaml`을 먼저 갱신합니다.
- UI 레이아웃/리사이즈/패널 오버랩/호스트 브라우저 슬롯 동기화 정책이 바뀌면 `3. Platform/27-ui-engineering-governance.yaml`을 먼저 갱신합니다.
- 외부 EXE 검증 lane, UIA 매크로 저장/실행, FlaUI(실행)·UiaPeek(탐색/보조) 역할과 uia.* 제어 계약이 바뀌면 `3. Platform/28-desktop-uia-macro-verification.yaml`을 먼저 갱신합니다.
- 브라우저 seed 시작 페이지는 긴 `data:text` 대신 `seed://...` 별칭을 기본으로 사용하고, 매핑은 `workspace/browser-seeds.yaml`에서 관리합니다.
- workspace/workspace-state의 모든 `*_key`/`*_ref`는 짧고 읽기 쉬운 alias 규약(prefix + readable token, 길이 제한)을 따라야 하며, UUID/랜덤 토큰과 긴 의미 없는 문자열은 금지됩니다.
- `src/main.tsx`, `src/app/*`, `src/styles/*`, `electron/preload/*`, `electron/main/*`, `electron/host-services/browser/*`를 변경하면 UI guard 문서(`27`, `26`, `17`, `99-worklog`) 중 최소 1개 이상을 같은 작업에서 갱신해야 합니다.
- 코드 구현 전에는 반드시 `batcli workflow start`로 시작하고, 문서 단계에서 `to-code`로 넘어가기 전 관련 문서를 먼저 갱신합니다.
- 구현 범위가 바뀌면 `1. Strategy/03-rebuild-roadmap.md`를 갱신합니다.
- 세션이 끝날 때마다 `9. Worklog/99-worklog.md`에 한 줄 이상 남깁니다.
- `ref/basic_reference`는 비교 기준 원본으로 유지하고, 실제 구현은 루트 `src/`에서 진행합니다.
