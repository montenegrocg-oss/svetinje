import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createDedicatedMapSearchIndex,
  filterDedicatedMapPlaces,
} from "../src/lib/dedicated-map-visibility.ts";
import {
  isMappablePlace,
  selectMappablePlaces,
} from "../src/lib/public-place-discovery.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(PROJECT_ROOT, file), "utf8");

const places = [
  {
    id: "cetinjski-manastir",
    placeType: "monastery",
    latitude: 42.39,
    longitude: 18.92,
    catalogueSearchFields: {
      name: "Цетињски манастир",
      canonicalId: "cetinjski-manastir",
      slug: "cetinjski-manastir",
      alternateNames: ["Cetinjski manastir"],
      municipality: "Cetinje",
      summary: "Православни манастир на Цетињу",
    },
  },
  {
    id: "manastir-podmaine",
    placeType: "monastery",
    latitude: 42.3,
    longitude: 18.84,
    catalogueSearchFields: {
      name: "Манастир Подмаине",
      alternateNames: ["Podmaine"],
      municipality: "Budva",
      summary: "Манастир изнад Будве",
    },
  },
  {
    id: "crkva-svetog-djordja",
    placeType: "church",
    latitude: 42.29,
    longitude: 18.85,
    catalogueSearchFields: {
      name: "Црква Светог Ђорђа",
      alternateNames: ["Crkva Svetog Đorđa", "Djurdjevi"],
      municipality: "Budva",
    },
  },
  {
    id: "hram-niksic",
    placeType: "cathedral",
    latitude: 42.78,
    longitude: 18.95,
    catalogueSearchFields: {
      name: "Саборни храм Светог Василија",
      municipality: "Nikšić",
      settlement: "Niksic",
    },
  },
];

test("mappable places require two finite coordinates", () => {
  assert.equal(isMappablePlace({ latitude: 42, longitude: 19 }), true);
  assert.equal(isMappablePlace({ longitude: 19 }), false);
  assert.equal(isMappablePlace({ latitude: 42 }), false);
  assert.equal(isMappablePlace({ latitude: Number.NaN, longitude: 19 }), false);
  assert.equal(isMappablePlace({ latitude: 42, longitude: Number.POSITIVE_INFINITY }), false);
  assert.deepEqual(
    selectMappablePlaces([
      { id: "valid", latitude: 42, longitude: 19 },
      { id: "missing-latitude", longitude: 19 },
      { id: "missing-longitude", latitude: 42 },
    ]).map(({ id }) => id),
    ["valid"],
  );
});

test("the dedicated map index is mappable, discovery-only, and public-safe", () => {
  const index = createDedicatedMapSearchIndex([
    ...places,
    {
      id: "missing-coordinates",
      placeType: "church",
      catalogueSearchFields: { name: "Без координата" },
      narrativeBody: "private narrative",
      approvals: { publishing: false },
    },
    {
      id: "holy-spring",
      placeType: "holy-spring",
      latitude: 42,
      longitude: 19,
      catalogueSearchFields: { name: "Извор" },
      provenance: { source: "private" },
    },
  ]);

  assert.deepEqual(index.map(({ id }) => id), places.map(({ id }) => id));
  for (const entry of index) {
    assert.deepEqual(Object.keys(entry), ["id", "category", "fields"]);
  }
  const payload = JSON.stringify(index);
  assert.doesNotMatch(payload, /narrativeBody|approvals|provenance|private narrative/);
});

test("category and normalized search produce one deterministic visible ID set", () => {
  const index = createDedicatedMapSearchIndex(places);
  const filter = (category, query) => filterDedicatedMapPlaces({ places: index, category, query });

  assert.deepEqual(filter("all", ""), places.map(({ id }) => id));
  assert.deepEqual(filter("all", "   "), places.map(({ id }) => id));
  assert.deepEqual(filter("monasteries", ""), ["cetinjski-manastir", "manastir-podmaine"]);
  assert.deepEqual(filter("churches", ""), ["crkva-svetog-djordja", "hram-niksic"]);
  assert.deepEqual(filter("all", "CETINJE"), ["cetinjski-manastir"]);
  assert.deepEqual(filter("monasteries", "Budva"), ["manastir-podmaine"]);
  assert.deepEqual(filter("churches", "Budva"), ["crkva-svetog-djordja"]);
  assert.deepEqual(filter("all", "Цетињски"), ["cetinjski-manastir"]);
  assert.deepEqual(filter("all", "Cetinjski"), ["cetinjski-manastir"]);
  assert.deepEqual(filter("all", "Niksic"), ["hram-niksic"]);
  assert.deepEqual(filter("all", "Djurdjevi"), ["crkva-svetog-djordja"]);
  assert.deepEqual(filter("all", "man Cet"), ["cetinjski-manastir"]);
  assert.deepEqual(filter("all", "c"), ["cetinjski-manastir", "crkva-svetog-djordja"]);
  assert.deepEqual(filter("all", "no result"), []);

  assert.deepEqual(filter("monasteries", ""), ["cetinjski-manastir", "manastir-podmaine"], "clearing search preserves category");
  assert.deepEqual(filter("churches", "Budva"), ["crkva-svetog-djordja"], "changing category preserves query");
});

test("the map page renders localized compact context and dedicated accessible search", async () => {
  const [mapPage, dedicatedMap, explorer, controls, canvas] = await Promise.all([
    source("src/components/MapPage.astro"),
    source("src/components/DedicatedMap.astro"),
    source("src/components/MapExplorer.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/MapCanvas.astro"),
  ]);

  assert.equal((mapPage.match(/<h1/g) ?? []).length, 1);
  assert.match(mapPage, /<h1>\{copy\.title\}<\/h1>/);
  assert.match(mapPage, /<p>\{copy\.description\}<\/p>/);
  assert.match(dedicatedMap, /type="search"/);
  assert.match(dedicatedMap, /<label class="sr-only" for=\{searchId\}>\{copy\.searchLabel\}<\/label>/);
  assert.match(dedicatedMap, /autocomplete="off"/);
  assert.match(dedicatedMap, /role="status" aria-live="polite" data-map-visible-count/);
  assert.doesNotMatch(explorer, /data-map-search-input|data-dedicated-map-search/);
  assert.match(controls, /variant === "homepage" && <details class="map-popover map-layers">/);
  assert.match(controls, /variant === "map-page" && mapAvailable && <details[^>]*data-map-basemap-control/);
  assert.match(controls, /variant === "homepage" && <details class="map-popover map-help">/);
  assert.doesNotMatch(controls, /map-help--page/);
  assert.match(canvas, /stage\?\.querySelector<HTMLElement>\("\[data-map-search-panel\]"\)/);
});

test("dedicated category and search state dispatch only the final visibility contract", async () => {
  const [dedicatedMap, canvas] = await Promise.all([
    source("src/components/DedicatedMap.astro"),
    source("src/components/MapCanvas.astro"),
  ]);

  assert.match(dedicatedMap, /filterDedicatedMapPlaces\(\{/);
  assert.match(dedicatedMap, /new CustomEvent\("svetinje:place-visibility-change", \{ detail: \{ visibleIds \} \}\)/);
  assert.doesNotMatch(dedicatedMap, /svetinje:filter-change/);
  assert.match(canvas, /window\.addEventListener\("svetinje:filter-change", handleFilterChange\)/);
  assert.match(canvas, /window\.addEventListener\("svetinje:place-visibility-change", handlePlaceVisibilityChange\)/);
});
