#!/usr/bin/env python3
"""Run all site build steps (notes, playlist, offline bundles)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

STEPS = [
    "build-notes.py",
    "build-playlist.py",
    "build-site-data.py",
    "build-music-inline.py",
    "build-live2d-inline.py",
    "build-offline-bundle.py",
]


def main() -> None:
    for name in STEPS:
        script = ROOT / name
        print(f"\n==> {name}")
        subprocess.run([sys.executable, str(script)], check=True)
    print("\nAll build steps completed.")


if __name__ == "__main__":
    main()
