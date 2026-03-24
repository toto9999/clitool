# Reference Baseline

## 기준 원본

- 경로: `ref/basic_reference`
- 성격: Figma 기반 UI 코드 번들
- 현재 역할: 시각 구조와 화면 분리 방식의 참고 기준

## 이번에 채택한 요소

- `Vite + React` 루트 구조
- `Mantine` 중심 UI 구성
- `ProjectManagement / ProjectEditor / ProjectWorkspace` 화면 분리
- 전역 사이드바 + 프로젝트 탭 사이드바라는 기본 셸 구조

## 이번에 의도적으로 제외한 요소

- 기존 루트의 오래된 CLI 구현 코드
- 구버전 빌드 산출물과 로컬 의존성 폴더
- 레퍼런스에 있던 미사용 대형 UI 컴포넌트 번들
- 레퍼런스의 사용되지 않는 이미지/피그마 import 부산물

## 유지해야 하는 운영 요소

- 문서 우선 개발 원칙
- `batcli workflow start -> to-doc -> to-code` 단계 강제 개념
- `doc/0. Governance/ssot.yaml`, `doc/0. Governance/ddd.md`를 기준으로 용어와 구조를 고정하는 방식
- 구현 후 `99-worklog.md`를 남기는 작업 기록 규칙

## 2026-03-23 기준 정리 내역

- 삭제: 구 `src/`, `scripts/`, `dist/`, `node_modules/`, `.husky/`, `.midas/`, `.policy/`, `policy/`
- 삭제: 구 `package-lock.json`, `midas.config.json`
- 교체: 루트 `package.json`, `README.md`, `tsconfig.json`
- 신규: `index.html`, `vite.config.ts`, `postcss.config.mjs`, `doc/*`

## 남아 있는 후속 작업

- 화면 내부의 mock 데이터를 실제 도메인 모델로 교체
- 프로젝트 저장/불러오기 방식 정의
- 모듈 카탈로그와 탭 레이아웃 규칙 정교화
- 현재 UI 루트에 맞는 `batcli workflow/docs validate`를 더 강한 자동화로 확장
