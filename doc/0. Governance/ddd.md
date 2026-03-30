# DDD Development Rule

## Bounded Contexts

### workspace-shell

- Scope: 전역 사이드바, 프로젝트 진입, 프로젝트 상단 탭 스트립, 중앙 작업 셸, 분리 창
- Main screens: `ProjectManagement`, `ProjectEditor`, `ProjectWorkspace`
- Responsibility: 화면 전환 구조와 전체 정보 구조를 유지한다.

### project-management

- Scope: 프로젝트 생성, 프로젝트 메타데이터 편집, 탭 추가/삭제/정렬
- Responsibility: 프로젝트를 실행하는 것이 아니라 설계하고 저장하는 흐름을 담당한다.

### runtime-workspace

- Scope: 저장된 프로젝트 진입 후 탭 단위 작업 공간 렌더링
- Responsibility: 선택된 탭의 레이아웃과 모듈 인스턴스를 표시한다.

### module-catalog

- Scope: 공통 모듈 정의, 탭 내 모듈 인스턴스 생성 규칙
- Responsibility: 브라우저/터미널/PDF 같은 공통 모듈을 프로젝트에 재사용 가능하게 제공한다.

### runtime-services

- Scope: PTY 세션, 브라우저 web contents, 모듈 간 IPC 버스, 권한 제어
- Responsibility: 렌더러 UI가 직접 OS 권한에 접근하지 않고도 필요한 기능을 사용하게 한다.

### control-plane

- Scope: GUI, Global CLI, Project CLI, Skill, MCP, 정책 엔진, 액션/이벤트/감사 로그
- Responsibility: 모든 제어 표면이 같은 액션 계약과 같은 감사 경로를 쓰게 한다.

### external-runtime

- Scope: Python, Node, Go, shell, renderer bundle, remote service 기반 외부 모듈 실행 표준
- Responsibility: 언어와 실행 방식이 달라도 같은 입력/중간상태/결과 계약으로 정규화한다.

### ai-planning

- Scope: AI manifest, capability tag, intent hint, example I/O, binding recommendation, anti-pattern
- Responsibility: AI가 모듈 선택과 연결을 이름 추측이 아니라 선언된 의미와 정책으로 수행하게 한다.

### ide-workspace

- Scope: browser panel, terminal panel, editor panel, logs/problems/tasks panel
- Responsibility: IDE 유사 작업환경을 제공하되 보안 경계를 무너뜨리지 않는다.

### governance

- Scope: `batcli workflow`, `ssot.yaml`, `ddd.md`, 문서 선행 갱신 규칙
- Responsibility: 코드보다 문서가 먼저 바뀌도록 강제한다.

## Ubiquitous Language

- `Project`: 사용자가 저장하고 진입할 수 있는 최상위 작업 단위
- `AutomationWorkbench`: 글로벌 CLI, 프로젝트 CLI, GUI, AI가 같은 계약으로 프로젝트를 제어하는 작업환경
- `GlobalCLIBase`: 모든 프로젝트 CLI가 파생되는 전역 CLI 기준
- `BatCLI`: GlobalCLIBase를 실행하는 권위 있는 executable namespace
- `ProjectCLIContext`: 특정 프로젝트에 맞게 파생된 effective CLI 컨텍스트
- `CentralArchitectureDocument`: 전체 시스템의 계층, 책임, 제어 흐름, 저장 구조를 중앙화해 유지하는 마스터 문서
- `CodebaseMap`: 현재 실제 코드 트리와 파일 책임을 중앙 문서에 유지하는 코드 구조 지도
- `TextualCLIHost`: Textual 기반의 권위 있는 Global CLI interactive host
- `ReferenceLibrary`: `ref/` 아래에 보관되며 분석과 착안의 기준으로 쓰는 업스트림 CLI/도구 자산
- `StructuralSharing`: 변경된 상태 가지에만 새 참조를 만들고 나머지 참조는 유지하는 상태 갱신 원칙
- `ProjectionCache`: durable truth에서 다시 만들 수 있는 분석/요약 캐시
- `BackpressureGate`: terminal, browser, log stream이 renderer를 압도하지 않도록 배치/샘플링/절단하는 경계
- `SecretRef`: 사람이 읽을 수 있는 비밀값 식별자이며, raw secret 자체가 아니다
- `SecretService`: host에서만 동작하는 secret create/resolve/rotate/revoke 계층
- `PermissionDecision`: allow, confirm, deny, dev-only 중 하나의 정책 판단
- `ReleaseGate`: 배포 전에 반드시 통과해야 하는 검증 기준
- `TrustedSource`: 패키지, 바이너리, Skill, MCP, ref 자산의 출처와 신뢰 수준 기록
- `ProjectTab`: 프로젝트 내부의 독립 작업 공간
- `ProjectTabStrip`: 프로젝트 내부 탭을 IDE처럼 상단에 배치하는 주 탭 surface
- `ProjectWindow`: 하나의 프로젝트에 속한 메인 또는 분리 런타임 창
- `DetachedTabWindow`: 특정 탭을 별도 top-level window로 분리한 런타임 창
- `TabCommunicationPolicy`: 탭 내부 통신만 허용할지, 명시된 cross-tab 통신을 허용할지 정의하는 정책
- `ModuleCatalogItem`: 공통 모듈 정의
- `ModuleInstance`: 특정 탭에 배치된 모듈 인스턴스
- `LayoutTemplate`: 탭에 적용되는 배치 규칙
- `RuntimeHost`: 렌더러 밖에서 네이티브 기능을 제공하는 데스크톱 셸
- `ModuleBus`: 모듈 간 명령과 이벤트를 중계하는 런타임 계약
- `ControlPlane`: GUI, CLI, Skill, MCP가 공통 액션 계약으로 들어오는 상위 제어 계층
- `ControlAction`: 사람이 읽을 수 있는 key로 추적되는 표준 실행 요청
- `SkillAttachment`: 프로젝트에 선언적으로 붙는 Skill 실행 surface
- `MCPAttachment`: 프로젝트에 선언적으로 붙는 MCP bridge surface
- `ActionLog`: 실행 요청과 결과를 남기는 append-only 기록
- `AuditLog`: 정책 판단과 설정 변경을 남기는 append-only 기록
- `ExternalModulePackage`: 실제 실행 단위를 설명하는 다언어 패키지 manifest
- `RuntimeProfile`: 언어별 런타임 실행 환경과 bootstrap 규칙
- `ObservabilityTier`: 라이브러리가 중간 상태를 얼마나 풍부하게 제공하는지에 대한 정직한 등급
- `ExecutionTrace`: 실행 중간상태와 최종결과를 묶는 추적 단위
- `AIManifest`: 모듈 의미, 예제, 용도, 비용, 호환성을 설명하는 ai 친화적 선언
- `BindingPolicy`: 어떤 capability 조합을 추천/허용/금지하는지 설명하는 규칙
- `BrowserSessionProfile`: 내장 브라우저의 partition, permission, trust 정책 단위
- `AuthProvider`: provider class, callback mode, scope set, token 저장 규칙을 가진 인증 공급자 정의
- `WorkspaceGateway`: 전체 workspace 요청을 host/path 기준으로 프로젝트 ingress로 라우팅하는 진입 게이트웨이
- `ProjectIngress`: 하나의 프로젝트가 소유하는 단일 canonical http ingress 포트
- `ProjectChannel`: 하나의 프로젝트 ingress 아래에서 `/app`, `/api`, `/mcp` 같은 하위 기능을 나누는 공개 경로 규칙
- `EditorWorkspaceState`: 열린 파일, 커서, 패널 상태를 담는 IDE 유사 상태 단위
- `AuthSession`: 외부 시스템 브라우저 인증, PKCE state, callback 만료를 관리하는 런타임 상태 단위
- `ProjectManagement`: 프로젝트를 설계하는 화면
- `ProjectWorkspace`: 저장된 프로젝트를 실행 관점에서 보는 화면
- `UIEngineeringGovernance`: UI 레이아웃 소유권, 리사이즈 동기화, 패널 레이어링, 문서-코드 동기 검증을 정의한 강제 계약
- `SeedUrlRef`: 브라우저 seed 시작 페이지를 가리키는 읽기 쉬운 `seed://<purpose>` 별칭
- `ObjectKeyAlias`: `project_key`, `tab_key`, `module_key`, `browser_key`, `terminal_key`, `window_key` 같은 객체 식별자를 UUID 대신 prefix 기반 짧은 별칭으로 관리하는 규약
- `AgentGovernance`: 루트 `AGENTS.md`(짧은 맵), `AGENT.md`(호환 엔트리), `agent-governance.md`(상세 규약)로 구성된 에이전트 운영 기준
- `FlaUIExecutor`: 데스크톱 Win32 UIA 쪽에서 매크로 재실행·작업 수행을 맡기는 실행 엔진 축; 매크로 저장·재실행·안정적 운용의 중심으로 둔다
- `UiaPeekInspector`: Peek/Record/체인·경계 확인 등 “현장 조사·탐색기” 축; 셀렉터·구조 파악·recorder 보조에 쓰고 실행 본체와 분리해 둔다

## Development Rule

- 구조, 용어, 엔티티가 바뀌면 `doc/0. Governance/ssot.yaml`과 이 문서를 먼저 수정한다.
- 에이전트 작업 절차, 하네스 검증 기준, AGENT/AGENTS 운영 규칙이 바뀌면 `AgentGovernance` 문서를 먼저 수정한다.
- 전체 아키텍처 수준의 변경은 `CentralArchitectureDocument`를 먼저 갱신하고, 이후 세부 계약 문서를 맞춘다.
- `CentralArchitectureDocument`는 개념 요약만이 아니라 `CodebaseMap`, 현재 구현 상태, 핵심 플로우를 포함해야 한다.
- 이 제품의 중심은 GUI가 아니라 `AutomationWorkbench`와 그 핵심 제어면인 `GlobalCLIBase`다.
- `BatCLI`는 GlobalCLIBase의 공식 실행 이름이며, workflow와 제품 제어 명령은 이 namespace 아래에 모인다.
- `TextualCLIHost`는 최종 Global CLI UX의 기준이며, 현재 React 패널은 임시 프로토타입이다.
- `ProjectManagement`는 편집 화면이지 런타임 화면이 아니다.
- 전역 사이드바는 프로젝트 전환용이며, 프로젝트 탭 전환의 주 surface는 `ProjectTabStrip`이다.
- `DetachedTabWindow`는 제품 요구이며, macOS 전용 native tab 기능에 기대지 않고 제품 코드에서 관리한다.
- 모듈은 프로젝트 전용 정의가 아니라 공통 카탈로그에서 가져온다.
- 탭마다 레이아웃과 모듈 구성이 독립적이어야 한다.
- `TabCommunicationPolicy` 없이 탭 간 메시지를 암묵적으로 허용하면 안 된다.
- 브라우저 모듈과 터미널 모듈은 직접 서로를 호출하지 않고 `ModuleBus`를 통해 통신한다.
- GUI, Global CLI, Project CLI, Skill, MCP는 직접 구현 내부를 호출하지 않고 `ControlPlane`에 `ControlAction`을 보낸다.
- 새 기능은 GUI에만 붙어 있으면 완료된 것이 아니며, `GlobalCLIBase`와 `ProjectCLIContext`를 통해 제어 가능해야 한다.
- 프로젝트에 붙는 Skill과 MCP는 선언적 attachment로 관리하고, 숨은 전역 훅으로 붙이지 않는다.
- 모든 안정된 동작은 `ActionLog`와 `AuditLog`에서 추적 가능해야 한다.
- 외부 라이브러리는 구현 언어가 아니라 `ExternalModulePackage` 계약으로 붙인다.
- 라이브러리에 중간 로그가 없더라도 `ObservabilityTier`를 숨기면 안 되며, 필요한 최소 실행 이벤트는 host가 보정한다.
- AI 자동화는 `AIManifest`와 `BindingPolicy` 없이 이름 기반으로 모듈을 추측 연결하면 안 된다.
- AI는 별도 특권 통로가 아니라 `AutomationWorkbench`의 같은 CLI/action 계층을 통해 시스템을 제어해야 한다.
- `ReferenceLibrary`는 `ref/` 아래에서 출처와 목적이 추적 가능해야 하며, 제품 코드는 이를 직접 링크하지 않고 분석 후 새로 구현해야 한다.
- `StructuralSharing`은 renderer 성능 최적화의 기본 원칙이며, 작은 변경 때문에 전체 프로젝트 트리를 deep copy하면 안 된다.
- `ProjectionCache`는 source of truth가 아니며, 항상 durable logs나 config에서 재생성 가능해야 한다.
- `BackpressureGate` 없이 raw runtime stream을 renderer 전역 상태로 밀어 넣으면 안 된다.
- `SecretRef`는 YAML에 저장할 수 있지만 raw secret value는 저장하면 안 된다.
- `SecretService`는 renderer나 AI에서 직접 우회 호출할 수 없고 host 계층에서만 비밀값을 해석한다.
- `PermissionDecision`은 GUI, CLI, AI, Skill, MCP 모두에 공통으로 적용되어야 한다.
- `ReleaseGate`를 통과하지 못한 기능이나 패키지는 release-ready로 간주하면 안 된다.
- `TrustedSource` 기록 없는 외부 의존성은 자동화 경로에 올리면 안 된다.
- IDE 유사 편의기능이 필요해도 원격 페이지에는 로컬 권한을 직접 주면 안 된다.
- OAuth와 민감 인증은 내장 브라우저에 억지로 고정하지 않고 `AuthSession`과 시스템 브라우저 플로우를 우선한다.
- 인증 공급자별 callback mode, scope class, token 저장 규칙은 `AuthProvider`로 yaml에 먼저 선언해야 한다.
- 프로젝트의 공개 http 기능은 `ProjectIngress` 하나 아래의 `ProjectChannel`로 정리하고, 숨은 public port를 늘리지 않는다.
- `WorkspaceGateway`는 host/path 라우팅을 담당하고, ad-hoc reverse proxy 설정을 모듈마다 따로 두지 않는다.
- 원격 웹 콘텐츠는 `RuntimeHost`의 로컬 권한을 직접 획득할 수 없어야 한다.

## Governance Rule

- 모든 작업은 `batcli workflow start`로 시작한다.
- 문서 변경이 필요한 작업은 반드시 `to-doc` 단계에서 먼저 처리한다.
- 문서 반영 없이 코드 구현을 진행하면 안 된다.
- 구현 후 문서가 달라졌다면 다시 `to-doc`로 돌아가서 맞춘 뒤 진행한다.
- UI 코드 변경(`src/main.tsx`, `src/app/*`, `src/styles/*`, `electron/preload/*`, `electron/main/*`, `electron/host-services/browser/*`)은 `UIEngineeringGovernance` 문서를 참고하고 필요한 경우 같은 작업에서 갱신해야 한다.
