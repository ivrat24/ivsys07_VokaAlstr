#!/usr/bin/env python3
"""Scan site/static/music and regenerate playlist.json."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

AUDIO_EXT = {".mp3", ".ogg", ".wav", ".flac", ".m4a", ".aac", ".opus"}
ROOT = Path(__file__).resolve().parent.parent
VOKA_ROOT = ROOT.parent.parent.parent
SOURCE_MUSIC_DIR = VOKA_ROOT / "static" / "music"
MUSIC_DIR = ROOT / "site" / "static" / "music"
PLAYLIST_FILE = MUSIC_DIR / "playlist.json"


def title_from_filename(name: str) -> str:
    stem = Path(name).stem
    return re.sub(r"[_\-]+", " ", stem).strip() or stem


def sync_source_music() -> int:
    """Copy audio from Voka/static/music into the deployable site folder."""
    if not SOURCE_MUSIC_DIR.exists():
        return 0

    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    for path in sorted(SOURCE_MUSIC_DIR.iterdir()):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXT:
            continue
        target = MUSIC_DIR / path.name
        if not target.exists() or path.stat().st_mtime > target.stat().st_mtime:
            shutil.copy2(path, target)
            copied += 1
    return copied


def main() -> None:
    synced = sync_source_music()
    if synced:
        print(f"Synced {synced} file(s) from {SOURCE_MUSIC_DIR}")

    existing: dict[str, dict] = {}
    if PLAYLIST_FILE.exists():
        try:
            data = json.loads(PLAYLIST_FILE.read_text(encoding="utf-8"))
            for track in data.get("tracks", []):
                file_name = track.get("file")
                if file_name:
                    existing[file_name] = track
        except json.JSONDecodeError:
            pass

    tracks = []
    for path in sorted(MUSIC_DIR.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in AUDIO_EXT:
            continue

        meta = existing.get(path.name, {})
        tracks.append(
            {
                "file": path.name,
                "title": meta.get("title") or title_from_filename(path.name),
                "artist": meta.get("artist") or "",
            }
        )

    payload = {
        "version": 1,
        "source": "static/music",
        "tracks": tracks,
    }
    PLAYLIST_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(tracks)} track(s) to {PLAYLIST_FILE}")


if __name__ == "__main__":
    main()
