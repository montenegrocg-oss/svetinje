import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import {
  loadEditorialPreviewPlaces,
  loadVisiblePlaces,
} from "../src/lib/content/publication.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(PROJECT_ROOT, file), "utf8");
}

async function previewProject(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "svetinje-preview-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(PROJECT_ROOT, "content"), path.join(root, "content"), { recursive: true });
  await mkdir(path.join(root, "validation"), { recursive: true });
  await cp(
    path.join(PROJECT_ROOT, "validation", "publication-policy.json"),
    path.join(root, "validation", "publication-policy.json"),
  );
  await cp(
    path.join(PROJECT_ROOT, "validation", "editorial-preview.json"),
    path.join(root, "validation", "editorial-preview.json"),
  );
  return root;
}

test("production ignores the preview allowlist and keeps Podmaine excluded", async (t) => {
  const root = await previewProject(t);
  await writeFile(path.join(root, "validation", "editorial-preview.json"), "not valid JSON", "utf8");
  assert.deepEqual(await loadVisiblePlaces(root, { editorialPreview: false }), []);

  const policy = JSON.parse(await source("validation/publication-policy.json"));
  assert.equal(policy.public_publication_locked, true);
});

test("editorial preview returns the two allowlisted research dossiers", async () => {
  const places = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  assert.equal(places.length, 2);
  const podmaine = places.find((place) => place.id === "podmaine");
  const cathedral = places.find((place) => place.id === "saborni-hram-podgorica");
  assert.ok(podmaine);
  assert.ok(cathedral);
  assert.equal(podmaine.id, "podmaine");
  assert.equal(podmaine.slug, "manastir-podmaine");
  assert.equal(podmaine.name, "Манастир Подмаине");
  assert.equal(podmaine.placeType, "monastery");
  assert.equal(podmaine.preview, true);
  assert.equal(podmaine.previewStatus, "research");
  assert.equal(podmaine.latitude, 42.29799);
  assert.equal(podmaine.longitude, 18.84452);
  assert.equal(podmaine.coordinateAccuracy, "complex-centroid");
  assert.equal(podmaine.municipality, "Будва");
  assert.equal(podmaine.settlement, "Подмаине");
  assert.match(podmaine.searchText, /Маине/);
  assert.match(podmaine.searchText, /Подострог/);
  assert.ok(podmaine.narrativeSections.some((section) => section.id === "introduction"));
  assert.ok(podmaine.narrativeSections.some((section) => section.id === "history"));
  assert.ok(podmaine.narrativeSections.every((section) => section.paragraphs.every((paragraph) => paragraph.sourceIds.length > 0)));
  assert.equal(cathedral.slug, "saborni-hram-hristovog-vaskrsenja-podgorica");
  assert.equal(cathedral.placeType, "cathedral");
  assert.equal(cathedral.typeLabel, "Саборни храм");
  assert.equal(cathedral.latitude, undefined);
  assert.equal(cathedral.longitude, undefined);
  assert.match(cathedral.searchText, /Предраг Ристић/);
  assert.match(cathedral.searchText, /Храм Васкрсења/);
  assert.ok(cathedral.narrativeSections.every((section) => section.paragraphs.every((paragraph) => paragraph.sourceIds.length > 0)));
});

test("preview allowlist rejects duplicates and unknown place IDs", async (t) => {
  const root = await previewProject(t);
  const allowlist = path.join(root, "validation", "editorial-preview.json");
  await writeFile(allowlist, JSON.stringify({ place_ids: ["podmaine", "podmaine"] }), "utf8");
  await assert.rejects(() => loadEditorialPreviewPlaces(root), /must not contain duplicates/);

  await writeFile(allowlist, JSON.stringify({ place_ids: ["unknown-preview-place"] }), "utf8");
  await assert.rejects(() => loadEditorialPreviewPlaces(root), /unknown allowlisted place ID unknown-preview-place/);
});

test("non-allowlisted research records never become visible", async (t) => {
  const root = await previewProject(t);
  await writeFile(path.join(root, "validation", "editorial-preview.json"), JSON.stringify({ place_ids: [] }), "utf8");
  assert.deepEqual(await loadEditorialPreviewPlaces(root), []);
});

test("Podmaine content remains research-only, sourced, and public-safe", async () => {
  const [placeText, narrative, osmText, policyText] = await Promise.all([
    source("content/places/podmaine/place.yaml"),
    source("content/places/podmaine/narratives/sr.md"),
    source("content/sources/openstreetmap-podmaine-way-161886544.yaml"),
    source("validation/publication-policy.json"),
  ]);
  const place = parse(placeText);
  const osm = parse(osmText);
  const policy = JSON.parse(policyText);

  assert.equal(place.editorial_status, "research");
  assert.ok(place.approvals.length === 0);
  assert.equal(place.location.coordinates.verification.status, "requires-verification");
  assert.equal(place.location.coordinates.publication_safety, "public");
  assert.match(place.location.coordinates.verification.qualification, /не означавају тачан пјешачки улаз/);
  assert.equal(osm.url, "https://www.openstreetmap.org/way/161886544");
  assert.equal(osm.source_type, "other-approved");
  assert.match(narrative, /summary: Манастир Подмаине је православни манастир/);
  assert.equal(policy.public_publication_locked, true);
});

test("preview UI is allowlist-driven, noindex, and free of prohibited data", async () => {
  const [mapCanvas, explorer, card, detail, baseLayout, metadata, previewWorkflow, productionWorkflow] = await Promise.all([
    source("src/components/MapCanvas.astro"),
    source("src/components/MapExplorer.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/pages/svetinje/[slug].astro"),
    source("src/layouts/BaseLayout.astro"),
    source("src/components/PageMetadata.astro"),
    source(".github/workflows/preview-cloudflare.yml"),
    source(".github/workflows/deploy-cloudflare.yml"),
  ]);
  const combined = [mapCanvas, explorer, card, detail].join("\n");

  assert.match(mapCanvas, /new maplibregl\.Marker/);
  assert.match(mapCanvas, /aria-label.*отвори детаље/);
  assert.match(mapCanvas, /svetinje:place-select/);
  assert.match(explorer, /loadVisiblePlaces/);
  assert.match(card, /Радни приказ/);
  assert.match(detail, /getStaticPaths/);
  assert.match(detail, /loadVisiblePlaces/);
  assert.match(detail, /Ауторска фотографија биће додата/);
  assert.doesNotMatch(detail, /1630|1747|1869|1979|1995|2007/);
  assert.match(baseLayout, /EDITORIAL_PREVIEW/);
  assert.match(metadata, /noindex,nofollow,noarchive/);
  assert.match(previewWorkflow, /EDITORIAL_PREVIEW: "true"/);
  assert.doesNotMatch(productionWorkflow, /EDITORIAL_PREVIEW/);
  assert.doesNotMatch(combined, /rating|оцјена|радно вријеме|телефон|033\/|@gmail\.com/i);
  assert.doesNotMatch(combined, /FeatureCollection|LineString|routeCoordinates|addSource\s*\(|addLayer\s*\(/);
  assert.doesNotMatch(detail, /<img\b|https?:\/\/.*\.(?:jpg|jpeg|png|webp)/i);
});
