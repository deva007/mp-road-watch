import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Madhya Pradesh road tracker", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
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
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
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
