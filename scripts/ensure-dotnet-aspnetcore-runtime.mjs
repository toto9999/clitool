/**
 * Ensures .NET shared runtimes UiaPeek needs: Microsoft.AspNetCore.App + Microsoft.WindowsDesktop.App
 * (same channel, e.g. 8.0). Default install home is workspace-local `.clibase/dotnet`.
 *
 * Usage:
 *   batcli uia-peek install-runtime [--channel 8.0]
 *   node scripts/ensure-dotnet-aspnetcore-runtime.mjs [--channel 8.0]
 *
 * Env:
 *   CLIBASE_UIAPEEK_DOTNET_CHANNEL — default 8.0 (alias: CLIBASE_UIAPEEK_ASPNETCORE_CHANNEL)
 *   CLIBASE_UIAPEEK_DOTNET_DIR — override local install dir (default `<repo>/.clibase/dotnet`)
 *   CLIBASE_UIAPEEK_SKIP_RUNTIME_INSTALL — if "1", exit 1 when missing (no install)
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DOTNET_INSTALL_SCRIPT =
  "https://builds.dotnet.microsoft.com/dotnet/scripts/v1/dotnet-install.ps1";

function resolveInstallDir() {
  return (
    process.env.CLIBASE_UIAPEEK_DOTNET_DIR?.trim() ||
    path.join(repoRoot, ".clibase", "dotnet")
  );
}

function parseChannel(argv) {
  let channel = (
    process.env.CLIBASE_UIAPEEK_DOTNET_CHANNEL ||
    process.env.CLIBASE_UIAPEEK_ASPNETCORE_CHANNEL ||
    "8.0"
  ).trim();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--channel" && argv[i + 1]) {
      channel = String(argv[(i += 1)]).trim();
      break;
    }
  }
  return channel || "8.0";
}

function majorFromChannel(channel) {
  return String(channel || "8.0").split(".")[0] || "8";
}

function enrichedPathEnv(installDir) {
  const env = { ...process.env };
  const localDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "dotnet");
  const progDir = path.join(process.env.ProgramFiles || "", "dotnet");
  const parts = [installDir, localDir, progDir, env.PATH || ""].filter(Boolean);
  env.PATH = parts.join(path.delimiter);
  return env;
}

function listRuntimesText(installDir) {
  const env = enrichedPathEnv(installDir);
  const tryExe = [
    path.join(installDir, "dotnet.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "dotnet", "dotnet.exe"),
    path.join(process.env.ProgramFiles || "", "dotnet", "dotnet.exe"),
  ];
  for (const exe of tryExe) {
    if (fs.existsSync(exe)) {
      const r = spawnSync(exe, ["--list-runtimes"], {
        encoding: "utf8",
        windowsHide: true,
        env,
        shell: false,
      });
      if (r.status === 0) {
        return r.stdout || "";
      }
    }
  }
  const r = spawnSync("dotnet", ["--list-runtimes"], {
    encoding: "utf8",
    windowsHide: true,
    env,
    shell: false,
  });
  return r.status === 0 ? r.stdout || "" : "";
}

/** UiaPeek is ASP.NET + Windows Desktop (WPF/WinForms); both shared frameworks must resolve. */
function hasUiaPeekDotnetRuntimes(channel, installDir) {
  const t = listRuntimesText(installDir);
  const major = majorFromChannel(channel);
  const asp = new RegExp(`Microsoft\\.AspNetCore\\.App\\s+${major}\\.`, "m");
  const desk = new RegExp(`Microsoft\\.WindowsDesktop\\.App\\s+${major}\\.`, "m");
  return asp.test(t) && desk.test(t);
}

function installOneDotnetRuntime(runtimeName, channel, installDir) {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const ps = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!fs.existsSync(ps)) {
    console.error("PowerShell not found; cannot run dotnet-install.ps1.");
    return false;
  }
  const escapedUrl = DOTNET_INSTALL_SCRIPT.replace(/'/g, "''");
  const escapedDir = installDir.replace(/'/g, "''");
  const escapedCh = String(channel).replace(/'/g, "''");
  const escapedRt = runtimeName.replace(/'/g, "''");

  const scriptBody = [
    "$ErrorActionPreference = 'Stop'",
    `$uri = '${escapedUrl}'`,
    `$dst = Join-Path $env:TEMP 'clibase-dotnet-install.ps1'`,
    `Invoke-WebRequest -Uri $uri -OutFile $dst -UseBasicParsing`,
    `& $dst -Runtime '${escapedRt}' -Channel '${escapedCh}' -InstallDir '${escapedDir}'`,
  ].join("; ");

  console.log(`\n--- dotnet-install.ps1 (${runtimeName} ${channel}) → ${installDir} ---\n`);

  const r = spawnSync(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", scriptBody], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  return (r.status ?? 1) === 0;
}

function installViaDotnetScript(channel, installDir) {
  const runtimes = ["aspnetcore", "windowsdesktop"];
  for (const rt of runtimes) {
    if (!installOneDotnetRuntime(rt, channel, installDir)) {
      return false;
    }
  }
  return true;
}

function main() {
  if (process.platform !== "win32") {
    console.log("ensure-dotnet-aspnetcore-runtime: skipped (Windows only).");
    process.exit(0);
  }

  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage: batcli uia-peek install-runtime [--channel 8.0]",
        "  Installs AspNetCore + WindowsDesktop shared runtimes (UiaPeek).",
        "  --channel X   default 8.0 or CLIBASE_UIAPEEK_DOTNET_CHANNEL",
      ].join("\n"),
    );
    process.exit(0);
  }

  const channel = parseChannel(argv);
  const installDir = resolveInstallDir();

  if ((process.env.CLIBASE_UIAPEEK_SKIP_RUNTIME_INSTALL || "").trim() === "1") {
    if (!hasUiaPeekDotnetRuntimes(channel, installDir)) {
      console.error(
        `UiaPeek .NET runtimes missing under ${installDir} and CLIBASE_UIAPEEK_SKIP_RUNTIME_INSTALL=1.`,
      );
      process.exit(1);
    }
    process.exit(0);
  }

  if (hasUiaPeekDotnetRuntimes(channel, installDir)) {
    console.log(
      `UiaPeek .NET runtimes already present under ${installDir} (Microsoft.AspNetCore.App + Microsoft.WindowsDesktop.App).`,
    );
    process.exit(0);
  }

  console.log(
    `Installing .NET shared runtimes for UiaPeek into ${installDir} (ASP.NET Core + Windows Desktop)…`,
  );

  const ok = installViaDotnetScript(channel, installDir);

  if (!ok) {
    console.error(
      `Install failed for ${installDir}. Run \`batcli uia-peek install-runtime\` again or install manually: https://dotnet.microsoft.com/download/dotnet`,
    );
    process.exit(1);
  }

  if (!hasUiaPeekDotnetRuntimes(channel, installDir)) {
    console.log(
      "\nInstall finished but runtimes are still not visible in this process.",
      "Open a new terminal, or ensure PATH includes:",
      installDir,
    );
    process.exit(1);
  }

  console.log(`\nOK: UiaPeek .NET runtimes are available under ${installDir}.`);
  process.exit(0);
}

main();
