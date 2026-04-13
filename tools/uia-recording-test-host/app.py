"""
Tkinter test window for CLI UIA recording (no .NET). Title and button text are stable for FlaUI Name: selectors.
Run with the uia-executor venv Python: .clibase/python/uia-executor/Scripts/python.exe app.py
"""

from __future__ import annotations

import tkinter as tk


def main() -> None:
    root = tk.Tk()
    root.title("Clibase UIA Recording Test")
    root.geometry("520x260")

    tk.Label(
        root,
        text="CLI 녹화 검증용 창 (버튼/입력은 UIA Name 기준으로 FlaUI에서 찾습니다).",
        wraplength=480,
        justify="left",
    ).pack(anchor="w", padx=12, pady=(12, 0))

    tk.Button(root, text="Recording test click", width=36, height=2).pack(
        anchor="w",
        padx=12,
        pady=(12, 0),
    )

    tk.Entry(root, width=56).pack(fill=tk.X, padx=12, pady=(12, 12))

    root.mainloop()


if __name__ == "__main__":
    main()
