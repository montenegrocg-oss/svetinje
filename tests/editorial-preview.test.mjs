import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse, stringify } from "yaml";
import {
  loadEditorialPreviewPlaces,
  loadVisiblePlaces,
} from "../src/lib/content/publication.ts";
import { PLACE_AREAS } from "../src/lib/place-areas.ts";

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

test("production ignores the preview allowlist and keeps research dossiers excluded", async (t) => {
  const root = await previewProject(t);
  await writeFile(path.join(root, "validation", "editorial-preview.json"), "not valid JSON", "utf8");
  assert.deepEqual(await loadVisiblePlaces(root, { editorialPreview: false }), []);

  const policy = JSON.parse(await source("validation/publication-policy.json"));
  assert.equal(policy.public_publication_locked, true);
});

test("editorial preview inventory is driven by the canonical allowlist", async () => {
  const places = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  const manifest = JSON.parse(await source("validation/editorial-preview.json"));

  assert.deepEqual(places.map((place) => place.id), manifest.place_ids);
  for (const place of places) {
    assert.equal(place.preview, true);
    assert.match(place.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(place.name.trim());
    assert.ok(place.summary.trim());
    assert.ok(place.placeType);
    assert.ok(place.narrativeSections.length > 0);
    assert.ok(place.narrativeSections.every((section) => section.paragraphs.every((paragraph) => paragraph.sourceIds.length === 0)));
    assert.ok(Array.isArray(place.galleryImages));
    if (place.previewImageSrc) {
      assert.match(place.previewImageSrc, /^https:\/\/media\.svetinje\.me\/places\//);
      assert.ok(place.previewImageAlt?.trim());
    }
  }
});

test("Serbian narratives contain no visible source-registry footnotes", async () => {
  const placeIds = await readdir(path.join(PROJECT_ROOT, "content", "places"));
  for (const placeId of placeIds) {
    const narrative = await source(path.join("content", "places", placeId, "narratives", "sr.md"));
    assert.doesNotMatch(narrative, /\[\^[^\]]+\]/, `${placeId} contains an inline source citation`);
    assert.doesNotMatch(narrative, /^\s*:\s*\[[^\]]+\]\(https?:\/\//m, `${placeId} contains an orphaned source definition`);
    assert.doesNotMatch(narrative, /Регистар извора/, `${placeId} contains a source registry label`);
  }
});

test("editorial preview accepts canonical place and narrative records without source registries", async (t) => {
  const root = await previewProject(t);
  const placeFile = path.join(root, "content", "places", "podmaine", "place.yaml");
  const narrativeFile = path.join(root, "content", "places", "podmaine", "narratives", "sr.md");
  const place = parse(await readFile(placeFile, "utf8"));
  delete place.source_ids;
  await writeFile(placeFile, stringify(place), "utf8");
  const markdown = await readFile(narrativeFile, "utf8");
  const closing = markdown.indexOf("\n---\n", 4);
  const frontMatter = parse(markdown.slice(4, closing));
  delete frontMatter.source_ids;
  delete frontMatter.section_sources;
  for (const alternate of frontMatter.alternate_names ?? []) delete alternate.source_ids;
  await writeFile(narrativeFile, `---\n${stringify(frontMatter)}---\n${markdown.slice(closing + 5)}`, "utf8");
  const visible = await loadEditorialPreviewPlaces(root);
  assert.ok(visible.some(({ id }) => id === "podmaine"));
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

test("Dajbabe remains research-only, sourced, and public-safe", async () => {
  const [placeText, narrative, osmText] = await Promise.all([
    source("content/places/dajbabe/place.yaml"),
    source("content/places/dajbabe/narratives/sr.md"),
    source("content/sources/openstreetmap-dajbabe-way-1351594167.yaml"),
  ]);
  const place = parse(placeText);
  const osm = parse(osmText);

  assert.equal(place.id, "dajbabe");
  assert.equal(place.editorial_status, "research");
  assert.equal(place.place_type.value, "monastery");
  assert.deepEqual(place.approvals, []);
  assert.equal(place.location.coordinates.latitude, 42.40364);
  assert.equal(place.location.coordinates.longitude, 19.23226);
  assert.equal(place.location.coordinates.accuracy, "complex-centroid");
  assert.equal(place.location.coordinates.publication_safety, "public");
  assert.match(place.location.coordinates.verification.qualification, /радни центар манастирског комплекса/);
  assert.equal(osm.url, "https://www.openstreetmap.org/way/1351594167");
  assert.equal(osm.source_type, "other-approved");
  assert.match(narrative, /summary: Пећински манастир Успења Пресвете Богородице/);
  assert.match(narrative, /## Чудесно откриће светиње \{#discovery\}/);
  assert.match(narrative, /## Канонизација и празник \{#canonization\}/);
  assert.match(narrative, /## Положај манастира \{#location\}/);
  assert.doesNotMatch(narrative, /радно вријеме|телефон|електронск[а-я]+ пошта|паркинг/i);
});

test("Savina remains a sourced editorial-preview monastery without media", async () => {
  const [placeText, narrative, osmText, manifestText, mediaDirectory] = await Promise.all([
    source("content/places/manastir-savina/place.yaml"),
    source("content/places/manastir-savina/narratives/sr.md"),
    source("content/sources/openstreetmap-manastir-savina-way-147257044.yaml"),
    source("validation/editorial-preview.json"),
    readdir(path.join(PROJECT_ROOT, "content", "media")),
  ]);
  const place = parse(placeText);
  const osm = parse(osmText);
  const manifest = JSON.parse(manifestText);

  assert.ok(manifest.place_ids.includes("manastir-savina"));
  assert.equal(place.id, "manastir-savina");
  assert.equal(place.editorial_status, "research");
  assert.equal(place.place_type.value, "monastery");
  assert.equal(place.location.coordinates.latitude, 42.45241989804254);
  assert.equal(place.location.coordinates.longitude, 18.554391598000464);
  assert.equal(place.location.coordinates.accuracy, "complex-centroid");
  assert.equal(place.location.coordinates.publication_safety, "public");
  assert.match(place.location.coordinates.verification.qualification, /центроид манастирског комплекса/);
  assert.equal(osm.url, "https://www.openstreetmap.org/way/147257044");
  assert.equal(osm.source_type, "other-approved");
  assert.match(narrative, /slug: manastir-savina/);
  assert.match(narrative, /summary: Манастир Савина је православни мушки манастир/);
  for (const sectionId of [
    "introduction",
    "architecture-and-art",
    "relics-icons-and-traditions",
    "feasts",
    "history",
    "location",
    "visitor-information",
    "verification-notes",
  ]) {
    assert.match(narrative, new RegExp(`\\{#${sectionId}\\}`));
  }
  assert.match(narrative, /по предању|Предање/);
  assert.equal(mediaDirectory.some((file) => /savina/i.test(file)), false);
  assert.doesNotMatch(narrative, /радно вријеме|телефон|електронск[а-я]+ пошта|паркинг/i);
});

test("the male-monastery import is complete, research-only, and source-bound", async () => {
  const sourceId = "mitropolija-muski-manastiri";
  const importedIds = [
    "cetinjski-manastir",
    "manastir-ostrog",
    "manastir-moraca",
    "manastir-savina",
    "manastir-zanjice",
    "miholjska-prevlaka",
    "manastir-bijelici",
    "podmaine",
    "manastir-stanjevici",
    "manastir-praskvica",
    "manastir-rezevici",
    "manastir-gradiste",
    "manastir-ribnjak",
    "manastir-vranjina",
    "manastir-moracnik",
    "manastir-tophana",
    "manastir-orahovo",
    "manastir-donje-brcele",
    "manastir-kom",
    "manastir-kosmac",
    "dajbabe",
    "lavra-svetog-simeona-mirotocivog",
    "manastir-recine",
  ];
  const manifest = JSON.parse(await source("validation/editorial-preview.json"));
  const visible = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  const visibleById = new Map(visible.map((place) => [place.id, place]));
  const sharedAreaIds = new Set(PLACE_AREAS.map((area) => area.id));

  assert.equal(importedIds.length, 23);
  for (const id of importedIds) {
    const place = parse(await source(`content/places/${id}/place.yaml`));
    const narrative = await source(`content/places/${id}/narratives/sr.md`);
    assert.equal(place.editorial_status, "research");
    assert.equal(place.place_type.value, "monastery");
    assert.deepEqual(place.approvals, []);
    assert.ok(place.source_ids.includes(sourceId));
    assert.ok(sharedAreaIds.has(place.browse_area_id), `${id} must use a shared browse area`);
    assert.match(narrative, new RegExp(`source_ids:[\\s\\S]*${sourceId}`));
    assert.ok(manifest.place_ids.includes(id));
    assert.equal(visibleById.get(id)?.placeType, "monastery");
  }
});

test("a research monastery without coordinates gets a detail route but no marker or false map claim", async () => {
  const places = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  const noCoordinates = places.find((place) => place.id === "manastir-bijelici");
  const withCoordinates = places.find((place) => place.id === "podmaine");
  const [detail, mapCanvas, card, practicalPanel] = await Promise.all([
    source("src/pages/svetinje/[slug].astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/components/place-detail/PlacePracticalPanel.astro"),
  ]);

  assert.ok(noCoordinates);
  assert.equal(noCoordinates.latitude, undefined);
  assert.equal(noCoordinates.longitude, undefined);
  assert.equal(withCoordinates?.latitude, 42.29799);
  assert.match(mapCanvas, /Number\.isFinite\(place\.latitude\)/);
  assert.match(detail, /Тачан положај на интерактивној карти биће додат након географске провјере/);
  assert.match(detail, /\{hasCoordinates && \([\s\S]*Прикажи на главној карти/);
  assert.match(card, /\{location && <p class="editorial-place-card__location"/);
  assert.match(practicalPanel, /\.filter\(\(row\) => Boolean\(row\.value\)\)/);
});

test("Bar cathedral remains research-only, sourced, and public-safe", async () => {
  const [placeText, narrative, sourceText] = await Promise.all([
    source("content/places/saborni-hram-bar/place.yaml"),
    source("content/places/saborni-hram-bar/narratives/sr.md"),
    source("content/sources/hrambar-o-hramu.yaml"),
  ]);
  const place = parse(placeText);
  const sourceRecord = parse(sourceText);

  assert.equal(place.id, "saborni-hram-bar");
  assert.equal(place.editorial_status, "research");
  assert.equal(place.place_type.value, "cathedral");
  assert.deepEqual(place.approvals, []);
  assert.equal(place.location.coordinates.latitude, 42.10145);
  assert.equal(place.location.coordinates.longitude, 19.09394);
  assert.equal(place.location.coordinates.accuracy, "complex-centroid");
  assert.equal(place.location.coordinates.publication_safety, "public");
  assert.match(place.location.coordinates.verification.qualification, /радни центар храмовног комплекса/);
  assert.equal(sourceRecord.source_type, "official-church");
  assert.match(narrative, /slug: saborni-hram-svetog-jovana-vladimira-bar/);
  assert.match(narrative, /## Пут до изградње храма \{#history\}/);
  assert.match(narrative, /несагласност извора око 2002\. и 2006\. године/);
  assert.match(narrative, /Координате на мапи означавају радни центар храмовног комплекса/);
});

test("preview UI is allowlist-driven, noindex, and free of prohibited data", async () => {
  const [
    homepage,
    mapCanvas,
    explorer,
    card,
    detail,
    detailHero,
    detailGallery,
    narrativeSegments,
    practicalPanel,
    miniMap,
    relatedShelf,
    baseLayout,
    metadata,
    styles,
    previewWorkflow,
    productionWorkflow,
  ] = await Promise.all([
    source("src/pages/index.astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/MapExplorer.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/pages/svetinje/[slug].astro"),
    source("src/components/place-detail/PlaceDetailHero.astro"),
    source("src/components/place-detail/PlaceDetailGallery.astro"),
    source("src/components/place-detail/PlaceNarrativeSegments.astro"),
    source("src/components/place-detail/PlacePracticalPanel.astro"),
    source("src/components/place-detail/PlaceMiniMap.astro"),
    source("src/components/place-detail/PlaceRelatedShelf.astro"),
    source("src/layouts/BaseLayout.astro"),
    source("src/components/PageMetadata.astro"),
    source("src/styles/global.css"),
    source(".github/workflows/preview-cloudflare.yml"),
    source(".github/workflows/deploy-cloudflare.yml"),
  ]);
  const detailSources = [detail, detailHero, detailGallery, narrativeSegments, practicalPanel, miniMap, relatedShelf].join("\n");
  const combined = [mapCanvas, explorer, card, detailSources].join("\n");

  assert.match(mapCanvas, /new maplibregl\.Marker/);
  assert.match(mapCanvas, /aria-label.*отвори страницу/);
  assert.match(mapCanvas, /document\.createElement\("a"\)/);
  assert.match(homepage, /loadVisiblePlaces/);
  assert.match(homepage, /<MapExplorer places=\{places\} \/>/);
  assert.doesNotMatch(explorer, /loadVisiblePlaces/);
  assert.match(card, /Радни приказ/);
  assert.match(card, /place\.previewImageSrc/);
  assert.match(card, /class="editorial-place-card__image"/);
  assert.match(card, /alt=\{place\.previewImageAlt \?\? place\.name\}/);
  assert.match(detail, /getStaticPaths/);
  assert.match(detail, /loadVisiblePlaces/);
  assert.match(detail, /coordinateDistance/);
  assert.match(detail, /candidate\.id !== place\.id/);
  assert.match(detail, /hasCoordinates: candidate\.latitude !== undefined/);
  assert.match(detail, /const HISTORY_SECTION_IDS = new Set\(\[[\s\S]*?"history"[\s\S]*?"canonization"[\s\S]*?\]\)/);
  assert.match(detail, /const ARRIVAL_SECTION_IDS = new Set\(\["location"\]\)/);
  assert.match(detail, /const PRACTICAL_SECTION_IDS = new Set\(\["services", "visitor-information", "verification-notes"\]\)/);
  assert.match(detail, /<PlaceNarrativeSegments sections=\{aboutSections\}/);
  assert.match(detail, /<PlaceNarrativeSegments sections=\{historySections\}/);
  assert.match(detail, /<PlaceNarrativeSegments sections=\{arrivalSections\}/);
  assert.match(detail, /<PlacePracticalPanel place=\{place\}/);
  assert.doesNotMatch(detail, /Уређивачки преглед|Траг извора|Извори и напомене|place-profile-sources/);
  assert.doesNotMatch(detail, /introSection|remainingNarrativeSections|place-profile-about__original-title/);
  assert.match(detailHero, /class="place-profile-hero"/);
  assert.match(detailHero, /place\.previewImageSrc/);
  assert.match(detailHero, /categoryForPlaceType/);
  assert.doesNotMatch(detailHero, /Радни приказ|Центар комплекса|accuracyLabel/);
  assert.match(detailGallery, /const placeholderSlots = \[1, 2, 3, 4\]/);
  assert.match(detailGallery, /place\.galleryImages/);
  assert.equal((detailGallery.match(/<img\b/g) ?? []).length, 2);
  assert.doesNotMatch(detailGallery, /Ауторски медији/);
  assert.match(narrativeSegments, /data-narrative-source-section=\{section\.id\}/);
  assert.doesNotMatch(narrativeSegments, /paragraph\.sourceIds\.map|<sup\b|#source-/);
  assert.doesNotMatch(narrativeSegments, /<h[23]\b/);
  assert.match(practicalPanel, /data-copy-coordinates/);
  assert.match(practicalPanel, /aria-live="polite"/);
  assert.match(practicalPanel, /label: "Епархија"/);
  assert.doesNotMatch(practicalPanel, /Црквена припадност|Тачност положаја|Статус записа|Напомена о подацима|practicalSections/);
  assert.match(miniMap, /import\.meta\.env\.PUBLIC_MAPTILER_KEY/);
  assert.match(miniMap, /019fc7d8-717c-701d-9ca5-a53d9438d3ce/);
  assert.match(miniMap, /new maplibregl\.Marker/);
  assert.match(miniMap, /anchor: "bottom"/);
  assert.match(miniMap, /map\.once\("load", handleMapLoad\)/);
  assert.match(miniMap, /loaded = true;[\s\S]*?map\.resize\(\);[\s\S]*?requestAnimationFrame/);
  assert.match(miniMap, /if \(ready \|\| removed \|\| !loaded \|\| !map\.isStyleLoaded\(\)\) return/);
  assert.match(miniMap, /map\.once\("idle", handleIdle\)/);
  assert.match(miniMap, /MAP_READY_TIMEOUT_MS = 11000/);
  assert.match(miniMap, /readyTimer = window\.setTimeout\(showFallback, MAP_READY_TIMEOUT_MS\)/);
  assert.match(miniMap, /root\.dataset\.mapState = "fallback";[\s\S]*?map\.remove\(\)/);
  assert.doesNotMatch(miniMap, /hasRenderableCanvas|map\.on\("render"|handleRender/);
  assert.match(miniMap, /data-place-mini-map-attribution[\s\S]*?hidden/);
  assert.match(miniMap, /if \(attribution\) attribution\.hidden = false/);
  assert.match(styles, /\.place-profile-cards\s*\{[\s\S]*?align-items: start;/);
  assert.match(styles, /\.place-arrival-card\s*\{[\s\S]*?align-self: start;/);
  assert.match(styles, /\.place-mini-map__viewport,[\s\S]*?\.place-mini-map__fallback\s*\{[\s\S]*?height: 12rem;/);
  assert.match(styles, /\.place-mini-map__canvas\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(styles, /--ink-reading: #4f5d69/);
  assert.match(styles, /\.place-profile-about p\s*\{[\s\S]*?color: var\(--ink-reading\)/);
  assert.match(styles, /\.place-editorial-card p\s*\{[\s\S]*?color: var\(--ink-reading\)/);
  assert.match(relatedShelf, /data-current-place/);
  assert.match(relatedShelf, /data-related-place/);
  assert.doesNotMatch(detail, /1630|1747|1869|1979|1995|2007/);
  assert.match(baseLayout, /EDITORIAL_PREVIEW/);
  assert.match(metadata, /noindex,nofollow,noarchive/);
  assert.match(previewWorkflow, /EDITORIAL_PREVIEW: "true"/);
  assert.doesNotMatch(productionWorkflow, /EDITORIAL_PREVIEW/);
  assert.doesNotMatch(combined, /rating|оцјена|радно вријеме|телефон|033\/|@gmail\.com/i);
  assert.doesNotMatch(detailSources, /180\s*m|08:00|16:00|18:00|Дјелимично активан|XVI вијек|Манастир Прасквица|Црква Св\. Тројице|Манастир Стањевићи|Манастир Дуљево/i);
  assert.doesNotMatch(combined, /FeatureCollection|LineString|routeCoordinates|addSource\s*\(|addLayer\s*\(/);
  assert.doesNotMatch(miniMap, /FeatureCollection|LineString|routeCoordinates|addSource\s*\(|addLayer\s*\(/);
});
