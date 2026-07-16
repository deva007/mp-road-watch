# MP Road Watch — Android App Design Spec (KMP, Android-first)

Status: draft v1 · Owner: deva007 · Last updated: 2026-07-16

## 1. Goal and product shape

A native Android app (Kotlin Multiplatform core, Jetpack Compose UI) that
delivers the same road intelligence as the website — active PMGSY works and
the official GIS road inventory per district — with the things a website
cannot do well: offline access, saved roads, and update notifications.

**Not** a WebView wrapper. Google Play's minimum-functionality policy
rejects thin wrappers, and the native value here (offline, saves, alerts)
is exactly what justifies an app.

## 2. Data contract (already live)

The GitHub Pages deployment doubles as a free, versioned, CDN-backed API.
All endpoints are static JSON under
`https://deva007.github.io/mp-road-watch/data/roads/`:

| Endpoint | Purpose |
| --- | --- |
| `states.json` | State index: `[{id, name, districtCount}]` (20 = Madhya Pradesh) |
| `{stateId}/districts.json` | District registry with summary counts |
| `{stateId}/{districtCode}.json` | Full district dataset: `inventory[]`, `ruralProjects[]` |
| `meta.json` | `{dataCheckedAt}` — freshness stamp, same one the site shows |

Notes for the client:
- Responses are immutable-ish snapshots refreshed via git commits; ETags are
  served by GitHub's CDN, so HTTP caching works out of the box.
- Coordinates are `[lat, lng]` pairs; district files run 100 KB–600 KB.
- Treat `meta.json.dataCheckedAt` as the honesty signal: always show it,
  exactly like the website header does.

## 3. Architecture

```
shared/ (KMP)
  data/     Ktor client + kotlinx.serialization DTOs (the JSON above)
            OkHttp cache (Android) → offline reads for visited districts
  domain/   models: State, DistrictSummary, InventoryRoad, RuralProject
            use-cases: LoadDistrict, SearchRoads, FilterByStage/Type
  sync/     freshness check (meta.json), retry with backoff
androidApp/
  ui/       Jetpack Compose, Material 3
  map/      MapLibre GL Native (open-source, no per-load billing)
            CARTO raster tiles initially; vector style later
  fcm/      push notifications (optional, phase 3)
iosApp/     (later) SwiftUI shell over the same shared core
```

Key choices and why:
- **MapLibre over Google Maps SDK**: keeps the stack open-source and free at
  any scale, matches the website's CARTO basemap, and renders polylines from
  the same route arrays without conversion.
- **Ktor + kotlinx.serialization** in shared code so iOS reuses the entire
  data layer later.
- **OkHttp cache (50 MB) + Room** for pinned districts: visited districts
  work offline automatically; explicitly "saved" districts are stored in
  Room and refreshed opportunistically.

## 4. Firebase (what it is for — and what it is not)

The data is public; Firebase Auth does not gate reading it. Auth exists
only for user-owned features:

- **Auth** (Google sign-in): identity for saved roads and alert preferences.
- **Firestore**: `users/{uid}/savedRoads`, `users/{uid}/alertPrefs`.
  Security Rules: `request.auth.uid == userId` — the classic per-user rule.
- **FCM**: "district data refreshed" / "saved road status changed" pushes
  (phase 3; requires a small Cloud Function watching `meta.json`).
- The Firebase config in the APK is not a secret; security lives in the
  Rules. Do not attempt to hide it; do enable App Check + Play Integrity.

Anonymous users get the full read experience. Sign-in is prompted only when
tapping "Save road" — never at launch.

## 5. Screens

1. **Home / District picker** — state selector (spinner), district list with
   counts (from `districts.json`), freshness stamp, language toggle (EN/hi
   via per-app locales, `AppCompatDelegate.setApplicationLocales`).
2. **District explorer** — the core screen. Tabs: Active projects | Road
   inventory. Search + stage/type filter chips. List items mirror the web
   cards (stage dot, name, block, length, progress). Tapping an item
   focuses the map.
3. **Map view** — MapLibre with stage-colored polylines, tap-to-select,
   bounds-fit on selection; same stage palette as the web
   (`#297864`, `#d77a37`, `#2875a6`, `#b28a2f`, `#687685`).
4. **Road detail sheet** — bottom sheet: scheme, package, sanction date,
   contractor, progress, precision label, "Open official source" (Custom
   Tab), Save button (auth-gated).
5. **Saved roads** — offline-first list of saved items with last-known
   status; pull-to-refresh.
6. **About / Sources & cautions** — the methodology content from the site,
   verbatim; this transparency is part of the product's trust story.

## 6. Design language (carry the web identity over)

- **Palette**: paper `#f4f0e7`, card `#fffdf7`, ink `#17251f`, green
  `#214f42`, deep green `#162a23`, orange `#d96f38`, sand `#efcf9f`.
  Dark theme: derive from deep-green surfaces, not pure black.
- **Type**: DM Sans (body), DM Serif Display (headlines), Noto Sans
  Devanagari (Hindi) — all on Google Fonts, available via Compose
  `GoogleFont` provider. Minimum body size 14sp; the audience skews 30–55
  and phone-only.
- **Tone**: the "honest data" affordances are design requirements, not
  decoration — freshness stamp always visible, location-precision labels on
  every record, source links on every detail sheet.
- Full-bleed lists, generous tap targets (48dp), stage colors always paired
  with text labels (color-blind safety), Hindi as a first-class locale.

## 7. Offline & failure behavior (mirror the web decisions)

- Last good data always shown; a stale banner appears when
  `dataCheckedAt` is older than 48h or the device is offline.
- Foreground refresh every 60s only on the district screen and only on
  unmetered connections; otherwise on-resume refresh.
- All fetches: 3 retries with exponential backoff; failures never clear
  cached data.

## 8. Play compliance checklist

- Native navigation, offline mode, saved items → passes minimum
  functionality.
- Data safety form: account identifiers (email) only if signed in; no ads.
- Target API level: current-1 minimum; use Play App Signing.
- R8 enabled; Play Integrity + Firebase App Check on Firestore access.

## 9. Phases

| Phase | Scope | Estimate |
| --- | --- | --- |
| 1 | KMP data layer + district explorer + map, no auth | 3–4 weeks |
| 2 | Saved roads (Firebase Auth + Firestore), Hindi locale, offline pinning | 2 weeks |
| 3 | FCM alerts via Cloud Function on data refresh | 1–2 weeks |
| 4 | iOS shell reusing shared core | 3+ weeks |

## 10. Open questions

- Vector tiles vs CARTO raster at phase 1 (raster is zero-effort; vector is
  prettier and lighter on data).
- Whether saved-road status diffing happens client-side (compare snapshots)
  or server-side (Cloud Function) — phase 3 decision.
- Monetization is out of scope; the public-data trust story argues against
  ads inside the explorer.
