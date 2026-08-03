import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(PROJECT_ROOT, file), "utf8");
}

function compileMapErrorSanitizer(mapCanvas, configuredKey) {
  const sanitizerSource = mapCanvas.match(
    /const sanitizeMapError = \(message: unknown\) => \{[\s\S]*?\n  \};/,
  )?.[0];

  assert.ok(sanitizerSource);
  const executable = sanitizerSource.replace(
    "const sanitizeMapError = (message: unknown) => {",
    "return (message) => {",
  );
  return new Function("MAPTILER_KEY", executable)(configuredKey);
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

test("map readiness uses a renderable canvas rather than complete style loading", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /const revealMap = \(\) => \{/);
  assert.match(mapCanvas, /if \(ready \|\| removed\) return;/);
  assert.match(mapCanvas, /map\.once\("load", revealMap\)/);
  assert.match(mapCanvas, /map\.on\("render", handleRender\)/);
  assert.match(mapCanvas, /map\.once\("idle", revealMap\)/);
  assert.match(mapCanvas, /const hasRenderableCanvas = \(\) => \{/);
  assert.match(mapCanvas, /canvas\.isConnected/);
  assert.match(mapCanvas, /mapContainer\.contains\(canvas\)/);
  assert.match(mapCanvas, /canvas\.clientWidth > 0/);
  assert.match(mapCanvas, /canvas\.clientHeight > 0/);
  assert.match(mapCanvas, /canvas\.width > 0/);
  assert.match(mapCanvas, /canvas\.height > 0/);
  assert.match(mapCanvas, /function handleRender\(\) \{[\s\S]*?if \(hasRenderableCanvas\(\)\) revealMap\(\);[\s\S]*?\}/);
  assert.match(mapCanvas, /map\.off\("render", handleRender\)/);
  assert.doesNotMatch(mapCanvas, /hasRenderableCanvas\(\)\s*&&/);
  assert.doesNotMatch(mapCanvas, /hasUsableStyle/);
  assert.doesNotMatch(mapCanvas, /map\.once\("load", \(\) =>/);
});

test("initial repaint and timeout reveal a usable canvas and otherwise fall back", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /map\.resize\(\);\s*map\.triggerRepaint\(\);\s*readinessFrame = window\.requestAnimationFrame/);
  assert.match(mapCanvas, /requestAnimationFrame\(\(\) => \{[\s\S]*?map\.resize\(\);\s*map\.triggerRepaint\(\);\s*if \(hasRenderableCanvas\(\)\) revealMap\(\);/);
  assert.match(mapCanvas, /readinessTimer = window\.setTimeout\(\(\) => \{[\s\S]*?if \(hasRenderableCanvas\(\)\) \{\s*revealMap\(\);\s*return;\s*\}\s*showFallback\(\);\s*removeMap\(\);[\s\S]*?11_000\);/);
  assert.doesNotMatch(mapCanvas, /hasRenderableCanvas\(\)\s*&&\s*hasUsableStyle\(\)/);
});

test("non-fatal MapLibre resource errors are reported only after sanitization", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");
  const sensitiveToken = ["sensitive", "token"].join("-");
  const sanitize = compileMapErrorSanitizer(mapCanvas, sensitiveToken);
  const sanitized = sanitize(
    `Failed https://api.maptiler.com/maps/outdoor-v4/style.json?key=${sensitiveToken}&session=value key=${sensitiveToken} PUBLIC_MAPTILER_KEY`,
  );

  assert.match(mapCanvas, /map\.on\("error", handleMapError\)/);
  assert.match(mapCanvas, /const sanitizedMessage = sanitizeMapError\(event\.error\?\.message\)/);
  assert.match(mapCanvas, /console\.error\("\[Svetinje map\]", sanitizedMessage\)/);
  assert.match(mapCanvas, /root\.dataset\.mapLastError = sanitizedMessage/);
  assert.match(mapCanvas, /replace\(\/\\b\(\?:https\?\|blob\):\\\/\\\/\[\^\\s/);
  assert.match(mapCanvas, /maptiler\\\.com/);
  assert.match(mapCanvas, /replace\(\/\\\?\[\^\\s/);
  assert.match(mapCanvas, /\\bkey\\s\*\[:=\]/);
  assert.match(mapCanvas, /replaceAll\(MAPTILER_KEY, "\[redacted-key\]"\)/);
  assert.match(mapCanvas, /slice\(0, 300\)/);
  assert.match(mapCanvas, /recentErrors\.length > 5/);
  assert.doesNotMatch(mapCanvas, /console\.error\([^\n]*event|console\.error\([^\n]*MAPTILER_KEY/);
  assert.doesNotMatch(mapCanvas, /root\.dataset\.mapLastError\s*=\s*event/);
  assert.doesNotMatch(mapCanvas, /map\.on\("error", \(\) => \{[\s\S]*?showFallback/);
  assert.match(sanitized, /\[redacted-resource\]/);
  assert.match(sanitized, /\[redacted-key\]|key=\[redacted\]/);
  assert.match(sanitized, /\[redacted-key-name\]/);
  assert.doesNotMatch(sanitized, /https?:|api\.maptiler\.com|\?|session=|PUBLIC_MAPTILER_KEY/);
  assert.equal(sanitized.includes(sensitiveToken), false);
  assert.ok(sanitized.length <= 300);
});

test("temporary diagnostics expose only safe map and source status", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");
  const debugType = mapCanvas.match(/type MapDebugState = \{[\s\S]*?\n  \};/)?.[0] ?? "";
  const debugAssignment = mapCanvas.match(/debugWindow\.__SVETINJE_MAP_DEBUG__ = \{[\s\S]*?\n      \};/)?.[0] ?? "";

  assert.ok(debugType);
  assert.ok(debugAssignment);
  for (const field of [
    "mapState",
    "canvasPresent",
    "canvasWidth",
    "canvasHeight",
    "webglAvailable",
    "styleLoaded",
    "tilesLoaded",
    "zoom",
    "center",
    "sourceIds",
    "sourceStates",
    "recentErrors",
  ]) {
    assert.match(debugType, new RegExp(`\\b${field}\\b`));
    assert.match(debugAssignment, new RegExp(`\\b${field}\\b`));
  }

  assert.match(mapCanvas, /map\.isSourceLoaded\(sourceId\)/);
  assert.match(mapCanvas, /map\.areTilesLoaded\(\)/);
  assert.match(mapCanvas, /map\.isStyleLoaded\(\)/);
  assert.match(mapCanvas, /map\.on\("styledata", handleDiagnosticUpdate\)/);
  assert.match(mapCanvas, /map\.on\("sourcedata", handleDiagnosticUpdate\)/);
  assert.match(mapCanvas, /map\.once\("load", updateMapDebug\)/);
  assert.match(mapCanvas, /map\.once\("idle", updateMapDebug\)/);
  assert.match(mapCanvas, /window\.setTimeout\(updateMapDebug, 3_000\)/);
  assert.doesNotMatch(debugType + debugAssignment, /styleUrls?|sourceUrls?|TileJSON|request|environment|MAPTILER_KEY|\bmap\s*:/i);
});

test("diagnostic style and source status never gates map readiness", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");
  const readiness = mapCanvas.match(/function handleRender\(\)[\s\S]*?readinessTimer = window\.setTimeout\([\s\S]*?11_000\);/)?.[0] ?? "";

  assert.ok(readiness);
  assert.doesNotMatch(readiness, /isStyleLoaded|areTilesLoaded|isSourceLoaded|styleLoaded|tilesLoaded|sourceStates/);
  assert.match(readiness, /if \(hasRenderableCanvas\(\)\) revealMap\(\)/);
});

test("ready-state CSS reveals the renderer and uncovers it from the fallback", async () => {
  const styles = await source("src/styles/global.css");

  assert.match(styles, /\.map-canvas\[data-map-state="ready"\] \.map-fallback\s*\{[\s\S]*?visibility: hidden;[\s\S]*?opacity: 0;/);
  assert.match(styles, /\.map-canvas\[data-map-state="ready"\] \.map-renderer\s*\{[\s\S]*?opacity: 1;[\s\S]*?pointer-events: auto;/);
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
