#!/usr/bin/env python3
"""Reconcile states.json from {stateId}/ data directories.

State names come ONLY from scripts/data/states-master.json — the single
canonical STATE_ID -> name registry (PMGSY GIS STATE_IDs are states and
UTs in alphabetical order; verified geometrically against district
centroids). Never pass display names on the command line.

Fails loudly (exit 1) if a data directory's ID is missing from the master,
marked unbuildable, or if two states would share a display name. Writes
states.json atomically and deterministically so retries are always safe.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

MASTER_PATH = Path(__file__).resolve().parent / "data" / "states-master.json"


def load_master() -> dict[int, dict]:
    raw = json.loads(MASTER_PATH.read_text(encoding="utf-8"))
    return {int(state_id): entry for state_id, entry in raw.items()}


def main(data_root: Path) -> None:
    data_root = Path(data_root)
    master = load_master()
    states: list[dict] = []
    problems: list[str] = []

    for state_dir in sorted(data_root.iterdir(), key=lambda p: p.name):
        if not state_dir.is_dir():
            continue
        try:
            state_id = int(state_dir.name)
        except ValueError:
            continue
        districts_file = state_dir / "districts.json"
        if not districts_file.exists():
            continue
        try:
            registry = json.loads(districts_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            problems.append(f"state {state_id}: districts.json is not valid JSON: {error}")
            continue
        if not isinstance(registry, list) or not registry:
            continue

        entry = master.get(state_id)
        if entry is None:
            problems.append(f"state id {state_id} has data but is missing from states-master.json")
            continue
        if not entry.get("buildable", True):
            problems.append(
                f"state id {state_id} ({entry['name']}) has data but is marked unbuildable in states-master.json"
            )
            continue
        states.append({"id": state_id, "name": entry["name"], "districtCount": len(registry)})

    names = [state["name"] for state in states]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        problems.append(f"duplicate state names (two IDs mapped to one state): {duplicates}")

    if problems:
        for problem in problems:
            print(f"ERROR: {problem}", file=sys.stderr)
        raise SystemExit(1)

    states.sort(key=lambda state: state["name"])
    payload = json.dumps(states, ensure_ascii=False, indent=2) + "\n"

    states_file = data_root / "states.json"
    fd, tmp_path = tempfile.mkstemp(dir=data_root, prefix=".states-", suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(payload)
        os.replace(tmp_path, states_file)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    print(json.dumps({"states": len(states), "stateIds": sorted(s["id"] for s in states)}))


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("public/data/roads"))
