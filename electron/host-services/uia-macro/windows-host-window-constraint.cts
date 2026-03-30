import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Windows: build PID tree from Toolhelp32 (spawn root + all descendants), pick the
 * largest visible top-level window in that tree, SetWindowPos to contract outer size,
 * strip WS_MAXIMIZEBOX, and subclass WM_GETMINMAXINFO so min/max track size match (resize lock).
 */

const PS1 = String.raw`param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][int]$Width,
  [Parameter(Mandatory = $true)][int]$Height
)
$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class ClibaseHostRefWin {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")] public static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool Process32FirstW(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool Process32NextW(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr hObject);
  [DllImport("comctl32.dll", SetLastError = true)] public static extern bool InitCommonControlsEx(ref INITCOMMONCONTROLSEX icc);
  [DllImport("comctl32.dll", SetLastError = true)] public static extern bool SetWindowSubclass(IntPtr hWnd, SubclassProc pfnSubclass, UIntPtr uIdSubclass, UIntPtr dwRefData);
  [DllImport("comctl32.dll")] public static extern IntPtr DefSubclassProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam, UIntPtr uIdSubclass, UIntPtr dwRefData);

  [StructLayout(LayoutKind.Sequential)]
  public struct INITCOMMONCONTROLSEX {
    public uint dwSize;
    public uint dwICC;
  }

  [UnmanagedFunctionPointer(CallingConvention.Winapi)]
  public delegate IntPtr SubclassProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam, UIntPtr uIdSubclass, UIntPtr dwRefData);

  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int x; public int y; }
  [StructLayout(LayoutKind.Sequential)] public struct MINMAXINFO {
    public POINT ptReserved;
    public POINT ptMaxSize;
    public POINT ptMaxPosition;
    public POINT ptMinTrackSize;
    public POINT ptMaxTrackSize;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PROCESSENTRY32 {
    public uint dwSize;
    public uint cntUsage;
    public uint th32ProcessID;
    public IntPtr th32DefaultHeapID;
    public uint th32ModuleID;
    public uint cntThreads;
    public uint th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
  }

  public const int GWL_STYLE = -16;
  public const uint WS_MAXIMIZEBOX = 0x00010000;
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOZORDER = 0x0004;
  public const uint SWP_FRAMECHANGED = 0x0020;
  public const uint WM_GETMINMAXINFO = 0x0024;
  public static readonly UIntPtr SubclassId = (UIntPtr)0xC11B45Eu;

  private static HashSet<uint> _whitelist;
  private static IntPtr _bestHwnd;
  private static int _bestArea;
  private static int _trackW;
  private static int _trackH;

  public static readonly SubclassProc SubclassDelegate = SubclassThunk;

  private static IntPtr SubclassThunk(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam, UIntPtr uIdSubclass, UIntPtr dwRefData) {
    if (uMsg == WM_GETMINMAXINFO) {
      MINMAXINFO mmi = (MINMAXINFO)Marshal.PtrToStructure(lParam, typeof(MINMAXINFO));
      mmi.ptMinTrackSize.x = _trackW;
      mmi.ptMinTrackSize.y = _trackH;
      mmi.ptMaxTrackSize.x = _trackW;
      mmi.ptMaxTrackSize.y = _trackH;
      Marshal.StructureToPtr(mmi, lParam, false);
      return IntPtr.Zero;
    }
    return DefSubclassProc(hWnd, uMsg, wParam, lParam, uIdSubclass, dwRefData);
  }

  public static uint[] BuildProcessTree(uint root) {
    var children = new Dictionary<uint, List<uint>>();
    IntPtr snap = CreateToolhelp32Snapshot(2, 0);
    if (snap == IntPtr.Zero || snap == new IntPtr(-1)) {
      return new uint[] { root };
    }
    try {
      var pe = new PROCESSENTRY32();
      pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
      if (!Process32FirstW(snap, ref pe)) {
        return new uint[] { root };
      }
      do {
        if (!children.ContainsKey(pe.th32ParentProcessID)) {
          children[pe.th32ParentProcessID] = new List<uint>();
        }
        children[pe.th32ParentProcessID].Add(pe.th32ProcessID);
      } while (Process32NextW(snap, ref pe));
    } finally {
      CloseHandle(snap);
    }

    var q = new Queue<uint>();
    var seen = new HashSet<uint>();
    q.Enqueue(root);
    seen.Add(root);
    while (q.Count > 0) {
      uint p = q.Dequeue();
      if (!children.ContainsKey(p)) continue;
      foreach (uint c in children[p]) {
        if (seen.Add(c)) {
          q.Enqueue(c);
        }
      }
    }
    return new List<uint>(seen).ToArray();
  }

  private static bool EnumFindBest(IntPtr hWnd, IntPtr lParam) {
    if (GetParent(hWnd) != IntPtr.Zero) {
      return true;
    }
    uint pid;
    GetWindowThreadProcessId(hWnd, out pid);
    if (_whitelist == null || !_whitelist.Contains(pid)) {
      return true;
    }
    if (!IsWindowVisible(hWnd)) {
      return true;
    }
    RECT r;
    if (!GetWindowRect(hWnd, out r)) {
      return true;
    }
    int w = r.Right - r.Left;
    int h = r.Bottom - r.Top;
    if (w < 32 || h < 32) {
      return true;
    }
    int area = w * h;
    if (area > _bestArea) {
      _bestArea = area;
      _bestHwnd = hWnd;
    }
    return true;
  }

  public static IntPtr FindLargestVisibleTopLevel(uint[] pids) {
    _whitelist = new HashSet<uint>();
    foreach (uint p in pids) {
      _whitelist.Add(p);
    }
    _bestHwnd = IntPtr.Zero;
    _bestArea = 0;
    EnumWindows(EnumFindBest, IntPtr.Zero);
    return _bestHwnd;
  }

  public static void Apply(IntPtr hwnd, int width, int height) {
    IntPtr stylePtr = GetWindowLongPtr(hwnd, GWL_STYLE);
    long style = stylePtr.ToInt64();
    style &= ~((long)WS_MAXIMIZEBOX);
    SetWindowLongPtr(hwnd, GWL_STYLE, new IntPtr(style));
    uint flags = SWP_NOMOVE | SWP_NOZORDER | SWP_FRAMECHANGED;
    SetWindowPos(hwnd, IntPtr.Zero, 0, 0, width, height, flags);
    _trackW = width;
    _trackH = height;
    var icc = new INITCOMMONCONTROLSEX();
    icc.dwSize = (uint)Marshal.SizeOf(typeof(INITCOMMONCONTROLSEX));
    icc.dwICC = 0x00004000;
    InitCommonControlsEx(ref icc);
    if (!SetWindowSubclass(hwnd, SubclassDelegate, SubclassId, IntPtr.Zero)) {
      throw new InvalidOperationException("SetWindowSubclass failed: " + Marshal.GetLastWin32Error());
    }
  }

  public static void ApplySoft(IntPtr hwnd, int width, int height) {
    IntPtr stylePtr = GetWindowLongPtr(hwnd, GWL_STYLE);
    long style = stylePtr.ToInt64();
    style &= ~((long)WS_MAXIMIZEBOX);
    SetWindowLongPtr(hwnd, GWL_STYLE, new IntPtr(style));
    uint flags = SWP_NOMOVE | SWP_NOZORDER | SWP_FRAMECHANGED;
    SetWindowPos(hwnd, IntPtr.Zero, 0, 0, width, height, flags);
  }
}
'@

$pids = [ClibaseHostRefWin]::BuildProcessTree([uint32]$ProcessId)
$hwnd = [ClibaseHostRefWin]::FindLargestVisibleTopLevel($pids)
if ($hwnd -eq [IntPtr]::Zero) {
  throw "no_visible_window_for_process_tree"
}
try {
  [ClibaseHostRefWin]::Apply($hwnd, $Width, $Height)
} catch {
  [ClibaseHostRefWin]::ApplySoft($hwnd, $Width, $Height)
}
Write-Output '{"ok":true}'
`;

function getPowerShellExe() {
  const root = process.env.SystemRoot ?? process.env.windir;
  if (root) {
    return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  }

  return "powershell.exe";
}

export function applyHostReferenceWindowConstraintWindows(
  pid: number,
  widthPx: number,
  heightPx: number,
): { ok: boolean; detail?: string } {
  if (process.platform !== "win32") {
    return { ok: false, detail: "not_windows" };
  }

  if (!Number.isFinite(pid) || pid <= 0) {
    return { ok: false, detail: "invalid_pid" };
  }

  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx));

  const tmp = path.join(
    os.tmpdir(),
    `clibase-hostref-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`,
  );

  fs.writeFileSync(tmp, PS1, "utf8");

  try {
    execFileSync(getPowerShellExe(), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tmp, "-ProcessId", String(pid), "-Width", String(w), "-Height", String(h)], {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    });

    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "stderr" in error
          ? String((error as { stderr?: string }).stderr ?? "")
          : String(error);

    return { ok: false, detail: message.trim() || "powershell_failed" };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}
