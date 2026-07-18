#!/usr/bin/env python3
"""Build normalized bank e-auction (SARFAESI) datasets for the auction map.

Source of truth is the public IBAPI portal (Indian Banks Auctions Mortgaged
Properties Information, https://www.ibapi.in) plus individual bank e-auction
notices. Those are legally-mandated public notices, refreshed continuously by
the banks; this pipeline re-fetches them on a schedule and normalizes each
notice into one JSON record.

Output layout (mirrors the road data):
  public/data/auctions/index.json                 — states + counts + freshness
  public/data/auctions/{stateId}/listings.json    — normalized notices

IBAPI has no stable scriptable export (ASPX portal, like the OMMAS CSV), so a
real fetch is wired through --source <html-or-json-dump>. Without a source this
runs in --sample mode: it writes a small, clearly-flagged synthetic dataset so
the site renders and the schema stays exercised. Every record carries
`sample: true` until real notices replace it, and the UI shows a banner while
any sample record is present.

Usage:
  python3 scripts/build-auction-data.py --sample
  python3 scripts/build-auction-data.py --source path/to/ibapi_dump.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data" / "auctions"
MASTER_PATH = ROOT / "scripts" / "data" / "states-master.json"

PROPERTY_TYPES = ["Residential", "Commercial", "Industrial", "Agricultural land", "Plot / land"]
INDIA_BBOX = (6.5, 68.0, 37.5, 97.5)  # lat_min, lng_min, lat_max, lng_max

# State-name -> id, from the canonical registry
MASTER = {int(k): v for k, v in json.loads(MASTER_PATH.read_text(encoding="utf-8")).items()}
NAME_TO_ID = {v["name"]: k for k, v in MASTER.items()}


def clean(value) -> str:
    return " ".join(str(value or "").split())


def parse_price(value) -> int | None:
    if value is None:
        return None
    digits = re.sub(r"[^\d.]", "", str(value))
    if not digits:
        return None
    try:
        return int(round(float(digits)))
    except ValueError:
        return None


def normalize(record: dict, sample: bool) -> dict | None:
    """Map one raw notice dict to the published schema. Returns None if unusable."""
    state_name = clean(record.get("state"))
    state_id = record.get("stateId") or NAME_TO_ID.get(state_name)
    reserve = parse_price(record.get("reservePrice"))
    auction_date = clean(record.get("auctionDate"))
    if not state_id or reserve is None or not auction_date:
        return None
    try:
        datetime.strptime(auction_date, "%Y-%m-%d")
    except ValueError:
        return None
    lat, lng = record.get("lat"), record.get("lng")
    coord_conf = record.get("coordConfidence", "district")
    return {
        "id": clean(record.get("id")) or f"{state_id}-{auction_date}-{reserve}",
        "bank": clean(record.get("bank")) or "Not stated",
        "branch": clean(record.get("branch")),
        "propertyType": clean(record.get("propertyType")) or "Plot / land",
        "title": clean(record.get("title")) or "Auction property",
        "address": clean(record.get("address")),
        "district": clean(record.get("district")),
        "pincode": clean(record.get("pincode")),
        "stateId": int(state_id),
        "reservePrice": reserve,
        "emd": parse_price(record.get("emd")),
        "auctionDate": auction_date,
        "noticeUrl": clean(record.get("noticeUrl")),
        "lat": round(float(lat), 6) if lat is not None else None,
        "lng": round(float(lng), 6) if lng is not None else None,
        "coordConfidence": coord_conf,
        "sample": bool(sample),
    }


def write_atomic(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def sample_records() -> list[dict]:
    """Deterministic, clearly-flagged synthetic notices across a few states.

    Coordinates are real city centers so the map renders sensibly; every record
    is sample=true and links to the IBAPI portal home, never a fake notice URL.
    """
    today = date.today()
    seeds = [
        # state, district, city (lat,lng), bank, type, reserve(INR), days_out, pincode
        ("Madhya Pradesh", "Indore", (22.7196, 75.8577), "State Bank of India", "Residential", 4200000, 12, "452001"),
        ("Madhya Pradesh", "Bhopal", (23.2599, 77.4126), "Punjab National Bank", "Commercial", 9500000, 20, "462001"),
        ("Maharashtra", "Pune", (18.5204, 73.8567), "Bank of Baroda", "Residential", 7300000, 9, "411001"),
        ("Maharashtra", "Nagpur", (21.1458, 79.0882), "Union Bank of India", "Industrial", 15800000, 27, "440001"),
        ("Karnataka", "Bengaluru Urban", (12.9716, 77.5946), "Canara Bank", "Plot / land", 6100000, 15, "560001"),
        ("Karnataka", "Mysuru", (12.2958, 76.6394), "State Bank of India", "Residential", 3900000, 6, "570001"),
        ("Tamil Nadu", "Coimbatore", (11.0168, 76.9558), "Indian Bank", "Commercial", 12500000, 18, "641001"),
        ("Tamil Nadu", "Madurai", (9.9252, 78.1198), "Indian Overseas Bank", "Agricultural land", 2800000, 33, ""),
        ("Gujarat", "Ahmedabad", (23.0225, 72.5714), "Bank of Baroda", "Residential", 5400000, 11, "380001"),
        ("West Bengal", "Kolkata", (22.5726, 88.3639), "UCO Bank", "Commercial", 8700000, 22, "700001"),
        ("Uttar Pradesh", "Lucknow", (26.8467, 80.9462), "Bank of India", "Residential", 4600000, 8, "226001"),
        ("Rajasthan", "Jaipur", (26.9124, 75.7873), "Punjab National Bank", "Plot / land", 3300000, 25, "302001"),
    ]
    records = []
    for index, (state, district, (lat, lng), bank, ptype, reserve, days_out, pincode) in enumerate(seeds, start=1):
        auction = today + timedelta(days=days_out)
        records.append({
            "id": f"sample-{index:03d}",
            "bank": bank,
            "branch": f"{district} branch",
            "propertyType": ptype,
            "title": f"{ptype} property, {district}",
            "address": f"{district}, {state}" + (f" - {pincode}" if pincode else ""),
            "district": district,
            "state": state,
            "pincode": pincode,
            "reservePrice": reserve,
            "emd": round(reserve * 0.1),
            "auctionDate": auction.isoformat(),
            "noticeUrl": "https://www.ibapi.in",
            "lat": lat,
            "lng": lng,
            "coordConfidence": "district",
        })
    return records


def load_source(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, list) else raw.get("listings", [])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--source", type=Path, help="IBAPI/bank notices dump (JSON list or {listings:[...]})")
    group.add_argument("--sample", action="store_true", help="write the flagged synthetic seed dataset")
    args = parser.parse_args()

    sample = args.sample
    raw = sample_records() if sample else load_source(args.source)
    normalized = [n for n in (normalize(r, sample) for r in raw) if n]

    by_state: dict[int, list[dict]] = {}
    for record in normalized:
        by_state.setdefault(record["stateId"], []).append(record)

    # Wipe stale state files, then write current ones
    for state_dir in OUT.glob("*/"):
        listings = state_dir / "listings.json"
        if listings.exists():
            listings.unlink()

    states_index = []
    for state_id, listings in sorted(by_state.items()):
        listings.sort(key=lambda r: r["auctionDate"])
        write_atomic(OUT / str(state_id) / "listings.json", listings)
        states_index.append({
            "id": state_id,
            "name": MASTER[state_id]["name"],
            "count": len(listings),
        })

    states_index.sort(key=lambda s: s["name"])
    index = {
        "generatedAt": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "source": "sample" if sample else "IBAPI + bank e-auction notices",
        "sample": sample,
        "totalListings": len(normalized),
        "states": states_index,
    }
    write_atomic(OUT / "index.json", index)
    print(json.dumps({"states": len(states_index), "listings": len(normalized), "sample": sample}))


if __name__ == "__main__":
    main()
