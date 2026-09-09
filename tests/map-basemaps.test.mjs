import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { publicCopy } from "../src/i18n/public-copy.ts";
import {
  DEFAULT_MAP_BASEMAP_ID,
  MAP_BASEMAPS,
  mapBasemapStyleUrl,
  mapCooperativeGesturesForLayout,
} from "../src/lib/map-basemaps.ts";
import {
  EDITORIAL_ROUTE_LAYER_IDS,
  EDITORIAL_ROUTE_SOURCE_ID,
  ensureEditorialRouteLayers,
  setEditorialRouteLayersVisibility,
} from "../src/lib/map-editorial-routes.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(PROJECT_ROOT, file), "utf8");

test("homepage and dedicated maps use ordinary wheel zoom while mobile touch stays unchanged", async () => {
  assert.equal(mapCooperativeGesturesForLayout("full", false), false);
  assert.equal(mapCooperativeGesturesForLayout("homepage", false), false);
  assert.equal(mapCooperativeGesturesForLayout("full", true), false);
  assert.equal(mapCooperativeGesturesForLayout("homepage", true), false);

  const canvas = await source("src/components/MapCanvas.astro");
  assert.match(canvas, /cooperativeGestures: mapCooperativeGesturesForLayout\(mapLayout, mobileTouch\)/);
  assert.match(canvas, /touchZoomRotate: true/);
  assert.match(canvas, /map\.touchZoomRotate\.disableRotation\(\)/);
  assert.doesNotMatch(canvas, /scrollZoom\.(?:enable|disable)|preventDefault\(\)[\s\S]{0,120}wheel/);
});

test("the MapTiler basemap registry is exact, ordered, unique, and key-safe", () => {
  assert.equal(DEFAULT_MAP_BASEMAP_ID, "default");
  assert.deepEqual(MAP_BASEMAPS.map(({ id }) => id), ["default", "topographic", "satellite"]);
  assert.deepEqual(MAP_BASEMAPS.map(({ mapId }) => mapId), [
    "019fc7d8-717c-701d-9ca5-a53d9438d3ce",
    "topo-v4",
    "satellite-v4",
  ]);
  assert.equal(new Set(MAP_BASEMAPS.map(({ id }) => id)).size, 3);
  assert.equal(new Set(MAP_BASEMAPS.map(({ mapId }) => mapId)).size, 3);

  for (const { id } of MAP_BASEMAPS) {
    const url = new URL(mapBasemapStyleUrl(id, "key with / reserved?"));
    assert.equal(url.origin, "https://api.maptiler.com");
    assert.match(url.pathname, /^\/maps\/[a-z0-9-]+\/style\.json$/i);
    assert.equal(url.searchParams.get("key"), "key with / reserved?");
  }
  assert.doesNotMatch(JSON.stringify(MAP_BASEMAPS), /key=/i);
});

test("the shared layer control is localized, accessible, and removed with unavailable maps", async () => {
  const [controls, dedicatedMap, styles] = await Promise.all([
    source("src/components/MapControls.astro"),
    source("src/components/DedicatedMap.astro"),
    source("src/styles/global.css"),
  ]);

  assert.match(controls, /mapAvailable && <details[^>]*data-map-basemap-control aria-busy="false"/);
  assert.match(controls, /type="radio"[\s\S]*data-map-basemap-option[\s\S]*checked=\{basemap\.id === DEFAULT_MAP_BASEMAP_ID\}/);
  assert.match(controls, /<fieldset[^>]*aria-label=\{c\.layers\}>/);
  assert.doesNotMatch(controls, /map-help/);
  assert.doesNotMatch(controls, /helpTitle|helpBody/);
  assert.match(dedicatedMap, /mapAvailable=\{hasMapTilerKey\}/);
  assert.match(dedicatedMap, /routesAvailable=\{routes\.length > 0\}/);
  const explorer = await source("src/components/MapExplorer.astro");
  assert.match(explorer, /const hasMapTilerKey = Boolean\(import\.meta\.env\.PUBLIC_MAPTILER_KEY\?\.trim\(\)\)/);
  assert.match(explorer, /<MapControls locale=\{locale\} mapAvailable=\{hasMapTilerKey\} \/>/);
  assert.match(controls, /variant === "map-page" && routesAvailable && <button[^>]*data-route-toggle/);
  assert.match(styles, /\.map-basemap-option span\s*\{[\s\S]*?min-height: 2\.75rem/);
  assert.match(styles, /\.map-basemap-option input:focus-visible \+ span/);
  assert.match(styles, /\.map-basemap-option input:checked \+ span/);

  assert.deepEqual(publicCopy.sr.homepage.mapControls.basemaps, {
    default: "Основна карта", topographic: "Топографска", satellite: "Сателит",
  });
  assert.deepEqual(publicCopy.ru.homepage.mapControls.basemaps, {
    default: "Основная карта", topographic: "Топографическая", satellite: "Спутник",
  });
  assert.deepEqual(publicCopy.en.homepage.mapControls.basemaps, {
    default: "Default map", topographic: "Topographic", satellite: "Satellite",
  });
});

test("style switching preserves app state and uses one MapLibre and marker lifecycle", async () => {
  const canvas = await source("src/components/MapCanvas.astro");
  const switchBlock = canvas.match(/const switchBasemap = async[\s\S]*?\n    const handleBasemapChange/)?.[0] ?? "";

  assert.match(switchBlock, /mapBasemapStyleUrl\(nextBasemapId, MAPTILER_KEY\)/);
  assert.match(canvas, /map\.setStyle\(styleUrl, \{ diff: false \}\)/);
  assert.match(switchBlock, /requestVersion !== basemapRequestVersion/);
  assert.match(switchBlock, /await loadBasemapStyle\(previousStyleUrl\)/);
  assert.match(switchBlock, /await restoreStyleOverlays\(\)/);
  assert.doesNotMatch(switchBlock, /fitBounds|easeTo|jumpTo|setCenter|setZoom|mapSearchInput\.value|visibleMarkerIds\s*=/);
  assert.equal((canvas.match(/new maplibregl\.Map\(/g) ?? []).length, 1);
  assert.equal((canvas.match(/markerPlaces\.forEach\(/g) ?? []).length, 1);
  assert.match(canvas, /basemapControl\?\.setAttribute\("aria-busy", String\(busy\)\)/);
  assert.match(canvas, /input\.checked = input\.value === activeBasemapId/);
});

class FakeRouteMap {
  sources = new Map();
  layers = new Map();
  sourceAdds = 0;
  layerAdds = 0;

  getSource(id) { return this.sources.get(id); }
  addSource(id, source) { this.sourceAdds += 1; this.sources.set(id, source); }
  getLayer(id) { return this.layers.get(id); }
  addLayer(layer) { this.layerAdds += 1; this.layers.set(layer.id, structuredClone(layer)); }
  setLayoutProperty(id, name, value) { this.layers.get(id).layout[name] = value; }
  replaceStyle() { this.sources.clear(); this.layers.clear(); }
}

const routeData = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { id: "route" },
    geometry: { type: "LineString", coordinates: [[19, 42], [19.1, 42.1]] },
  }],
};

test("route GeoJSON is rehydrated after setStyle without duplicate sources or layers", () => {
  const map = new FakeRouteMap();
  ensureEditorialRouteLayers(map, routeData, false);
  assert.ok(map.getSource(EDITORIAL_ROUTE_SOURCE_ID));
  assert.deepEqual(EDITORIAL_ROUTE_LAYER_IDS.map((id) => map.getLayer(id).layout.visibility), ["none", "none", "none"]);

  ensureEditorialRouteLayers(map, routeData, false);
  assert.equal(map.sourceAdds, 1);
  assert.equal(map.layerAdds, 3);

  map.replaceStyle();
  ensureEditorialRouteLayers(map, routeData, true);
  assert.equal(map.sourceAdds, 2);
  assert.equal(map.layerAdds, 6);
  assert.deepEqual(EDITORIAL_ROUTE_LAYER_IDS.map((id) => map.getLayer(id).layout.visibility), ["visible", "visible", "visible"]);

  setEditorialRouteLayersVisibility(map, false);
  assert.deepEqual(EDITORIAL_ROUTE_LAYER_IDS.map((id) => map.getLayer(id).layout.visibility), ["none", "none", "none"]);
});

test("route data cache and visibility survive basemap replacement without refetch or refit", async () => {
  const canvas = await source("src/components/MapCanvas.astro");
  const restoreBlock = canvas.match(/const restoreStyleOverlays = async[\s\S]*?\n    const switchBasemap/)?.[0] ?? "";

  assert.match(canvas, /let routeGeoJson: MapEditorialRouteFeatureCollection \| undefined/);
  assert.match(canvas, /let routeGeoJsonPromise: Promise<MapEditorialRouteFeatureCollection> \| undefined/);
  assert.match(canvas, /if \(routeGeoJson\) return routeGeoJson/);
  assert.match(canvas, /ensureEditorialRouteLayers\(map, data, routesVisible\)/);
  assert.match(restoreBlock, /if \(routesVisible\) await ensureRouteLayersForCurrentStyle\(\)/);
  assert.doesNotMatch(restoreBlock, /fetch\(|fitBounds/);
  assert.match(canvas, /if \(routeLayerEventsBound\) return/);
});
