import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("static export renders the Madhya Pradesh road tracker", async () => {
  const htmlUrl = new URL("../out/index.html", import.meta.url);
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /<title>Madhya Pradesh Road Watch<\/title>/i);
  assert.match(html, /Find the roads/);
  assert.match(html, /Road project explorer/);
  assert.match(html, /Active projects/);
  assert.match(html, /All road inventory/);
  assert.match(html, /aria-label="Choose language"/);
  assert.match(html, /हिंदी/);
  assert.match(html, /Bhopal/);
  assert.match(html, /41,016/);
  assert.match(html, /PMGSY/);
});

test("static export bundles the road data and freshness stamp", async () => {
  const metaUrl = new URL("../out/data/roads/meta.json", import.meta.url);
  const meta = JSON.parse(await readFile(metaUrl, "utf8"));
  assert.ok(
    !Number.isNaN(new Date(meta.dataCheckedAt).getTime()),
    "expected meta.json to carry a valid dataCheckedAt date",
  );

  const registryUrl = new URL("../out/data/roads/districts.json", import.meta.url);
  const registry = JSON.parse(await readFile(registryUrl, "utf8"));
  assert.ok(registry.length >= 50, "expected the full district registry");
});

test("inventory roads include selectable route geometry", async () => {
  const dataUrl = new URL("../public/data/roads/579.json", import.meta.url);
  const dataset = JSON.parse(await readFile(dataUrl, "utf8"));
  const road = dataset.inventory.find(
    (item) => item.name === "Karariya Tiraha to Shamshabad",
  );

  assert.ok(road, "expected the Vidisha inventory road from the map report");
  assert.ok(road.route.length >= 2, "expected an official GIS road line");
});
