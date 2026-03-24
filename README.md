# CLIBase

`ref/basic_reference`를 기준으로 다시 구성하는 워크스페이스 셸 프로젝트입니다.

현재 루트는 `Vite + React + Mantine` 베이스로 재정비되어 있으며, 이 UI는 장기적으로 Electron 데스크톱 셸 안에서 구동될 렌더러 프로토타입입니다. 제품 방향과 작업 기록은 [doc/README.md](c:\MIDAS\code\clibase\doc\README.md)에 정리합니다.

문서 운영 원칙은 유지합니다. 특히 `batcli workflow start -> to-doc -> to-code` 흐름, `doc/0. Governance/ssot.yaml`, `doc/0. Governance/ddd.md` 선행 갱신 규칙은 이 프로젝트에서도 계속 유효한 기준으로 관리합니다.

## 빠른 시작

```bash
batcli install
batcli dev
```

배포 빌드는 아래 명령으로 확인합니다.

```bash
batcli build
```

문서, 타입, 빌드를 한 번에 검증하려면 아래 명령을 사용합니다.

```bash
batcli verify
```

실행 중인 Electron 앱에 첫 runtime action을 보내려면 아래처럼 사용합니다.

```bash
batcli action run --action app.ping
batcli action run --action app.logs.tail --limit 20
batcli action run --action browser.get-state
batcli action run --action browser.navigate --url https://example.com
batcli action run --action browser.automation.click --selector a
batcli action run --action browser.capture-screenshot --output .clibase/artifacts/screenshots/current.png
```

문서 강제 흐름은 아래처럼 사용할 수 있습니다.

```bash
batcli workflow start "project shell update"
batcli docs validate
batcli workflow to-code
batcli workflow status
batcli docs touch "updated shell planning docs"
batcli workflow stop
```

전역 명령으로 쓰려면 `npm link` 후 `batcli ...` 형태로 실행할 수 있습니다.

`npm run dev`, `npm run build`, `npm run typecheck`, `npm run verify`도 모두 내부적으로 `batcli`를 통하도록 맞춰집니다.

아직 글로벌 `batcli`가 없는 초기 clone에서는 repo 루트에서 `.\batcli install`로 bootstrap 한 뒤, 이후부터 plain `batcli ...`를 사용합니다. `batcli install`은 의존성 설치 후 `npm link`까지 수행해 글로벌 명령을 연결합니다.

## 기준 경로

- 실행 기준 앱: `./src`
- 참고 레퍼런스: `./ref/basic_reference`
- 기획/설계 문서: `./doc`
- SSOT 기준: `./doc/0. Governance/ssot.yaml`
- DDD 기준: `./doc/0. Governance/ddd.md`
