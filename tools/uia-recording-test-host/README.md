# UIA recording test host (Python)

`app.py`는 Tkinter 창 하나로, 버튼 문구 **Recording test click**을 FlaUI `Name:` 셀렉터로 잡을 수 있게 합니다. .NET 불필요.

## 단일 EXE로 검증 (권장: “진짜 exe”로 대상 등록)

1. `batcli uia-test-host build-exe` — PyInstaller로 `tools/uia-recording-test-host/dist/UiaRecordingTestHost.exe` 생성
2. `batcli smoke verification --cli-auto-exe` — 위 EXE를 `uia.target`로 두고 녹화·재생 스모크

`--cli-auto`는 `python.exe` + `app.py` 조합이고, `--cli-auto-exe`는 빌드된 EXE 한 개만 실행합니다.

## 준비 (batcli 한 번에)

저장소 루트에서:

```bash
batcli smoke verification --cli-auto
```

`batcli`가 다음을 수행합니다.

- `uia-executor` venv (`batcli install`과 동일한 ensure)
- UiaPeek vendor (`ensure-uiapeek` 경로)
- `app.ping`이 안 되면 `dist` 빌드 후 Electron을 **백그라운드(detached)** 로 띄움
- 스크립트에 `CLIBASE_UIA_EXECUTOR_PYTHON` 전달

## 터미널만으로 녹화 엔진 (Electron 없음)

UiaPeek HTTP만 떠 있으면 SignalR로 이벤트를 받을 수 있습니다. 대상 EXE는 별도로 실행해 두고, 녹화 구간만 캡처합니다.

1. `batcli uia-peek start` (또는 `UiaPeek.exe` 직접 실행)
2. 테스트 창(`UiaRecordingTestHost.exe` 등) 실행 후 사용자 조작
3. `batcli uia record terminal capture --ms 12000`

결과는 `.clibase/uia-terminal-record/`에 `payloads.json`, `steps.yaml`로 저장됩니다.

워크스페이스에 등록·재생은 **Electron 없이** 같은 저장소에서:

```bash
npm run build:electron
batcli uia macro save --macro-key macro-my --target-key target-uia-test-host --steps-file .clibase/uia-terminal-record/steps.yaml
batcli uia macro run --macro-key macro-my --ensure-target-running true
```

(`batcli build`에 electron 빌드가 포함되어 있으면 `build:electron`만 따로 안 해도 됩니다.)

## 한 번에 E2E (터미널만)

**로그인한 Windows 데스크톱에서** PowerShell·cmd·Windows Terminal으로 실행하세요. Cursor/SSH/에이전트 전용 터미널은 stdin이 TTY가 아니거나 세션이 달라 **테스트 EXE 창이 화면에 안 보일 수 있습니다.** 그런 경우 로컬 PowerShell에서 같은 명령을 다시 실행하세요.

타깃이 `workspace/uia-macros.yaml`에 있어야 합니다. 그다음:

```bash
batcli uia pipeline e2e --target-key target-uia-test-host
```

순서: 시작 시 **화면 확인 안내** → (Windows) 등록된 대상 EXE를 **한 번 자동 실행**해 창이 뜨게 함 → Enter 후 `uia record terminal capture` → `uia macro save` → Enter 후 `uia macro run` → 매크로 삭제(기본).

- EXE를 직접 띄우고만 싶으면 `--no-launch-target`
- Enter 없이 자동 진행(CI 등): `--skip-interactive`
- 이미 UiaPeek이 떠 있으면 `--skip-uia-peek`

## 수동

- `batcli uia-executor install`
- `batcli uia-peek download` (녹화 시 HTTP)
- `batcli uia-test-host build` — `app.py` 문법 검사
- Electron: `batcli dev` 또는 위 smoke의 자동 부트스트랩
