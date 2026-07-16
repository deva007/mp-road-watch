#!/usr/bin/env node
/**
 * Writes public/data/roads/meta.json with the date the road data was last
 * updated (the last git commit touching the data directory). The frontend
 * shows this as the "Data checked" stamp, so it can never drift from the
 * data the way a hardcoded string can.
 *
 * Requires full git history for an accurate date (checkout with
 * fetch-depth: 0 in CI); falls back to file mtime outside a git checkout.
 */

import { execFileSync } from "node:child_process";
import { statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(repoRoot, "public", "data", "roads");

function lastDataCommitDate() {
  try {
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%cI", "--", "public/data/roads"],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    if (iso) return new Date(iso);
  } catch {
    // Not a git checkout (or git unavailable); fall through.
  }
  try {
    return statSync(join(dataDir, "districts.json")).mtime;
  } catch {
    return new Date();
  }
}

const checkedAt = lastDataCommitDate();
const meta = { dataCheckedAt: checkedAt.toISOString() };
writeFileSync(join(dataDir, "meta.json"), `${JSON.stringify(meta)}\n`);
console.log(`meta.json written: data checked ${meta.dataCheckedAt}`);
