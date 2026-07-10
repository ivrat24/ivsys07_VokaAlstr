#!/usr/bin/env python3
"""Bundle site JS for file:// (double-click index.html) — Chrome blocks ES modules on file://."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYNC_NODE_MODULES = ROOT / "sync" / "node_modules"
ENTRY = ROOT / "site" / "js" / "offline-entry.js"
OUT = ROOT / "site" / "js" / "site-offline.bundle.js"
HTML2PDF_VENDOR = ROOT / "site" / "js" / "vendor" / "html2pdf.bundle.min.js"
HTML2PDF_SRC = SYNC_NODE_MODULES / "html2pdf.js" / "dist" / "html2pdf.bundle.min.js"
HTML2CANVAS_VENDOR = ROOT / "site" / "js" / "vendor" / "html2canvas.min.js"
HTML2CANVAS_SRC = SYNC_NODE_MODULES / "html2canvas" / "dist" / "html2canvas.min.js"
JSPDF_VENDOR = ROOT / "site" / "js" / "vendor" / "jspdf.umd.min.js"
JSPDF_SRC = SYNC_NODE_MODULES / "jspdf" / "dist" / "jspdf.umd.min.js"


def find_esbuild() -> list[str]:
    local = ROOT / "sync" / "node_modules" / ".bin" / ("esbuild.cmd" if sys.platform == "win32" else "esbuild")
    if local.exists():
        return [str(local)]
    npx = shutil.which("npx")
    if npx:
        return [npx, "--yes", "esbuild"]
    raise SystemExit("esbuild not found — run: cd sync && npm install esbuild")


def main() -> None:
    if not ENTRY.exists():
        raise SystemExit(f"Missing entry: {ENTRY}")

    if not HTML2CANVAS_SRC.exists() or not JSPDF_SRC.exists():
        raise SystemExit("Missing html2canvas/jspdf — run: cd sync && npm install")

    vendor_dir = HTML2CANVAS_VENDOR.parent
    vendor_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(HTML2CANVAS_SRC, HTML2CANVAS_VENDOR)
    shutil.copy2(JSPDF_SRC, JSPDF_VENDOR)
    if HTML2PDF_SRC.exists():
        shutil.copy2(HTML2PDF_SRC, HTML2PDF_VENDOR)

    cmd = [
        *find_esbuild(),
        str(ENTRY),
        "--bundle",
        "--format=iife",
        "--platform=browser",
        "--target=es2020",
        f"--outfile={OUT}",
        "--log-level=warning",
    ]
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)
    size_kb = OUT.stat().st_size // 1024
    print(f"Wrote {OUT} ({size_kb} KB)")


if __name__ == "__main__":
    main()
