# Documentation Index

`doc/`는 이 프로젝트를 다시 만드는 동안의 기준 문서 저장소입니다. 문서는 카테고리별 번호 폴더로 관리합니다.

## 읽는 순서

1. `0. Governance/ssot.yaml`
2. `0. Governance/ddd.md`
3. `0. Governance/workflow-rules.md`
4. `1. Strategy/00-project-charter.md`
5. `1. Strategy/14-product-direction.md`
6. `1. Strategy/16-project-operating-model.md`
7. `2. Product/15-core-user-scenarios.md`
8. `1. Strategy/03-rebuild-roadmap.md`
9. `2. Product/01-reference-baseline.md`
10. `2. Product/02-product-ia.md`
11. `3. Platform/04-runtime-platform-plan.md`
12. `3. Platform/17-central-architecture.md`
13. `3. Platform/05-system-contracts.yaml`
14. `3. Platform/06-module-sdk.yaml`
15. `3. Platform/07-control-plane-and-observability.yaml`
16. `3. Platform/08-external-module-runtime.yaml`
17. `3. Platform/09-ai-usable-module-manifest.yaml`
18. `3. Platform/10-browser-terminal-and-ide-foundation.yaml`
19. `3. Platform/11-auth-provider-templates.yaml`
20. `3. Platform/12-browser-automation-and-playwright-mcp.yaml`
21. `3. Platform/13-channel-domain-and-port-routing.yaml`
22. `3. Platform/18-global-cli-textual-foundation.yaml`
23. `3. Platform/19-performance-and-optimization-policy.yaml`
24. `3. Platform/20-secret-and-credential-management.yaml`
25. `3. Platform/21-permission-and-policy-matrix.yaml`
26. `3. Platform/22-build-packaging-and-update.yaml`
27. `3. Platform/23-verification-and-release-gates.yaml`
28. `3. Platform/24-trust-and-package-source-policy.yaml`
29. `9. Worklog/99-worklog.md`

## 폴더 구조

- `0. Governance`: SSOT, DDD, workflow 규칙
- `1. Strategy`: 프로젝트 목표와 단계 계획
- `2. Product`: 제품 구조와 레퍼런스 정리
- `3. Platform`: 런타임 플랫폼과 시스템 계약
- `9. Worklog`: 세션 로그

## 운영 원칙

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
- 코드 구현 전에는 반드시 `batcli workflow start`로 시작하고, 문서 단계에서 `to-code`로 넘어가기 전 관련 문서를 먼저 갱신합니다.
- 구현 범위가 바뀌면 `1. Strategy/03-rebuild-roadmap.md`를 갱신합니다.
- 세션이 끝날 때마다 `9. Worklog/99-worklog.md`에 한 줄 이상 남깁니다.
- `ref/basic_reference`는 비교 기준 원본으로 유지하고, 실제 구현은 루트 `src/`에서 진행합니다.
