import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import { updateCanonicalPlace } from "../src/place-editor.ts";
import { loadEditablePlace, parseNarrative } from "../src/repository-content.ts";
import { updatePlace } from "../src/service.ts";

const HEAD = "a".repeat(40);
const TREE = "b".repeat(40);
const PLACE_SCHEMA = JSON.stringify({ $defs: { placeType: { enum: ["monastery", "church"] }, coordinateAccuracy: { enum: ["exact-entrance", "complex-centroid"] } } });
const NARRATIVE_SCHEMA = JSON.stringify({ $defs: { sectionKey: { enum: ["introduction", "history", "location"] } } });
const COMMON_SCHEMA = JSON.stringify({ $defs: { publicationSafety: { enum: ["public", "review-required"] }, verificationStatus: { enum: ["verified", "requires-verification", "unknown"] } } });
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

class Repository {
  committed;
  constructor() {
    this.blobs = { placeSchema: PLACE_SCHEMA, narrativeSchema: NARRATIVE_SCHEMA, commonSchema: COMMON_SCHEMA, preview: JSON.stringify({ place_ids: ["existing-place"] }), place: PLACE, narrative: NARRATIVE, sourceOne: "id: source-one\n", sourceMap: "id: source-map\n" };
  }
  async readBranchState() { return { headSha: HEAD, treeSha: TREE }; }
  async readTree() { return [
    ["schemas/place.schema.json", "placeSchema"], ["schemas/narrative.schema.json", "narrativeSchema"], ["schemas/common.schema.json", "commonSchema"], ["validation/editorial-preview.json", "preview"],
    ["content/places/existing-place/place.yaml", "place"], ["content/places/existing-place/narratives/sr.md", "narrative"], ["content/sources/source-one.yaml", "sourceOne"], ["content/sources/source-map.yaml", "sourceMap"],
  ].map(([path, sha]) => ({ path, sha, type: "blob", mode: "100644" })); }
  async readBlob(sha) { return this.blobs[sha]; }
  async commitFilesAtomic(input) { this.committed = input; return { commitSha: "d".repeat(40), branch: input.branch }; }
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
  assert.deepEqual(model.options.placeTypes, ["monastery", "church"]);
  assert.equal(model.place.inPreview, true);
  assert.deepEqual(model.place.placeSourceIds, ["source-one", "source-map"]);
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
  const unchanged = updateCanonicalPlace(loaded, update, "editor-user", new Date("2026-08-13T12:00:00Z"));
  assert.deepEqual(unchanged.place.place_type.verification, parse(PLACE).place_type.verification);
  assert.deepEqual(unchanged.place.location.coordinates.verification, parse(PLACE).location.coordinates.verification);
  const cleared = updateCanonicalPlace(loaded, { ...update, latitude: "", longitude: "" }, "editor-user", new Date("2026-08-13T12:00:00Z"));
  assert.equal(cleared.place.location.coordinates, undefined);
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
