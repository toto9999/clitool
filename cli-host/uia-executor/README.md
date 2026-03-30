# UIA executor (FlaUI-class, Python)

Windows 전용. 매크로 스텝 `flaui.*`는 Electron 호스트가 이 스크립트를 `python run_step.py`로 호출하며, 표준 입력으로 JSON 한 줄을 넘깁니다.

## 설치 (권장)

리포 루트에서 Global CLI로 Windows 전용 venv를 만든다 (`.clibase/python/uia-executor`, Textual 호스트 venv와 동일 패밀리).

```bash
batcli install
```

UIA 실행기만 다시 설치할 때:

```bash
batcli uia-executor install
```

`batcli install`에서 UIA venv를 건너뛰려면 `--no-uia-executor`를 쓴다.

수동으로 같은 경로에 맞추려면:

```bash
python -m pip install -r cli-host/uia-executor/requirements.txt
```

(venv를 직접 쓸 경우 Electron은 리포 루트의 `.clibase/python/uia-executor/Scripts/python.exe`가 있으면 자동으로 선택한다.)

인터프리터 우선순위: 환경 변수 `CLIBASE_PYTHON` → `workspace/uia-macros.yaml`의 `uia_adapter.python_executable`(비어 있지 않을 때) → 위 venv 경로(파일이 있을 때) → `PATH`의 `python`.

## stdin JSON

- `action` (string): `click` | `type` | `set_text` | `invoke`
- `selector` (string): 세미콜론으로 구분한 `키:값` 조합. 예: `AutomationId:btnOk` 또는 `Name:Run;ControlType:Button`
- `value` (string, optional): `type`, `set_text`에 사용
- `pid` (number, required): 대상 프로세스 PID
- `timeout_ms` (number, optional)

## stdout

성공 시 한 줄 JSON: `{"ok": true, "detail": "..."}`  
실패 시 비정상 종료 및 stderr에 메시지.
