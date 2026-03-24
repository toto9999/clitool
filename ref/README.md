# Launcher Browser + Bridge Base

이 디렉터리는 아래 기반 요구를 빠르게 검증하기 위한 시작점입니다.

- 런처 이벤트를 서버로 전달
- 웹 콘솔(React) 기반 브리지 확인
- Mantine UI 기반 테마(다크/라이트) 적용
- Electron 런처 내장 브라우저 실행
- 하단 터미널 로그 실시간 확인
- 브라우저 커스터마이징(CSS/JS 주입) 및 통신
- `symphony` 라이브러리 연결 어댑터 제공

## 왜 Electron 런처가 필요한가

React 웹의 `iframe` 방식은 대상 사이트의 보안 정책(`X-Frame-Options`, `CSP frame-ancestors`)에 의해 차단될 수 있습니다.
실제 브라우저 엔진을 런처 프로세스에 내장하려면 `BrowserView/WebContents` 기반이 필요합니다.

## 브리지 서버 + 웹 콘솔 실행

```bash
cd ref
npm install
npm run dev
```

- 웹 콘솔: `http://localhost:5173`
- 브리지 서버: `http://localhost:7071`

## Mantine 테마 세팅

루트 CLI 기준으로 아래 명령을 사용합니다.

```bash
cd /c/MIDAS/code/clibase
batcli ui setup-mantine
```

## Electron 런처 실행

```bash
cd ref/launcher
npm install
npm run settings:init
npm run dev
```

`npm run dev`는 변경 반영을 위해 다음을 동시에 실행합니다.

- TypeScript watch 컴파일
- renderer/sidebar 자산 복사 watch
- Electron 실행

레이아웃/스타일/패널 스크립트 변경 시 런처 재실행 없이 하단 패널/사이드바가 자동 reload 됩니다.

또는 `ref` 루트에서

```bash
npm run launcher:dev
```

## 구조

- `src/server.ts`
  - REST API + WebSocket 브로드캐스트
  - 터미널 명령 실행 결과를 웹으로 스트리밍
- `src/symphonyAdapter.ts`
  - `symphony` 동적 로딩
  - 라이브러리 미설치 시 mock 모드
- `web/src/App.tsx`
  - 상단 브라우저 iframe
  - 하단 터미널 로그
  - symphony 연결 버튼
- `launcher/src/main.ts`
  - 런처 윈도우에 좌측 사이드바 + 우측 브라우저 + 하단 패널 분할 배치
  - VS Code 스타일의 좌측 고정 사이드바 레이아웃
- `launcher/src/preload.ts`
  - 하단 패널에 안전한 설정 API 노출
- `launcher/src/sidebarPreload.ts`
  - 좌측 사이드바에서 설정 패널 열기 이벤트 전달
- `launcher/src/settings.ts`
  - 라이트/다크 모드 및 레이아웃 설정 중앙 관리
- `launcher/src/launcherCli.ts`
  - CLI 기반 설정 파일 생성/테마 변경
- `launcher/src/renderer.ts`
  - 하단 패널 영역 중앙 텍스트 및 설정 모달 UI
- `launcher/src/sidebar.ts`
  - 하단 설정 버튼 동작
- `launcher/src/shared.ts`
  - IPC 메시지 타입 정의

## 레이아웃 확인 포인트

- 좌측 사이드바 중앙: `LEFT SIDEBAR`
- 우측 하단 패널 중앙: `RIGHT BOTTOM PANEL`
- 브라우저 영역은 우측 상단에 실제 브라우저 엔진으로 렌더링

## 런처 설정 CLI

```bash
cd ref/launcher
npm run settings:init
npm run settings:dark
npm run settings:light
```

## symphony 실제 연결

프로젝트에 맞는 `symphony` 패키지를 설치한 뒤, `src/symphonyAdapter.ts`의 `connect`/`send` 로직을 실제 SDK API에 맞춰 보완하면 됩니다.
