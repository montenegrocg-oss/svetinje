import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { publicCopy } from "../src/i18n/public-copy.ts";
import { loadVisibleRoutes } from "../src/lib/content/routes.ts";
import { mapEditorialRoutes } from "../src/lib/map-editorial-routes.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const ROUTE_ID = "manastir-sergija-rumija";

test("editorial map routes are allowlist-driven in preview and fail closed in production", async () => {
  const [previewRoutes, productionRoutes] = await Promise.all([
    loadVisibleRoutes(PROJECT_ROOT, { editorialPreview: true }),
    loadVisibleRoutes(PROJECT_ROOT, { editorialPreview: false }),
  ]);
  const previewPayload = mapEditorialRoutes(previewRoutes);
  const productionPayload = mapEditorialRoutes(productionRoutes);
  const route = previewPayload.find((candidate) => candidate.id === ROUTE_ID);

  assert.equal(previewPayload.length, 1);
  assert.equal(productionPayload.length, 0);
  assert.ok(route);
  assert.deepEqual(route.metrics, { distanceM: 2693, ascentM: 614, durationMinutes: 140 });
  assert.equal(route.difficulty, "moderate");
  assert.equal(route.trackUrl, "/rute/manastir-sergija-rumija/track.geojson");
  assert.equal(route.detailUrl, "/rute/manastir-sergija-rumija/");
  assert.equal(productionPayload.some((candidate) => candidate.id === ROUTE_ID), false);
  assert.doesNotMatch(JSON.stringify(productionPayload), /manastir-svetog-sergija-radonjeskog|crkva-svete-trojice-na-rumiji/);
  for (const privateField of ["startPlace", "endPlace", "approvals", "audit", "narrativeSections"]) {
    assert.equal(privateField in route, false);
  }
});

test("the canonical preview track remains a detailed non-empty LineString", async () => {
  const file = path.join(PROJECT_ROOT, "content", "routes", ROUTE_ID, "track.geojson");
  const text = await readFile(file, "utf8");
  const track = JSON.parse(text);

  assert.equal(track.type, "Feature");
  assert.equal(track.geometry.type, "LineString");
  assert.equal(track.geometry.coordinates.length, 1986);
  assert.ok(track.geometry.coordinates.every((coordinate) =>
    Array.isArray(coordinate)
    && coordinate.length >= 2
    && coordinate.every(Number.isFinite)));
  assert.ok(Buffer.byteLength(text) > 100_000);
});

test("walking-route copy and map behavior are localized and limited to the dedicated map surface", async () => {
  const [canvas, controls, explorer, dedicatedMap, mapPage, page] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "src/components/MapCanvas.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src/components/MapControls.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src/components/MapExplorer.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src/components/DedicatedMap.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src/components/MapPage.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src/pages/mapa/index.astro"), "utf8"),
  ]);

  assert.equal(publicCopy.sr.homepage.filters.routes, "Пјешачке руте");
  assert.equal(publicCopy.ru.homepage.filters.routes, "Пешеходные маршруты");
  assert.equal(publicCopy.en.homepage.filters.routes, "Walking routes");
  assert.doesNotMatch(controls, /Поклоничке руте|data-filter="routes"/);
  assert.match(controls, /variant === "map-page" && <button[^>]*data-route-toggle/);
  assert.doesNotMatch(controls, /Изгради руту|data-notice-trigger|route-notice/);
  assert.match(explorer, /<MapCanvas places=\{discoveryPlaces\} locale=\{locale\} \/>/);
  assert.doesNotMatch(explorer, /<MapCanvas[^>]*routes=/);
  assert.match(dedicatedMap, /<MapCanvas places=\{places\} routes=\{routes\} layout="full" locale=\{locale\} \/>/);
  assert.match(mapPage, /<DedicatedMap places=\{discoveryPlaces\} routes=\{routes\} locale=\{locale\} \/>/);
  assert.match(page, /Promise\.all\(\[loadVisiblePlaces\(\), loadVisibleRoutes\(\)\]\)/);
  assert.match(page, /<MapPage places=\{places\} routes=\{routes\} locale="sr" \/>/);
  assert.ok(
    controls.indexOf('data-filter="all"') < controls.indexOf('data-filter="monasteries"')
      && controls.indexOf('data-filter="monasteries"') < controls.indexOf('data-filter="churches"')
      && controls.indexOf('data-filter="churches"') < controls.indexOf("data-route-toggle"),
    "the dedicated map controls must keep the requested surface order",
  );
  assert.match(canvas, /EDITORIAL_ROUTE_SOURCE_ID = "editorial-walking-routes"/);
  assert.match(canvas, /fetch\(route\.trackUrl, \{ credentials: "same-origin" \}\)/);
  assert.match(canvas, /visibility", showRoutes \? "visible" : "none"/);
  assert.match(canvas, /map\.queryRenderedFeatures\(\[/);
  assert.match(canvas, /root\.clientWidth < 768[\s\S]*map\.unproject\(\[map\.getCanvas\(\)\.clientWidth \/ 2, 112\]\)/);
  assert.match(canvas, /routePopup\.setLngLat\(popupLngLat\)\.setDOMContent\(createRouteSummary\(route\)\)/);
  assert.match(canvas, /link\.href = route\.detailUrl/);
  assert.match(explorer, /const filterIds = new Set\(\["all", "monasteries", "churches"\]\)/);
  assert.doesNotMatch(canvas, /clusterProjectedMarkers\([^)]*editorialRoutes/);
});
