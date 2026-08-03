import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(PROJECT_ROOT, file), "utf8");
}

test("MapTiler configuration uses only the approved public environment variable", async () => {
  const [mapCanvas, envExample] = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source(".env.example"),
  ]);

  assert.equal(envExample, "PUBLIC_MAPTILER_KEY=\n");
  assert.match(mapCanvas, /import\.meta\.env\.PUBLIC_MAPTILER_KEY/);
  assert.match(mapCanvas, /maps\/outdoor-v4\/style\.json\?key=\$\{encodeURIComponent\(MAPTILER_KEY\)\}/);
  assert.doesNotMatch(mapCanvas, /style\.json\?key=[A-Za-z0-9_-]{8,}/);
});

test("the homepage keeps a successful no-key map fallback", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /data-map-state=\{mapTilerAvailable \? "loading" : "fallback"\}/);
  assert.match(mapCanvas, /if \(!MAPTILER_OUTDOOR_STYLE \|\| !mapContainer \|\| !renderer\)/);
  assert.match(mapCanvas, /Интерактивна карта тренутно није доступна\./);
  assert.match(mapCanvas, /class="map-fallback"/);
});

test("the map structure contains an interactive container and explicit attribution", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /import "maplibre-gl\/dist\/maplibre-gl\.css"/);
  assert.match(mapCanvas, /await import\("maplibre-gl"\)/);
  assert.match(mapCanvas, /data-testid="maplibre-container"/);
  assert.match(mapCanvas, /role="region"/);
  assert.match(mapCanvas, /aria-label="Интерактивна карта Црне Горе"/);
  assert.match(mapCanvas, /data-map-attribution/);
  assert.match(mapCanvas, /https:\/\/www\.maptiler\.com\/copyright\//);
  assert.match(mapCanvas, /https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.equal((mapCanvas.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
});

test("custom controls use a responsive Montenegro view without geolocation", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /MONTENEGRO_CONTEXT_BOUNDS/);
  assert.match(mapCanvas, /map\.fitBounds\(MONTENEGRO_CONTEXT_BOUNDS/);
  assert.match(mapCanvas, /map\.zoomIn/);
  assert.match(mapCanvas, /map\.zoomOut/);
  assert.match(mapCanvas, /resetButton\?\.addEventListener\("click", resetView\)/);
  assert.match(mapCanvas, /prefers-reduced-motion: reduce/);
  assert.match(mapCanvas, /cooperativeGestures: true/);
  assert.doesNotMatch(mapCanvas, /navigator\.geolocation|GeolocateControl|flyTo\s*\(/);
});

test("the basemap integration adds no sacred-place markers or route geometry", async () => {
  const files = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/MapExplorer.astro"),
  ]);
  const mapSource = files.join("\n");

  assert.doesNotMatch(mapSource, /\bMarker\b|new\s+Marker|addSource\s*\(|addLayer\s*\(|FeatureCollection|LineString|routeCoordinates|data-map-marker/i);
  assert.doesNotMatch(mapSource, /Подмаине|podmaine/iu);
  assert.match(mapSource, /Функција планирања руте је у припреми\./);
});

test("only the deployment build step receives the MapTiler secret", async () => {
  const [deployText, validationText] = await Promise.all([
    source(".github/workflows/deploy-cloudflare.yml"),
    source(".github/workflows/content-validation.yml"),
  ]);
  const deploy = parse(deployText);
  const steps = deploy.jobs.deploy.steps;
  const buildStep = steps.find((step) => step.name === "Build static site");
  const secretReference = `${String.fromCharCode(36)}{{ secrets.PUBLIC_MAPTILER_KEY }}`;

  assert.deepEqual(buildStep.env, { PUBLIC_MAPTILER_KEY: secretReference });
  assert.equal(
    steps.filter((step) => Object.hasOwn(step.env ?? {}, "PUBLIC_MAPTILER_KEY")).length,
    1,
  );
  assert.doesNotMatch(validationText, /PUBLIC_MAPTILER_KEY/);
});

test("production builds retain the excluded-content leak check", async () => {
  const [packageText, verifier] = await Promise.all([
    source("package.json"),
    source("scripts/verify-production-output.mjs"),
  ]);
  const packageJson = JSON.parse(packageText);

  assert.match(packageJson.scripts.build, /test:production-output/);
  assert.match(verifier, /Production output check passed/);
});
