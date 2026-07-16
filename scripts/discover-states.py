#!/usr/bin/env python3
"""List the states available in the national PMGSY GIS parquet.

Prints the parquet's columns and one line per STATE_ID with its road count
(and state/district name columns when the export carries them). Used by the
data-build workflow's discover mode to find STATE_IDs before building.
"""

from __future__ import annotations

import json
import sys

import duckdb

GIS_URL = (
    "https://pub-0429b8e3b5a946e69ea007df844a6f1c.r2.dev/"
    "transport/pmgsy-roads/pmgsy_roads.parquet"
)

STATE_NAME_CANDIDATES = ["STATE_NAME", "STATE_N", "STATE_NA", "State_Name", "StateName"]


def main(source: str) -> None:
    connection = duckdb.connect()
    connection.execute("PRAGMA disable_progress_bar")

    columns = [
        row[0]
        for row in connection.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{source}') LIMIT 0"
        ).fetchall()
    ]
    print(json.dumps({"columns": columns}))

    name_column = next((c for c in STATE_NAME_CANDIDATES if c in columns), None)
    name_select = f", any_value({name_column}) AS state_name" if name_column else ""
    rows = connection.execute(
        f"""
        SELECT STATE_ID, count(*) AS roads {name_select}, any_value(RoadName) AS sample_road
        FROM read_parquet('{source}')
        GROUP BY STATE_ID
        ORDER BY STATE_ID
        """
    ).fetchall()
    for row in rows:
        entry = {"stateId": row[0], "roads": row[1]}
        if name_column:
            entry["stateName"] = row[2]
            entry["sampleRoad"] = row[3]
        else:
            entry["sampleRoad"] = row[2]
        print(json.dumps(entry))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else GIS_URL)
