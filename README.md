# CLIBase

`ref/basic_reference`를 기준으로 다시 구성하는 워크스페이스 셸 프로젝트입니다.

현재 루트는 `Vite + React + Mantine` 베이스로 재정비되어 있으며, 이 UI는 장기적으로 Electron 데스크톱 셸 안에서 구동될 렌더러 프로토타입입니다. 제품 방향과 작업 기록은 [doc/README.md](c:\MIDAS\code\clibase\doc\README.md)에 정리합니다.

문서 운영 원칙은 유지합니다. 특히 `batcli workflow start -> to-doc -> to-code` 흐름, `doc/0. Governance/ssot.yaml`, `doc/0. Governance/ddd.md` 선행 갱신 규칙은 이 프로젝트에서도 계속 유효한 기준으로 관리합니다.

## 빠른 시작

```bash
npm install
npm run dev
```

배포 빌드는 아래 명령으로 확인합니다.

```bash
npm run build
```

문서 강제 흐름은 아래처럼 사용할 수 있습니다.

```bash
npm run batcli -- workflow start "project shell update"
npm run batcli -- docs validate
npm run batcli -- workflow to-code
npm run batcli -- workflow status
npm run batcli -- docs touch "updated shell planning docs"
npm run batcli -- workflow stop
```

전역 명령으로 쓰려면 `npm link` 후 `batcli ...` 형태로 실행할 수 있습니다.

## 기준 경로

- 실행 기준 앱: `./src`
- 참고 레퍼런스: `./ref/basic_reference`
- 기획/설계 문서: `./doc`
- SSOT 기준: `./doc/0. Governance/ssot.yaml`
- DDD 기준: `./doc/0. Governance/ddd.md`
