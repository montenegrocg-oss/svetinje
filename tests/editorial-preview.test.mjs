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

async function createSyntheticMediaFixture(root) {
  const placeId = "synthetic-media-fixture";
  const mediaId = "synthetic-media-fixture-image";
  const mediaPath = path.join(root, "content", "media", `${mediaId}.yaml`);
  const placeDirectory = path.join(root, "content", "places", placeId);
  const narrativeDirectory = path.join(placeDirectory, "narratives");
  const previewImageSrc = "https://media.svetinje.me/places/synthetic-media-fixture/synthetic-image.jpg";
  const previewImageAlt = "Синтетичка фотографија светиње";

  await mkdir(narrativeDirectory, { recursive: true });
  await writeFile(path.join(placeDirectory, "place.yaml"), stringify({
    schema_version: 1,
    id: placeId,
    editorial_status: "research",
    place_type: { value: "monastery", verification: { status: "requires-verification" } },
    relationships: { media_ids: [mediaId] },
    approvals: [],
    audit: { created_at: "2026-01-01T00:00:00Z", created_by: "test", updated_at: "2026-01-01T00:00:00Z", updated_by: "test" },
  }), "utf8");
  await writeFile(path.join(narrativeDirectory, "sr.md"), `---\n${stringify({
    schema_version: 1,
    place_id: placeId,
    locale: "sr",
    editorial_status: "research",
    translation_status: "source",
    slug: placeId,
    preferred_name: "Синтетичка светиња",
    summary: "Контролисани тестни запис.",
    approvals: [],
    audit: { created_at: "2026-01-01T00:00:00Z", created_by: "test", updated_at: "2026-01-01T00:00:00Z", updated_by: "test" },
  })}---\n\nКонтролисани тестни садржај.\n`, "utf8");
  await writeFile(mediaPath, stringify({
    schema_version: 1,
    id: mediaId,
    editorial_status: "approved",
    media_type: "image",
    storage_provider: "cloudflare-r2",
    object_key: "places/synthetic-media-fixture/synthetic-image.jpg",
    creator: "test",
    copyright_owner: "test",
    rights_basis: "project-original",
    credit_line: "Фото: test",
    allowed_uses: ["web-display"],
    publication_safety: "public",
    related_place_ids: [placeId],
    localized_text: { sr: { alt_text: previewImageAlt, translation_status: "source", approvals: [] } },
    approvals: [],
    audit: { created_at: "2026-01-01T00:00:00Z", created_by: "test", updated_at: "2026-01-01T00:00:00Z", updated_by: "test" },
  }), "utf8");
  await writeFile(path.join(root, "validation", "editorial-preview.json"), JSON.stringify({ place_ids: [placeId] }), "utf8");

  return { placeId, mediaPath, previewImageSrc, previewImageAlt };
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
    assert.equal(typeof place.summary, "string");
    assert.ok(place.placeType);
    assert.ok(Array.isArray(place.narrativeSections));
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
  const markdown = (await readFile(narrativeFile, "utf8")).replaceAll("\r\n", "\n");
  const closing = markdown.indexOf("\n---\n", 4);
  const frontMatter = parse(markdown.slice(4, closing));
  delete frontMatter.source_ids;
  delete frontMatter.section_sources;
  for (const alternate of frontMatter.alternate_names ?? []) delete alternate.source_ids;
  await writeFile(narrativeFile, `---\n${stringify(frontMatter)}---\n${markdown.slice(closing + 5)}`, "utf8");
  const visible = await loadEditorialPreviewPlaces(root);
  assert.ok(visible.some(({ id }) => id === "podmaine"));
});

test("editorial preview normalizes legacy and plural feasts and exposes an optional service schedule", async (t) => {
  const root = await previewProject(t);
  const placeFile = path.join(root, "content", "places", "podmaine", "place.yaml");
  const narrativeFile = path.join(root, "content", "places", "podmaine", "narratives", "sr.md");
  const place = parse(await readFile(placeFile, "utf8"));
  place.patronal_feast = { name: "Тестна слава" };
  place.video = { youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };
  await writeFile(placeFile, stringify(place), "utf8");

  const visible = await loadEditorialPreviewPlaces(root);
  const podmaine = visible.find(({ id }) => id === "podmaine");
  assert.deepEqual(podmaine?.patronalFeasts, ["Тестна слава"]);
  assert.equal(podmaine?.youtubeVideoId, "dQw4w9WgXcQ");

  delete place.patronal_feast;
  place.patronal_feasts = [{ name: "Прва слава" }, { name: "Друга слава" }];
  delete place.video;
  await writeFile(placeFile, stringify(place), "utf8");
  const markdown = (await readFile(narrativeFile, "utf8")).replaceAll("\r\n", "\n");
  const closing = markdown.indexOf("\n---\n", 4);
  const frontMatter = parse(markdown.slice(4, closing));
  frontMatter.service_schedule = "Недјељом у 9:00.\nВечерње у 18:00.";
  await writeFile(narrativeFile, `---\n${stringify(frontMatter)}---\n${markdown.slice(closing + 5)}`, "utf8");
  const plural = (await loadEditorialPreviewPlaces(root)).find(({ id }) => id === "podmaine");
  assert.equal(plural?.youtubeVideoId, undefined);
  assert.deepEqual(plural?.patronalFeasts, ["Прва слава", "Друга слава"]);
  assert.equal(plural?.serviceSchedule, "Недјељом у 9:00.\nВечерње у 18:00.");

  delete place.patronal_feasts;
  await writeFile(placeFile, stringify(place), "utf8");
  delete frontMatter.service_schedule;
  await writeFile(narrativeFile, `---\n${stringify(frontMatter)}---\n${markdown.slice(closing + 5)}`, "utf8");
  const withoutOptionalData = (await loadEditorialPreviewPlaces(root)).find(({ id }) => id === "podmaine");
  assert.deepEqual(withoutOptionalData?.patronalFeasts, []);
  assert.equal(withoutOptionalData?.serviceSchedule, undefined);
});

test("editorial preview loads a research place without summary, sections, or narrative sources", async (t) => {
  const root = await previewProject(t);
  const id = "manastir-svetog-sergija-radonjeskog";
  const placeFile = path.join(root, "content", "places", id, "place.yaml");
  const narrativeFile = path.join(root, "content", "places", id, "narratives", "sr.md");
  const allowlistFile = path.join(root, "validation", "editorial-preview.json");

  const place = parse(await readFile(placeFile, "utf8"));
  place.location.coordinates.publication_safety = "public";
  await writeFile(placeFile, stringify(place), "utf8");

  const markdown = (await readFile(narrativeFile, "utf8")).replaceAll("\r\n", "\n");
  const closing = markdown.indexOf("\n---\n", 4);
  const frontMatter = parse(markdown.slice(4, closing));
  delete frontMatter.summary;
  delete frontMatter.source_ids;
  delete frontMatter.section_sources;
  await writeFile(narrativeFile, `---\n${stringify(frontMatter)}---\n`, "utf8");

  const allowlist = JSON.parse(await readFile(allowlistFile, "utf8"));
  if (!allowlist.place_ids.includes(id)) {
    allowlist.place_ids.push(id);
  }
  await writeFile(allowlistFile, `${JSON.stringify(allowlist, null, 2)}\n`, "utf8");

  const visible = await loadEditorialPreviewPlaces(root);
  const textless = visible.find((candidate) => candidate.id === id);
  assert.ok(textless);
  assert.equal(textless.summary, "");
  assert.deepEqual(textless.narrativeSections, []);
  assert.deepEqual(textless.sourceIds, []);
  assert.equal(textless.preview, true);
  assert.deepEqual(await loadVisiblePlaces(root, { editorialPreview: false }), []);

  const [card, hero, detail] = await Promise.all([
    source("src/components/PlaceCard.astro"),
    source("src/components/place-detail/PlaceDetailHero.astro"),
    source("src/components/PlaceDetailPage.astro"),
  ]);
  assert.match(card, /\{place\.summary && <p class="editorial-place-card__summary">/);
  assert.match(hero, /\{place\.summary && <p>\{place\.summary\}<\/p>\}/);
  assert.match(detail, /place\.narrativeBody\.trim\(\)[\s\S]*copy\.about\.empty/);
  assert.doesNotMatch(detail, /historySections|Историјски подаци су у припреми\./);
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
  assert.match(narrative, /^summary:\s+\S.+$/m);
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
  assert.match(narrative, /почетак савременог манастира повезан је са виђењем/);
  assert.match(narrative, /Пећинска црква има неправилну основу/);
  assert.doesNotMatch(narrative, /^section_sources:/m);
  assert.doesNotMatch(narrative, /радно вријеме|телефон|електронск[а-я]+ пошта|паркинг/i);
});

test("Savina remains a sourced editorial-preview monastery", async () => {
  const [placeText, narrative, osmText, manifestText] = await Promise.all([
    source("content/places/manastir-savina/place.yaml"),
    source("content/places/manastir-savina/narratives/sr.md"),
    source("content/sources/openstreetmap-manastir-savina-way-147257044.yaml"),
    source("validation/editorial-preview.json"),
  ]);
  const place = parse(placeText);
  const osm = parse(osmText);
  const manifest = JSON.parse(manifestText);
  const preview = await loadEditorialPreviewPlaces(PROJECT_ROOT);

  assert.ok(manifest.place_ids.includes("manastir-savina"));
  assert.equal(place.id, "manastir-savina");
  assert.equal(place.editorial_status, "research");
  assert.equal(place.place_type.value, "monastery");
  assert.equal(preview.find((candidate) => candidate.id === place.id)?.monasticCommunity, "male");
  assert.ok(place.source_ids.includes(osm.id));
  assert.equal(osm.url, "https://www.openstreetmap.org/way/147257044");
  assert.equal(osm.source_type, "other-approved");
  assert.match(narrative, /slug: manastir-savina/);
  assert.equal(preview.find((candidate) => candidate.id === place.id)?.preview, true);
  assert.doesNotMatch(narrative, /радно вријеме|телефон|електронск[а-я]+ пошта|паркинг/i);
});

test("editorial preview derives primary media and handles synthetic no-media records", async (t) => {
  const root = await previewProject(t);
  const fixture = await createSyntheticMediaFixture(root);
  const withMedia = (await loadEditorialPreviewPlaces(root)).find((place) => place.id === fixture.placeId);

  assert.ok(withMedia);
  assert.equal(withMedia.previewImageSrc, withMedia.galleryImages[0]?.src);
  assert.equal(withMedia.previewImageAlt, withMedia.galleryImages[0]?.alt);
  assert.equal(withMedia.previewImageSrc, fixture.previewImageSrc);
  assert.equal(withMedia.previewImageAlt, fixture.previewImageAlt);

  await rm(fixture.mediaPath);

  const withoutMedia = (await loadEditorialPreviewPlaces(root)).find((place) => place.id === fixture.placeId);
  assert.ok(withoutMedia);
  assert.equal(withoutMedia.previewImageSrc, undefined);
  assert.equal(withoutMedia.previewImageAlt, undefined);
  assert.deepEqual(withoutMedia.galleryImages, []);
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
  const sourcePlace = places.find((place) => place.id === "manastir-bijelici");
  const noCoordinates = sourcePlace && {
    ...sourcePlace,
    id: "synthetic-coordinate-less-place",
    slug: "synthetic-coordinate-less-place",
    latitude: undefined,
    longitude: undefined,
  };
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
  const detailRoutes = [noCoordinates].map((place) => `/svetinje/${place.slug}/`);
  const markerPlaces = [noCoordinates].filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
  assert.deepEqual(detailRoutes, ["/svetinje/synthetic-coordinate-less-place/"]);
  assert.deepEqual(markerPlaces, []);
  assert.equal(withCoordinates?.latitude, 42.29799);
  assert.match(mapCanvas, /Number\.isFinite\(place\.latitude\)/);
  assert.match(practicalPanel, /\{hasCoordinates && \([\s\S]*<PlaceMiniMap/);
  assert.match(card, /\{location && <p class="editorial-place-card__location"/);
  assert.match(practicalPanel, /\.filter\(\(row\) => Boolean\(row\.value\)\)/);
});

test("Bar cathedral remains research-only, sourced, and public-safe", async () => {
  const [placeText, narrative, sourceText, manifestText] = await Promise.all([
    source("content/places/saborni-hram-bar/place.yaml"),
    source("content/places/saborni-hram-bar/narratives/sr.md"),
    source("content/sources/hrambar-o-hramu.yaml"),
    source("validation/editorial-preview.json"),
  ]);
  const place = parse(placeText);
  const sourceRecord = parse(sourceText);
  const manifest = JSON.parse(manifestText);
  const preview = await loadEditorialPreviewPlaces(PROJECT_ROOT);

  assert.equal(place.id, "saborni-hram-bar");
  assert.equal(place.editorial_status, "research");
  assert.equal(place.place_type.value, "cathedral");
  assert.ok(place.source_ids.includes(sourceRecord.id));
  assert.equal(sourceRecord.source_type, "official-church");
  assert.match(narrative, /place_id: saborni-hram-bar/);
  assert.match(narrative, /slug: saborni-hram-svetog-jovana-vladimira-bar/);
  assert.ok(manifest.place_ids.includes(place.id));
  const previewPlace = preview.find((candidate) => candidate.id === place.id);
  assert.equal(previewPlace?.preview, true);
  for (const prohibitedField of ["phone", "email", "openingHours", "parking"]) {
    assert.equal(prohibitedField in (previewPlace ?? {}), false);
  }
});

test("preview UI is allowlist-driven, noindex, and free of prohibited data", async () => {
  const [
    homepage,
    mapCanvas,
    explorer,
    card,
    detailRoute,
    detail,
    detailHero,
    detailGallery,
    narrativeArticle,
    practicalPanel,
    miniMap,
    relatedShelf,
    relatedModel,
    baseLayout,
    metadata,
    styles,
    previewWorkflow,
    productionWorkflow,
  ] = await Promise.all([
    source("src/components/HomePage.astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/MapExplorer.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/pages/svetinje/[slug].astro"),
    source("src/components/PlaceDetailPage.astro"),
    source("src/components/place-detail/PlaceDetailHero.astro"),
    source("src/components/place-detail/PlaceDetailGallery.astro"),
    source("src/components/place-detail/PlaceNarrativeArticle.astro"),
    source("src/components/place-detail/PlacePracticalPanel.astro"),
    source("src/components/place-detail/PlaceMiniMap.astro"),
    source("src/components/place-detail/PlaceRelatedShelf.astro"),
    source("src/lib/related-places.ts"),
    source("src/layouts/BaseLayout.astro"),
    source("src/components/PageMetadata.astro"),
    source("src/styles/global.css"),
    source(".github/workflows/preview-cloudflare.yml"),
    source(".github/workflows/deploy-cloudflare.yml"),
  ]);
  const detailSources = [detail, detailHero, detailGallery, narrativeArticle, practicalPanel, miniMap, relatedShelf].join("\n");
  const combined = [mapCanvas, explorer, card, detailSources].join("\n");

  assert.match(mapCanvas, /new maplibregl\.Marker/);
  assert.match(mapCanvas, /data-open-page-label=\{publicCopy\[locale\]\.openPage\}/);
  assert.match(mapCanvas, /document\.createElement\("a"\)/);
  assert.match(homepage, /loadVisiblePlaces/);
  assert.match(homepage, /loadVisibleRoutes/);
  assert.match(homepage, /<MapExplorer places=\{places\} routes=\{routes\} calendarDays=\{calendarDays\} scriptureCorpus=\{scriptureCorpus\} locale=\{locale\} \/>/);
  assert.doesNotMatch(explorer, /loadVisiblePlaces/);
  assert.doesNotMatch(card, /Радни приказ|У радном приказу|Није у радном приказу/);
  assert.match(card, /place\.previewImageSrc/);
  assert.match(card, /class="editorial-place-card__image"/);
  assert.match(card, /alt=\{place\.previewImageAlt \?\? place\.name\}/);
  assert.match(detailRoute, /getStaticPaths/);
  assert.match(detailRoute, /loadVisiblePlaces/);
  assert.match(detailRoute, /relatedPlacesFor\(place, places, "sr"\)/);
  assert.match(relatedModel, /coordinateDistance/);
  assert.match(relatedModel, /candidate\.id !== place\.id/);
  assert.match(relatedModel, /hasCoordinates: candidate\.latitude !== undefined/);
  assert.match(detail, /const aboutLabel = place\.placeType === "monastery"/);
  assert.match(detail, /<PlaceNarrativeArticle body=\{place\.narrativeBody\} heading=\{aboutLabel\} locale=\{locale\}/);
  assert.doesNotMatch(detail, /place-history-title|place-arrival-title|PlaceNarrativeSegments/);
  assert.match(detail, /<PlacePracticalPanel place=\{place\}/);
  assert.doesNotMatch(detail, /Уређивачки преглед|Траг извора|Извори и напомене|place-profile-sources/);
  assert.doesNotMatch(detail, /introSection|remainingNarrativeSections|place-profile-about__original-title/);
  assert.match(detailHero, /class="place-profile-hero"/);
  assert.match(detailHero, /place\.previewImageSrc/);
  assert.match(detailHero, /categoryForPlaceType/);
  assert.doesNotMatch(detailHero, /Радни приказ|Центар комплекса|accuracyLabel/);
  assert.match(detailGallery, /const placeholderSlots = \[1, 2, 3, 4\]/);
  assert.match(detailGallery, /place\.galleryImages/);
  assert.match(detailGallery, /data-gallery-open/);
  assert.match(detailGallery, /<dialog class="place-gallery-lightbox"/);
  assert.match(detailGallery, /ArrowLeft|ArrowRight/);
  assert.match(detailGallery, /youtube-nocookie\.com\/embed/);
  assert.doesNotMatch(detailGallery, /Ауторски медији/);
  assert.match(narrativeArticle, /parsePlaceNarrativeBlocks/);
  assert.match(narrativeArticle, /<h3 id=\{block\.id\}>/);
  assert.doesNotMatch(narrativeArticle, /sourceIds|<sup\b|#source-/);
  assert.match(practicalPanel, /data-copy-coordinates/);
  assert.match(practicalPanel, /aria-live="polite"/);
  assert.match(practicalPanel, /label: copy\.jurisdiction/);
  assert.match(practicalPanel, /copy\.feast : copy\.feasts/);
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
  assert.doesNotMatch(styles, /\.place-profile-cards\s*\{|\.place-arrival-card\s*\{/);
  assert.match(styles, /\.place-mini-map__viewport,[\s\S]*?\.place-mini-map__fallback\s*\{[\s\S]*?height: 12rem;/);
  assert.match(styles, /\.place-mini-map__canvas\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;/);
  assert.match(styles, /--ink-reading: #4f5d69/);
  assert.match(styles, /\.place-profile-about p\s*\{[\s\S]*?color: var\(--ink-reading\)/);
  assert.match(styles, /\.place-profile-about h3\s*\{[\s\S]*?color: var\(--navy-950\)/);
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
