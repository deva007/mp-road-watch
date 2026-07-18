#!/usr/bin/env python3
"""Fetch REAL bank e-auction notices (BAANKNET, formerly IBAPI) into the pipeline.

BAANKNET (https://baanknet.com, PSB Alliance) is the official portal where
public-sector banks publish SARFAESI auction notices. It is a closed SPA with
no documented public API, so this fetcher works in two modes:

  auto   — probe the portal's JSON endpoints used by the search UI. Endpoints
           can change without notice; every probe failure is reported and the
           script exits 0 so a scheduled deploy never breaks. When a probe
           succeeds, the response is normalized to the pipeline schema.
  manual — parse a saved export: open baanknet.com property search in a
           browser, save the JSON response (DevTools > Network > copy response)
           or page HTML into a file, then run:
              python3 scripts/fetch-auctions.py --manual saved.json
           The parser accepts several shapes (list of dicts / {data:[...]} /
           {properties:[...]}) and maps common BAANKNET field names.

Output: auctions_source.json (consumed by build-auction-data.py --source).
Existing published data is never touched by this script.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

OUT = Path("auctions_source.json")
MASTER = Path(__file__).resolve().parent / "data" / "states-master.json"
UA = "Mozilla/5.0 (compatible; road-watch-auction-fetch/1.0)"

# Candidate JSON endpoints observed/likely for the BAANKNET SPA. Probed in
# order; harmless 404/403s are expected as the portal evolves.
CANDIDATES = [
    "https://baanknet.com/appapi/property/search?pageNumber=1&pageSize=200",
    "https://baanknet.com/api/property/search?page=1&size=200",
    "https://baanknet.com/eauction-psb/api/properties?page=1&size=200",
    "https://www.ibapi.in/api/property/search?page=1&size=200",
]

# Common field-name variants seen in bank auction exports
FIELD_MAP = {
    "bank": ["bankName", "bank", "financialInstitution", "organisationName"],
    "branch": ["branchName", "branch"],
    "title": ["propertyTitle", "title", "assetName", "propertyName", "description"],
    "propertyType": ["propertyType", "assetType", "category", "propertySubType"],
    "address": ["address", "propertyAddress", "location", "assetLocation"],
    "district": ["district", "districtName", "city", "cityName"],
    "state": ["state", "stateName"],
    "pincode": ["pincode", "pinCode", "zip"],
    "reservePrice": ["reservePrice", "reserve_price", "reservprice", "startPrice"],
    "emd": ["emdAmount", "emd", "earnestMoney"],
    "auctionDate": ["auctionDate", "auctionStartDate", "eauctionDate", "auction_date"],
    "noticeUrl": ["noticeUrl", "propertyUrl", "detailUrl", "url"],
    "id": ["propertyId", "id", "auctionId", "assetId"],
}

TYPE_NORMALIZE = {
    "residential": "Residential", "flat": "Residential", "house": "Residential",
    "commercial": "Commercial", "shop": "Commercial", "office": "Commercial",
    "industrial": "Industrial", "factory": "Industrial", "plant": "Industrial",
    "agricultural": "Agricultural land", "agriculture": "Agricultural land",
    "land": "Plot / land", "plot": "Plot / land",
}


def pick(record: dict, keys: list[str]):
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
        for k in record:  # case-insensitive fallback
            if k.lower() == key.lower() and record[k] not in (None, ""):
                return record[k]
    return None


def normalize_type(value) -> str:
    text = str(value or "").lower()
    for needle, label in TYPE_NORMALIZE.items():
        if needle in text:
            return label
    return "Plot / land"


def normalize_date(value) -> str | None:
    text = str(value or "")
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m:
        return m.group(0)
    m = re.search(r"(\d{2})[/-](\d{2})[/-](\d{4})", text)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def extract_pincode(record: dict) -> str:
    pin = pick(record, FIELD_MAP["pincode"])
    if pin:
        return re.sub(r"\D", "", str(pin))[:6]
    m = re.search(r"\b([1-9]\d{5})\b", str(pick(record, FIELD_MAP["address"]) or ""))
    return m.group(1) if m else ""


def normalize(records: list[dict]) -> list[dict]:
    out = []
    for r in records:
        if not isinstance(r, dict):
            continue
        date = normalize_date(pick(r, FIELD_MAP["auctionDate"]))
        if not date:
            continue
        url = str(pick(r, FIELD_MAP["noticeUrl"]) or "")
        if url and not url.startswith("http"):
            url = f"https://baanknet.com{url if url.startswith('/') else '/' + url}"
        out.append({
            "id": str(pick(r, FIELD_MAP["id"]) or f"bk-{len(out)+1}"),
            "bank": pick(r, FIELD_MAP["bank"]),
            "branch": pick(r, FIELD_MAP["branch"]),
            "title": pick(r, FIELD_MAP["title"]),
            "propertyType": normalize_type(pick(r, FIELD_MAP["propertyType"])),
            "address": pick(r, FIELD_MAP["address"]),
            "district": pick(r, FIELD_MAP["district"]),
            "state": pick(r, FIELD_MAP["state"]),
            "pincode": extract_pincode(r),
            "reservePrice": pick(r, FIELD_MAP["reservePrice"]),
            "emd": pick(r, FIELD_MAP["emd"]),
            "auctionDate": date,
            "noticeUrl": url or "https://baanknet.com",
        })
    return out


def unwrap(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("data", "properties", "content", "results", "items", "propertyList"):
            v = payload.get(key)
            if isinstance(v, list):
                return v
            if isinstance(v, dict):
                inner = unwrap(v)
                if inner:
                    return inner
    return []


def probe() -> list[dict]:
    for url in CANDIDATES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.loads(resp.read().decode("utf-8", "replace"))
            rows = unwrap(payload)
            print(f"probe {url} -> {len(rows)} rows")
            if rows:
                return rows
        except Exception as error:  # noqa: BLE001
            print(f"probe {url} -> {type(error).__name__}: {error}")
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manual", type=Path, help="saved BAANKNET JSON export to parse")
    args = parser.parse_args()

    if args.manual:
        raw = json.loads(args.manual.read_text(encoding="utf-8"))
        rows = unwrap(raw) or (raw if isinstance(raw, list) else [])
    else:
        rows = probe()

    listings = normalize(rows)
    if not listings:
        print("NO REAL LISTINGS FETCHED — portal endpoints unavailable or shape unrecognized.")
        print("Manual path: save the property-search JSON from baanknet.com (DevTools > Network),")
        print("then: python3 scripts/fetch-auctions.py --manual saved.json")
        sys.exit(0)  # never break the deploy

    OUT.write_text(json.dumps({"listings": listings}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({"realListings": len(listings), "output": str(OUT)}))


if __name__ == "__main__":
    main()
