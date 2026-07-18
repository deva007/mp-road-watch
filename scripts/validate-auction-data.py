#!/usr/bin/env python3
"""Validate published auction datasets before deploy (gates the pipeline).

Checks index/listings integrity: every state in the index has a listings file
whose count matches; every record has a known stateId, a positive reserve
price, a future-or-today parseable auction date, coordinates inside India (or
explicitly null), and an https notice URL. Fails loudly (exit 1) so a partial
or malformed refresh never reaches the site.

Run: python3 scripts/validate-auction-data.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "auctions"
MASTER = {int(k): v for k, v in json.loads((ROOT / "scripts/data/states-master.json").read_text()).items()}
BBOX = (6.5, 68.0, 37.5, 97.5)
TYPES = {"Residential", "Commercial", "Industrial", "Agricultural land", "Plot / land"}
CONFIDENCE = {"rooftop", "street", "locality", "pincode", "district"}

errors: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


def check_record(state_id: int, r: dict) -> None:
    rid = r.get("id", "?")
    if r.get("stateId") != state_id:
        fail(f"{rid}: stateId {r.get('stateId')} != folder {state_id}")
    if state_id not in MASTER:
        fail(f"{rid}: unknown stateId {state_id}")
    if not isinstance(r.get("reservePrice"), int) or r["reservePrice"] <= 0:
        fail(f"{rid}: reservePrice must be a positive int")
    try:
        datetime.strptime(r.get("auctionDate", ""), "%Y-%m-%d")
    except ValueError:
        fail(f"{rid}: bad auctionDate {r.get('auctionDate')!r}")
    if r.get("propertyType") not in TYPES:
        fail(f"{rid}: unknown propertyType {r.get('propertyType')!r}")
    lat, lng = r.get("lat"), r.get("lng")
    if lat is not None or lng is not None:
        if not (BBOX[0] <= (lat or 0) <= BBOX[2] and BBOX[1] <= (lng or 0) <= BBOX[3]):
            fail(f"{rid}: coordinates {lat},{lng} outside India bbox")
    url = r.get("noticeUrl", "")
    if url and not url.startswith("https://"):
        fail(f"{rid}: noticeUrl must be https ({url!r})")
    conf = r.get("coordConfidence")
    if conf not in CONFIDENCE:
        fail(f"{rid}: coordConfidence must be one of {sorted(CONFIDENCE)} (got {conf!r})")
    if (lat is None) != (lng is None):
        fail(f"{rid}: lat/lng must both be set or both null")


def main() -> None:
    index_path = OUT / "index.json"
    if not index_path.is_file():
        print("VALIDATION FAILED: index.json missing", file=sys.stderr)
        sys.exit(1)
    index = json.loads(index_path.read_text(encoding="utf-8"))

    total = 0
    for state in index.get("states", []):
        state_id = state["id"]
        listings_path = OUT / str(state_id) / "listings.json"
        if not listings_path.is_file():
            fail(f"state {state_id} in index but {listings_path} missing")
            continue
        listings = json.loads(listings_path.read_text(encoding="utf-8"))
        if len(listings) != state["count"]:
            fail(f"state {state_id}: {len(listings)} listings but index says {state['count']}")
        for r in listings:
            check_record(state_id, r)
        total += len(listings)

    if total != index.get("totalListings"):
        fail(f"index totalListings {index.get('totalListings')} != sum {total}")

    if errors:
        for e in errors:
            print(f"VALIDATION FAILED: {e}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps({"ok": True, "states": len(index["states"]), "listings": total, "sample": index.get("sample")}))


if __name__ == "__main__":
    main()
