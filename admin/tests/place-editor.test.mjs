import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { updateCanonicalPlace } from "../src/place-editor.ts";
import { loadEditablePlace, parseNarrative } from "../src/repository-content.ts";
import { updatePlace, updatePlacePreview } from "../src/service.ts";
import { editPlacePage } from "../src/ui.ts";

const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);
const PLACE_SCHEMA = await readFile(new URL("../../schemas/place.schema.json", import.meta.url), "utf8");
const NARRATIVE_SCHEMA = await readFile(new URL("../../schemas/narrative.schema.json", import.meta.url), "utf8");
const COMMON_SCHEMA = await readFile(new URL("../../schemas/common.schema.json", import.meta.url), "utf8");
const MEDIA_SCHEMA = await readFile(new URL("../../schemas/media.schema.json", import.meta.url), "utf8");
const PLACE = `schema_version: 1
id: existing-place
editorial_status: research
browse_area_id: budva-pastrovici
place_type:
  value: monastery
  verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
ecclesiastical:
  jurisdiction:
    value: Existing jurisdiction
    verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
  community_type:
    value: brotherhood
    verification: { status: requires-verification }
location:
  country_code:
    value: ME
    verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
  municipality:
    value: Budva
    verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
  settlement:
    value: Existing settlement
    verification: { status: requires-verification, source_ids: [source-one] }
  coordinates:
    latitude: 42.1
    longitude: 18.9
    crs: EPSG:4326
    accuracy: complex-centroid
    publication_safety: public
    verification: { status: verified, source_ids: [source-map], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
relationships: { related_place_ids: [related-place] }
source_ids: [source-one, source-map]
approvals:
  - { role: factual, reviewer_id: maxim, outcome: approved, reviewed_at: 2026-08-01T00:00:00Z, reviewed_revision: cccccccccccccccccccccccccccccccccccccccc, scope: Existing }
audit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }
`;
const NARRATIVE = `---
schema_version: 1
place_id: existing-place
locale: sr
editorial_status: research
translation_status: source
slug: existing-place
preferred_name: Постојећи објекат
short_name: Кратко
alternate_names:
  - name: Стари назив
    context: Existing context
    source_ids: [source-one]
    verification_status: verified
summary: Existing summary
source_ids: [source-one]
section_sources:
  introduction: [source-one]
  history: [source-one]
approvals:
  - { role: sr-language, reviewer_id: maxim, outcome: approved, reviewed_at: 2026-08-01T00:00:00Z, reviewed_revision: cccccccccccccccccccccccccccccccccccccccc, scope: Existing }
audit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }
---
## Увод {#introduction}

Први пасус.[^source-one]

## Историја {#history}

Стара историја.[^source-one]

[^source-one]: Регистар извора: source-one.
`;
const TEXTLESS_NARRATIVE = `---
schema_version: 1
place_id: existing-place
locale: sr
editorial_status: research
translation_status: source
slug: existing-place
preferred_name: Постојећи објекат
approvals: []
audit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }
---
`;

class Repository {
  committed;
  constructor() {
    this.blobs = { placeSchema: PLACE_SCHEMA, narrativeSchema: NARRATIVE_SCHEMA, commonSchema: COMMON_SCHEMA, mediaSchema: MEDIA_SCHEMA, preview: JSON.stringify({ place_ids: ["existing-place"] }), place: PLACE, narrative: NARRATIVE, sourceOne: "id: source-one\n", sourceMap: "id: source-map\n" };
  }
  async readBranchState() { return { headSha: HEAD, treeSha: TREE }; }
  async readTree() { return [
    ["schemas/place.schema.json", "placeSchema"], ["schemas/narrative.schema.json", "narrativeSchema"], ["schemas/common.schema.json", "commonSchema"], ["schemas/media.schema.json", "mediaSchema"], ["validation/editorial-preview.json", "preview"],
    ["content/places/existing-place/place.yaml", "place"], ["content/places/existing-place/narratives/sr.md", "narrative"], ["content/sources/source-one.yaml", "sourceOne"], ["content/sources/source-map.yaml", "sourceMap"],
  ].map(([path, sha]) => ({ path, sha, type: "blob", mode: "100644" })); }
  async readBlob(sha) { return this.blobs[sha]; }
  async commitFilesAtomic(input) { this.committed = input; return { commitSha: "d".repeat(40), branch: input.branch }; }
}

class RoundTripRepository extends Repository {
  headSha = HEAD;
  commitCount = 0;
  async readBranchState() { return { headSha: this.headSha, treeSha: TREE }; }
  async commitFilesAtomic(input) {
    this.committed = input;
    this.commitCount += 1;
    this.blobs.place = input.files.find(({ path }) => path.endsWith("/place.yaml")).content;
    this.blobs.narrative = input.files.find(({ path }) => path.endsWith("/narratives/sr.md")).content;
    this.headSha = this.commitCount.toString(16).padStart(40, "0");
    return { commitSha: this.headSha, branch: input.branch };
  }
}

class PreviewRoundTripRepository extends Repository {
  headSha = HEAD;
  commitCount = 0;
  constructor(initialIds = []) {
    super();
    this.blobs.preview = JSON.stringify({ place_ids: initialIds });
  }
  async readBranchState() { return { headSha: this.headSha, treeSha: TREE }; }
  async commitFilesAtomic(input) {
    this.committed = input;
    this.commitCount += 1;
    assert.deepEqual(input.files.map(({ path }) => path), ["validation/editorial-preview.json"]);
    this.blobs.preview = input.files[0].content;
    this.headSha = this.commitCount.toString(16).padStart(40, "0");
    return { commitSha: this.headSha, branch: input.branch };
  }
}

const env = { GITHUB_EDITORIAL_BRANCH: "editorial/work" };
const session = { subject: "user", email: "editor@example.com", actor: "editor-user", developmentBypass: false };
const body = (place) => ({
  expectedHeadSha: HEAD, preferredName: place.preferredName, shortName: place.shortName ?? "", slug: place.slug, placeType: place.placeType, browseAreaId: place.browseAreaId, summary: place.summary,
  jurisdiction: place.jurisdiction ?? "", countryCode: place.countryCode ?? "", municipality: place.municipality ?? "", settlement: place.settlement ?? "", postalAddress: place.postalAddress ?? "",
  latitude: place.latitude, longitude: place.longitude, coordinateAccuracy: place.coordinateAccuracy, publicationSafety: place.publicationSafety, alternateNames: place.alternateNames, sections: place.sections,
});

test("GET editable model derives schema options and preserves narrative structure", async () => {
  const model = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  assert.equal(model.place.preferredName, "Постојећи објекат");
  assert.deepEqual(model.place.sections.map(({ id }) => id), ["introduction", "history"]);
  assert.deepEqual(model.options.placeTypes.slice(0, 2), ["monastery", "church"]);
  assert.equal(model.options.placeTypes.includes("cathedral"), true);
  assert.equal(model.place.inPreview, true);
  assert.equal("placeSourceIds" in model.place, false);
  assert.equal("sourceIds" in model.place.alternateNames[0], false);
});

test("editorial preview add, duplicate add, remove, and duplicate remove stay atomic and canonical", async () => {
  const repository = new PreviewRoundTripRepository();
  const added = await updatePlacePreview(repository, env, session, "existing-place", { expectedHeadSha: HEAD, enabled: true });
  assert.equal(added.inPreview, true);
  assert.equal(added.unchanged, false);
  assert.equal(repository.commitCount, 1);
  assert.equal(repository.committed.message, "Add existing-place to editorial preview");
  assert.deepEqual(JSON.parse(repository.blobs.preview), { place_ids: ["existing-place"] });

  const duplicateAdd = await updatePlacePreview(repository, env, session, "existing-place", { expectedHeadSha: repository.headSha, enabled: true });
  assert.equal(duplicateAdd.unchanged, true);
  assert.equal(repository.commitCount, 1);

  const removed = await updatePlacePreview(repository, env, session, "existing-place", { expectedHeadSha: repository.headSha, enabled: false });
  assert.equal(removed.inPreview, false);
  assert.equal(removed.unchanged, false);
  assert.equal(repository.commitCount, 2);
  assert.equal(repository.committed.message, "Remove existing-place from editorial preview");
  assert.deepEqual(JSON.parse(repository.blobs.preview), { place_ids: [] });
  assert.equal(repository.committed.files.some(({ path }) => path.includes("content/places") || path.includes("content/media")), false);

  const duplicateRemove = await updatePlacePreview(repository, env, session, "existing-place", { expectedHeadSha: repository.headSha, enabled: false });
  assert.equal(duplicateRemove.unchanged, true);
  assert.equal(repository.commitCount, 2);
});

test("editorial preview accepts a textless research narrative but still rejects public-unsafe coordinates", async () => {
  const textless = new PreviewRoundTripRepository();
  textless.blobs.narrative = TEXTLESS_NARRATIVE;
  const added = await updatePlacePreview(textless, env, session, "existing-place", { expectedHeadSha: HEAD, enabled: true });
  assert.equal(added.inPreview, true);
  assert.equal(textless.commitCount, 1);

  const unsafe = new PreviewRoundTripRepository();
  unsafe.blobs.place = PLACE.replace("publication_safety: public", "publication_safety: review-required");
  await assert.rejects(
    () => updatePlacePreview(unsafe, env, session, "existing-place", { expectedHeadSha: HEAD, enabled: true }),
    (error) => error.code === "invalid_form_data" && Boolean(error.fields?.publicationSafety),
  );
  assert.equal(unsafe.commitCount, 0);
});

test("research place saves with no summary, sources, or narrative sections", async () => {
  const repository = new Repository();
  repository.blobs.narrative = TEXTLESS_NARRATIVE;
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  assert.equal(loaded.place.summary, undefined);
  assert.deepEqual(loaded.place.sections, []);

  const result = await updatePlace(
    repository,
    env,
    session,
    "existing-place",
    { ...body(loaded.place), shortName: "Кратко име" },
    new Date("2026-08-13T12:00:00Z"),
  );
  assert.equal(result.unchanged, false);
  const saved = parseNarrative(repository.committed.files.find(({ path }) => path.endsWith("/narratives/sr.md")).content);
  assert.equal(saved.frontMatter.summary, undefined);
  assert.equal(saved.frontMatter.source_ids, undefined);
  assert.equal(saved.body.trim(), "");
});

test("editorial preview updates reject stale HEAD and unknown places", async () => {
  const repository = new PreviewRoundTripRepository();
  await assert.rejects(
    () => updatePlacePreview(repository, env, session, "existing-place", { expectedHeadSha: "f".repeat(40), enabled: true }),
    (error) => error.code === "git_conflict" && error.status === 409,
  );
  await assert.rejects(
    () => updatePlacePreview(repository, env, session, "missing-place", { expectedHeadSha: HEAD, enabled: true }),
    (error) => error.code === "not_found" && error.status === 404,
  );
  assert.equal(repository.commitCount, 0);
});

test("PATCH round trip updates basic, location, coordinates and narrative in one commit without data loss", async () => {
  const repository = new Repository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const update = body(loaded.place);
  update.preferredName = "Измијењени објекат";
  update.municipality = "Котор";
  update.latitude = 42.2;
  update.longitude = 18.8;
  update.sections = loaded.place.sections.map((section) => section.id === "history" ? { ...section, paragraphs: ["Нови текст.[^source-one]", section.paragraphs[1]] .filter(Boolean) } : section);
  update.sections.reverse();
  const result = await updatePlace(repository, env, session, "existing-place", update, new Date("2026-08-13T12:00:00Z"));
  assert.equal(result.commitSha, "d".repeat(40));
  assert.equal(repository.committed.files.length, 2);
  assert.deepEqual(repository.committed.files.map(({ path }) => path), ["content/places/existing-place/place.yaml", "content/places/existing-place/narratives/sr.md"]);
  assert.equal(repository.committed.files.some(({ path }) => path.includes("editorial-preview")), false);
  const nextPlace = parse(repository.committed.files[0].content);
  const nextNarrative = parseNarrative(repository.committed.files[1].content);
  assert.equal(nextPlace.relationships.related_place_ids[0], "related-place");
  assert.deepEqual(nextPlace.source_ids, ["source-one", "source-map"]);
  assert.equal(nextPlace.approvals.length, 1);
  assert.equal(nextNarrative.frontMatter.approvals.length, 1);
  assert.deepEqual(nextNarrative.frontMatter.section_sources, { introduction: ["source-one"], history: ["source-one"] });
  assert.match(nextNarrative.body, /\[\^source-one\]/);
  assert.ok(nextNarrative.body.indexOf("{#history}") < nextNarrative.body.indexOf("{#introduction}"));
  assert.equal(nextPlace.audit.created_at, "2026-08-01T00:00:00Z");
  assert.equal(nextPlace.audit.created_by, "maxim");
  assert.equal(nextPlace.audit.updated_by, "editor-user");
  assert.equal(nextNarrative.frontMatter.audit.updated_at, "2026-08-13T12:00:00Z");
  assert.equal(nextPlace.location.municipality.verification.status, "requires-verification");
  assert.equal(nextPlace.location.municipality.verification.source_ids, undefined);
  assert.equal(nextPlace.location.country_code.verification.status, "verified");
  assert.deepEqual(nextPlace.location.country_code.verification.source_ids, ["source-one"]);
  assert.equal(nextPlace.location.coordinates.verification.status, "requires-verification");
  assert.equal(nextPlace.ecclesiastical.community_type.value, "brotherhood");
});

test("unchanged facts retain verification exactly and coordinates can be cleared", async () => {
  const loaded = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const update = body(loaded.place);
  const unchanged = await updateCanonicalPlace(loaded, update, "editor-user", new Date("2026-08-13T12:00:00Z"));
  assert.equal(unchanged.unchanged, true);
  assert.deepEqual(unchanged.place.place_type.verification, parse(PLACE).place_type.verification);
  assert.deepEqual(unchanged.place.location.coordinates.verification, parse(PLACE).location.coordinates.verification);
  assert.deepEqual(unchanged.place.audit, parse(PLACE).audit);
  assert.deepEqual(unchanged.narrative.audit, parseNarrative(NARRATIVE).frontMatter.audit);
  const cleared = await updateCanonicalPlace(loaded, { ...update, latitude: "", longitude: "" }, "editor-user", new Date("2026-08-13T12:00:00Z"));
  assert.equal(cleared.unchanged, false);
  assert.equal(cleared.place.location.coordinates, undefined);
});

test("no-op PATCH succeeds without changing audit timestamps or creating a Git commit", async () => {
  const repository = new Repository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const result = await updatePlace(repository, env, session, "existing-place", body(loaded.place), new Date("2026-08-13T12:00:00Z"));
  assert.equal(result.unchanged, true);
  assert.equal(result.commitSha, HEAD);
  assert.equal(repository.committed, undefined);
});

test("a repeated PATCH after serialization and readback does not create an audit-only commit", async () => {
  const repository = new RoundTripRepository();
  const original = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const first = await updatePlace(
    repository,
    env,
    session,
    "existing-place",
    { ...body(original.place), summary: "Updated summary" },
    new Date("2026-08-13T12:00:00Z"),
  );
  assert.equal(first.unchanged, false);
  assert.equal(repository.commitCount, 1);

  const savedPlace = parse(repository.blobs.place);
  const savedNarrative = parseNarrative(repository.blobs.narrative).frontMatter;
  const reloaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const repeated = await updatePlace(
    repository,
    env,
    session,
    "existing-place",
    { ...body(reloaded.place), expectedHeadSha: repository.headSha },
    new Date("2026-08-13T12:05:00Z"),
  );

  assert.equal(repeated.unchanged, true);
  assert.equal(repeated.commitSha, repository.headSha);
  assert.equal(repository.commitCount, 1);
  assert.deepEqual(parse(repository.blobs.place).audit, savedPlace.audit);
  assert.deepEqual(parseNarrative(repository.blobs.narrative).frontMatter.audit, savedNarrative.audit);
});

test("preview coordinates require explicit public safety while non-preview records retain canonical options", async () => {
  const previewRepository = new Repository();
  const previewRecord = await loadEditablePlace(previewRepository, "editorial/work", "existing-place");
  await assert.rejects(
    () => updatePlace(previewRepository, env, session, "existing-place", { ...body(previewRecord.place), publicationSafety: "review-required" }),
    (error) => error.code === "invalid_form_data"
      && error.status === 400
      && error.fields?.publicationSafety === "Координате објекта у радном приказу морају бити означене као јавне.",
  );
  assert.equal(previewRepository.committed, undefined);

  const nonPreviewRepository = new Repository();
  nonPreviewRepository.blobs.preview = JSON.stringify({ place_ids: [] });
  const nonPreviewRecord = await loadEditablePlace(nonPreviewRepository, "editorial/work", "existing-place");
  const result = await updatePlace(
    nonPreviewRepository,
    env,
    session,
    "existing-place",
    { ...body(nonPreviewRecord.place), publicationSafety: "review-required" },
  );
  assert.equal(result.unchanged, false);
  assert.equal(nonPreviewRepository.committed.files.length, 2);
});

test("place editor explains preview coordinate safety next to the field", async () => {
  const uiSource = await readFile(new URL("../src/ui.ts", import.meta.url), "utf8");
  assert.match(uiSource, /За објекат у радном приказу координате морају бити означене као јавне\./);
});

test("place editor exposes the photo workflow and no source-registry controls", async () => {
  const [uiSource, clientSource] = await Promise.all([
    readFile(new URL("../src/ui.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/editor.ts", import.meta.url), "utf8"),
  ]);
  assert.match(uiSource, /href="#foto">Фото/);
  assert.match(uiSource, /type="file" accept="image\/\*" multiple/);
  assert.match(uiSource, /Још нема фотографија\./);
  assert.match(uiSource, /data-photo-alt/);
  assert.match(uiSource, /data-save-photo-alt>Сачувај опис/);
  assert.match(uiSource, /Додај фотографије/);
  assert.match(uiSource, /Изаберите фотографије са рачунара или телефона, или их превуците овдје\./);
  assert.match(clientSource, /Отпреми 1 фотографију/);
  assert.match(clientSource, /Отпреми \$\{count\} фотографије/);
  assert.match(clientSource, /Фотографија је отпремљена и сачувана\./);
  assert.doesNotMatch(uiSource, /type="radio" name="primaryPhoto"/);
  assert.doesNotMatch(uiSource, /href="#izvori"|data-alt-sources|Постојеће референце|section_sources/);
  assert.match(clientSource, /2400/);
  assert.match(clientSource, /0\.85/);
  assert.match(clientSource, /FormData/);
  assert.doesNotMatch(clientSource, /sourceIds|data-alt-sources/);
});

test("place editor exposes explicit editorial-preview management without production wording", async () => {
  const record = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const previewHtml = await editPlacePage(session, record).text();
  assert.match(previewHtml, /data-preview-enabled="true"/);
  assert.match(previewHtml, /У радном приказу/);
  assert.match(previewHtml, /Уклони из радног приказа/);
  assert.match(previewHtml, /Објекат ће нестати са радне верзије сајта, али његови подаци и фотографије остају сачувани у администрацији./);

  const repository = new Repository();
  repository.blobs.preview = JSON.stringify({ place_ids: [] });
  const nonPreview = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const nonPreviewHtml = await editPlacePage(session, nonPreview).text();
  assert.match(nonPreviewHtml, /Објекат још није видљив на радној верзији сајта./);
  assert.match(nonPreviewHtml, /Додај у радни приказ/);
  assert.match(nonPreviewHtml, /Промјена ће бити видљива након завршетка радне изградње./);
  const previewBlock = nonPreviewHtml.match(/<section class="panel preview-control"[\s\S]+?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(previewBlock, /production|publication/i);

  const [uiSource, clientSource] = await Promise.all([
    readFile(new URL("../src/ui.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/editor.ts", import.meta.url), "utf8"),
  ]);
  assert.match(uiSource, /У радном приказу/);
  assert.match(uiSource, /Није у радном приказу/);
  assert.match(clientSource, /\/api\/places\/\$\{encodeURIComponent\(form\.dataset\.placeId/);
  assert.match(clientSource, /Садржај је у међувремену измијењен\. Освјежите страницу и покушајте поново\./);
  assert.match(clientSource, /Нема промјена\./);
  assert.match(previewHtml, /<textarea name="summary">/);
  assert.doesNotMatch(previewHtml, /<textarea name="summary" required/);
});

test("admin media thumbnails use the scoped R2 CSP and relationship-order controls", async () => {
  const record = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  record.place.media = [
    {
      id: "photo-existing-random-a1",
      objectKey: "places/existing-place/photo-existing-random-a1.jpg",
      src: "https://media.svetinje.me/places/existing-place/photo-existing-random-a1.jpg",
      mimeType: "image/jpeg",
      width: 1280,
      height: 960,
      altText: "Прва фотографија",
      isPrimary: true,
    },
    {
      id: "photo-existing-random-b2",
      objectKey: "places/existing-place/photo-existing-random-b2.jpg",
      src: "https://media.svetinje.me/places/existing-place/photo-existing-random-b2.jpg",
      mimeType: "image/jpeg",
      width: 1024,
      height: 768,
      altText: "Друга фотографија",
      isPrimary: false,
    },
  ];
  const response = editPlacePage(session, record);
  const html = await response.text();
  const csp = response.headers.get("content-security-policy") ?? "";
  const imgDirective = csp.split(";").find((directive) => directive.trim().startsWith("img-src")) ?? "";
  assert.match(imgDirective, /https:\/\/media\.svetinje\.me/);
  assert.doesNotMatch(csp.split(";").find((directive) => directive.trim().startsWith("default-src")) ?? "", /media\.svetinje\.me|\*/);
  assert.doesNotMatch(csp.split(";").find((directive) => directive.trim().startsWith("connect-src")) ?? "", /media\.svetinje\.me/);
  assert.doesNotMatch(csp, /https:\/\/images\.example\.com/);
  assert.match(html, /src="https:\/\/media\.svetinje\.me\/places\/existing-place\/photo-existing-random-a1\.jpg"/);
  assert.match(html, /<strong>Главна фотографија<\/strong><span class="badge" data-primary-photo>Главна<\/span>/);
  assert.match(html, /<strong>Фотографија 2<\/strong>/);
  assert.match(html, /data-set-primary-photo>Постави као главну/);
  assert.match(html, /<summary>Технички подаци<\/summary>/);
  assert.doesNotMatch(html, /name="primaryPhoto"|-main/);

  record.place.media = [record.place.media[0]];
  const singleHtml = await editPlacePage(session, record).text();
  assert.match(singleHtml, /Главна фотографија/);
  assert.doesNotMatch(singleHtml, /data-set-primary-photo|name="primaryPhoto"/);
});

test("canonical schema violations return invalid_form_data instead of internal_error", async () => {
  const repository = new Repository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  await assert.rejects(
    () => updatePlace(repository, env, session, "existing-place", { ...body(loaded.place), slug: "a".repeat(81) }),
    (error) => error.code === "invalid_form_data" && error.status === 400 && Boolean(error.fields?.["narrative/slug"]),
  );
  assert.equal(repository.committed, undefined);
});

test("canonical schema fingerprint mismatch fails closed before validation or commit", async () => {
  const repository = new Repository();
  repository.blobs.commonSchema = JSON.stringify({ ...JSON.parse(COMMON_SCHEMA), title: "Changed after Worker build" });
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  await assert.rejects(
    () => updatePlace(repository, env, session, "existing-place", body(loaded.place)),
    (error) => error.code === "internal_error" && error.status === 502,
  );
  assert.equal(repository.committed, undefined);
});

test("unsupported type, area, coordinates, section and stale HEAD are rejected without commits", async () => {
  const cases = [
    { placeType: "unsupported" }, { browseAreaId: "unknown-area" }, { latitude: 100 },
  ];
  for (const patch of cases) {
    const repository = new Repository(); const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
    await assert.rejects(() => updatePlace(repository, env, session, "existing-place", { ...body(loaded.place), ...patch }), (error) => error.code === "invalid_form_data");
    assert.equal(repository.committed, undefined);
  }
  const repository = new Repository(); const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  await assert.rejects(() => updatePlace(repository, env, session, "existing-place", { ...body(loaded.place), sections: [{ id: "unsupported", title: "Не", paragraphs: [] }] }), (error) => error.code === "invalid_form_data");
  await assert.rejects(() => updatePlace(repository, env, session, "existing-place", { ...body(loaded.place), expectedHeadSha: "f".repeat(40) }), (error) => error.code === "git_conflict");
  assert.equal(repository.committed, undefined);
});
