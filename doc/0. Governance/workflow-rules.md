# Workflow Rules

## 목적

새 UI 루트로 재시작하더라도, 이 프로젝트는 여전히 문서 우선 개발을 강제한다. `batcli workflow`는 단순 편의 명령이 아니라 개발 단계 전환 계약이다.

## 기본 흐름

1. `batcli workflow start "<note>"`
2. `batcli workflow to-doc`
3. `doc/0. Governance/ssot.yaml`, `doc/0. Governance/ddd.md`, 관련 기획 문서 갱신
4. `batcli workflow to-code`
5. 코드 구현
6. 필요 시 `batcli workflow to-doc`로 복귀
7. 마무리 후 `batcli workflow stop`

## 필수 문서

- `doc/0. Governance/ssot.yaml`
- `doc/0. Governance/ddd.md`
- `doc/1. Strategy/14-product-direction.md`
- `doc/1. Strategy/16-project-operating-model.md`
- `doc/2. Product/15-core-user-scenarios.md`
- `doc/2. Product/02-product-ia.md`
- `doc/1. Strategy/03-rebuild-roadmap.md`
- `doc/3. Platform/04-runtime-platform-plan.md`
- `doc/3. Platform/17-central-architecture.md`
- `doc/3. Platform/05-system-contracts.yaml`
- `doc/3. Platform/06-module-sdk.yaml`
- `doc/3. Platform/07-control-plane-and-observability.yaml`
- `doc/3. Platform/08-external-module-runtime.yaml`
- `doc/3. Platform/09-ai-usable-module-manifest.yaml`
- `doc/3. Platform/10-browser-terminal-and-ide-foundation.yaml`
- `doc/3. Platform/11-auth-provider-templates.yaml`
- `doc/3. Platform/12-browser-automation-and-playwright-mcp.yaml`
- `doc/3. Platform/13-channel-domain-and-port-routing.yaml`
- `doc/3. Platform/18-global-cli-textual-foundation.yaml`
- `doc/3. Platform/19-performance-and-optimization-policy.yaml`
- `doc/3. Platform/20-secret-and-credential-management.yaml`
- `doc/3. Platform/21-permission-and-policy-matrix.yaml`
- `doc/3. Platform/22-build-packaging-and-update.yaml`
- `doc/3. Platform/23-verification-and-release-gates.yaml`
- `doc/3. Platform/24-trust-and-package-source-policy.yaml`
- `doc/9. Worklog/99-worklog.md`

## 강제 규칙

- 구조 변경은 항상 문서가 먼저다.
- 용어 변경은 `ssot.yaml`과 `ddd.md`를 먼저 수정한다.
- 제품의 중심축이나 사용자 운영 방식이 바뀌면 `14-product-direction.md`, `16-project-operating-model.md`, `15-core-user-scenarios.md`를 먼저 수정한다.
- 구현 범위 변경은 `03-rebuild-roadmap.md`를 먼저 수정한다.
- 데스크톱 셸 구조, 네이티브 기능 범위, 보안 경계 변경은 `04-runtime-platform-plan.md`를 먼저 수정한다.
- 전체 아키텍처의 계층, 관계, 책임, 제어 흐름이 바뀌면 `17-central-architecture.md`를 먼저 수정한다.
- 현재 코드 트리, 핵심 파일 책임, 주요 플로우가 바뀌어도 `17-central-architecture.md`를 먼저 수정한다.
- 저장 포맷, 사람이 읽는 식별자 규칙, IPC/모듈 통신 계약 변경은 `05-system-contracts.yaml`을 먼저 수정한다.
- 새 모듈의 capability, lifecycle, adapter 인터페이스 변경은 `06-module-sdk.yaml`을 먼저 수정한다.
- GUI/CLI/Skill/MCP 제어 규약, project attachment, action log, audit log, replay 규약 변경은 `07-control-plane-and-observability.yaml`을 먼저 수정한다.
- 다언어 패키지 실행 방식, runner/transport, progress log 정규화, observability tier 규약 변경은 `08-external-module-runtime.yaml`을 먼저 수정한다.
- AI 설명 계층, capability tag, example I/O, usage hint, binding recommendation 규약 변경은 `09-ai-usable-module-manifest.yaml`을 먼저 수정한다.
- 브라우저 보안 경계, 터미널/에디터/IDE 유사 환경 선택이 바뀌면 `10-browser-terminal-and-ide-foundation.yaml`을 먼저 수정한다.
- auth provider registry, callback template, redirect registration 예시가 바뀌면 `11-auth-provider-templates.yaml`을 먼저 수정한다.
- Playwright MCP, 브라우저 자동화 bridge, 터미널에서의 브라우저 제어 계약이 바뀌면 `12-browser-automation-and-playwright-mcp.yaml`을 먼저 수정한다.
- 프로젝트 채널, 도메인, ingress port, workspace gateway 라우팅 규약이 바뀌면 `13-channel-domain-and-port-routing.yaml`을 먼저 수정한다.
- Global CLI UX, Textual adoption, `ref/` 기반 reference CLI 분석/재구현 정책, 멀티라인/링크/이미지 붙여넣기 편의 규약이 바뀌면 `18-global-cli-textual-foundation.yaml`을 먼저 수정한다.
- 상태 구조, shallow reference 전략, cache 계층, renderer render boundary, stream backpressure, 성능 기본 정책이 바뀌면 `19-performance-and-optimization-policy.yaml`을 먼저 수정한다.
- secret_ref, redaction, credential lifecycle, export/import secret 정책이 바뀌면 `20-secret-and-credential-management.yaml`을 먼저 수정한다.
- actor별 allow/confirm/deny 권한 매트릭스가 바뀌면 `21-permission-and-policy-matrix.yaml`을 먼저 수정한다.
- 패키징, 코드사인, update 채널, native module release 기준이 바뀌면 `22-build-packaging-and-update.yaml`을 먼저 수정한다.
- poc gate, smoke gate, release gate 기준이 바뀌면 `23-verification-and-release-gates.yaml`을 먼저 수정한다.
- 외부 패키지, 바이너리, skill, mcp, ref 자산의 source trust 기준이 바뀌면 `24-trust-and-package-source-policy.yaml`을 먼저 수정한다.
- 세션 종료 전 `99-worklog.md`를 남기지 않으면 작업이 완료된 것으로 간주하지 않는다.

## 현재 해석

- 예전 CLI 구현 코드는 정리되었지만, 워크플로우 규칙 자체는 폐기되지 않았다.
- 현재 문서가 먼저 기준을 복원했고, 최소 `batcli workflow`와 `docs validate/touch` 명령도 현재 루트 기준으로 다시 연결했다.
- 이후에는 문서 diff 감지나 phase별 파일 잠금 같은 더 강한 자동화로 확장한다.
