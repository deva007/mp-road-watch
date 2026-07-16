# MP Road Watch

Explore active road projects and the official PMGSY GIS road inventory for
every Madhya Pradesh district, on an interactive Leaflet map with bilingual
(English / Hindi) UI.

Live site: https://deva007.github.io/mp-road-watch/

## How it works

The site is fully static — no server, no database. A Python pipeline turns
official PMGSY exports into one JSON file per district under
`public/data/roads/{stateId}/`, and a Next.js static export serves them from
GitHub Pages.

```
scripts/build-road-data.py  →  public/data/roads/{stateId}/*.json  →  next build (export)  →  GitHub Pages
```

- `app/road-watch.tsx` — the whole UI: state + district pickers, filters,
  project list, Leaflet map. Auto-refreshes its data every 60 seconds while
  the tab is visible, and keeps the last good data if a refresh fails.
- `public/data/roads/states.json` — state index driving the state picker
  (maintained automatically by the pipeline).
- `public/data/roads/{stateId}/districts.json` — per-state district registry
  with summary counts (20 = Madhya Pradesh).
- `public/data/roads/meta.json` — generated at build time
  (`scripts/write-data-meta.mjs`) from the last git commit touching the data;
  drives the "Data checked" stamp in the header.

## Prerequisites

- Node.js `>=22.13.0`
- Python 3.11+ with `duckdb` (only for refreshing data)

## Commands

- `npm run dev` — local development
- `npm run build:pages` — the GitHub Pages static export (set
  `GITHUB_PAGES=true` for the `/mp-road-watch` base path)
- `npm test` — build the export and verify the rendered HTML and data
- `npm run lint` — ESLint
- `npm run validate:data` — sanity-check the published datasets

## Refreshing the data

1. Download the Sanction Award Progress CSV for Madhya Pradesh from the
   PMGSY OMMAS report portal (linked from each project's "Open official
   source" button).
2. Run the pipeline (downloads the PMGSY GIS parquet automatically, with
   retry/backoff for flaky mirrors):

   ```bash
   python3 scripts/build-road-data.py public/data/roads/20 --status-csv path/to/status.csv --state-id 20
   python3 scripts/validate-road-data.py public/data/roads
   ```

3. Commit and push. The Pages workflow re-validates the data before
   deploying — a partial or corrupt dataset fails the build and the last
   good deploy stays live. GitHub emails you when a workflow run fails;
   that is the alerting.

The "Data checked" stamp updates automatically from the commit date — no
manual date edits needed.

**Known gap — full automation.** The OMMAS status CSV has no stable,
scriptable export URL (it is an ASPX report portal), so step 1 is manual.
Everything after it is automated and guarded. If a reliable CSV endpoint is
found, wiring it into a scheduled workflow makes the whole refresh
hands-off — until then, the manual download is the one human step.

## Adding another state

The site is state-aware; adding a state is a data task, not a code task.
The easiest path is the **"Build state road data" GitHub Actions workflow**
(Actions tab → Build state road data → Run workflow):

1. Run it in `discover` mode once — the run summary lists every `STATE_ID`
   in the national GIS parquet (20 = Madhya Pradesh).
2. Run it in `build` mode with the state's id and name. Without a CSV the
   state is built inventory-only (full road network, 0 active projects);
   pass `csv_url` pointing at the state's OMMAS status CSV for active
   projects too. The workflow validates and commits straight to `main`,
   which redeploys the site with the state in the picker.
3. Optionally add Hindi names for the state and its districts in
   `app/i18n.ts` (`hindiStateNames`, `hindiDistrictNames`) — untranslated
   names fall back to English.

The same build runs locally with
`python3 scripts/build-road-data.py public/data/roads/<id> --state-id <id> --state-name "<Name>" [--status-csv status.csv]`.

Mind the scale: each state adds roughly 10–20 MB of JSON. GitHub Pages has a
1 GB site soft limit, so going far beyond a handful of states calls for
tighter geometry simplification (`ST_Simplify` tolerance in
`build-road-data.py`).

## Deployment

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every
push to `main`. The deploy is gated on `scripts/validate-road-data.py`.
