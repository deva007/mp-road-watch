#!/usr/bin/env python3
"""Apply scripts/data/district-names.json to the published datasets.

Rewrites the `name` field in every {stateId}/districts.json registry and the
embedded district.name in every {stateId}/{code}.json it finds. Idempotent,
atomic (temp file + rename), and rename-only — no other field is touched.

Usage:
  python3 scripts/rename-districts.py public/data/roads          # apply
  python3 scripts/rename-districts.py public/data/roads --check  # CI: fail if any rename pending
"""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from pathlib import Path

NAMES_PATH = Path(__file__).resolve().parent / "data" / "district-names.json"
PLACEHOLDER = re.compile(r"^District \d+$")


def write_atomic(path: Path, payload) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_root", type=Path)
    parser.add_argument("--check", action="store_true", help="fail (exit 1) if any placeholder name remains")
    args = parser.parse_args()

    names = {int(k): v for k, v in json.loads(NAMES_PATH.read_text(encoding="utf-8")).items()}
    renamed = missing_files = unresolved = 0

    for registry_path in sorted(args.data_root.glob("*/districts.json")):
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        changed = False
        for entry in registry:
            target = names.get(entry["code"])
            if PLACEHOLDER.match(entry["name"]):
                if target:
                    entry["name"] = target
                    changed = True
                    renamed += 1
                else:
                    unresolved += 1
            district_file = registry_path.parent / f"{entry['code']}.json"
            if not district_file.is_file():
                missing_files += 1
                continue
            dataset = json.loads(district_file.read_text(encoding="utf-8"))
            info = dataset.get("district", {})
            desired = target or entry["name"]
            if info.get("name") != desired and desired:
                info["name"] = desired
                if not args.check:
                    write_atomic(district_file, dataset)
                renamed += 1
        if changed and not args.check:
            write_atomic(registry_path, registry)

    print(json.dumps({"renamed": renamed, "unresolved": unresolved, "districtFilesMissing": missing_files}))
    if args.check and (renamed or unresolved):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
