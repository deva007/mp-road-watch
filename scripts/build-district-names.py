#!/usr/bin/env python3
"""Build scripts/data/district-names.json (DRRP district code -> English name).

The PMGSY GIS parquet revision we use carries no district-name column, so
names are derived by spatially joining each district's road-derived center
against district boundary polygons (GeoJSON with `district` name properties,
e.g. https://github.com/udit-001/india-maps-data geojson/states/).

Codes are national DRRP codes (verified unique across all states), so the
output is a flat {code: name} map. States whose registries already carry
real names (Madhya Pradesh, or anything fed from an OMMAS status CSV) are
taken as-is — the spatial join never overrides a real name.

Assignment per state: greedy one-to-one on (containment first, then
boundary distance), so two centers can't silently take the same polygon.
Leftovers (dataset has newer/split districts than the boundary vintage)
get their containing polygon's name and are flagged in the review report.

Usage:
  python3 scripts/build-district-names.py public/data/roads path/to/geojson/states \
      [--report district-names-review.md]
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from shapely.geometry import Point, shape

MASTER_PATH = Path(__file__).resolve().parent / "data" / "states-master.json"
OUT_PATH = Path(__file__).resolve().parent / "data" / "district-names.json"
PLACEHOLDER = re.compile(r"^District \d+$")

SLUG_OVERRIDES = {
    "Dadra and Nagar Haveli": "dnh-and-dd",
    "Andaman and Nicobar Islands": "andaman-and-nicobar-islands",
}


def slug(name: str) -> str:
    return SLUG_OVERRIDES.get(name, name.lower().replace(" ", "-"))


def load_polygons(geojson_dir: Path, state_name: str):
    path = geojson_dir / f"{slug(state_name)}.geojson"
    if not path.is_file():
        return None
    collection = json.loads(path.read_text(encoding="utf-8"))
    polygons = []
    for feature in collection.get("features", []):
        name = " ".join(str(feature["properties"].get("district", "")).split())
        if not name:
            continue
        polygons.append((name, shape(feature["geometry"])))
    return polygons


def assign(centers: list[tuple[int, Point]], polygons) -> tuple[dict[int, str], list[str]]:
    """Greedy one-to-one assignment; returns (code -> name, flags)."""
    pairs = []
    for code, point in centers:
        for index, (name, geom) in enumerate(polygons):
            contained = geom.contains(point)
            cost = 0.0 if contained else point.distance(geom)
            pairs.append((cost, code, index, contained))
    pairs.sort(key=lambda item: item[0])

    named: dict[int, str] = {}
    used_polygons: set[int] = set()
    confidence: dict[int, tuple[float, bool]] = {}
    for cost, code, index, contained in pairs:
        if code in named or index in used_polygons:
            continue
        named[code] = polygons[index][0]
        used_polygons.add(index)
        confidence[code] = (cost, contained)

    flags = []
    for code, point in centers:
        if code not in named:  # more districts than polygons — reuse containing/nearest
            best = min(
                range(len(polygons)),
                key=lambda i: 0.0 if polygons[i][1].contains(point) else point.distance(polygons[i][1]),
            )
            named[code] = polygons[best][0]
            flags.append(f"code {code}: no free polygon — reused {polygons[best][0]!r} (newer district than boundary vintage?)")
        else:
            cost, contained = confidence[code]
            if not contained and cost > 0.1:
                flags.append(f"code {code}: assigned {named[code]!r} by distance {cost:.3f}° — verify manually")
    return named, flags


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_root", type=Path)
    parser.add_argument("geojson_dir", type=Path)
    parser.add_argument("--report", type=Path, default=Path("district-names-review.md"))
    args = parser.parse_args()

    master = {int(k): v for k, v in json.loads(MASTER_PATH.read_text(encoding="utf-8")).items()}
    mapping: dict[int, str] = {}
    report: list[str] = []

    for state_id, entry in sorted(master.items()):
        registry_path = args.data_root / str(state_id) / "districts.json"
        if not registry_path.is_file():
            continue
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        real = [(d["code"], d["name"]) for d in registry if not PLACEHOLDER.match(d["name"])]
        placeholder = [(d["code"], Point(d["center"][1], d["center"][0])) for d in registry if PLACEHOLDER.match(d["name"])]

        for code, name in real:  # keep real names (MP, CSV-fed states) verbatim
            mapping[code] = name

        if not placeholder:
            continue
        polygons = load_polygons(args.geojson_dir, entry["name"])
        if not polygons:
            report.append(f"## {entry['name']} ({state_id})\n- NO BOUNDARY FILE — {len(placeholder)} districts left as placeholders\n")
            continue
        named, flags = assign(placeholder, polygons)
        mapping.update(named)
        header = f"## {entry['name']} ({state_id}) — {len(placeholder)} named from {len(polygons)} polygons\n"
        report.append(header + "".join(f"- {flag}\n" for flag in flags))

    OUT_PATH.write_text(
        json.dumps({str(k): mapping[k] for k in sorted(mapping)}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    args.report.write_text(
        "# District name spatial-join review\n\nEdit scripts/data/district-names.json to correct any entry; "
        "rename-districts.py re-applies it.\n\n" + "\n".join(report),
        encoding="utf-8",
    )
    print(json.dumps({"named": len(mapping), "reviewFlags": sum(r.count("- ") for r in report)}))


if __name__ == "__main__":
    main()
