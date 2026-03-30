# Agent Governance (Harness Engineering Baseline)

## 목적

이 문서는 이 저장소에서 에이전트가 일관되게 동작하도록 하는 하네스 엔지니어링 기준이다.  
`AGENTS.md`는 짧은 진입 맵으로 유지하고, 본 문서가 상세 정책을 담당한다.

## 적용 범위

- 모든 코드/문서/검증 변경
- GUI, Global CLI(`batcli`), Project CLI, Skill, MCP, AI 제어면
- 로컬 개발, 자동화 검증, 릴리즈 게이트

## 핵심 원칙

### 1. Repo를 시스템 오브 레코드로 유지

- 아키텍처 지식, 운영 규칙, 실행 계획은 반드시 저장소 내부 문서로 남긴다.
- 채팅/구두 합의는 문서 반영 전까지 공식 지식으로 간주하지 않는다.

### 2. AGENTS는 짧게, 상세는 분산 문서로

- 루트 `AGENTS.md`는 진입 지도 역할만 수행한다.
- 상세 계약은 `doc/` 하위 문서로 분산하고 상호 링크한다.
- 도구 호환을 위해 `AGENT.md`(singular)도 함께 유지한다.

### 3. 결정론적(재현 가능) 개발 루프

- 빌드/검증 결과는 선언된 입력에 의존해야 한다.
- 숨은 전역 상태, 수동 프로세스 제어, 임의 셸 우회 루프를 지양한다.
- 운영 계약은 `batcli` 경유로 통일한다.

### 4. 단일 제어면(One Control Plane)

- 안정 기능은 named action으로 노출한다.
- GUI 전용 우회 로직을 만들지 않는다.
- GUI/CLI/AI/Skill/MCP가 동일 action/event/audit 경로를 사용한다.

### 5. 관측 가능성 우선

- 로그는 구조화된 필드와 타임스탬프를 포함한다.
- action/session/trace 상관관계 필드를 유지한다.
- 재현 가능한 분석을 위해 사람이 읽는 키를 우선한다.

### 6. 검증 가능한 문서 강제

- 문서와 구현의 drift를 방치하지 않는다.
- UI/아키텍처 변경은 지정 문서 동시 갱신을 강제한다.
- 세션 종료 시 worklog를 남긴다.

## 실행 표준

### 표준 작업 순서

1. `batcli workflow start "<note>"`
2. `batcli workflow to-doc`
3. `ssot.yaml`, `ddd.md`, 관련 설계 문서 갱신
4. `batcli workflow to-code`
5. 구현
6. 검증 게이트 실행
7. `batcli docs touch "<what changed>"`
8. `batcli workflow stop`

### 최소 검증 게이트

1. `batcli docs validate`
2. `batcli typecheck`
3. `batcli build`
4. `batcli smoke runtime` 또는 범위 제한 smoke
5. `batcli action run ...` 기반 시나리오 검증

## 범용 AGENT 파일 구조 권장안

다른 저장소에도 그대로 이식할 수 있도록 아래 구조를 권장한다.

1. 루트 `AGENTS.md`: 목적, 읽는 순서, 필수 명령, Do/Don’t
2. 루트 `AGENT.md`: 도구 호환용 엔트리(루트 맵으로 포인터)
3. `doc/0. Governance/*`: SSOT, DDD, workflow, agent governance
4. `doc/3. Platform/*`: 시스템 계약(런타임/보안/관측/검증)
5. `doc/9. Worklog/*`: 세션 단위 변경 로그

## 품질 점검 체크리스트

- 문서 우선 규칙이 `batcli docs validate`로 실제 강제되는가
- AGENT/AGENTS 진입점이 분산 문서 구조를 가리키는가
- `batcli` 외 우회 제어면이 생기지 않았는가
- action/event/audit 로그가 구조화되어 있는가
- 새 기능이 CLI + GUI + AI 공통 계약으로 노출되는가
- 식별자가 짧고 의미 있는 alias 규약을 지키는가

## 외부 기준(웹 레퍼런스)

검토일: 2026-03-30

- OpenAI, Harness engineering (에이전트 우선 저장소 설계, AGENTS를 짧은 맵으로 유지, 문서/검증 기계 강제)
  - https://openai.com/index/harness-engineering/
- OpenAI, How OpenAI uses Codex (AGENTS.md의 지속 컨텍스트 역할)
  - https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf
- Bazel Hermeticity (재현 가능한 빌드/테스트 원칙)
  - https://bazel.build/basics/hermeticity
- Playwright Best Practices (사용자 관찰 가능 행동 중심 검증, 안정 locator 전략)
  - https://playwright.dev/docs/best-practices
- OpenTelemetry Logs Data Model (구조화 로그/상관관계 필드 모델)
  - https://opentelemetry.io/docs/specs/otel/logs/data-model/
- AGENT.md format reference (도구 간 호환 파일명/구조 관례 참고)
  - https://github.com/agentmd/agent.md

