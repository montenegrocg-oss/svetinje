import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(PROJECT_ROOT, file), "utf8");
}

test("MapLibre GL JS is pinned exactly to the v5 compatibility release", async () => {
  const [packageText, lockText] = await Promise.all([
    source("package.json"),
    source("pnpm-lock.yaml"),
  ]);
  const packageJson = JSON.parse(packageText);
  const lock = parse(lockText);

  assert.equal(packageJson.dependencies["maplibre-gl"], "5.15.0");
  assert.deepEqual(lock.importers["."].dependencies["maplibre-gl"], {
    specifier: "5.15.0",
    version: "5.15.0",
  });
});

test("MapTiler configuration uses only the approved public environment variable", async () => {
  const [mapCanvas, envExample] = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source(".env.example"),
  ]);

  assert.equal(envExample, "PUBLIC_MAPTILER_KEY=\n");
  assert.match(mapCanvas, /import maplibregl from "maplibre-gl"/);
  assert.doesNotMatch(mapCanvas, /import \* as maplibregl from "maplibre-gl"/);
  assert.match(mapCanvas, /import\.meta\.env\.PUBLIC_MAPTILER_KEY/);
  assert.match(mapCanvas, /maps\/019fc7d8-717c-701d-9ca5-a53d9438d3ce\/style\.json\?key=\$\{encodeURIComponent\(MAPTILER_KEY\)\}/);
  assert.doesNotMatch(mapCanvas, /maps\/streets-v4\/style\.json/);
  assert.doesNotMatch(mapCanvas, /maps\/outdoor-v4\/style\.json/);
  assert.doesNotMatch(mapCanvas, /style\.json\?key=[A-Za-z0-9_-]{8,}/);
});

test("the homepage keeps a safe no-key fallback", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /class="map-fallback"[\s\S]*?aria-hidden="false"/);
  assert.match(mapCanvas, /class="map-renderer"[\s\S]*?hidden[\s\S]*?aria-hidden="true"/);
  assert.match(mapCanvas, /if \(!MAPTILER_KEY \|\| !mapContainer \|\| !renderer\)/);
  assert.match(mapCanvas, /const showFallback = \(\) => \{/);
  assert.match(mapCanvas, /if \(fallbackNotice\) fallbackNotice\.hidden = false/);
  assert.doesNotMatch(mapCanvas, /mapTilerAvailable/);
});

test("the map structure contains an interactive container and explicit attribution", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /import "maplibre-gl\/dist\/maplibre-gl\.css"/);
  assert.match(mapCanvas, /import maplibregl from "maplibre-gl"/);
  assert.doesNotMatch(mapCanvas, /import \* as maplibregl from "maplibre-gl"/);
  assert.doesNotMatch(mapCanvas, /await import\("maplibre-gl"\)/);
  assert.match(mapCanvas, /data-testid="maplibre-container"/);
  assert.match(mapCanvas, /role="region"/);
  assert.match(mapCanvas, /data-map-attribution/);
  assert.match(mapCanvas, /https:\/\/www\.maptiler\.com\/copyright\//);
  assert.match(mapCanvas, /https:\/\/www\.openstreetmap\.org\/copyright/);
  assert.equal((mapCanvas.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
});

test("custom controls use the requested responsive Montenegro view without geolocation", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /const MONTENEGRO_BOUNDS: LngLatBoundsLike = \[\s*\[18\.42, 41\.8\],\s*\[20\.36, 43\.57\],\s*\];/);
  assert.match(mapCanvas, /map\.fitBounds\(MONTENEGRO_BOUNDS/);
  assert.match(mapCanvas, /if \(width >= 1088\) return \{ top: 78, right: 28, bottom: 30, left: 292 \};/);
  assert.match(mapCanvas, /if \(width >= 768\) return \{ top: 135, right: 26, bottom: 34, left: 245 \};/);
  assert.match(mapCanvas, /return \{ top: 62, right: 14, bottom: 26, left: 14 \};/);
  assert.match(mapCanvas, /center: \[19\.25, 42\.7\]/);
  assert.match(mapCanvas, /zoom: 6/);
  assert.match(mapCanvas, /map\.once\("load", \(\) => \{[\s\S]*?fitMontenegro\(false\)/);
  assert.match(mapCanvas, /const resetView = \(\) => \{[\s\S]*?fitMontenegro\(true\);/);
  assert.match(mapCanvas, /map\.zoomIn/);
  assert.match(mapCanvas, /map\.zoomOut/);
  assert.match(mapCanvas, /resetButton\?\.addEventListener\("click", resetView\)/);
  assert.match(mapCanvas, /prefers-reduced-motion: reduce/);
  assert.match(mapCanvas, /cooperativeGestures: true/);
  assert.match(mapCanvas, /dragRotate: false/);
  assert.match(mapCanvas, /pitchWithRotate: false/);
  assert.doesNotMatch(mapCanvas, /navigator\.geolocation|GeolocateControl|flyTo\s*\(/);
});

test("the renderer is exposed immediately after successful map construction", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");
  const constructionIndex = mapCanvas.indexOf("map = new maplibregl.Map");
  const exposeIndex = mapCanvas.indexOf("showInteractiveMap();");
  const loadIndex = mapCanvas.indexOf('map.once("load"');

  assert.notEqual(constructionIndex, -1);
  assert.ok(exposeIndex > constructionIndex);
  assert.ok(loadIndex > exposeIndex);
  assert.match(mapCanvas, /const showInteractiveMap = \(\) => \{[\s\S]*?renderer\.hidden = false;[\s\S]*?fallback\.hidden = true;[\s\S]*?attribution\.hidden = false;[\s\S]*?setControlsEnabled\(true\);[\s\S]*?map\.resize\(\);/);
  assert.doesNotMatch(mapCanvas, /data-map-state|revealMap|hasRenderableCanvas|hasUsableStyle|handleRender|readinessTimer|readinessFrame/);
  assert.doesNotMatch(mapCanvas, /triggerRepaint|requestAnimationFrame|map\.on\("render"|map\.once\("idle"|11_000/);
});

test("MapLibre errors remain available through the library's built-in reporting", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.doesNotMatch(mapCanvas, /handleMapError|dataset\.mapError/);
  assert.doesNotMatch(mapCanvas, /map\.(?:on|once|off)\("error"/);
  assert.doesNotMatch(mapCanvas, /__SVETINJE_MAP_DEBUG__|sourcedata|styledata|getContext\s*\(/);
});

test("CSS keeps the renderer visible and the selected layer exclusive", async () => {
  const styles = await source("src/styles/global.css");
  const rendererRule = styles.match(/\.map-renderer\s*\{\s*z-index: 2;([^}]*)\}/)?.[1] ?? "";

  assert.match(rendererRule, /pointer-events: auto/);
  assert.doesNotMatch(rendererRule, /opacity:\s*0|pointer-events:\s*none/);
  assert.match(styles, /\.maplibre-map,\s*#montenegro-map\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(styles, /\.map-fallback\[hidden\],\s*\.map-renderer\[hidden\]\s*\{[\s\S]*?display: none;/);
  assert.doesNotMatch(styles, /data-map-state="ready"|map-readiness/);
});

test("the map accepts only server-selected marker data and adds no route geometry", async () => {
  const files = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/MapExplorer.astro"),
  ]);
  const mapSource = files.join("\n");

  assert.match(mapSource, /data-map-place-data/);
  assert.match(mapSource, /new maplibregl\.Marker/);
  assert.match(mapSource, /data-map-marker/);
  assert.match(mapSource, /svetinje:place-select/);
  assert.doesNotMatch(mapSource, /addSource\s*\(|addLayer\s*\(|FeatureCollection|LineString|routeCoordinates/i);
  assert.doesNotMatch(mapSource, /42\.29799|18\.84452|Манастир Подмаине/iu);
});

test("only Cloudflare site build steps receive the MapTiler secret", async () => {
  const [deployText, previewText, validationText] = await Promise.all([
    source(".github/workflows/deploy-cloudflare.yml"),
    source(".github/workflows/preview-cloudflare.yml"),
    source(".github/workflows/content-validation.yml"),
  ]);
  const deploy = parse(deployText);
  const preview = parse(previewText);
  const secretReference = `${String.fromCharCode(36)}{{ secrets.PUBLIC_MAPTILER_KEY }}`;

  const deployBuild = deploy.jobs.deploy.steps.find((step) => step.name === "Build static site");
  const previewBuild = preview.jobs.preview.steps.find((step) => step.name === "Build static site");
  assert.deepEqual(deployBuild.env, { PUBLIC_MAPTILER_KEY: secretReference });
  assert.deepEqual(previewBuild.env, {
    PUBLIC_MAPTILER_KEY: secretReference,
    EDITORIAL_PREVIEW: "true",
  });
  for (const steps of [deploy.jobs.deploy.steps, preview.jobs.preview.steps]) {
    assert.equal(steps.filter((step) => Object.hasOwn(step.env ?? {}, "PUBLIC_MAPTILER_KEY")).length, 1);
  }
  assert.doesNotMatch(deployText, /EDITORIAL_PREVIEW/);
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
