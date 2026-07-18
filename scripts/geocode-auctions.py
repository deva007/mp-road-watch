#!/usr/bin/env python3
"""Geocode auction listings to precise coordinates with an honest confidence.

Phase 1 gate: every listing must carry lat/lng + coordConfidence before the
map redesign proceeds. Runs a tiered cascade so nothing is ever blocked
waiting for a perfect provider:

  1. Mappls (MapmyIndia)  — primary, best for Indian/rural addresses.
                            Enabled when MAPPLS_TOKEN is set; returns a match
                            precision mapped to rooftop/street/locality.
  2. Pincode centroid     — guaranteed offline floor (scripts/data/
                            pincode-centroids.csv). Covers ~100% of notices
                            that carry a pincode. confidence = "pincode".
  3. District centroid    — last resort (existing behaviour). confidence =
                            "district".

Every resolved address is cached by a stable hash in
scripts/data/geocode-cache.json, so repeat runs cost nothing and only new or
changed addresses hit the network. Idempotent and atomic.

Confidence levels (best -> worst): rooftop, street, locality, pincode, district.

Usage:
  MAPPLS_TOKEN=xxx python3 scripts/geocode-auctions.py            # full cascade
  python3 scripts/geocode-auctions.py                            # offline: pincode + district floor
  python3 scripts/geocode-auctions.py --check                    # CI: fail if any listing lacks coords/confidence
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUCTIONS = ROOT / "public" / "data" / "auctions"
PINCODE_CSV = ROOT / "scripts" / "data" / "pincode-centroids.csv"
CACHE_PATH = ROOT / "scripts" / "data" / "geocode-cache.json"

CONFIDENCE_RANK = {"rooftop": 0, "street": 1, "locality": 2, "pincode": 3, "district": 4}
INDIA_BBOX = (6.5, 68.0, 37.5, 97.5)


def load_pincodes() -> dict[str, tuple[float, float]]:
    table: dict[str, tuple[float, float]] = {}
    if not PINCODE_CSV.is_file():
        return table
    with PINCODE_CSV.open() as handle:
        for row in csv.DictReader(handle):
            try:
                table[row["pincode"].strip()] = (float(row["lat"]), float(row["lng"]))
            except (ValueError, KeyError):
                continue
    return table


def load_cache() -> dict[str, dict]:
    if CACHE_PATH.is_file():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def address_key(listing: dict) -> str:
    parts = [
        listing.get("address", ""),
        listing.get("district", ""),
        str(listing.get("stateId", "")),
        str(listing.get("pincode", "")),
    ]
    normalized = "|".join(" ".join(str(p).split()).lower() for p in parts)
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()


def in_india(lat: float, lng: float) -> bool:
    return INDIA_BBOX[0] <= lat <= INDIA_BBOX[2] and INDIA_BBOX[1] <= lng <= INDIA_BBOX[3]


# Map a Mappls match to our confidence scale (eLoc/geocodeLevel varies by plan).
MAPPLS_LEVELS = {
    "houseNumber": "rooftop", "poi": "rooftop", "street": "street",
    "subLocality": "locality", "locality": "locality", "city": "locality",
    "village": "locality", "pincode": "pincode", "district": "district",
}


def geocode_mappls(listing: dict, token: str) -> dict | None:
    address = ", ".join(
        p for p in [listing.get("address"), listing.get("district"), str(listing.get("pincode") or "")] if p
    )
    url = "https://atlas.mappls.com/api/places/geocode?" + urllib.parse.urlencode({"address": address})
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 - network/parse failures fall through to the floor
        return None
    results = payload.get("results") or payload.get("copResults")
    if not results:
        return None
    best = results[0] if isinstance(results, list) else results
    try:
        lat, lng = float(best["lat"]), float(best["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    if not in_india(lat, lng):
        return None
    level = MAPPLS_LEVELS.get(str(best.get("geocodeLevel", "")).strip(), "locality")
    return {"lat": round(lat, 6), "lng": round(lng, 6), "coordConfidence": level, "geocoder": "mappls"}


def geocode_pincode(listing: dict, pincodes: dict) -> dict | None:
    pin = str(listing.get("pincode") or "").strip()
    if pin in pincodes:
        lat, lng = pincodes[pin]
        return {"lat": round(lat, 6), "lng": round(lng, 6), "coordConfidence": "pincode", "geocoder": "pincode"}
    return None


def resolve(listing: dict, pincodes: dict, cache: dict, token: str | None) -> dict:
    key = address_key(listing)
    if key in cache:
        return cache[key]
    result = None
    if token:
        result = geocode_mappls(listing, token)
    if result is None:
        result = geocode_pincode(listing, pincodes)
    if result is None:  # keep whatever the build gave (district centroid), label it
        result = {
            "lat": listing.get("lat"),
            "lng": listing.get("lng"),
            "coordConfidence": "district",
            "geocoder": "district-centroid",
        }
    cache[key] = result
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if any listing lacks lat/lng/confidence")
    args = parser.parse_args()

    pincodes = load_pincodes()
    cache = load_cache()
    token = os.environ.get("MAPPLS_TOKEN")

    stats = {"rooftop": 0, "street": 0, "locality": 0, "pincode": 0, "district": 0, "missing": 0}
    changed_files = 0

    for listings_path in sorted(AUCTIONS.glob("*/listings.json")):
        listings = json.loads(listings_path.read_text(encoding="utf-8"))
        dirty = False
        for listing in listings:
            if args.check:
                if listing.get("lat") is None or listing.get("lng") is None or not listing.get("coordConfidence"):
                    stats["missing"] += 1
                else:
                    stats[listing["coordConfidence"]] = stats.get(listing["coordConfidence"], 0) + 1
                continue
            resolved = resolve(listing, pincodes, cache, token)
            for field in ("lat", "lng", "coordConfidence"):
                if listing.get(field) != resolved[field]:
                    listing[field] = resolved[field]
                    dirty = True
            stats[resolved["coordConfidence"]] = stats.get(resolved["coordConfidence"], 0) + 1
        if dirty and not args.check:
            write_atomic(listings_path, json.dumps(listings, ensure_ascii=False, separators=(",", ":")))
            changed_files += 1

    if not args.check:
        write_atomic(CACHE_PATH, json.dumps(cache, ensure_ascii=False, indent=1))

    print(json.dumps({"filesUpdated": changed_files, "confidence": stats, "mapplsEnabled": bool(token)}))
    if args.check and stats["missing"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
