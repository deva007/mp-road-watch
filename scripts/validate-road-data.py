#!/usr/bin/env python3
"""Validate the published road datasets before deploying.

Guards the deploy pipeline: if a data refresh ever produces a partial,
empty, or corrupt dataset, this script fails the build and the last good
deploy stays live.

Layout: data_root/states.json lists states; each state's district files
live in data_root/{stateId}/ with a districts.json registry.

Run as `python3 scripts/validate-road-data.py public/data/roads`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

MIN_TOTAL_INVENTORY = 30_000
MIN_TOTAL_PROJECTS = 1_000
DISTRICT_KEYS = {"district", "inventory", "ruralProjects"}


def fail(message: str) -> None:
    print(f"VALIDATION FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: Path):
    if not path.is_file():
        fail(f"{path} is missing")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{path} is not valid JSON: {error}")


def validate_state(data_root: Path, state: dict) -> tuple[int, int]:
    state_id = state.get("id")
    if not isinstance(state_id, int) or not state.get("name"):
        fail(f"states.json entry missing id or name: {state!r:.120}")

    state_dir = data_root / str(state_id)
    registry = load_json(state_dir / "districts.json")
    if not isinstance(registry, list) or not registry:
        fail(f"{state_dir}/districts.json is empty")
    if len(registry) != state.get("districtCount"):
        fail(
            f"state {state_id}: registry has {len(registry)} districts but "
            f"states.json says {state.get('districtCount')}"
        )

    total_inventory = 0
    total_projects = 0
    for entry in registry:
        code = entry.get("code")
        if not isinstance(code, int) or not entry.get("name"):
            fail(f"state {state_id}: registry entry missing code or name: {entry!r:.120}")

        district_path = state_dir / f"{code}.json"
        dataset = load_json(district_path)
        if not DISTRICT_KEYS.issubset(dataset):
            fail(f"{district_path.name} missing keys {DISTRICT_KEYS - set(dataset)}")

        inventory_count = len(dataset["inventory"])
        project_count = len(dataset["ruralProjects"])
        if inventory_count != entry.get("inventoryCount"):
            fail(
                f"{district_path}: inventory count {inventory_count} does not "
                f"match registry ({entry.get('inventoryCount')})"
            )
        if project_count != entry.get("activeProjectCount"):
            fail(
                f"{district_path}: project count {project_count} does not "
                f"match registry ({entry.get('activeProjectCount')})"
            )

        total_inventory += inventory_count
        total_projects += project_count

    return total_inventory, total_projects


def main(data_root: Path) -> None:
    states = load_json(data_root / "states.json")
    if not isinstance(states, list) or not states:
        fail("states.json must list at least one state")

    total_inventory = 0
    total_projects = 0
    total_districts = 0
    for state in states:
        inventory, projects = validate_state(data_root, state)
        total_inventory += inventory
        total_projects += projects
        total_districts += state["districtCount"]

    if total_inventory < MIN_TOTAL_INVENTORY:
        fail(f"total inventory {total_inventory} below floor {MIN_TOTAL_INVENTORY} — refusing partial dataset")
    if total_projects < MIN_TOTAL_PROJECTS:
        fail(f"total projects {total_projects} below floor {MIN_TOTAL_PROJECTS} — refusing partial dataset")

    print(
        json.dumps(
            {
                "ok": True,
                "states": len(states),
                "districts": total_districts,
                "inventory": total_inventory,
                "activeProjects": total_projects,
            }
        )
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("public/data/roads"))
