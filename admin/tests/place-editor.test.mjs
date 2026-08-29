import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { updateCanonicalPlace } from "../src/place-editor.ts";
import { loadEditablePlace, parseNarrative } from "../src/repository-content.ts";
import { createPlace, updatePlace, updatePlaceNarrative, updatePlacePreview } from "../src/service.ts";
import { editPlacePage, newPlacePage } from "../src/ui.ts";
import { validatePlace } from "../src/generated/canonical-validators.js";

const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);
const PLACE_SCHEMA = await readFile(new URL("../../schemas/place.schema.json", import.meta.url), "utf8");
const NARRATIVE_SCHEMA = await readFile(new URL("../../schemas/narrative.schema.json", import.meta.url), "utf8");
const COMMON_SCHEMA = await readFile(new URL("../../schemas/common.schema.json", import.meta.url), "utf8");
const MEDIA_SCHEMA = await readFile(new URL("../../schemas/media.schema.json", import.meta.url), "utf8");
const FEAST_SCHEMA = await readFile(new URL("../../schemas/feast-registry.schema.json", import.meta.url), "utf8");
const FEAST_REGISTRY = `schema_version: 1
feasts:
  - id: sveta-trojica
    name_sr: Света Тројица
    legacy_names: [Света Тројица]
    date: { kind: movable }
  - id: sveti-nikola
    name_sr: Свети Никола
    legacy_names: [Свети Никола]
    date: { kind: fixed, month: 12, day: 19 }
`;
const FEAST_BLOB_SHA = "feastRegistry";
const PLACE = `schema_version: 1
id: existing-place
editorial_status: research
browse_area_id: budva-pastrovici
place_type:
  value: monastery
  verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
ecclesiastical:
  authority_id:
    value: mitropolija-crnogorsko-primorska
    verification: { status: requires-verification, source_ids: [source-one] }
  jurisdiction:
    value: Existing jurisdiction
    verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
  community_type:
    value: male
    verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01, qualification: Existing classification }
  dedication_ids:
    value: [existing-dedication]
    verification: { status: requires-verification, source_ids: [source-one] }
  associated_entity_ids:
    value: [existing-entity]
    verification: { status: requires-verification, source_ids: [source-one] }
location:
  country_code:
    value: ME
    verification: { status: verified, source_ids: [source-one], reviewed_by: [maxim], reviewed_at: 2026-08-01 }
  municipality:
    value: Будва
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
const LEGACY_NARRATIVE = NARRATIVE.replace(
  "source_ids: [source-one]\napprovals:",
  "source_ids: [source-one]\nsection_sources:\n  introduction: [source-one]\n  history: [source-map, source-one]\napprovals:",
);
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

const RU_NARRATIVE = `---
schema_version: 1
place_id: existing-place
locale: ru
editorial_status: research
translation_status: draft
slug: existing-place-ru
preferred_name: Синтетический объект
summary: Синтетическое описание
seo_title: Сохранённый SEO заголовок
seo_description: Сохранённое SEO описание
patronal_feasts: [Успение, Святитель Николай]
service_schedule: |
  По воскресеньям в 9:00.
  Вечернее богослужение в 18:00.
source_revision: ${HEAD}
alternate_names:
  - name: Сохранённое имя
    context: Synthetic test metadata
    verification_status: requires-verification
approvals: []
audit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }
---

Синтетический текст.
`;

const EN_NARRATIVE = RU_NARRATIVE
  .replace("locale: ru", "locale: en")
  .replace("slug: existing-place-ru", "slug: existing-place-en")
  .replace("preferred_name: Синтетический объект", "preferred_name: Synthetic place")
  .replace("summary: Синтетическое описание", "summary: Synthetic summary")
  .replace("patronal_feasts: [Успение, Святитель Николай]", "patronal_feasts: [Dormition, Saint Nicholas]")
  .replace("По воскресеньям в 9:00.", "Sundays at 9:00.")
  .replace("Вечернее богослужение в 18:00.", "Evening service at 18:00.")
  .replace("Синтетический текст.", "Synthetic body.");

class Repository {
  committed;
  constructor() {
    this.blobs = { placeSchema: PLACE_SCHEMA, narrativeSchema: NARRATIVE_SCHEMA, commonSchema: COMMON_SCHEMA, mediaSchema: MEDIA_SCHEMA, feastSchema: FEAST_SCHEMA, feastRegistry: FEAST_REGISTRY, preview: JSON.stringify({ place_ids: ["existing-place"] }), place: PLACE, narrative: NARRATIVE, sourceOne: "id: source-one\n", sourceMap: "id: source-map\n" };
  }
  async readBranchState() { return { headSha: HEAD, treeSha: TREE }; }
  async readTree() { return [
    ["schemas/place.schema.json", "placeSchema"], ["schemas/narrative.schema.json", "narrativeSchema"], ["schemas/common.schema.json", "commonSchema"], ["schemas/media.schema.json", "mediaSchema"], ["schemas/feast-registry.schema.json", "feastSchema"], ["content/feasts/registry.yaml", "feastRegistry"], ["validation/editorial-preview.json", "preview"],
    ["content/places/existing-place/place.yaml", "place"], ["content/places/existing-place/narratives/sr.md", "narrative"], ["content/sources/source-one.yaml", "sourceOne"], ["content/sources/source-map.yaml", "sourceMap"],
  ].map(([path, sha]) => ({ path, sha, type: "blob", mode: "100644" })); }
  async readBlob(sha) { return this.blobs[sha]; }
  async commitFilesAtomic(input) { this.committed = input; return { commitSha: "d".repeat(40), branch: input.branch }; }
}

class LocalizedRepository extends Repository {
  constructor({ ru = true, en = true } = {}) {
    super();
    if (ru) this.blobs.ruNarrative = RU_NARRATIVE;
    if (en) this.blobs.enNarrative = EN_NARRATIVE;
  }
  async readTree() {
    const tree = await super.readTree();
    if (this.blobs.ruNarrative) tree.push({ path: "content/places/existing-place/narratives/ru.md", sha: "ruNarrative", type: "blob", mode: "100644" });
    if (this.blobs.enNarrative) tree.push({ path: "content/places/existing-place/narratives/en.md", sha: "enNarrative", type: "blob", mode: "100644" });
    return tree;
  }
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
    const registry = input.files.find(({ path }) => path === "content/feasts/registry.yaml");
    if (registry) this.blobs.feastRegistry = registry.content;
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

class CreateLifecycleRepository {
  headSha = HEAD;
  commitCount = 0;
  constructor({ breakAfterCreate = false } = {}) {
    this.breakAfterCreate = breakAfterCreate;
    this.files = new Map([
      ["schemas/place.schema.json", PLACE_SCHEMA],
      ["schemas/narrative.schema.json", NARRATIVE_SCHEMA],
      ["schemas/common.schema.json", COMMON_SCHEMA],
      ["schemas/media.schema.json", MEDIA_SCHEMA],
      ["schemas/feast-registry.schema.json", FEAST_SCHEMA],
      ["content/feasts/registry.yaml", FEAST_REGISTRY],
      ["validation/editorial-preview.json", JSON.stringify({ place_ids: ["existing-place"] })],
      ["content/places/existing-place/place.yaml", PLACE],
      ["content/places/existing-place/narratives/sr.md", NARRATIVE],
      ["content/sources/source-one.yaml", "id: source-one\n"],
      ["content/sources/source-map.yaml", "id: source-map\n"],
    ]);
    this.commits = [];
  }
  tree() { let index = 1; return [...this.files.keys()].sort().map((path) => ({ path, mode: "100644", type: "blob", sha: path === "content/feasts/registry.yaml" ? FEAST_BLOB_SHA : (index++).toString(16).padStart(40, "0") })); }
  async readBranchState() { return { headSha: this.headSha, treeSha: TREE }; }
  async readTree() { return this.tree(); }
  async readBlob(sha) { const entry = this.tree().find((item) => item.sha === sha); return this.files.get(entry.path); }
  async readBlobs(shas) { const tree = this.tree(); return new Map(shas.map((sha) => { const entry = tree.find((item) => item.sha === sha); return [sha, this.files.get(entry.path)]; })); }
  async commitFilesAtomic(input) {
    assert.equal(input.expectedHeadSha, this.headSha);
    for (const file of input.files) this.files.set(file.path, file.content);
    this.commitCount += 1;
    if (this.breakAfterCreate && this.commitCount === 1) {
      const narrativePath = "content/places/novi-objekat/narratives/sr.md";
      this.files.set(narrativePath, this.files.get(narrativePath).replace(/^preferred_name:.*\n/m, ""));
    }
    this.headSha = this.commitCount.toString(16).padStart(40, "0");
    this.commits.push(input);
    return { commitSha: this.headSha, branch: input.branch };
  }
}

const env = { GITHUB_EDITORIAL_BRANCH: "editorial/work" };
const session = { subject: "user", email: "editor@example.com", actor: "editor-user", developmentBypass: false };
const newPlaceBody = { preferredName: "Нови објекат", id: "novi-objekat", slug: "novi-objekat", placeType: "monastery", expectedHeadSha: HEAD, patronalFeastIds: [], stagedFeasts: [], expectedFeastRegistryBlobSha: FEAST_BLOB_SHA };
const body = (place) => ({
  expectedHeadSha: HEAD, preferredName: place.preferredName, shortName: place.shortName ?? "", slug: place.slug, placeType: place.placeType, browseAreaId: place.browseAreaId, summary: place.summary,
  monasticCommunity: place.monasticCommunity ?? "", eparchyId: place.eparchyId ?? "", jurisdiction: place.jurisdiction ?? "", municipalityId: place.municipalityId ?? "", settlement: place.settlement ?? "",
  latitude: place.latitude, longitude: place.longitude, alternateNames: place.alternateNames,
  narrativeBody: place.narrativeBody, patronalFeastIds: place.patronalFeastIds, stagedFeasts: [], expectedFeastRegistryBlobSha: FEAST_BLOB_SHA, serviceSchedule: place.serviceSchedule ?? "", youtubeUrl: place.youtubeUrl ?? "",
});

test("new place defaults to draft and immediate publication is safe", async () => {
  const draftRepository = new CreateLifecycleRepository();
  const draft = await createPlace(draftRepository, env, session, newPlaceBody, new Date("2026-08-15T12:00:00Z"));
  assert.equal(draft.published, false);
  assert.equal(draftRepository.commits.length, 1);
  assert.deepEqual(JSON.parse(draftRepository.files.get("validation/editorial-preview.json")).place_ids, ["existing-place"]);

  const publishedRepository = new CreateLifecycleRepository();
  const published = await createPlace(publishedRepository, env, session, { ...newPlaceBody, published: true }, new Date("2026-08-15T12:00:00Z"));
  assert.equal(published.published, true);
  assert.equal(publishedRepository.commits.length, 2);
  assert.deepEqual(JSON.parse(publishedRepository.files.get("validation/editorial-preview.json")).place_ids, ["existing-place", "novi-objekat"]);

  const incompleteRepository = new CreateLifecycleRepository({ breakAfterCreate: true });
  const incomplete = await createPlace(incompleteRepository, env, session, { ...newPlaceBody, published: true }, new Date("2026-08-15T12:00:00Z"));
  assert.equal(incomplete.published, false);
  assert.match(incomplete.publicationErrors.preferredName, /пожељни назив/);
  assert.equal(incompleteRepository.files.has("content/places/novi-objekat/place.yaml"), true);
  assert.equal(incompleteRepository.commits.length, 1);
  assert.deepEqual(JSON.parse(incompleteRepository.files.get("validation/editorial-preview.json")).place_ids, ["existing-place"]);
});

test("new place supports all optional taxonomy combinations and reloads selected IDs", async () => {
  const combinations = [
    {},
    { eparchyId: "mitropolija-crnogorsko-primorska" },
    { municipalityId: "kotor" },
    { eparchyId: "eparhija-budimljansko-niksicka", municipalityId: "niksic" },
  ];
  for (const selection of combinations) {
    const repository = new CreateLifecycleRepository();
    const created = await createPlace(repository, env, session, { ...newPlaceBody, ...selection }, new Date("2026-08-15T12:00:00Z"));
    const place = parse(repository.files.get("content/places/novi-objekat/place.yaml"));
    assert.equal(place.ecclesiastical?.authority_id?.value, selection.eparchyId);
    assert.equal(place.location?.municipality_id?.value, selection.municipalityId);
    assert.equal(place.location?.municipality, undefined);
    const reloaded = await loadEditablePlace(repository, "editorial/work", created.place.id);
    assert.equal(reloaded.place.eparchyId, selection.eparchyId);
    assert.equal(reloaded.place.municipalityId, selection.municipalityId);
  }
});

test("create and edit reject injected taxonomy IDs", async () => {
  for (const [field, value] of [["eparchyId", "unknown-eparchy"], ["municipalityId", "unknown-municipality"], ["eparchyId", 42], ["municipalityId", 42]]) {
    await assert.rejects(
      () => createPlace(new CreateLifecycleRepository(), env, session, { ...newPlaceBody, [field]: value }),
      (error) => error.code === "invalid_form_data" && Boolean(error.fields?.[field]),
    );
  }
  const loaded = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  await assert.rejects(
    () => updateCanonicalPlace(loaded, { ...body(loaded.place), municipalityId: "unknown-municipality" }, "editor-user", new Date("2026-08-15T12:00:00Z")),
    (error) => error.code === "invalid_form_data" && Boolean(error.fields?.municipalityId),
  );
});

test("GET editable model exposes one unified narrative body", async () => {
  const model = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  assert.equal(model.place.preferredName, "Постојећи објекат");
  assert.match(model.place.narrativeBody, /## Увод \{#introduction\}[\s\S]*## Историја \{#history\}/);
  assert.deepEqual(model.options.placeTypes.slice(0, 2), ["monastery", "church"]);
  assert.equal(model.options.placeTypes.includes("cathedral"), true);
  assert.deepEqual(model.options.monasticCommunities, ["male", "female"]);
  assert.equal(model.options.eparchies.length, 4);
  assert.equal(model.options.municipalities.length, 25);
  assert.deepEqual(model.options.eparchies.map(({ id }) => id), [
    "mitropolija-crnogorsko-primorska",
    "eparhija-budimljansko-niksicka",
    "eparhija-milesevska",
    "eparhija-zahumsko-hercegovacka-i-primorska",
  ]);
  assert.equal(model.options.municipalities[0].labelSr, "Андријевица");
  assert.equal(model.options.municipalities.at(-1).labelSr, "Шавник");
  assert.equal(model.place.eparchyId, "mitropolija-crnogorsko-primorska");
  assert.equal(model.place.municipalityId, undefined);
  assert.equal(model.place.monasticCommunity, "male");
  assert.equal(model.place.inPreview, true);
  assert.equal("placeSourceIds" in model.place, false);
  assert.equal("sourceIds" in model.place.alternateNames[0], false);
});

test("canonical taxonomy schema rejects empty and unknown IDs", () => {
  for (const value of ["", "unknown-eparchy"]) {
    const place = parse(PLACE);
    place.ecclesiastical.authority_id.value = value;
    assert.equal(validatePlace(place), false);
  }
  for (const value of ["", "unknown-municipality"]) {
    const place = parse(PLACE);
    place.location.municipality_id = { value, verification: { status: "requires-verification" } };
    assert.equal(validatePlace(place), false);
  }
});

test("legacy singular feast resolves to a registry selection and normalizes to canonical IDs on save", async () => {
  const repository = new RoundTripRepository();
  repository.blobs.place = PLACE.replace("location:\n", "patronal_feast:\n  name: Света Тројица\nlocation:\n");
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  assert.deepEqual(loaded.place.patronalFeastIds, ["sveta-trojica"]);
  const html = await editPlacePage(session, loaded).text();
  assert.match(html, /data-patronal-feast-selector/);
  assert.match(html, /sveta-trojica/);

  await updatePlace(repository, env, session, "existing-place", body(loaded.place), new Date("2026-08-20T11:00:00Z"));
  const saved = parse(repository.blobs.place);
  assert.equal(saved.patronal_feast, undefined);
  assert.equal(saved.patronal_feasts, undefined);
  assert.deepEqual(saved.patronal_feast_ids, ["sveta-trojica"]);

  const reopened = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const noOp = await updatePlace(repository, env, session, "existing-place", {
    ...body(reopened.place), expectedHeadSha: repository.headSha,
  }, new Date("2026-08-20T11:01:00Z"));
  assert.equal(noOp.unchanged, true);
  assert.equal(repository.commitCount, 1);
});

test("staged feasts update registry and canonical place IDs in one commit", async () => {
  const repository = new RoundTripRepository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const result = await updatePlace(repository, env, session, "existing-place", {
    ...body(loaded.place),
    patronalFeastIds: ["sveti-luka", "pokrov-novi"],
    stagedFeasts: [
      { id: "sveti-luka", nameSr: "Свети Лука", dateKind: "fixed", month: 10, day: 31 },
      { id: "pokrov-novi", nameSr: "Покров Нови", dateKind: "undated", nearDuplicateConfirmed: true },
    ],
  }, new Date("2026-08-20T11:05:00Z"));
  assert.equal(result.registryChanged, true);
  assert.equal(repository.commitCount, 1);
  assert.deepEqual(repository.committed.files.slice(0, 3).map(({ path }) => path), [
    "content/feasts/registry.yaml",
    "content/places/existing-place/place.yaml",
    "content/places/existing-place/narratives/sr.md",
  ]);
  assert.deepEqual(parse(repository.blobs.place).patronal_feast_ids, ["sveti-luka", "pokrov-novi"]);
  assert.equal(parse(repository.blobs.place).patronal_feasts, undefined);
  const registry = parse(repository.blobs.feastRegistry);
  assert.equal(registry.feasts.some(({ id }) => id === "sveti-luka"), true);
  assert.equal(registry.feasts.some(({ id }) => id === "pokrov-novi" && id), true);
});

test("stale feast registry SHA rejects staged writes without a commit", async () => {
  const repository = new RoundTripRepository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  await assert.rejects(
    () => updatePlace(repository, env, session, "existing-place", {
      ...body(loaded.place),
      expectedFeastRegistryBlobSha: "stale-registry",
      patronalFeastIds: ["sveti-luka"],
      stagedFeasts: [{ id: "sveti-luka", nameSr: "Свети Лука", dateKind: "fixed", month: 10, day: 31 }],
    }),
    (error) => error.code === "git_conflict" && error.status === 409,
  );
  assert.equal(repository.commitCount, 0);
});

test("admin locale-keyed model loads existing translations and accepts missing ones", async () => {
  const existing = await loadEditablePlace(new LocalizedRepository(), "editorial/work", "existing-place");
  assert.equal(existing.place.narratives.sr.translationStatus, "source");
  assert.equal(existing.place.narratives.ru.preferredName, "Синтетический объект");
  assert.equal(existing.place.narratives.en.preferredName, "Synthetic place");
  assert.equal(existing.place.narratives.ru.sourceRevision, HEAD);
  assert.deepEqual(existing.place.narratives.ru.patronalFeasts, ["Успение", "Святитель Николай"]);
  assert.match(existing.place.narratives.en.serviceSchedule, /Sundays at 9:00/);

  const missing = await loadEditablePlace(new LocalizedRepository({ ru: false, en: false }), "editorial/work", "existing-place");
  assert.equal(missing.place.narratives.ru.exists, false);
  assert.equal(missing.place.narratives.ru.translationStatus, "missing");
  assert.equal(missing.place.narratives.en.exists, false);

  const mismatched = new LocalizedRepository({ en: false });
  mismatched.blobs.ruNarrative = RU_NARRATIVE.replace("locale: ru", "locale: en");
  await assert.rejects(
    () => loadEditablePlace(mismatched, "editorial/work", "existing-place"),
    (error) => error.code === "internal_error" && error.fields?.stage === "catalog_tree_processing_failed",
  );
});

test("localized saves are isolated, preserve deferred metadata, and no-op without a commit", async () => {
  const ruRepository = new LocalizedRepository();
  const ru = await updatePlaceNarrative(ruRepository, env, session, "existing-place", "ru", {
    expectedHeadSha: HEAD,
    preferredName: "Новый синтетический объект",
    slug: "existing-place-ru",
    summary: "Синтетическое описание",
    patronalFeasts: ["Успение", "", "Святитель Николай"],
    serviceSchedule: "По воскресеньям в 10:00.\r\nВечернее богослужение в 18:00.",
    narrativeBody: "Синтетический текст.",
    translationStatus: "published",
  }, new Date("2026-08-20T12:00:00Z"));
  assert.equal(ru.unchanged, false);
  assert.deepEqual(ruRepository.committed.files.map(({ path }) => path), ["content/places/existing-place/narratives/ru.md"]);
  const savedRu = parseNarrative(ruRepository.committed.files[0].content).frontMatter;
  assert.equal(savedRu.translation_status, "draft");
  assert.equal(savedRu.alternate_names[0].name, "Сохранённое имя");
  assert.deepEqual(savedRu.patronal_feasts, ["Успение", "Святитель Николай"]);
  assert.equal(savedRu.service_schedule, "По воскресеньям в 10:00.\nВечернее богослужение в 18:00.");
  assert.equal(savedRu.seo_title, "Сохранённый SEO заголовок");
  assert.equal(savedRu.seo_description, "Сохранённое SEO описание");

  const enRepository = new LocalizedRepository();
  await updatePlaceNarrative(enRepository, env, session, "existing-place", "en", {
    expectedHeadSha: HEAD,
    preferredName: "Updated synthetic place",
    slug: "existing-place-en",
    summary: "Synthetic summary",
    patronalFeasts: ["Dormition", "Saint Nicholas"],
    serviceSchedule: "Sundays at 9:00.\nEvening service at 18:00.",
    narrativeBody: "Synthetic body.",
  }, new Date("2026-08-20T12:00:00Z"));
  assert.deepEqual(enRepository.committed.files.map(({ path }) => path), ["content/places/existing-place/narratives/en.md"]);

  const noOpRepository = new LocalizedRepository();
  const noOp = await updatePlaceNarrative(noOpRepository, env, session, "existing-place", "en", {
    expectedHeadSha: HEAD,
    preferredName: "Synthetic place",
    slug: "existing-place-en",
    summary: "Synthetic summary",
    patronalFeasts: ["Dormition", "Saint Nicholas"],
    serviceSchedule: "Sundays at 9:00.\nEvening service at 18:00.",
    narrativeBody: "Synthetic body.",
  });
  assert.equal(noOp.unchanged, true);
  assert.equal(noOpRepository.committed, undefined);

  const missingRepository = new LocalizedRepository({ ru: false, en: false });
  const created = await updatePlaceNarrative(missingRepository, env, session, "existing-place", "ru", {
    expectedHeadSha: HEAD,
    preferredName: "",
    shortName: "",
    slug: "",
    summary: "",
    narrativeBody: "",
    translationStatus: "published",
  }, new Date("2026-08-20T12:00:00Z"));
  assert.equal(created.unchanged, false);
  assert.deepEqual(missingRepository.committed.files.map(({ path }) => path), ["content/places/existing-place/narratives/ru.md"]);
  const scaffold = parseNarrative(missingRepository.committed.files[0].content);
  assert.equal(scaffold.frontMatter.source_revision, HEAD);
  assert.equal(scaffold.frontMatter.translation_status, "draft");
  assert.equal(scaffold.frontMatter.preferred_name, undefined);
  assert.equal(scaffold.body.trim(), "");

  const missingEnRepository = new LocalizedRepository({ ru: false, en: false });
  await updatePlaceNarrative(missingEnRepository, env, session, "existing-place", "en", {
    expectedHeadSha: HEAD,
    narrativeBody: "",
    translationStatus: "published",
  }, new Date("2026-08-20T12:00:00Z"));
  const enScaffold = parseNarrative(missingEnRepository.committed.files[0].content);
  assert.equal(enScaffold.frontMatter.locale, "en");
  assert.equal(enScaffold.frontMatter.translation_status, "draft");
});

test("localized updates reset reviewed content to draft and preserve outdated provenance", async () => {
  const reviewedRepository = new LocalizedRepository();
  reviewedRepository.blobs.enNarrative = EN_NARRATIVE.replace("translation_status: draft", "translation_status: in-review");
  await updatePlaceNarrative(reviewedRepository, env, session, "existing-place", "en", {
    expectedHeadSha: HEAD,
    preferredName: "Changed after review",
    slug: "existing-place-en",
    summary: "Synthetic summary",
    patronalFeasts: ["Dormition", "Saint Nicholas"],
    serviceSchedule: "Sundays at 9:00.\nEvening service at 18:00.",
    narrativeBody: "Synthetic body.",
    translationStatus: "published",
  });
  assert.equal(parseNarrative(reviewedRepository.committed.files[0].content).frontMatter.translation_status, "draft");

  const staleRevision = "c".repeat(40);
  const outdatedRepository = new LocalizedRepository();
  outdatedRepository.blobs.ruNarrative = RU_NARRATIVE
    .replace("translation_status: draft", "translation_status: outdated")
    .replace(`source_revision: ${HEAD}`, `source_revision: ${staleRevision}`);
  await updatePlaceNarrative(outdatedRepository, env, session, "existing-place", "ru", {
    expectedHeadSha: HEAD,
    preferredName: "Уточнённый синтетический объект",
    slug: "existing-place-ru",
    summary: "Синтетическое описание",
    patronalFeasts: ["Успение", "Святитель Николай"],
    serviceSchedule: "По воскресеньям в 9:00.\nВечернее богослужение в 18:00.",
    narrativeBody: "Синтетический текст.",
  });
  const savedOutdated = parseNarrative(outdatedRepository.committed.files[0].content).frontMatter;
  assert.equal(savedOutdated.translation_status, "outdated");
  assert.equal(savedOutdated.source_revision, staleRevision);
});

test("localized saves preserve HEAD conflicts and reject arbitrary locale paths", async () => {
  const repository = new LocalizedRepository();
  await assert.rejects(
    () => updatePlaceNarrative(repository, env, session, "existing-place", "ru", { expectedHeadSha: "f".repeat(40), narrativeBody: "", translationStatus: "draft" }),
    (error) => error.code === "git_conflict" && error.status === 409,
  );
  await assert.rejects(
    () => updatePlaceNarrative(repository, env, session, "existing-place", "../../secret", { expectedHeadSha: HEAD, narrativeBody: "", translationStatus: "draft" }),
    (error) => error.code === "not_found" && error.status === 404,
  );
});

test("Serbian prose, schedule, and feast changes stale translations while coordinates and community do not", async () => {
  const proseRepository = new LocalizedRepository();
  const proseRecord = await loadEditablePlace(proseRepository, "editorial/work", "existing-place");
  await updatePlace(proseRepository, env, session, "existing-place", {
    ...body(proseRecord.place),
    summary: "Нови синтетички сажетак",
  }, new Date("2026-08-20T12:00:00Z"));
  const serbianFile = proseRepository.committed.files.find(({ path }) => path.endsWith("/narratives/sr.md"));
  assert.equal(parseNarrative(serbianFile.content).frontMatter.translation_status, "source");
  const translationFiles = proseRepository.committed.files.filter(({ path }) => /\/narratives\/(ru|en)\.md$/.test(path));
  assert.equal(translationFiles.length, 2);
  for (const file of translationFiles) {
    const parsed = parseNarrative(file.content);
    assert.equal(parsed.frontMatter.translation_status, "outdated");
    assert.equal(parsed.frontMatter.source_revision, HEAD);
    assert.match(parsed.body, /Synthetic|Синтетический/);
  }

  const coordinateRepository = new LocalizedRepository();
  const coordinateRecord = await loadEditablePlace(coordinateRepository, "editorial/work", "existing-place");
  await updatePlace(coordinateRepository, env, session, "existing-place", {
    ...body(coordinateRecord.place),
    latitude: 42.25,
    longitude: 18.95,
  }, new Date("2026-08-20T12:00:00Z"));
  assert.equal(coordinateRepository.committed.files.some(({ path }) => /\/narratives\/(ru|en)\.md$/.test(path)), false);

  for (const change of [
    { serviceSchedule: "Недјељом у 9:00." },
    { patronalFeastIds: ["sveta-trojica", "sveti-nikola"] },
  ]) {
    const repository = new LocalizedRepository();
    const record = await loadEditablePlace(repository, "editorial/work", "existing-place");
    await updatePlace(repository, env, session, "existing-place", { ...body(record.place), ...change }, new Date("2026-08-20T12:05:00Z"));
    const localizedFiles = repository.committed.files.filter(({ path }) => /\/narratives\/(ru|en)\.md$/.test(path));
    assert.equal(localizedFiles.length, 2);
    for (const file of localizedFiles) {
      const parsed = parseNarrative(file.content);
      assert.equal(parsed.frontMatter.translation_status, "outdated");
      assert.match(parsed.frontMatter.service_schedule, /9:00|Sundays/);
    }
  }

  const communityRepository = new LocalizedRepository();
  const communityRecord = await loadEditablePlace(communityRepository, "editorial/work", "existing-place");
  await updatePlace(communityRepository, env, session, "existing-place", {
    ...body(communityRecord.place), monasticCommunity: "female",
  }, new Date("2026-08-20T12:10:00Z"));
  assert.equal(communityRepository.committed.files.some(({ path }) => /\/narratives\/(ru|en)\.md$/.test(path)), false);
});

test("admin reads normalized male and female monastic communities", async () => {
  const male = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  assert.equal(male.place.monasticCommunity, "male");

  const femaleRepository = new Repository();
  femaleRepository.blobs.place = PLACE.replace("value: male", "value: female");
  const female = await loadEditablePlace(femaleRepository, "editorial/work", "existing-place");
  assert.equal(female.place.monasticCommunity, "female");
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
  assert.equal(loaded.place.narrativeBody, "");

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
  update.municipalityId = "kotor";
  update.latitude = 42.2;
  update.longitude = 18.8;
  update.narrativeBody = loaded.place.narrativeBody.replace("Стара историја", "Нови текст");
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
  assert.deepEqual(nextNarrative.frontMatter.source_ids, ["source-one"]);
  assert.equal(nextNarrative.frontMatter.section_sources, undefined);
  assert.match(nextNarrative.body, /\[\^source-one\]/);
  assert.ok(nextNarrative.body.indexOf("{#introduction}") < nextNarrative.body.indexOf("{#history}"));
  assert.match(nextNarrative.body, /Нови текст/);
  assert.equal(nextPlace.audit.created_at, "2026-08-01T00:00:00Z");
  assert.equal(nextPlace.audit.created_by, "maxim");
  assert.equal(nextPlace.audit.updated_by, "editor-user");
  assert.equal(nextNarrative.frontMatter.audit.updated_at, "2026-08-13T12:00:00Z");
  assert.equal(nextPlace.location.municipality_id.value, "kotor");
  assert.equal(nextPlace.location.municipality_id.verification.status, "requires-verification");
  assert.equal(nextPlace.location.municipality.verification.status, "verified");
  assert.equal(nextPlace.location.municipality.value, "Будва");
  assert.equal(nextPlace.location.country_code.verification.status, "verified");
  assert.deepEqual(nextPlace.location.country_code.verification.source_ids, ["source-one"]);
  assert.equal(nextPlace.location.coordinates.verification.status, "requires-verification");
  assert.equal(nextPlace.ecclesiastical.community_type.value, "male");
});

test("monastic community saves and clears without losing other ecclesiastical facts", async () => {
  const loaded = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const female = await updateCanonicalPlace(
    loaded,
    { ...body(loaded.place), monasticCommunity: "female" },
    "editor-user",
    new Date("2026-08-22T12:00:00Z"),
  );
  assert.equal(female.place.ecclesiastical.community_type.value, "female");
  assert.deepEqual(female.place.ecclesiastical.community_type.verification, { status: "requires-verification" });
  assert.deepEqual(female.place.ecclesiastical.jurisdiction, loaded.rawPlace.ecclesiastical.jurisdiction);
  assert.deepEqual(female.place.ecclesiastical.authority_id, loaded.rawPlace.ecclesiastical.authority_id);
  assert.deepEqual(female.place.ecclesiastical.dedication_ids, loaded.rawPlace.ecclesiastical.dedication_ids);
  assert.deepEqual(female.place.ecclesiastical.associated_entity_ids, loaded.rawPlace.ecclesiastical.associated_entity_ids);

  const femaleRepository = new Repository();
  femaleRepository.blobs.place = PLACE.replace("value: male", "value: female");
  const loadedFemale = await loadEditablePlace(femaleRepository, "editorial/work", "existing-place");
  const male = await updateCanonicalPlace(
    loadedFemale,
    { ...body(loadedFemale.place), monasticCommunity: "male" },
    "editor-user",
    new Date("2026-08-22T12:00:30Z"),
  );
  assert.equal(male.place.ecclesiastical.community_type.value, "male");

  const cleared = await updateCanonicalPlace(
    loaded,
    { ...body(loaded.place), monasticCommunity: "" },
    "editor-user",
    new Date("2026-08-22T12:01:00Z"),
  );
  assert.equal(cleared.place.ecclesiastical.community_type, undefined);
  assert.deepEqual(cleared.place.ecclesiastical.jurisdiction, loaded.rawPlace.ecclesiastical.jurisdiction);
});

test("changing a monastery to a non-monastery clears its monastic community", async () => {
  const loaded = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const changed = await updateCanonicalPlace(
    loaded,
    { ...body(loaded.place), placeType: "church", monasticCommunity: "male" },
    "editor-user",
    new Date("2026-08-22T12:02:00Z"),
  );
  assert.equal(changed.place.place_type.value, "church");
  assert.equal(changed.place.ecclesiastical.community_type, undefined);
});

test("admin rejects unsupported monastic community values", async () => {
  const loaded = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  for (const monasticCommunity of ["brotherhood", "православни мушки манастир", 42]) {
    await assert.rejects(
      () => updateCanonicalPlace(loaded, { ...body(loaded.place), monasticCommunity }, "editor-user", new Date("2026-08-22T12:03:00Z")),
      (error) => error.code === "invalid_form_data" && Boolean(error.fields?.monasticCommunity),
    );
  }
});

test("unchanged facts retain verification exactly and coordinates can be cleared", async () => {
  const loaded = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const update = body(loaded.place);
  const unchanged = await updateCanonicalPlace(loaded, update, "editor-user", new Date("2026-08-13T12:00:00Z"));
  assert.equal(unchanged.unchanged, true);
  assert.deepEqual(unchanged.place.place_type.verification, parse(PLACE).place_type.verification);
  assert.deepEqual(unchanged.place.location.coordinates.verification, parse(PLACE).location.coordinates.verification);
  assert.deepEqual(unchanged.place.ecclesiastical.community_type.verification, parse(PLACE).ecclesiastical.community_type.verification);
  assert.deepEqual(unchanged.place.ecclesiastical.authority_id, parse(PLACE).ecclesiastical.authority_id);
  assert.deepEqual(unchanged.place.location.municipality, parse(PLACE).location.municipality);
  assert.deepEqual(unchanged.place.audit, parse(PLACE).audit);
  assert.deepEqual(unchanged.narrative.audit, parseNarrative(NARRATIVE).frontMatter.audit);
  const cleared = await updateCanonicalPlace(loaded, { ...update, latitude: "", longitude: "" }, "editor-user", new Date("2026-08-13T12:00:00Z"));
  assert.equal(cleared.unchanged, false);
  assert.equal(cleared.place.location.coordinates, undefined);
});

test("taxonomy selectors save and clear IDs without changing legacy descriptive facts", async () => {
  const loaded = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const selected = await updateCanonicalPlace(
    loaded,
    { ...body(loaded.place), eparchyId: "eparhija-milesevska", municipalityId: "pljevlja" },
    "editor-user",
    new Date("2026-08-15T12:30:00Z"),
  );
  assert.equal(selected.place.ecclesiastical.authority_id.value, "eparhija-milesevska");
  assert.equal(selected.place.location.municipality_id.value, "pljevlja");
  assert.deepEqual(selected.place.ecclesiastical.jurisdiction, loaded.rawPlace.ecclesiastical.jurisdiction);
  assert.deepEqual(selected.place.location.municipality, loaded.rawPlace.location.municipality);

  const cleared = await updateCanonicalPlace(
    loaded,
    { ...body(loaded.place), eparchyId: "", municipalityId: "" },
    "editor-user",
    new Date("2026-08-15T12:31:00Z"),
  );
  assert.equal(cleared.place.ecclesiastical.authority_id, undefined);
  assert.equal(cleared.place.location.municipality_id, undefined);
  assert.deepEqual(cleared.place.ecclesiastical.jurisdiction, loaded.rawPlace.ecclesiastical.jurisdiction);
  assert.deepEqual(cleared.place.location.municipality, loaded.rawPlace.location.municipality);
});

test("unrelated legacy save neither guesses municipality ID nor loses existing taxonomy", async () => {
  const legacy = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const savedLegacy = await updateCanonicalPlace(
    legacy,
    { ...body(legacy.place), summary: "Измијењен само опис" },
    "editor-user",
    new Date("2026-08-15T12:32:00Z"),
  );
  assert.equal(savedLegacy.place.location.municipality.value, "Будва");
  assert.equal(savedLegacy.place.location.municipality_id, undefined);

  const repository = new Repository();
  repository.blobs.place = PLACE.replace(
    "  municipality:\n",
    "  municipality_id:\n    value: budva\n    verification: { status: requires-verification }\n  municipality:\n",
  );
  const classified = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const savedClassified = await updateCanonicalPlace(
    classified,
    { ...body(classified.place), summary: "Други опис" },
    "editor-user",
    new Date("2026-08-15T12:33:00Z"),
  );
  assert.equal(savedClassified.place.ecclesiastical.authority_id.value, "mitropolija-crnogorsko-primorska");
  assert.equal(savedClassified.place.location.municipality_id.value, "budva");
});

test("no-op PATCH succeeds without changing audit timestamps or creating a Git commit", async () => {
  const repository = new Repository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const result = await updatePlace(repository, env, session, "existing-place", body(loaded.place), new Date("2026-08-13T12:00:00Z"));
  assert.equal(result.unchanged, true);
  assert.equal(result.commitSha, HEAD);
  assert.equal(repository.committed, undefined);
});

test("legacy narrative provenance self-heals on save without losing sources", async () => {
  const repository = new RoundTripRepository();
  repository.blobs.narrative = LEGACY_NARRATIVE;
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const first = await updatePlace(
    repository,
    env,
    session,
    "existing-place",
    { ...body(loaded.place), summary: "Мигриран опис" },
    new Date("2026-08-15T12:00:00Z"),
  );
  assert.equal(first.unchanged, false);
  const migrated = parseNarrative(repository.blobs.narrative);
  assert.deepEqual(migrated.frontMatter.source_ids, ["source-one", "source-map"]);
  assert.equal(migrated.frontMatter.section_sources, undefined);
  assert.equal(migrated.body.trim(), parseNarrative(LEGACY_NARRATIVE).body.trim());

  const reopened = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const repeated = await updatePlace(
    repository,
    env,
    session,
    "existing-place",
    { ...body(reopened.place), expectedHeadSha: repository.headSha },
    new Date("2026-08-15T12:05:00Z"),
  );
  assert.equal(repeated.unchanged, true);
  assert.equal(repository.commitCount, 1);
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

test("coordinate metadata is backend-managed, defaults for a new pair, and preserves valid existing values", async () => {
  const repository = new Repository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const removed = await updateCanonicalPlace(loaded, { ...body(loaded.place), latitude: "", longitude: "" }, "editor-user", new Date("2026-08-13T12:00:00Z"));
  const withoutCoordinates = { ...loaded, rawPlace: removed.place, place: { ...loaded.place, latitude: undefined, longitude: undefined } };
  const created = await updateCanonicalPlace(withoutCoordinates, { ...body(withoutCoordinates.place), latitude: 42.1, longitude: 19.1 }, "editor-user", new Date("2026-08-13T12:01:00Z"));
  assert.deepEqual(created.place.location.coordinates, {
    latitude: 42.1,
    longitude: 19.1,
    accuracy: "complex-centroid",
    publication_safety: "public",
    crs: "EPSG:4326",
    verification: { status: "requires-verification" },
  });

  const customRepository = new Repository();
  customRepository.blobs.place = PLACE.replace("accuracy: complex-centroid", "accuracy: exact-entrance");
  const custom = await loadEditablePlace(customRepository, "editorial/work", "existing-place");
  const moved = await updateCanonicalPlace(custom, { ...body(custom.place), latitude: 42.2, longitude: 19.2 }, "editor-user", new Date("2026-08-13T12:02:00Z"));
  assert.equal(moved.place.location.coordinates.accuracy, "exact-entrance");
  assert.equal(moved.place.location.coordinates.publication_safety, "public");
  assert.equal(moved.place.location.coordinates.crs, "EPSG:4326");
});

test("place editor hides technical coordinate controls while canonical schemas retain them", async () => {
  const record = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const [html, uiSource, clientSource] = await Promise.all([
    editPlacePage(session, record).text(),
    readFile(new URL("../src/ui.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/editor.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(html, /Јавна безбједност|Тачност|CRS|coordinateAccuracy|publicationSafety/);
  assert.match(html, /<input name="latitude"[^>]*>/);
  assert.match(html, /<input name="longitude"[^>]*>/);
  assert.match(html, /data-coordinate-map-canvas/);
  assert.match(html, /Уклони координате/);
  assert.match(uiSource, /Мапа тренутно није доступна\. Координате можете унијети ручно\./);
  assert.doesNotMatch(clientSource, /field\("coordinateAccuracy"\)|field\("publicationSafety"\)/);
  assert.match(clientSource, /zoom: coordinateState\.pair \? 16 : 6\.2/);
  assert.match(clientSource, /new maplibregl\.Marker\(\{ element: createMarkerElement\(\), draggable: true, anchor: "bottom" \}\)/);
  assert.match(clientSource, /coordinateMap\.on\("click"/);
  assert.match(clientSource, /coordinateMarker\.on\("dragend"/);
  assert.match(clientSource, /coordinateMap\.once\("load", revealCoordinateMap\)/);
  assert.match(clientSource, /coordinateMap\.once\("idle", revealCoordinateMap\)/);
  assert.match(clientSource, /hasLoadedBaseStyle\(coordinateMap\)/);
  assert.match(clientSource, /coordinateMap\.on\("error", handleMapError\)/);
  assert.match(clientSource, /if \(!mapReady && isFatalBaseStyleError\(event\)\) showMapFailure\(\)/);
  assert.match(clientSource, /isFatalBaseStyleError\(event\)/);
  assert.match(clientSource, /showMapFailure/);
  assert.match(clientSource, /Мапа тренутно није доступна\. Координате можете унијети ручно\./);
  assert.match(clientSource, /if \(coordinateState\.pair\) syncMarker\(coordinateState\.pair\); else resetMontenegro\(\);/);
  assert.doesNotMatch(clientSource, /hasRenderableCanvas|coordinateMap\.on\("render"/);
  assert.doesNotMatch(clientSource, /key=[A-Za-z0-9]{20}/);
  assert.match(clientSource, /input\.addEventListener\("blur", syncManualPoint\)/);
  assert.match(clientSource, /coordinateState\.clear\(\)/);
  assert.match(clientSource, /addControl\("⌂", "Прикажи Црну Гору"/);
  assert.match(uiSource, /admin-map-controls\.maplibregl-ctrl-group button\{width:44px;min-width:44px;height:44px;min-height:44px\}/);
  assert.match(PLACE_SCHEMA, /"accuracy"/);
  assert.match(PLACE_SCHEMA, /"publication_safety"/);
  assert.match(PLACE_SCHEMA, /"crs"/);
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

test("place editor saves plural patronal feasts, multiline service schedule, and YouTube video", async () => {
  const repository = new RoundTripRepository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const update = {
    ...body(loaded.place),
    narrativeBody: "## О манастиру\n\nЈединствени текст у више пасуса.\n\nДруги пасус.",
    patronalFeastIds: ["sveta-trojica", "sveti-nikola"],
    serviceSchedule: "Недјељом у 9:00.\r\nВечерње у 18:00.",
    youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
  };
  await updatePlace(repository, env, session, "existing-place", update, new Date("2026-08-15T14:00:00Z"));
  const savedPlace = parse(repository.blobs.place);
  const savedNarrative = parseNarrative(repository.blobs.narrative);
  assert.deepEqual(savedPlace.patronal_feast_ids, ["sveta-trojica", "sveti-nikola"]);
  assert.equal(savedPlace.patronal_feast, undefined);
  assert.equal(savedPlace.patronal_feasts, undefined);
  assert.equal(savedNarrative.frontMatter.service_schedule, "Недјељом у 9:00.\nВечерње у 18:00.");
  assert.equal(savedPlace.video.youtube_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.match(savedNarrative.body, /Јединствени текст у више пасуса\.[\s\S]*Други пасус\./);

  const reopened = await loadEditablePlace(repository, "editorial/work", "existing-place");
  assert.deepEqual(reopened.place.patronalFeastIds, ["sveta-trojica", "sveti-nikola"]);
  assert.equal(reopened.place.serviceSchedule, "Недјељом у 9:00.\nВечерње у 18:00.");
  assert.equal(reopened.place.youtubeUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.match(reopened.place.narrativeBody, /Други пасус/);

  await updatePlace(repository, env, session, "existing-place", {
    ...body(reopened.place), expectedHeadSha: repository.headSha,
    patronalFeastIds: ["sveti-nikola"], youtubeUrl: "https://www.youtube.com/shorts/9bZkp7q19f0",
  }, new Date("2026-08-15T14:03:00Z"));
  const edited = await loadEditablePlace(repository, "editorial/work", "existing-place");
  assert.deepEqual(edited.place.patronalFeastIds, ["sveti-nikola"]);
  assert.equal(edited.place.youtubeUrl, "https://www.youtube.com/watch?v=9bZkp7q19f0");

  await updatePlace(repository, env, session, "existing-place", {
    ...body(edited.place), expectedHeadSha: repository.headSha, patronalFeastIds: [], serviceSchedule: "", youtubeUrl: "",
  }, new Date("2026-08-15T14:05:00Z"));
  assert.equal(parse(repository.blobs.place).patronal_feast_ids, undefined);
  assert.equal(parseNarrative(repository.blobs.narrative).frontMatter.service_schedule, undefined);
  assert.equal(parse(repository.blobs.place).video, undefined);
});

test("place editor rejects unsafe video URLs without weakening optional fields", async () => {
  const repository = new Repository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  await assert.rejects(
    () => updatePlace(repository, env, session, "existing-place", { ...body(loaded.place), youtubeUrl: "https://youtube.example.com/watch?v=dQw4w9WgXcQ" }),
    (error) => error.code === "invalid_form_data" && error.fields?.youtubeUrl === "Унесите важећи YouTube линк.",
  );
  const optional = await updateCanonicalPlace(loaded, { ...body(loaded.place), youtubeUrl: "", patronalFeastIds: [] }, "editor-user", new Date("2026-08-15T14:00:00Z"));
  assert.equal(optional.unchanged, true);
});

test("place editor UI keeps one narrative field per locale and no legacy section controls", async () => {
  const record = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const html = await editPlacePage(session, record).text();
  assert.match(html, /<h2>О манастиру<\/h2>/);
  assert.match(html, /<textarea name="narrativeBody"/);
  assert.equal((html.match(/name="narrativeBody"/g) ?? []).length, 3);
  assert.match(html, /data-language-tab="sr">Српски/);
  assert.match(html, /data-language-tab="ru">Русский/);
  assert.match(html, /data-language-tab="en">English/);
  assert.match(html, /name="youtubeUrl"/);
  assert.match(html, /data-patronal-feast-selector/);
  assert.match(html, /<h2>Додај нову славу<\/h2>/);
  assert.match(html, /<div data-new-feast-panel>/);
  assert.doesNotMatch(html, /<form data-new-feast|data-new-feast-(?:name|day|month)[^>]* required/);
  assert.match(html, /name="serviceSchedule"/);
  assert.equal((html.match(/name="serviceSchedule"/g) ?? []).length, 3);
  assert.equal((html.match(/data-translation-editor/g) ?? []).length, 2);
  assert.doesNotMatch(html, /name="translationStatus"|Статус превода/);
  assert.doesNotMatch(html, /name="seoTitle"|SEO title/);
  assert.doesNotMatch(html, /name="seoDescription"|SEO description/);
  assert.match(html, /\.editor\[data-language-panel\]\[hidden\]\{display:none\}/);
  assert.match(html, /Тип манастира<select name="monasticCommunity">/);
  assert.match(html, /<option value="">— није одређено —<\/option>/);
  assert.match(html, /<option value="male" selected>Мушки<\/option>/);
  assert.match(html, /<option value="female">Женски<\/option>/);
  const eparchySelect = html.match(/<select name="eparchyId">([\s\S]*?)<\/select>/)?.[1] ?? "";
  const municipalitySelect = html.match(/<select name="municipalityId">([\s\S]*?)<\/select>/)?.[1] ?? "";
  assert.equal((eparchySelect.match(/<option /g) ?? []).length, 5);
  assert.equal((municipalitySelect.match(/<option /g) ?? []).length, 26);
  assert.match(eparchySelect, /value="mitropolija-crnogorsko-primorska" selected/);
  assert.doesNotMatch(html, /name="municipality"/);
  assert.doesNotMatch(html, /data-add-section|data-section-title|data-remove-paragraph|Додај канонски одјељак/);

  const newHtml = await newPlacePage(session, record.options, HEAD).text();
  assert.equal((newHtml.match(/<select name="eparchyId">[\s\S]*?<\/select>/g) ?? []).length, 1);
  assert.equal((newHtml.match(/<select name="municipalityId">[\s\S]*?<\/select>/g) ?? []).length, 1);

  record.place.placeType = "church";
  delete record.place.monasticCommunity;
  const churchHtml = await editPlacePage(session, record).text();
  assert.match(churchHtml, /data-monastic-community-field hidden/);
  assert.match(churchHtml, /name="monasticCommunity" disabled/);

  const clientSource = await readFile(new URL("../client/editor.ts", import.meta.url), "utf8");
  assert.match(clientSource, /setupFeastSelectors/);
  assert.match(clientSource, /\.\.\.feastValue\(\)/);
  assert.match(clientSource, /placeTypeInput\.value === "monastery"/);
  assert.match(clientSource, /monasticCommunityInput\.value = ""/);
});

test("place editor exposes compact draft and published visibility management", async () => {
  const record = await loadEditablePlace(new Repository(), "editorial/work", "existing-place");
  const previewHtml = await editPlacePage(session, record).text();
  assert.match(previewHtml, /data-published="true"/);
  assert.match(previewHtml, /Објављено/);
  assert.match(previewHtml, /Врати у нацрт/);
  assert.match(previewHtml, /Објекат више неће бити видљив на сајту\. Подаци и фотографије остају сачувани у администрацији\./);

  const repository = new Repository();
  repository.blobs.preview = JSON.stringify({ place_ids: [] });
  const nonPreview = await loadEditablePlace(repository, "editorial/work", "existing-place");
  const nonPreviewHtml = await editPlacePage(session, nonPreview).text();
  assert.match(nonPreviewHtml, /data-published="false"/);
  assert.match(nonPreviewHtml, />Нацрт</);
  assert.match(nonPreviewHtml, />Објави</);
  assert.doesNotMatch(nonPreviewHtml, /Радни приказ|радном приказу|preview-control|preview-on|preview-off/);

  const [uiSource, clientSource] = await Promise.all([
    readFile(new URL("../src/ui.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/editor.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(uiSource, /Радни приказ|радном приказу|Research scaffold/);
  assert.match(uiSource, /status-published/);
  assert.match(uiSource, /status-draft/);
  assert.match(clientSource, /\/api\/places\/\$\{encodeURIComponent\(form\.dataset\.placeId/);
  assert.match(clientSource, /\/visibility/);
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
  const connectDirective = csp.split(";").find((directive) => directive.trim().startsWith("connect-src"))?.trim() ?? "";
  const imgDirective = csp.split(";").find((directive) => directive.trim().startsWith("img-src")) ?? "";
  assert.equal(connectDirective, "connect-src 'self' https://api.maptiler.com");
  assert.match(imgDirective, /https:\/\/api\.maptiler\.com/);
  assert.doesNotMatch(csp, /https:\/\/\*\.maptiler\.com|(?:^|\s)https:(?:\s|;|$)/);
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

test("unsupported type, area, coordinates and stale HEAD are rejected without commits", async () => {
  const cases = [
    { placeType: "unsupported" }, { browseAreaId: "unknown-area" }, { latitude: 100 },
  ];
  for (const patch of cases) {
    const repository = new Repository(); const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
    await assert.rejects(() => updatePlace(repository, env, session, "existing-place", { ...body(loaded.place), ...patch }), (error) => error.code === "invalid_form_data");
    assert.equal(repository.committed, undefined);
  }
  const repository = new Repository(); const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  await assert.rejects(() => updatePlace(repository, env, session, "existing-place", { ...body(loaded.place), expectedHeadSha: "f".repeat(40) }), (error) => error.code === "git_conflict");
  assert.equal(repository.committed, undefined);
});

test("coordinate updates reject incomplete and out-of-range pairs", async () => {
  const repository = new Repository();
  const loaded = await loadEditablePlace(repository, "editorial/work", "existing-place");
  for (const [patch, field] of [
    [{ latitude: 91, longitude: 19.1 }, "latitude"],
    [{ latitude: 42.1, longitude: 181 }, "longitude"],
    [{ latitude: 42.1, longitude: "" }, "coordinates"],
  ]) {
    await assert.rejects(
      () => updateCanonicalPlace(loaded, { ...body(loaded.place), ...patch }, "editor-user", new Date("2026-08-13T12:00:00Z")),
      (error) => error.code === "invalid_form_data" && Boolean(error.fields?.[field]),
    );
  }
  await assert.rejects(
    () => updateCanonicalPlace(loaded, { ...body(loaded.place), latitude: 42.1, longitude: "" }, "editor-user", new Date("2026-08-13T12:00:00Z")),
    (error) => error.fields?.coordinates === "Унесите и географску ширину и географску дужину.",
  );
});
