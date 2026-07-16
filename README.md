# MP Road Watch

Explore active road projects and the official PMGSY GIS road inventory for
every Madhya Pradesh district, on an interactive Leaflet map with bilingual
(English / Hindi) UI.

Live site: https://deva007.github.io/mp-road-watch/

## How it works

The site is fully static — no server, no database. A Python pipeline turns
official PMGSY exports into one JSON file per district under
`public/data/roads/`, and a Next.js static export serves them from GitHub
Pages.

```
scripts/build-road-data.py  →  public/data/roads/*.json  →  next build (export)  →  GitHub Pages
```

- `app/road-watch.tsx` — the whole UI: district picker, filters, project
  list, Leaflet map. Auto-refreshes its data every 60 seconds while the tab
  is visible, and keeps the last good data if a refresh fails.
- `public/data/roads/districts.json` — district registry with summary counts.
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
   python3 scripts/build-road-data.py path/to/status.csv public/data/roads
   python3 scripts/validate-road-data.py public/data/roads
   ```

3. Commit and push. The Pages workflow re-validates the data before
   deploying — a partial or corrupt dataset fails the build and the last
   good deploy stays live. GitHub emails you when a workflow run fails;
   that is the alerting.

The "Data checked" stamp updates automatically from the commit date — no
manual date edits needed.

## Deployment

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every
push to `main`. The deploy is gated on `scripts/validate-road-data.py`.
