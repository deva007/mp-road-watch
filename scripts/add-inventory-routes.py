#!/usr/bin/env python3
"""Add official PMGSY road polylines to generated district inventory files."""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


SERVICE_URL = (
    "https://livingatlas.esri.in/server1/rest/services/"
    "PMGSY/IN_DRRP_Road_2021/MapServer/0/query"
)


def request_features(district_code: int, offset: int) -> dict:
    payload = urllib.parse.urlencode(
        {
            "where": f"st_id=20 AND dist_id={district_code}",
            "outFields": "er_id",
            "returnGeometry": "true",
            "outSR": "4326",
            "geometryPrecision": "6",
            "maxAllowableOffset": "0.00065",
            "resultOffset": str(offset),
            "resultRecordCount": "2000",
            "orderByFields": "objectid ASC",
            "returnTrueCurves": "false",
            "f": "json",
        }
    ).encode("ascii")

    for attempt in range(4):
        try:
            request = urllib.request.Request(SERVICE_URL, data=payload)
            with urllib.request.urlopen(request, timeout=60) as response:
                result = json.load(response)
            if "error" in result:
                raise RuntimeError(result["error"])
            return result
        except (OSError, RuntimeError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("Unreachable retry state")


def district_routes(district_code: int) -> dict[str, list[list[float]]]:
    routes = {}
    offset = 0
    while True:
        result = request_features(district_code, offset)
        features = result.get("features", [])
        for feature in features:
            road_id = str(feature.get("attributes", {}).get("er_id", ""))
            paths = feature.get("geometry", {}).get("paths", [])
            path = max(paths, key=len, default=[])
            if not road_id or len(path) < 2:
                continue
            routes[road_id] = [
                [round(float(point[1]), 6), round(float(point[0]), 6)]
                for point in path
            ]
        if not result.get("exceededTransferLimit") or not features:
            break
        offset += len(features)
    return routes


def add_routes(path: Path, routes: dict[str, list[list[float]]]) -> tuple[int, int]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    matched = 0
    inventory = payload.get("inventory", [])
    for road in inventory:
        road_id = road["id"].removeprefix("gis-")
        route = routes.get(road_id)
        road["route"] = route
        if route:
            matched += 1

    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, separators=(",", ":"))
    return matched, len(inventory)


def build(data_root: Path) -> None:
    with (data_root / "districts.json").open("r", encoding="utf-8") as handle:
        districts = [item for item in json.load(handle) if item["inventoryCount"] > 0]

    route_results = {}
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(district_routes, district["code"]): district
            for district in districts
        }
        for future in as_completed(futures):
            district = futures[future]
            route_results[district["code"]] = future.result()

    matched_total = 0
    inventory_total = 0
    by_district = []
    for district in districts:
        matched, inventory = add_routes(
            data_root / f"{district['code']}.json",
            route_results[district["code"]],
        )
        matched_total += matched
        inventory_total += inventory
        by_district.append(
            {"district": district["name"], "matched": matched, "inventory": inventory}
        )

    print(
        json.dumps(
            {
                "matched": matched_total,
                "inventory": inventory_total,
                "coverage": round(matched_total / inventory_total, 4),
                "districts": by_district,
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("data_root", type=Path)
    arguments = parser.parse_args()
    build(arguments.data_root)
