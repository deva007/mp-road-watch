#!/usr/bin/env python3
"""Validate the published road datasets before deploying.

Guards the deploy pipeline: if the data refresh ever produces a partial,
empty, or corrupt dataset, this script fails the build and the last good
deploy stays live. Run as `python3 scripts/validate-road-data.py public/data/roads`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

MIN_DISTRICTS = 50
MIN_TOTAL_INVENTORY = 30_000
MIN_TOTAL_PROJECTS = 1_000
DISTRICT_KEYS = {"district", "inventory", "ruralProjects"}


def fail(message: str) -> None:
    print(f"VALIDATION FAILED: {message}", file=sys.stderr)
    sys.exit(1)


def main(data_root: Path) -> None:
    registry_path = data_root / "districts.json"
    if not registry_path.is_file():
        fail(f"{registry_path} is missing")

    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"districts.json is not valid JSON: {error}")

    if not isinstance(registry, list) or len(registry) < MIN_DISTRICTS:
        fail(
            f"expected at least {MIN_DISTRICTS} districts, "
            f"found {len(registry) if isinstance(registry, list) else 'non-list payload'}"
        )

    total_inventory = 0
    total_projects = 0
    for entry in registry:
        code = entry.get("code")
        name = entry.get("name")
        if not isinstance(code, int) or not name:
            fail(f"registry entry missing code or name: {entry!r:.120}")

        district_path = data_root / f"{code}.json"
        if not district_path.is_file():
            fail(f"district file {district_path.name} listed in registry but missing")

        try:
            dataset = json.loads(district_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            fail(f"{district_path.name} is not valid JSON: {error}")

        if not DISTRICT_KEYS.issubset(dataset):
            fail(f"{district_path.name} missing keys {DISTRICT_KEYS - set(dataset)}")

        inventory_count = len(dataset["inventory"])
        project_count = len(dataset["ruralProjects"])
        if inventory_count != entry.get("inventoryCount"):
            fail(
                f"{district_path.name}: inventory count {inventory_count} does not "
                f"match registry ({entry.get('inventoryCount')})"
            )
        if project_count != entry.get("activeProjectCount"):
            fail(
                f"{district_path.name}: project count {project_count} does not "
                f"match registry ({entry.get('activeProjectCount')})"
            )

        total_inventory += inventory_count
        total_projects += project_count

    if total_inventory < MIN_TOTAL_INVENTORY:
        fail(f"total inventory {total_inventory} below floor {MIN_TOTAL_INVENTORY} — refusing partial dataset")
    if total_projects < MIN_TOTAL_PROJECTS:
        fail(f"total projects {total_projects} below floor {MIN_TOTAL_PROJECTS} — refusing partial dataset")

    print(
        json.dumps(
            {
                "ok": True,
                "districts": len(registry),
                "inventory": total_inventory,
                "activeProjects": total_projects,
            }
        )
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("public/data/roads"))
