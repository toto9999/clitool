param(
  [string]$ExePath = 'C:\Program Files\MIDAS\MODS NX\MIDAS GEN NX\GenNX.exe',
  [string]$ProductProcessName = 'GenNX',
  [string]$WindowTitlePrefix = 'MIDAS GEN NX',
  [string]$ResultPath = '',
  [string]$ScreenshotPath = '',
  [int]$LaunchWaitSec = 18,
  [int]$ActionWaitSec = 12,
  [string[]]$ExtraStopProcessNames = @('apiserver', 'apirunner')
)

$ErrorActionPreference = 'Stop'

function Ensure-ParentDir {
  param([string]$Path)
  $parent = [System.IO.Path]::GetDirectoryName($Path)
  if ($parent) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
}

function New-RectObject {
  param($Rect)
  [ordered]@{
    left = [int]([Math]::Round($Rect.Left))
    top = [int]([Math]::Round($Rect.Top))
    right = [int]([Math]::Round($Rect.Right))
    bottom = [int]([Math]::Round($Rect.Bottom))
    width = [int]([Math]::Round($Rect.Width))
    height = [int]([Math]::Round($Rect.Height))
  }
}

function Get-RootWindowsForProcess {
  param([int]$ProcessId)

  $root = [System.Windows.Automation.AutomationElement]::RootElement
  $cond = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $ProcessId
  )
  $children = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
  $rows = @()
  for ($i = 0; $i -lt $children.Count; $i++) {
    $el = $children.Item($i)
    $rect = $el.Current.BoundingRectangle
    $width = [Math]::Max(0, [int]([Math]::Round($rect.Width)))
    $height = [Math]::Max(0, [int]([Math]::Round($rect.Height)))
    $rows += [ordered]@{
      element = $el
      name = $el.Current.Name
      class_name = $el.Current.ClassName
      control_type = $el.Current.ControlType.ProgrammaticName
      native_window_handle = $el.Current.NativeWindowHandle
      rect = New-RectObject $rect
      area = ($width * $height)
    }
  }
  return $rows
}

function Select-MainWindow {
  param(
    [array]$Windows,
    [string]$Prefix
  )

  $candidates = @($Windows | Where-Object { $_.control_type -like '*Window*' })
  if ($Prefix) {
    $byPrefix = @($candidates | Where-Object { $_.name -like "$Prefix*" })
    if ($byPrefix.Count -gt 0) {
      $candidates = $byPrefix
    }
  }
  if ($candidates.Count -eq 0) {
    $candidates = @($Windows)
  }
  return $candidates | Sort-Object area -Descending | Select-Object -First 1
}

function Get-UniqueTextCandidates {
  param([array]$Windows)

  $rows = New-Object System.Collections.ArrayList
  $seen = @{}
  foreach ($win in $Windows) {
    if ($win.name -and -not $seen.ContainsKey($win.name)) {
      $seen[$win.name] = $true
      [void]$rows.Add([ordered]@{
          source = 'window'
          control_type = $win.control_type
          name = $win.name
        })
    }
    if ($rows.Count -ge 80) {
      break
    }
    try {
      $desc = $win.element.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
      )
      for ($i = 0; $i -lt $desc.Count; $i++) {
        $el = $desc.Item($i)
        $name = $el.Current.Name
        if ([string]::IsNullOrWhiteSpace($name)) {
          continue
        }
        if ($seen.ContainsKey($name)) {
          continue
        }
        $seen[$name] = $true
        [void]$rows.Add([ordered]@{
            source = 'descendant'
            control_type = $el.Current.ControlType.ProgrammaticName
            name = $name
          })
        if ($rows.Count -ge 80) {
          break
        }
      }
    } catch {
    }
    if ($rows.Count -ge 80) {
      break
    }
  }
  return @($rows)
}

function Get-WerArchiveCount {
  param([string]$ProcessName)

  $pattern = "AppCrash_${ProcessName}.exe*"
  return @(
    Get-ChildItem 'C:\ProgramData\Microsoft\Windows\WER\ReportArchive' -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like $pattern }
  ).Count
}

function Get-NewTempFiles {
  $rows = @()
  $tempRoot = Join-Path $env:LOCALAPPDATA 'Temp'
  $files = @(
    Get-ChildItem -LiteralPath $tempRoot -Filter 'NEW*.tmp' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 8
  )
  foreach ($file in $files) {
    $preview = ''
    try {
      $preview = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
    } catch {
      $preview = ''
    }
    if ($preview.Length -gt 240) {
      $preview = $preview.Substring(0, 240)
    }
    $rows += [ordered]@{
      path = $file.FullName
      size_bytes = [int64]$file.Length
      last_write_time = $file.LastWriteTime.ToString('o')
      preview = $preview
    }
  }
  return $rows
}

function Get-WebViewPreferenceSummary {
  $patterns = @(
    (Join-Path $env:LOCALAPPDATA 'Temp\GenNX\*\UserData\EBWebView\User Data\Default\Preferences'),
    (Join-Path $env:LOCALAPPDATA 'Temp\MidasWebView2\WebView2-*\EBWebView\User Data\Default\Preferences')
  )
  $rows = @()
  foreach ($pattern in $patterns) {
    $files = @(Get-ChildItem -Path $pattern -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    foreach ($file in $files) {
      $raw = ''
      try {
        $raw = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop
      } catch {
        $raw = ''
      }
      $rows += [ordered]@{
        path = $file.FullName
        last_write_time = $file.LastWriteTime.ToString('o')
        contains_midasuser = ($raw -match 'midasuser\.com')
        contains_tech_midasuser = ($raw -match 'tech\.midasuser\.com')
      }
    }
  }
  return @($rows | Sort-Object last_write_time -Descending | Select-Object -First 6)
}

function Get-MidasRegistrySummary {
  $rows = @()
  $root = 'HKCU:\Software\MIDAS'
  if (-not (Test-Path -LiteralPath $root)) {
    return $rows
  }
  $keys = @(Get-ChildItem -LiteralPath $root -Recurse -ErrorAction SilentlyContinue)
  foreach ($key in $keys) {
    $props = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
    if (-not $props) {
      continue
    }
    $values = [ordered]@{}
    foreach ($prop in $props.PSObject.Properties) {
      if ($prop.Name -in @('PSPath', 'PSParentPath', 'PSChildName', 'PSDrive', 'PSProvider')) {
        continue
      }
      if ($key.PSChildName -like 'Web Notice*' -or $prop.Name -match 'ENV_NOTICE|mods-url|Installed Path') {
        $values[$prop.Name] = [string]$prop.Value
      }
    }
    if ($values.Count -gt 0) {
      $rows += [ordered]@{
        path = $key.Name
        values = $values
      }
    }
  }
  return @($rows | Select-Object -First 20)
}

if (-not $ResultPath) {
  $ResultPath = Join-Path $env:TEMP 'clibase-midas-new-project-result.json'
}
if (-not $ScreenshotPath) {
  $ScreenshotPath = Join-Path $env:TEMP 'clibase-midas-new-project-screen.png'
}

Ensure-ParentDir $ResultPath
Ensure-ParentDir $ScreenshotPath

$result = [ordered]@{
  status = 'error'
  started_at = (Get-Date).ToString('o')
  exe_path = $ExePath
  product_process_name = $ProductProcessName
  window_title_prefix = $WindowTitlePrefix
  launch_wait_sec = $LaunchWaitSec
  action_wait_sec = $ActionWaitSec
  screenshot_path = $ScreenshotPath
  result_path = $ResultPath
}

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName Microsoft.VisualBasic
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public struct RECT {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}

public static class NativeInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
}
'@

  $stopped = @()
  foreach ($name in @($ProductProcessName) + @($ExtraStopProcessNames)) {
    if ([string]::IsNullOrWhiteSpace($name)) {
      continue
    }
    $procs = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
    foreach ($proc in $procs) {
      $stopped += [ordered]@{
        id = $proc.Id
        process_name = $proc.ProcessName
        session_id = $proc.SessionId
      }
      $proc | Stop-Process -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 2

  if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Exe not found: $ExePath"
  }

  $beforeWer = Get-WerArchiveCount -ProcessName $ProductProcessName
  $launchProc = Start-Process -FilePath $ExePath -WorkingDirectory ([System.IO.Path]::GetDirectoryName($ExePath)) -PassThru
  Start-Sleep -Seconds $LaunchWaitSec

  $currentProc = Get-Process -Name $ProductProcessName -ErrorAction SilentlyContinue | Sort-Object StartTime -Descending | Select-Object -First 1
  if (-not $currentProc) {
    throw "Process not found after launch: $ProductProcessName"
  }

  $windows = @(Get-RootWindowsForProcess -ProcessId $currentProc.Id)
  $mainWindow = Select-MainWindow -Windows $windows -Prefix $WindowTitlePrefix
  if (-not $mainWindow) {
    throw "Unable to resolve the main window for process id $($currentProc.Id)."
  }

  $mainHandle = [IntPtr]$mainWindow.native_window_handle
  $activatedByPid = $false
  $activatedByTitle = $false
  try {
    [Microsoft.VisualBasic.Interaction]::AppActivate($currentProc.Id)
    $activatedByPid = $true
  } catch {
    $activatedByPid = $false
  }
  if (-not $activatedByPid) {
    try {
      $shell = New-Object -ComObject WScript.Shell
      $activatedByTitle = $shell.AppActivate($WindowTitlePrefix)
    } catch {
      $activatedByTitle = $false
    }
  }
  if ($mainHandle -ne [IntPtr]::Zero) {
    [NativeInput]::SetForegroundWindow($mainHandle) | Out-Null
  }
  Start-Sleep -Milliseconds 700

  $rect = $mainWindow.rect
  if ($mainHandle -ne [IntPtr]::Zero) {
    $nativeRect = New-Object RECT
    if ([NativeInput]::GetWindowRect($mainHandle, [ref]$nativeRect)) {
      $rect = [ordered]@{
        left = $nativeRect.Left
        top = $nativeRect.Top
        right = $nativeRect.Right
        bottom = $nativeRect.Bottom
        width = ($nativeRect.Right - $nativeRect.Left)
        height = ($nativeRect.Bottom - $nativeRect.Top)
      }
    }
  }

  $clickX = [Math]::Max(0, [int]$rect.left + 16)
  $clickY = [Math]::Max(0, [int]$rect.top + 52)
  [NativeInput]::SetCursorPos($clickX, $clickY) | Out-Null
  Start-Sleep -Milliseconds 200
  [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
  [NativeInput]::mouse_event([NativeInput]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 800
  [System.Windows.Forms.SendKeys]::SendWait('{HOME}')
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep -Seconds $ActionWaitSec

  $screenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bitmap = New-Object System.Drawing.Bitmap($screenBounds.Width, $screenBounds.Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CopyFromScreen($screenBounds.Location, [System.Drawing.Point]::Empty, $screenBounds.Size)
  $bitmap.Save($ScreenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()

  $afterProc = @(
    Get-Process -Name $ProductProcessName -ErrorAction SilentlyContinue |
      Sort-Object StartTime -Descending |
      Select-Object Id, ProcessName, MainWindowTitle, Responding, SessionId,
        @{ Name = 'StartTime'; Expression = { $_.StartTime.ToString('o') } }
  )
  $afterWer = Get-WerArchiveCount -ProcessName $ProductProcessName
  $windowsAfter = @(Get-RootWindowsForProcess -ProcessId $currentProc.Id)
  $dialogTexts = @(Get-UniqueTextCandidates -Windows $windowsAfter)

  $result.status = 'success'
  $result.ended_at = (Get-Date).ToString('o')
  $result.stopped_processes = $stopped
  $result.launch = [ordered]@{
    pid = $launchProc.Id
    started_process_pid = $currentProc.Id
    activated_by_pid = $activatedByPid
    activated_by_title = $activatedByTitle
  }
  $result.main_window = [ordered]@{
    name = $mainWindow.name
    class_name = $mainWindow.class_name
    control_type = $mainWindow.control_type
    native_window_handle = $mainWindow.native_window_handle
    rect = $rect
    window_candidate_count = @($windows).Count
  }
  $result.interaction = [ordered]@{
    menu_path = 'left_menu -> New Project'
    hamburger_click_point = [ordered]@{
      x = $clickX
      y = $clickY
    }
    keys_sent = @('{HOME}', '{ENTER}')
  }
  $result.process_after = $afterProc
  $result.wer_before = $beforeWer
  $result.wer_after = $afterWer
  $result.crash_delta = ($afterWer - $beforeWer)
  $result.top_windows_after = @(
    $windowsAfter |
      Select-Object name, class_name, control_type, native_window_handle, rect
  )
  $result.dialog_text_candidates = $dialogTexts
  $result.new_tmp_files = Get-NewTempFiles
  $result.webview_profiles = Get-WebViewPreferenceSummary
  $result.registry_summary = Get-MidasRegistrySummary
} catch {
  $result.status = 'error'
  $result.ended_at = (Get-Date).ToString('o')
  $result.error = $_.Exception.Message
  $result.error_record = ($_ | Out-String)
}

$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
