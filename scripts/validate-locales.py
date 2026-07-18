#!/usr/bin/env python3
"""Locale completeness gate (runs in pr-checks.yml).

Checks that (1) Hindi geo covers every published state and district name,
(2) every regional code declared available in app/i18n.ts has a locale file,
(3) each regional locale file covers all districts of the states that
declare that language in states-master.json, and (4) every buildable
state's regionalLang, when set, has an autonym in app/state-languages.ts.
English is the fallback everywhere, so gaps fail loudly here rather than
silently on the site.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "roads"
LOCALES = ROOT / "public" / "locales"

errors: list[str] = []

master = {int(k): v for k, v in json.loads((ROOT / "scripts/data/states-master.json").read_text()).items()}
i18n_src = (ROOT / "app/i18n.ts").read_text()
declared = re.search(r"AVAILABLE_REGIONAL_LOCALES[^=]*=\s*\[([^\]]*)\]", i18n_src)
declared_locales = re.findall(r'"(\w+)"', declared.group(1)) if declared else []

published: dict[int, list[str]] = {}
for registry_path in sorted(DATA.glob("*/districts.json")):
    state_id = int(registry_path.parent.name)
    published[state_id] = [d["name"] for d in json.loads(registry_path.read_text())]

# 1. Hindi must be complete
hi = json.loads((LOCALES / "hi/geo.json").read_text())
for state_id, districts in published.items():
    name = master[state_id]["name"]
    if name not in hi["states"]:
        errors.append(f"hi: missing state {name}")
    for district in districts:
        if district not in hi["districts"]:
            errors.append(f"hi: missing district {district!r} ({name})")

# 2 + 3. declared regional locales exist and cover their states
for code in declared_locales:
    geo_path = LOCALES / code / "geo.json"
    if not geo_path.is_file():
        errors.append(f"{code}: declared in AVAILABLE_REGIONAL_LOCALES but {geo_path} is missing")
        continue
    geo = json.loads(geo_path.read_text())
    for state_id, entry in master.items():
        if entry.get("regionalLang") == code and state_id in published:
            for district in published[state_id]:
                if district not in geo["districts"]:
                    errors.append(f"{code}: missing district {district!r} ({entry['name']})")

# 4. autonyms for every used regional language
autonyms_src = (ROOT / "app/state-languages.ts").read_text()
for entry in master.values():
    lang = entry.get("regionalLang")
    if lang and f"  {lang}:" not in autonyms_src and f'"{lang}"' not in autonyms_src:
        errors.append(f"state-languages.ts: no autonym for {lang} ({entry['name']})")

if errors:
    for error in errors:
        print(f"LOCALE VALIDATION FAILED: {error}", file=sys.stderr)
    sys.exit(1)
print(json.dumps({"ok": True, "regionalLocales": declared_locales, "hiDistricts": len(hi["districts"])}))
