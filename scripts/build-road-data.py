#!/usr/bin/env python3
"""Build district road datasets from official PMGSY status and GIS exports."""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import time
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

import duckdb


GIS_URL = (
    "https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev/"
    "transport/pmgsy-roads/pmgsy_roads.parquet"
)

CATEGORY_LABELS = {
    "NH": "National highway",
    "SH": "State highway",
    "MDR": "Major district road",
    "RR(ODR)": "Other district road",
    "RR(VR)": "Village road",
    "RR(TRACK)": "Rural track",
    "OT": "Other road",
}


def clean(value: str | None) -> str:
    return (value or "").strip()


def number(value: str | None) -> float | None:
    try:
        parsed = float(clean(value))
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def normalize_name(value: str) -> str:
    value = value.lower()
    value = re.sub(r"^(mrl|l|t|vr)\s*\d+[\s:-]*", "", value)
    return re.sub(r"[^a-z0-9]+", "", value)


def road_match_score(left: str, right: str) -> float:
    left_normalized = normalize_name(left)
    right_normalized = normalize_name(right)
    if not left_normalized or not right_normalized:
        return 0.0
    if left_normalized == right_normalized:
        return 1.0
    if left_normalized in right_normalized or right_normalized in left_normalized:
        return 0.93
    return SequenceMatcher(None, left_normalized, right_normalized).ratio()


def route_coordinates(route_json: str) -> list[list[float]] | None:
    payload = json.loads(route_json)
    coordinates = payload.get("coordinates", [])
    if payload.get("type") == "MultiLineString":
        coordinates = max(coordinates, key=len, default=[])
    if len(coordinates) < 2:
        return None
    return [[round(point[1], 6), round(point[0], 6)] for point in coordinates]


def load_active_status(path: Path | None) -> list[dict]:
    if path is None:
        return []
    records: dict[tuple[str, str], dict] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            status = clean(row.get("ROAD_C_COMPLETED_P_PROGRESS_A_F_L_PENDING_"))
            code = clean(row.get("SANCTION_CODE"))
            district_code = clean(row.get("DISTRICT_CODE"))
            if status not in {"Pending", "In Progress"} or not code or not district_code:
                continue
            key = (district_code, code)
            if key not in records:
                records[key] = row
    return list(records.values())


# The parquet is a national export; some revisions carry district/state name
# columns. Detect them so inventory-only states still get readable names.
DISTRICT_NAME_CANDIDATES = [
    "DISTRICT_N",
    "DISTRICT_NA",
    "DISTRICT_NAME",
    "District_Name",
    "DistrictName",
    "District",
    "DISTRICT",
    "district_name",
    "district"
]


def parquet_columns(connection, source: str) -> list[str]:
    rows = connection.execute(f"DESCRIBE SELECT * FROM read_parquet('{source}') LIMIT 0").fetchall()
    return [row[0] for row in rows]


def load_gis(source: str, state_id: int) -> tuple[list[dict], dict[int, str]]:
    connection = duckdb.connect()
    connection.execute("PRAGMA disable_progress_bar")
    connection.execute("INSTALL spatial; LOAD spatial")
    columns = parquet_columns(connection, source)
    name_column = next((c for c in DISTRICT_NAME_CANDIDATES if c in columns), None)
    name_select = f", {name_column} AS district_name" if name_column else ""
    query = f"""
        SELECT
            ER_ID,
            BLOCK_ID,
            DISTRICT_I,
            DRRP_ROAD_,
            RoadCatego,
            RoadName,
            RoadOwner,
            xmin,
            ymin,
            xmax,
            ymax,
            ST_AsGeoJSON(ST_Simplify(geometry, 0.00065)) AS route_json
            {name_select}
        FROM read_parquet('{source}')
        WHERE STATE_ID = {int(state_id)}
          AND RoadName IS NOT NULL
    """
    result_columns = [column[0] for column in connection.execute(query).description]
    unique_roads = {}
    gis_district_names: dict[int, str] = {}
    for row in connection.execute(query).fetchall():
        record = dict(zip(result_columns, row))
        unique_roads.setdefault(record["ER_ID"], record)
        if name_column and record.get("district_name"):
            gis_district_names.setdefault(int(record["DISTRICT_I"]), str(record["district_name"]).strip().title())
    return list(unique_roads.values()), gis_district_names


def load_gis_with_retry(
    source: str, state_id: int, attempts: int = 3, base_delay: float = 30.0
) -> tuple[list[dict], dict[int, str]]:
    """Remote sources (gov mirrors, R2) fail transiently; retry with backoff."""
    for attempt in range(1, attempts + 1):
        try:
            return load_gis(source, state_id)
        except Exception as error:  # noqa: BLE001 - duckdb raises varied types
            if attempt == attempts:
                raise
            delay = base_delay * attempt
            print(f"GIS load failed (attempt {attempt}/{attempts}): {error}; retrying in {delay:.0f}s")
            time.sleep(delay)
    raise RuntimeError("unreachable")


def update_states_index(data_root: Path, state_id: int, state_name: str, district_count: int) -> None:
    """Merge this state's entry into data_root/states.json (the state picker index)."""
    states_path = data_root / "states.json"
    states = []
    if states_path.is_file():
        states = json.loads(states_path.read_text(encoding="utf-8"))
    states = [entry for entry in states if entry.get("id") != state_id]
    states.append({"id": state_id, "name": state_name, "districtCount": district_count})
    states.sort(key=lambda entry: entry["name"])
    with states_path.open("w", encoding="utf-8") as handle:
        json.dump(states, handle, ensure_ascii=True, separators=(",", ":"))


def build(
    status_path: Path | None,
    output_root: Path,
    gis_source: str = GIS_URL,
    state_id: int = 20,
    state_name: str = "Madhya Pradesh",
) -> None:
    active_status = load_active_status(status_path)
    gis_records, gis_district_names = load_gis_with_retry(gis_source, state_id)

    gis_by_district: dict[int, list[dict]] = defaultdict(list)
    gis_by_block: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for road in gis_records:
        district_code = int(road["DISTRICT_I"])
        block_code = int(road["BLOCK_ID"] or 0)
        gis_by_district[district_code].append(road)
        gis_by_block[(district_code, block_code)].append(road)

    status_by_district: dict[int, list[dict]] = defaultdict(list)
    district_names: dict[int, str] = dict(gis_district_names)
    for record in active_status:
        district_code = int(clean(record["DISTRICT_CODE"]))
        district_names[district_code] = clean(record["DISTRICT"])
        status_by_district[district_code].append(record)

    output_root.mkdir(parents=True, exist_ok=True)
    registry = []
    district_codes = sorted(set(gis_by_district) | set(status_by_district))

    for district_code in district_codes:
        inventory = []
        category_counts: dict[str, int] = defaultdict(int)
        district_roads = gis_by_district.get(district_code, [])

        for road in district_roads:
            category = CATEGORY_LABELS.get(clean(road["RoadCatego"]), "Other road")
            category_counts[category] += 1
            bounds = [
                round(float(road["ymin"]), 6),
                round(float(road["xmin"]), 6),
                round(float(road["ymax"]), 6),
                round(float(road["xmax"]), 6),
            ]
            route = route_coordinates(road["route_json"])
            inventory.append(
                {
                    "id": f"gis-{road['ER_ID']}",
                    "name": clean(road["RoadName"]),
                    "code": clean(road["DRRP_ROAD_"]),
                    "category": category,
                    "owner": clean(road["RoadOwner"]) or "Not stated",
                    "blockCode": int(road["BLOCK_ID"] or 0),
                    "bounds": bounds,
                    "route": route,
                }
            )

        rural_projects = []
        stage_counts = {"In progress": 0, "Pending / not started": 0}
        for record in status_by_district.get(district_code, []):
            block_code = int(clean(record.get("BLOCK_CODE")) or 0)
            candidates = gis_by_block.get((district_code, block_code)) or district_roads
            best_match = None
            best_score = 0.0
            road_name = clean(record.get("ROAD_NAME"))
            for candidate in candidates:
                score = road_match_score(road_name, clean(candidate["RoadName"]))
                if score > best_score:
                    best_score = score
                    best_match = candidate

            matched = best_match if best_score >= 0.68 else None
            length = number(record.get("ROAD_LENGTH"))
            completed_length = number(record.get("ROAD_COMPLETED_LENGTH"))
            progress = None
            if length and completed_length is not None and length > 0:
                progress = min(100, round((completed_length / length) * 100))

            raw_status = clean(record.get("ROAD_C_COMPLETED_P_PROGRESS_A_F_L_PENDING_"))
            stage = "In progress" if raw_status == "In Progress" else "Pending / not started"
            stage_counts[stage] += 1

            bounds = None
            route = None
            location_precision = "Block-level anchor"
            if matched:
                bounds = [
                    round(float(matched["ymin"]), 6),
                    round(float(matched["xmin"]), 6),
                    round(float(matched["ymax"]), 6),
                    round(float(matched["xmax"]), 6),
                ]
                route = route_coordinates(matched["route_json"])
                location_precision = "Matched to PMGSY GIS road"

            rural_projects.append(
                {
                    "id": f"pmgsy-{district_code}-{clean(record['SANCTION_CODE'])}",
                    "name": road_name,
                    "code": clean(record["SANCTION_CODE"]),
                    "category": "Village / rural project",
                    "stage": stage,
                    "block": clean(record.get("BLOCK")) or "Block not stated",
                    "scheme": clean(record.get("Textbox12")) or "PMGSY",
                    "batch": clean(record.get("Textbox14")),
                    "year": clean(record.get("YEAR")),
                    "package": clean(record.get("PACKAGE")),
                    "workType": clean(record.get("Textbox22")) or "Road",
                    "length": length,
                    "completedLength": completed_length,
                    "progress": progress,
                    "sanctionDate": clean(record.get("Textbox28")),
                    "agreementDate": clean(record.get("Textbox30")),
                    "contractor": clean(record.get("Textbox32")),
                    "company": clean(record.get("Textbox34")),
                    "locationPrecision": location_precision,
                    "matchScore": round(best_score, 2) if matched else None,
                    "bounds": bounds,
                    "route": route,
                    "sourceUrl": (
                        "https://pmgsy.dord.gov.in/MvcReportViewer.aspx?"
                        f"_r=%2fPMGSYCitizen%2fSanctionAwardProgress&State={state_id}&District={district_code}&Scheme=0"
                    ),
                }
            )

        if district_roads:
            center = [
                round(sum((float(road["ymin"]) + float(road["ymax"])) / 2 for road in district_roads) / len(district_roads), 6),
                round(sum((float(road["xmin"]) + float(road["xmax"])) / 2 for road in district_roads) / len(district_roads), 6),
            ]
        else:
            center = [23.55, 78.2]

        district_name = district_names.get(district_code)
        if not district_name and district_roads:
            district_name = f"District {district_code}"

        payload = {
            "district": {"code": district_code, "name": district_name, "center": center},
            "inventory": sorted(inventory, key=lambda item: (item["category"], item["name"])),
            "ruralProjects": sorted(rural_projects, key=lambda item: (item["stage"] != "In progress", item["name"])),
        }
        with (output_root / f"{district_code}.json").open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=True, separators=(",", ":"))

        registry.append(
            {
                "code": district_code,
                "name": district_name,
                "center": center,
                "inventoryCount": len(inventory),
                "activeProjectCount": len(rural_projects),
                "stageCounts": stage_counts,
                "categoryCounts": dict(sorted(category_counts.items())),
            }
        )

    registry.sort(key=lambda item: item["name"] or "")
    with (output_root / "districts.json").open("w", encoding="utf-8") as handle:
        json.dump(registry, handle, ensure_ascii=True, separators=(",", ":"))

    print(
        json.dumps(
            {
                "districts": len(registry),
                "inventory": sum(item["inventoryCount"] for item in registry),
                "activeProjects": sum(item["activeProjectCount"] for item in registry),
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Build per-district road datasets for one state. "
        "output_root should be the per-state directory, e.g. public/data/roads/20",
    )
    parser.add_argument("output_root", type=Path)
    parser.add_argument(
        "--status-csv",
        type=Path,
        default=None,
        help="OMMAS Sanction Award Progress CSV; omit for an inventory-only build",
    )
    parser.add_argument("--gis-source", default=GIS_URL)
    parser.add_argument("--state-id", type=int, default=20, help="PMGSY STATE_ID (20 = Madhya Pradesh)")
    parser.add_argument("--state-name", default="Madhya Pradesh")
    arguments = parser.parse_args()
    build(
        arguments.status_csv,
        arguments.output_root,
        arguments.gis_source,
        arguments.state_id,
        arguments.state_name,
    )
