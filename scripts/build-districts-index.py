#!/usr/bin/env python3
"""Build a global district index for the search box.

Scans every published state's districts.json and emits one flat list of
{code, name, stateId, stateName} so the UI search can jump to ANY district
in the country, not just the loaded state. Names stay in English (the UI
translates via the locale files at render time).

Output: public/data/roads/districts-index.json
Run after the road data exists:  python3 scripts/build-districts-index.py
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROADS = ROOT / "public" / "data" / "roads"


def write_atomic(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main() -> None:
    states = {s["id"]: s["name"] for s in json.loads((ROADS / "states.json").read_text(encoding="utf-8"))}
    entries = []
    for registry_path in sorted(ROADS.glob("*/districts.json"), key=lambda p: int(p.parent.name)):
        state_id = int(registry_path.parent.name)
        state_name = states.get(state_id)
        if not state_name:
            continue
        for d in json.loads(registry_path.read_text(encoding="utf-8")):
            entries.append({
                "code": d["code"],
                "name": d["name"],
                "stateId": state_id,
                "stateName": state_name,
            })
    entries.sort(key=lambda e: (e["stateName"], e["name"]))
    write_atomic(ROADS / "districts-index.json", json.dumps(entries, ensure_ascii=False, separators=(",", ":")))
    print(json.dumps({"districts": len(entries), "states": len(states)}))


if __name__ == "__main__":
    main()
