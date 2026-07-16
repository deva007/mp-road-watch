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


def load_active_status(path: Path) -> list[dict]:
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


def load_gis(source: str) -> list[dict]:
    connection = duckdb.connect()
    connection.execute("PRAGMA disable_progress_bar")
    connection.execute("INSTALL spatial; LOAD spatial")
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
        FROM read_parquet('{source}')
        WHERE STATE_ID = 20
          AND RoadName IS NOT NULL
    """
    columns = [column[0] for column in connection.execute(query).description]
    unique_roads = {}
    for row in connection.execute(query).fetchall():
        record = dict(zip(columns, row))
        unique_roads.setdefault(record["ER_ID"], record)
    return list(unique_roads.values())


def load_gis_with_retry(source: str, attempts: int = 3, base_delay: float = 30.0) -> list[dict]:
    """Remote sources (gov mirrors, R2) fail transiently; retry with backoff."""
    for attempt in range(1, attempts + 1):
        try:
            return load_gis(source)
        except Exception as error:  # noqa: BLE001 - duckdb raises varied types
            if attempt == attempts:
                raise
            delay = base_delay * attempt
            print(f"GIS load failed (attempt {attempt}/{attempts}): {error}; retrying in {delay:.0f}s")
            time.sleep(delay)
    raise RuntimeError("unreachable")


def build(status_path: Path, output_root: Path, gis_source: str = GIS_URL) -> None:
    active_status = load_active_status(status_path)
    gis_records = load_gis_with_retry(gis_source)

    gis_by_district: dict[int, list[dict]] = defaultdict(list)
    gis_by_block: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for road in gis_records:
        district_code = int(road["DISTRICT_I"])
        block_code = int(road["BLOCK_ID"] or 0)
        gis_by_district[district_code].append(road)
        gis_by_block[(district_code, block_code)].append(road)

    status_by_district: dict[int, list[dict]] = defaultdict(list)
    district_names: dict[int, str] = {}
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
                        f"_r=%2fPMGSYCitizen%2fSanctionAwardProgress&State=20&District={district_code}&Scheme=0"
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
    parser = argparse.ArgumentParser()
    parser.add_argument("status_csv", type=Path)
    parser.add_argument("output_root", type=Path)
    parser.add_argument("--gis-source", default=GIS_URL)
    arguments = parser.parse_args()
    build(arguments.status_csv, arguments.output_root, arguments.gis_source)
