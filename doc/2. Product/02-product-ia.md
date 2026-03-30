# Product Information Architecture

## 핵심 엔티티

- `Project`: 사용자가 저장하고 실행할 수 있는 최상위 작업 단위
- `ProjectTab`: 한 프로젝트 안의 독립 작업 공간
- `ModuleCatalogItem`: 재사용 가능한 공통 모듈 정의
- `ModuleInstance`: 특정 탭 안에 배치된 모듈 인스턴스
- `LayoutTemplate`: 탭에 적용되는 배치 규칙
- `SkillAttachment`: 프로젝트에 선언적으로 붙는 Skill 실행 surface
- `MCPAttachment`: 프로젝트에 선언적으로 붙는 MCP 실행 surface
- `ExternalModulePackage`: 프로젝트에서 재사용하는 다언어 자동화 라이브러리 실행 단위
- `AIManifest`: AI가 모듈 의미와 추천 연결을 이해하기 위한 설명 계층
- `EditorWorkspaceState`: 브라우저/터미널/에디터/로그 패널을 가진 작업공간 상태
- `AuthProvider`: 시스템 브라우저 인증, callback 방식, scope set 정책을 담는 공급자 정의
- `AuthSession`: 외부 시스템 브라우저 인증과 앱 복귀 콜백을 추적하는 상태
- `WorkspaceGateway`: 프로젝트별 라우팅과 도메인 정책을 가진 workspace 진입 게이트웨이
- `ProjectIngress`: 하나의 프로젝트가 소유하는 단일 ingress 포트와 라우팅 규칙
- `ProjectChannel`: 하나의 프로젝트 아래의 app/api/mcp/auth 같은 하위 채널

## 전체 화면 구조

- 전역 사이드바: 맨 위에 프로젝트 관리 아이콘, 그 아래에 저장된 프로젝트 아이콘
- 프로젝트 탭 스트립: 프로젝트 진입 후 IDE처럼 상단에 탭 목록 표시
- 중앙 작업 영역: 현재 선택된 탭의 레이아웃과 모듈을 렌더링
- 하단 next navigation: ordered project tab 흐름을 따라 다음 탭으로 이동
- 분리 창: 탭 스트립에서 드래그한 탭을 새 top-level window로 띄워 멀티모니터에서 사용

## 제품 관점 요약

- 이 제품의 중심은 GUI가 아니라 `CLI-first automation workbench`다.
- GUI는 글로벌 CLI와 프로젝트 CLI를 설정하고 관찰하는 surface다.
- AI는 같은 action/CLI 계층을 통해 프로젝트를 제어하는 실행자다.

## 프로젝트 관리 화면 역할

- 프로젝트 생성/수정/삭제
- 글로벌 CLI 기준과 프로젝트 CLI 파생 설정 관리
- Textual 기반 Global CLI 작성 환경과 기본 조작 규칙 관리
- 프로젝트 메타데이터 편집
- 프로젝트 내부 탭 생성/정렬/삭제
- 탭별 레이아웃과 모듈 구성 설계
- 탭별 통신 범위와 cross-tab 허용 정책 설정
- 탭의 docked/detached window 기본 동작과 next navigation 흐름 설정
- 프로젝트별 CLI 파생, Skill attachment, MCP attachment, action policy 설정
- 프로젝트에서 사용할 auth provider와 callback 정책 선택
- 프로젝트에서 사용할 browser automation target과 Playwright MCP attachment 정책 선택
- 프로젝트의 internal/external domain과 channel exposure 정책 선택
- 외부 자동화 라이브러리의 package/runtime profile/observability tier 설정
- `ref/` 기반 reference CLI/library 분석 정책과 제품 재구현 범위 설정
- AI manifest와 binding recommendation 정책 설정
- 브라우저/터미널/에디터/로그 패널이 포함된 IDE 유사 작업공간 정책 설정
- 저장 후 전역 사이드바에 프로젝트 아이콘 반영

## 프로젝트 편집 화면 역할

- 선택한 프로젝트의 탭 구조를 상세 편집
- 각 탭의 레이아웃 타입 선택
- 각 탭에 들어갈 모듈 선택 및 배치
- 모듈별 UI/동작 설정의 시작점 제공
- 탭 간 통신 정책, explicit binding, detachable window 동작 편집
- 프로젝트 수준의 automation surface와 action exposure 정책 편집

## 프로젝트 작업공간 역할

- 설계 결과를 실제 작업 셸처럼 보여주는 런타임 화면
- 프로젝트 탭 전환
- 탭별 독립 레이아웃 렌더링
- IDE형 상단 탭, 하단 next 버튼, detached window를 통한 멀티모니터 작업
- 이후 실제 모듈 실행이 붙을 자리 확보

## 사용자 흐름

1. 프로젝트 관리로 진입한다.
2. 새 프로젝트를 만든다.
3. 프로젝트 안에 탭을 추가한다.
4. 탭별로 모듈과 레이아웃을 배치한다.
5. 프로젝트에 필요한 CLI, Skill, MCP attachment와 정책을 설정한다.
6. 저장한다.
7. 전역 사이드바에서 프로젝트를 선택해 런타임 작업공간으로 진입한다.

## 데이터 설계 메모

- 프로젝트 저장 단위는 `Project` 하나다.
- 탭 설정은 프로젝트 내부 배열로 관리한다.
- 모듈은 카탈로그와 인스턴스를 분리해 같은 모듈의 다중 배치를 허용한다.
- 레이아웃은 탭 단위로 저장하고, 모듈 위치 정보는 레이아웃 슬롯 기준으로 매핑한다.
- 탭 간 통신은 기본적으로 격리하고, 허용된 cross-tab binding만 control plane을 통해 흐르게 한다.
- 탭의 분리 창 상태와 모니터 배치는 durable preference와 volatile placement 상태를 나눠 관리해야 한다.
- 각 프로젝트는 글로벌 CLI에서 파생된 자신의 effective CLI 컨텍스트를 가진다.
- 글로벌 CLI가 제품 전체 제어의 기준이며, 프로젝트 CLI는 그 파생이다.
- 최종 Global CLI interactive UX는 React 패널이 아니라 Textual host로 수렴해야 한다.
- 탭과 모듈은 필요할 때만 그 CLI를 오버라이드한다.
- 프로젝트 저장에는 Skill/MCP attachment와 action exposure policy가 포함되어야 한다.
- 외부 라이브러리는 `module-packages.yaml`과 `runtime-profiles.yaml` 기준으로 프로젝트에 연결되어야 한다.
- AI 추천과 자동 연결은 `module-ai-manifests.yaml`과 `binding-policies.yaml`을 기준으로 해야 한다.
- IDE 유사 상태는 `ide-state.yaml` 기준으로 열린 파일과 패널 상태를 복원할 수 있어야 한다.
- 민감 인증은 `auth-state.yaml` 기준으로 앱 내부 상태를 추적하되, 실제 로그인 화면은 필요 시 시스템 브라우저로 분리해야 한다.
- 인증 공급자 정의는 `auth-providers.yaml`에서 관리하고, 프로젝트는 그 선언된 공급자만 선택해야 한다.
- 프로젝트의 공개 기능은 `ProjectIngress` 하나 아래에서 `ProjectChannel` 경로로 관리해야 한다.
- 포트 충돌 회피는 채널별 ad-hoc port가 아니라 workspace gateway와 project ingress registry로 풀어야 한다.
- GUI와 CLI는 같은 action catalog를 기준으로 프로젝트 동작을 제어해야 한다.
- AI도 같은 action catalog와 CLI/action 계층을 기준으로 프로젝트 동작을 제어해야 한다.
- action/event/audit 로그는 프로젝트 분석과 재실행 준비를 위해 별도 버킷으로 누적 저장된다.
- upstream CLI나 도구는 `ref/` 아래에 분석 기준으로 두고, 제품 코드는 그 동작을 참고해 별도로 구현해야 한다.

## 런타임 전제

- `Terminal` 모듈은 실제 PTY 세션과 연결되어야 한다.
- `Browser` 모듈은 외부 웹 콘텐츠를 앱 내부에 띄우되, 원격 콘텐츠에 로컬 권한을 직접 노출하면 안 된다.
- 모듈 간 데이터 교환은 중앙 런타임 버스를 통해서만 일어나야 하며, 임시 전역 객체 공유를 기본 전략으로 삼지 않는다.
- CLI-aware 모듈은 파일을 직접 읽어 합성하지 않고, 런타임이 해석한 effective CLI 컨텍스트를 받아서 사용해야 한다.
- Skill과 MCP는 프로젝트에 attachment로 붙고, 숨은 direct hook이 아니라 control plane 액션으로 동작해야 한다.
- 터미널에서 브라우저를 조작할 때도 raw shell hook이 아니라 project cli 또는 mcp attachment를 통해 control plane으로 들어와야 한다.
- 모든 안정된 앱 동작은 Global CLI와 GUI 양쪽에서 같은 계약으로 호출 가능해야 한다.
- 중요한 실행, 정책 판단, 오류는 로그와 분석 대상이 되어야 한다.
- 중간 로그가 없는 라이브러리도 최소 실행 lifecycle은 앱에서 추적 가능해야 한다.
- AI는 capability tag, usage hint, example I/O, compatibility 정책을 기준으로 모듈을 선택해야 한다.
- 내장 브라우저는 강한 보안 경계 아래 broad best-effort 호환성을 목표로 해야 한다.
