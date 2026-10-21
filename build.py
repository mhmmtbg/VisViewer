#!/usr/bin/env python3
"""VisViewer derleme betiği (yalnızca standart kütüphane).

  python3 build.py            -> dist/VisViewer.html
  python3 build.py --exe      -> ek olarak dist/VisViewer.exe (Go ile Windows için çapraz derleme)
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
JS_ORDER = ["zip.js", "model.js", "render.js", "edit.js", "ui_core.js", "ui_panels.js"]


def read(p):
    with open(os.path.join(SRC, p), encoding="utf-8") as f:
        return f.read()


def build_html():
    css = read("style.css")
    js = "\n".join(read(f) for f in JS_ORDER)
    html = read("index.html")
    if "</script" in js.lower():
        raise SystemExit("JS içinde </script dizgesi var; satır içi gömülemez.")
    html = html.replace("/*@CSS@*/", css).replace("/*@JS@*/", js)
    out_dir = os.path.join(ROOT, "dist")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "VisViewer.html")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("yazıldı:", out, f"({len(html) // 1024} KB)")
    return out


def build_exe(html_path):
    go = shutil.which("go") or "/usr/local/go/bin/go"
    exe_dir = os.path.join(ROOT, "exe")
    shutil.copyfile(html_path, os.path.join(exe_dir, "VisViewer.html"))
    env = dict(os.environ, GOOS="windows", GOARCH="amd64", CGO_ENABLED="0")
    out = os.path.join(ROOT, "dist", "VisViewer.exe")
    subprocess.check_call(
        [go, "build", "-trimpath", "-ldflags", "-H=windowsgui -s -w", "-o", out, "."],
        cwd=exe_dir, env=env,
    )
    print("yazıldı:", out, f"({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    html = build_html()
    if "--exe" in sys.argv:
        build_exe(html)
