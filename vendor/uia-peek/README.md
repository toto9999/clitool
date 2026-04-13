# UiaPeek (optional vendor drop)

Download the **Windows win-x64 .zip** from [UiaPeek releases](https://github.com/g4-api/uia-peek/releases) and **extract all files** into this folder (`vendor/uia-peek/`). The zip contains `UiaPeek.exe` plus `UiaPeek.dll`, dependency assemblies, `appsettings.json`, and `UiaPeek.runtimeconfig.json`. Copying only `UiaPeek.exe` will fail at startup (no HTTP on port 9955).

`batcli uia-peek download` installs the full bundle automatically. When GitHub is unreachable, unzip manually so this directory looks like the extracted release (not exe-only).

The Electron app checks here before downloading into app userData.

## Prerequisites (automated)

From the repo root, one of:

```bash
batcli install
```

(Windows: also installs ASP.NET Core runtime for UiaPeek when missing, unless `batcli install --no-dotnet-aspnetcore`.)

Or only the .NET runtime:

```bash
batcli uia-peek install-runtime
```

## Launch (recommended)

From the repo root:

```bash
batcli uia-peek start
```

(`uia-peek start` runs `install-runtime` logic automatically when `CLIBASE_UIAPEEK_SKIP_RUNTIME_INSTALL` is not set.)

This uses Node `spawn` with a full path. Do **not** use `cmd /c start "" "…\\UiaPeek.exe"` from Git Bash: the `start` command’s first argument is the window title, and broken quoting can make Windows try to run `\\` and show “Windows cannot find '\\\\'” (or `₩₩` on Korean Windows).

Alternatives: double-click `UiaPeek.exe` in Explorer, or run `batcli uia-peek start` from PowerShell or `cmd.exe`.

## If HTTP never comes up

- **.NET runtime:** UiaPeek is an **ASP.NET Core** host (HTTP on port 9955). Install **ASP.NET Core Runtime** (x64), not only “.NET Desktop Runtime”. Run `dotnet --list-runtimes` and confirm a line `Microsoft.AspNetCore.App …`. The default vendor install uses release **v2025.10.27.5** (net8). `CLIBASE_UIAPEEK_RELEASE_TAG=latest` may require **.NET 10** (`UiaPeek.runtimeconfig.json`).
- Override release: `set CLIBASE_UIAPEEK_RELEASE_TAG=latest` (newest; needs .NET 10) or `set CLIBASE_UIAPEEK_RELEASE_TAG=v2025.10.27.5` then `batcli uia-peek download --force`.
- Retry: `batcli uia-peek start` uses several spawn attempts; set `CLIBASE_UIAPEEK_HTTP_WAIT_MS=180000` or `CLIBASE_UIAPEEK_START_ATTEMPTS=5` for slow machines.
- See UiaPeek console output: `set CLIBASE_UIAPEEK_SPAWN_DEBUG=1` then `batcli uia-peek start` (stdio inherited; may not combine well with all terminals).
- Antivirus / corporate policy may block the process; try running `UiaPeek.exe` once from Explorer to allow it.
