import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { loadVisiblePlaces } from "../src/lib/content/publication.ts";
import { categoryForPlaceType } from "../src/lib/place-filters.ts";
import { MARKER_ASSETS, resolveMarkerAsset } from "../src/lib/map-marker-assets.ts";

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

test("the homepage renders a safe no-key fallback and a key-backed loading state", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.match(mapCanvas, /const hasMapTilerKey = Boolean\(import\.meta\.env\.PUBLIC_MAPTILER_KEY\?\.trim\(\)\);/);
  assert.match(mapCanvas, /data-map-state=\{hasMapTilerKey \? "loading" : "fallback"\}/);
  assert.match(mapCanvas, /class="map-fallback"[\s\S]*?hidden=\{hasMapTilerKey\}[\s\S]*?aria-hidden=\{hasMapTilerKey \? "true" : "false"\}/);
  assert.match(mapCanvas, /class="map-renderer"[\s\S]*?hidden=\{!hasMapTilerKey\}[\s\S]*?aria-hidden=\{hasMapTilerKey \? "false" : "true"\}/);
  assert.match(mapCanvas, /class="map-loading-surface"[\s\S]*?data-map-loading-status[\s\S]*?Учитавање карте/);
  assert.match(mapCanvas, /data-map-fallback-notice[\s\S]*?hidden=\{hasMapTilerKey\}/);
  assert.match(mapCanvas, /if \(!MAPTILER_KEY \|\| !mapContainer \|\| !renderer\)/);
  assert.match(mapCanvas, /const showFallback = \(\) => \{/);
  assert.match(mapCanvas, /root\.dataset\.mapState = "fallback"/);
  assert.match(mapCanvas, /if \(fallbackNotice\) fallbackNotice\.hidden = false/);
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
  assert.match(mapCanvas, /if \(layout === "full"\)/);
  assert.match(mapCanvas, /return \{ top: 56, right: 56, bottom: 56, left: 56 \};/);
  assert.match(mapCanvas, /return \{ top: 42, right: 42, bottom: 42, left: 42 \};/);
  assert.match(mapCanvas, /return \{ top: 22, right: 22, bottom: 22, left: 22 \};/);
  assert.match(mapCanvas, /center: \[19\.25, 42\.7\]/);
  assert.match(mapCanvas, /zoom: 6/);
  assert.match(mapCanvas, /const showReadyMap = \(\) => \{[\s\S]*?fitMontenegro\(false\)/);
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

test("the renderer becomes ready only after MapLibre loads and has a bounded fallback", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");
  const constructionIndex = mapCanvas.indexOf("map = new maplibregl.Map");
  const loadIndex = mapCanvas.indexOf('map.once("load"');

  assert.notEqual(constructionIndex, -1);
  assert.ok(loadIndex > constructionIndex);
  assert.match(mapCanvas, /const MAP_LOAD_TIMEOUT_MS = 10_000;/);
  assert.match(mapCanvas, /const showReadyMap = \(\) => \{[\s\S]*?root\.dataset\.mapState = "ready";[\s\S]*?renderer\.hidden = false;[\s\S]*?fallback\.hidden = true;[\s\S]*?loadingSurface\.hidden = true;[\s\S]*?attribution\.hidden = false;[\s\S]*?setControlsEnabled\(true\);[\s\S]*?map\.resize\(\);[\s\S]*?fitMontenegro\(false\);/);
  assert.match(mapCanvas, /map\.once\("load", \(\) => \{[\s\S]*?showReadyMap\(\);[\s\S]*?\}\);[\s\S]*?mapLoadTimer = window\.setTimeout\(showFallback, MAP_LOAD_TIMEOUT_MS\);/);
  assert.match(mapCanvas, /const clearMapLoadTimer = \(\) => \{[\s\S]*?window\.clearTimeout\(mapLoadTimer\);/);
  assert.match(mapCanvas, /removeActiveMap = \(\) => \{[\s\S]*?clearMapLoadTimer\(\);/);
  assert.doesNotMatch(mapCanvas, /showInteractiveMap\(\);|map\.on\("render"|map\.once\("idle"|triggerRepaint|requestAnimationFrame/);
});

test("MapLibre errors remain available through the library's built-in reporting", async () => {
  const mapCanvas = await source("src/components/MapCanvas.astro");

  assert.doesNotMatch(mapCanvas, /handleMapError|dataset\.mapError/);
  assert.doesNotMatch(mapCanvas, /map\.(?:on|once|off)\("error"/);
  assert.doesNotMatch(mapCanvas, /__SVETINJE_MAP_DEBUG__|sourcedata|styledata|getContext\s*\(/);
});

test("CSS keeps the renderer visible and gives loading, ready, and fallback explicit layers", async () => {
  const styles = await source("src/styles/global.css");
  const rendererRule = styles.match(/\.map-renderer\s*\{\s*z-index: 2;([^}]*)\}/)?.[1] ?? "";

  assert.match(rendererRule, /pointer-events: auto/);
  assert.doesNotMatch(rendererRule, /opacity:\s*0|pointer-events:\s*none/);
  assert.match(styles, /\.maplibre-map,\s*#montenegro-map\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(styles, /\.map-fallback\[hidden\],[\s\S]*?\.map-renderer\[hidden\],[\s\S]*?\.map-loading-surface\[hidden\]\s*\{[\s\S]*?display: none;/);
  assert.match(styles, /\.map-loading-surface\s*\{[\s\S]*?z-index: 3;/);
  assert.match(styles, /\[data-map-state="loading"\][\s\S]*?\[data-map-state="ready"\][\s\S]*?\[data-map-state="fallback"\]/);
  assert.doesNotMatch(rendererRule, /opacity:\s*0|pointer-events:\s*none/);
});

test("the map accepts only server-selected marker data and adds no route geometry", async () => {
  const files = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/MapExplorer.astro"),
  ]);
  const mapSource = files.join("\n");

  assert.match(mapSource, /data-map-place-data/);
  assert.match(mapSource, /placeType: place\.placeType/);
  assert.match(mapSource, /category: categoryForPlaceType\(place\.placeType\)/);
  assert.match(mapSource, /link\.dataset\.placeCategory = place\.category \?\? ""/);
  assert.match(mapSource, /new maplibregl\.Marker/);
  assert.match(mapSource, /new maplibregl\.Marker\(\{ element: link, anchor: "bottom" \}\)/);
  assert.match(mapSource, /dataset\.mapMarker/);
  assert.match(mapSource, /const link = document\.createElement\("a"\)/);
  assert.match(mapSource, /link\.href = `\/svetinje\/\$\{encodeURIComponent\(place\.slug\)\}\/`/);
  assert.match(mapSource, /link\.setAttribute\("aria-label", `\$\{place\.name\} — отвори страницу`\)/);
  assert.doesNotMatch(mapSource, /addSource\s*\(|addLayer\s*\(|FeatureCollection|LineString|routeCoordinates/i);
  assert.doesNotMatch(mapSource, /42\.29799|18\.84452|Манастир Подмаине/iu);
});

test("marker artwork follows one shared place-category taxonomy", async () => {
  const [mapCanvas, markerAssets, miniMap, styles] = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source("src/lib/map-marker-assets.ts"),
    source("src/components/place-detail/PlaceMiniMap.astro"),
    source("src/styles/global.css"),
  ]);
  const markerAssetByCategory = Object.fromEntries(
    Object.entries(MARKER_ASSETS).map(([category, asset]) => [category, asset.src]),
  );
  const expectedTypes = {
    monastery: markerAssetByCategory.monasteries,
    skete: markerAssetByCategory.monasteries,
    hermitage: markerAssetByCategory.monasteries,
    church: markerAssetByCategory.churches,
    chapel: markerAssetByCategory.churches,
    cathedral: markerAssetByCategory.churches,
    "holy-spring": markerAssetByCategory["holy-places"],
    cave: markerAssetByCategory["holy-places"],
    shrine: markerAssetByCategory["holy-places"],
    other: markerAssetByCategory["holy-places"],
  };

  assert.match(mapCanvas, /import \{ resolveMarkerAsset \} from "\.\.\/lib\/map-marker-assets"/);
  assert.match(miniMap, /import \{ resolveMarkerAsset \} from "\.\.\/\.\.\/lib\/map-marker-assets"/);
  assert.match(miniMap, /const markerSrc = resolveMarkerAsset\(placeType\)\?\.src/);
  assert.match(markerAssets, /monasteries: \{ src: "\/images\/map\/pin-monastery\.png", width: 354, height: 473 \}/);
  assert.match(markerAssets, /churches: \{ src: "\/images\/map\/pin-church\.png", width: 354, height: 480 \}/);
  assert.match(markerAssets, /"holy-places": \{ src: "\/images\/map\/pin-holy-place\.png", width: 352, height: 497 \}/);
  assert.match(markerAssets, /const category = categoryForPlaceType\(placeType\);[\s\S]*?return category \? MARKER_ASSETS\[category\] : undefined;/);
  assert.match(mapCanvas, /markerImage\.src = markerAsset\.src/);
  assert.match(mapCanvas, /markerImage\.alt = ""/);
  assert.match(mapCanvas, /holy-place-marker__fallback/);
  assert.doesNotMatch(mapCanvas, /markerPlaces\.push\([\s\S]*?placeType:\s*["']church["']/);
  for (const [placeType, expectedAsset] of Object.entries(expectedTypes)) {
    assert.equal(resolveMarkerAsset(placeType)?.src, expectedAsset);
  }
  assert.equal(categoryForPlaceType("unsupported-place-type"), null);
  assert.match(styles, /\.holy-place-marker\s*\{[\s\S]*?width: 2\.75rem;[\s\S]*?height: 2\.75rem;/);
  assert.match(styles, /\.holy-place-marker__image\s*\{[\s\S]*?bottom: 0;[\s\S]*?height: 2\.625rem;[\s\S]*?transform-origin: 50% 100%;/);
  assert.match(styles, /\.holy-place-marker\.is-selected \.holy-place-marker__image\s*\{[\s\S]*?scale\(1\.142857\)/);
  assert.match(styles, /@media \(min-width: 48rem\)[\s\S]*?\.holy-place-marker__image\s*\{[\s\S]*?height: 2\.875rem;[\s\S]*?\.holy-place-marker\.is-selected \.holy-place-marker__image\s*\{[\s\S]*?scale\(1\.173913\)/);
  assert.match(styles, /\.holy-place-marker:focus-visible\s*\{[\s\S]*?outline: 3px solid/);
});

test("editorial-preview markers derive from coordinates and retain category artwork", async () => {
  const places = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  const markerPlaces = places.filter(({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude));
  const assetFor = (placeType) => resolveMarkerAsset(placeType)?.src;
  const enrichedMonasteryIds = [
    "cetinjski-manastir",
    "manastir-ostrog",
    "manastir-moraca",
    "manastir-zanjice",
    "miholjska-prevlaka",
    "manastir-stanjevici",
    "manastir-praskvica",
    "manastir-rezevici",
    "manastir-gradiste",
    "manastir-ribnjak",
    "manastir-vranjina",
    "manastir-moracnik",
    "manastir-kom",
    "manastir-donje-brcele",
  ];

  assert.equal(assetFor(markerPlaces.find(({ id }) => id === "manastir-savina")?.placeType), "/images/map/pin-monastery.png");
  for (const id of enrichedMonasteryIds) {
    assert.equal(assetFor(markerPlaces.find((place) => place.id === id)?.placeType), "/images/map/pin-monastery.png");
  }
  for (const id of ["saborni-hram-podgorica", "saborni-hram-bar"]) {
    assert.equal(assetFor(markerPlaces.find((place) => place.id === id)?.placeType), "/images/map/pin-church.png");
  }
  assert.equal(markerPlaces.find(({ id }) => id === "manastir-savina")?.previewImageSrc, undefined);
});

test("one accessible marker preview supports hover and focus while markers navigate directly", async () => {
  const [mapCanvas, publication, styles] = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source("src/lib/content/publication.ts"),
    source("src/styles/global.css"),
  ]);

  assert.equal((mapCanvas.match(/new maplibregl\.Popup/g) ?? []).length, 1);
  assert.match(mapCanvas, /closeButton: false,[\s\S]*?closeOnClick: false,[\s\S]*?maxWidth: "240px"/);
  assert.match(mapCanvas, /\.setDOMContent\(card\)/);
  assert.doesNotMatch(mapCanvas, /(?:previewPopup|map-place-preview)[\s\S]{0,160}innerHTML/);
  assert.match(mapCanvas, /link\.addEventListener\("pointerenter", \(event\) => \{[\s\S]*?event\.pointerType !== "mouse"[\s\S]*?openPreview\(place, link\)/);
  assert.match(mapCanvas, /link\.addEventListener\("pointerleave", \(event\) => \{[\s\S]*?event\.pointerType !== "mouse"[\s\S]*?schedulePreviewClose\(\)/);
  assert.match(mapCanvas, /link\.addEventListener\("focus", \(\) => openPreview\(place, link\)\)/);
  assert.doesNotMatch(mapCanvas, /activatePlace|selectPlace|link\.addEventListener\("pointerup"|link\.addEventListener\("click"/);
  assert.match(mapCanvas, /card\.addEventListener\("pointerenter", \(event\) => \{[\s\S]*?event\.pointerType !== "mouse"[\s\S]*?clearPreviewCloseTimer\(\)/);
  assert.match(mapCanvas, /card\.addEventListener\("pointerleave", \(event\) => \{[\s\S]*?event\.pointerType !== "mouse"[\s\S]*?schedulePreviewClose\(\)/);
  assert.match(mapCanvas, /event\.composedPath\(\)[\s\S]*?eventPath\.includes\(activePreview\.link\)[\s\S]*?eventPath\.includes\(activePreview\.card\)/);
  assert.match(mapCanvas, /window\.setTimeout\(closePreview, 200\)/);
  assert.match(mapCanvas, /event\.key !== "Escape"/);
  assert.match(mapCanvas, /document\.addEventListener\("pointerdown", handleOutsidePreviewPointer\)/);
  assert.match(mapCanvas, /link\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(mapCanvas, /link\.setAttribute\("aria-controls", card\.id\)/);
  assert.match(mapCanvas, /root\.dataset\.popupOpen = "true"/);
  assert.match(mapCanvas, /root\.removeAttribute\("data-popup-open"\)/);
  assert.match(mapCanvas, /if \(activePreview\?\.place\.id === place\.id\) \{[\s\S]*?root\.dataset\.popupOpen = "true"/);
  assert.match(mapCanvas, /activePreview = \{ place, link, card \};[\s\S]*?root\.dataset\.popupOpen = "true"/);
  assert.doesNotMatch(mapCanvas, /activePreview\.pinned|pinned:/);
  assert.match(mapCanvas, /if \(activePreview\?\.place\.id === id\) closePreview\(\)/);
  assert.match(mapCanvas, /link\.href = `\/svetinje\/\$\{encodeURIComponent\(place\.slug\)\}\/`/);
  assert.match(mapCanvas, /notice\.textContent = "Ауторска фотографија биће додата"/);
  assert.match(mapCanvas, /image\.alt = place\.previewImageAlt \?\? place\.name/);

  assert.match(publication, /previewImageSrc\?: string/);
  assert.match(publication, /media\.related_place_ids\.includes\(placeId\)/);
  assert.match(publication, /media\.allowed_uses\?\.includes\("web-display"\)/);
  assert.match(publication, /\["approved", "published"\]\.includes\(media\.editorial_status\)/);
  assert.match(publication, /normalized\.startsWith\("public\/"\)/);
  assert.match(publication, /await access\(absolute\)/);
  assert.match(publication, /media\.editorial_status === "published"[\s\S]*?\["media-rights", "publishing"\]/);
  assert.match(styles, /\.map-place-preview\s*\{[\s\S]*?width: min\(15rem, calc\(100vw - 2rem\)\)/);
  assert.match(styles, /\.holy-place-popup \.maplibregl-popup-content\s*\{[\s\S]*?padding: 0 !important;[\s\S]*?background: var\(--paper\) !important;/);
  assert.match(styles, /\.map-place-preview\s*\{[\s\S]*?max-width: 100%;[\s\S]*?box-sizing: border-box;[\s\S]*?display: block;[\s\S]*?margin: 0;[\s\S]*?padding: 14px 20px 0 20px;/);
  assert.match(styles, /\.map-place-preview__media\s*\{[\s\S]*?width: 100%;[\s\S]*?max-width: 100%;[\s\S]*?box-sizing: border-box;[\s\S]*?margin: 0;/);
  assert.match(styles, /\.map-place-preview__body\s*\{[\s\S]*?padding: 14px 0 14px;/);
  assert.match(styles, /@media \(max-width: 47\.99rem\)\s*\{[\s\S]*?\.map-canvas\[data-popup-open="true"\] \.map-renderer\s*\{[\s\S]*?z-index: auto;[\s\S]*?\.map-canvas\[data-popup-open="true"\] \.holy-place-popup\s*\{[\s\S]*?z-index: 40 !important;/);
  assert.match(styles, /@media \(max-width: 47\.99rem\)[\s\S]*?\.map-place-preview\s*\{[\s\S]*?padding: 10px 10px 0;[\s\S]*?\.map-place-preview__media\s*\{[\s\S]*?min-height: 5\.75rem;[\s\S]*?\.map-place-preview__image\s*\{[\s\S]*?height: 5\.75rem;[\s\S]*?\.map-place-preview__body\s*\{[\s\S]*?padding: 10px 0 13px;/);
  assert.match(styles, /\.map-place-preview__type\s*\{[\s\S]*?display: none;/);
  assert.match(styles, /\.map-place-preview__link:focus-visible/);
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
