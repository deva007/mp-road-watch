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
    # National spread — one representative city per buildable state so the map
    # shows coverage everywhere. Clearly flagged sample; real IBAPI data replaces it.
    seeds = [
        # state, city/district, (lat, lng), bank, type, reserve, days_out, pincode
        ("Andhra Pradesh", "Visakhapatnam", (17.6868, 83.2185), "State Bank of India", "Residential", 5200000, 12, "530001"),
        ("Arunachal Pradesh", "Itanagar", (27.0844, 93.6053), "State Bank of India", "Plot / land", 2600000, 21, "791111"),
        ("Assam", "Guwahati", (26.1445, 91.7362), "Bank of Baroda", "Commercial", 8800000, 9, "781001"),
        ("Bihar", "Patna", (25.5941, 85.1376), "Punjab National Bank", "Residential", 4300000, 15, "800001"),
        ("Chhattisgarh", "Raipur", (21.2514, 81.6296), "Bank of India", "Industrial", 13400000, 27, "492001"),
        ("Gujarat", "Ahmedabad", (23.0225, 72.5714), "Bank of Baroda", "Residential", 5400000, 11, "380001"),
        ("Haryana", "Gurugram", (28.4595, 77.0266), "HDFC Bank", "Commercial", 18500000, 8, "122001"),
        ("Himachal Pradesh", "Shimla", (31.1048, 77.1734), "State Bank of India", "Residential", 3600000, 33, "171001"),
        ("Jammu and Kashmir", "Srinagar", (34.0837, 74.7973), "J&K Bank", "Plot / land", 4100000, 18, "190001"),
        ("Jharkhand", "Ranchi", (23.3441, 85.3096), "Bank of India", "Residential", 3800000, 14, "834001"),
        ("Karnataka", "Bengaluru Urban", (12.9716, 77.5946), "Canara Bank", "Plot / land", 6100000, 6, "560001"),
        ("Kerala", "Ernakulam", (9.9312, 76.2673), "Federal Bank", "Commercial", 9700000, 20, "682001"),
        ("Madhya Pradesh", "Indore", (22.7196, 75.8577), "State Bank of India", "Residential", 4200000, 12, "452001"),
        ("Maharashtra", "Pune", (18.5204, 73.8567), "Bank of Baroda", "Residential", 7300000, 9, "411001"),
        ("Manipur", "Imphal West", (24.8170, 93.9368), "State Bank of India", "Plot / land", 2400000, 30, "795001"),
        ("Meghalaya", "East Khasi Hills", (25.5788, 91.8933), "State Bank of India", "Residential", 3100000, 25, "793001"),
        ("Mizoram", "Aizawl", (23.7271, 92.7176), "State Bank of India", "Commercial", 4500000, 22, "796001"),
        ("Nagaland", "Kohima", (25.6751, 94.1086), "State Bank of India", "Plot / land", 2700000, 19, "797001"),
        ("Odisha", "Khordha", (20.2961, 85.8245), "UCO Bank", "Residential", 4600000, 13, "751001"),
        ("Punjab", "Ludhiana", (30.9010, 75.8573), "Punjab National Bank", "Industrial", 15800000, 27, "141001"),
        ("Rajasthan", "Jaipur", (26.9124, 75.7873), "Bank of Baroda", "Plot / land", 3300000, 16, "302001"),
        ("Sikkim", "East Sikkim", (27.3389, 88.6065), "State Bank of India", "Residential", 3500000, 24, "737101"),
        ("Tamil Nadu", "Chennai", (13.0827, 80.2707), "Indian Bank", "Commercial", 12500000, 10, "600001"),
        ("Tripura", "West Tripura", (23.8315, 91.2868), "State Bank of India", "Residential", 2900000, 28, "799001"),
        ("Uttar Pradesh", "Lucknow", (26.8467, 80.9462), "Bank of India", "Residential", 4600000, 8, "226001"),
        ("Uttarakhand", "Dehradun", (30.3165, 78.0322), "State Bank of India", "Plot / land", 5100000, 17, "248001"),
        ("West Bengal", "Kolkata", (22.5726, 88.3639), "UCO Bank", "Commercial", 8700000, 11, "700001"),
        ("Telangana", "Hyderabad", (17.3850, 78.4867), "State Bank of India", "Commercial", 11200000, 15, "500001"),
        ("Ladakh", "Leh", (34.1526, 77.5771), "State Bank of India", "Plot / land", 3900000, 34, "194101"),
        ("Maharashtra", "Mumbai Suburban", (19.0760, 72.8777), "HDFC Bank", "Residential", 24500000, 7, "400001"),
        ("Maharashtra", "Nashik", (19.9975, 73.7898), "Bank of Maharashtra", "Plot / land", 4900000, 20, "422001"),
        ("Karnataka", "Mysuru", (12.2958, 76.6394), "Canara Bank", "Residential", 3900000, 13, "570001"),
        ("Tamil Nadu", "Coimbatore", (11.0168, 76.9558), "Indian Overseas Bank", "Industrial", 14200000, 24, "641001"),
        ("Uttar Pradesh", "Gautam Buddha Nagar", (28.5355, 77.3910), "Punjab National Bank", "Commercial", 21000000, 6, "201301"),
        ("Gujarat", "Surat", (21.1702, 72.8311), "Bank of Baroda", "Commercial", 10800000, 18, "395001"),
        ("West Bengal", "Howrah", (22.5958, 88.2636), "UCO Bank", "Industrial", 9200000, 26, "711101"),
        ("Telangana", "Warangal Urban", (17.9689, 79.5941), "State Bank of India", "Residential", 4400000, 15, "506001"),
        ("Rajasthan", "Jodhpur", (26.2389, 73.0243), "Bank of Baroda", "Residential", 3700000, 29, "342001"),
        ("Madhya Pradesh", "Bhopal", (23.2599, 77.4126), "Punjab National Bank", "Commercial", 9500000, 20, "462001"),
        ("Karnataka", "Belagavi", (15.8497, 74.4977), "Canara Bank", "Plot / land", 2900000, 11, "590001"),
        ("Bihar", "Gaya", (24.7955, 85.0002), "State Bank of India", "Residential", 3200000, 22, "823001"),
        ("Delhi", "New Delhi", (28.6139, 77.2090), "State Bank of India", "Commercial", 32000000, 9, "110001"),
        ("Delhi", "Dwarka", (28.5921, 77.0460), "Punjab National Bank", "Residential", 18500000, 16, "110075"),
        ("Haryana", "Faridabad", (28.4089, 77.3178), "HDFC Bank", "Residential", 11500000, 13, "121001"),
        ("Uttar Pradesh", "Ghaziabad", (28.6692, 77.4538), "Bank of Baroda", "Commercial", 16800000, 19, "201001"),
        ("Karnataka", "Kalaburagi", (17.3297, 76.8343), "State Bank of India", "Agricultural land", 2600000, 21, "585101"),
        ("Andhra Pradesh", "Krishna", (16.5062, 80.6480), "Union Bank of India", "Residential", 4800000, 14, "520001"),
        ("Kerala", "Kozhikode", (11.2588, 75.7804), "Federal Bank", "Residential", 6300000, 12, "673001"),
        ("Gujarat", "Rajkot", (22.3039, 70.8022), "Bank of Baroda", "Plot / land", 4100000, 23, "360001"),
        ("Tamil Nadu", "Madurai", (9.9252, 78.1198), "Indian Bank", "Residential", 3600000, 17, "625001"),
        ("Uttar Pradesh", "Varanasi", (25.3176, 82.9739), "Bank of India", "Commercial", 8900000, 25, "221001"),
        ("Maharashtra", "Nagpur", (21.1458, 79.0882), "Union Bank of India", "Industrial", 15800000, 9, "440001"),
        ("Punjab", "Amritsar", (31.6340, 74.8723), "Punjab National Bank", "Commercial", 7600000, 20, "143001"),
        ("Rajasthan", "Udaipur", (24.5854, 73.7125), "Bank of Baroda", "Residential", 5200000, 28, "313001"),
        ("West Bengal", "Siliguri", (26.7271, 88.3953), "UCO Bank", "Commercial", 6800000, 15, "734001"),
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
            "coordConfidence": "locality",
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
