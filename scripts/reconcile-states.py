#!/usr/bin/env python3
"""Reconcile states.json by scanning all {stateId}/ directories.

Generates states.json atomically from discovered state directories.
This enables parallel builds without race conditions on states.json.
"""

from __future__ import annotations

import json
from pathlib import Path


def main(data_root: Path) -> None:
    data_root = Path(data_root)
    states = []

    # Scan all state directories
    for state_dir in sorted(data_root.iterdir()):
        if not state_dir.is_dir() or state_dir.name in (".", ".."):
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
            if not isinstance(registry, list) or not registry:
                continue

            # Extract state name from first district entry if available
            state_name = None
            for entry in registry:
                if entry.get("name"):
                    # Try to extract state name from district name (heuristic)
                    state_name = entry.get("state_name")
                    break

            if not state_name:
                state_name = f"State {state_id}"

            states.append({
                "id": state_id,
                "name": state_name,
                "districtCount": len(registry)
            })
        except (json.JSONDecodeError, KeyError):
            continue

    # Sort by name
    states.sort(key=lambda s: s["name"])

    # Write states.json atomically
    states_file = data_root / "states.json"
    states_file.write_text(json.dumps(states, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")

    print(json.dumps({
        "states": len(states),
        "stateIds": sorted([s["id"] for s in states])
    }))


if __name__ == "__main__":
    import sys
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("public/data/roads"))
