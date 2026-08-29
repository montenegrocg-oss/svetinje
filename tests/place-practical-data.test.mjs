import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import commonSchema from "../schemas/common.schema.json" with { type: "json" };
import narrativeSchema from "../schemas/narrative.schema.json" with { type: "json" };
import placeSchema from "../schemas/place.schema.json" with { type: "json" };
import { parseLocalizedNarrative } from "../src/lib/content/localized-narrative.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(commonSchema);
const validatePlace = ajv.compile(placeSchema);
const validateNarrative = ajv.compile(narrativeSchema);
const audit = { created_at: "2026-08-23T00:00:00Z", created_by: "test", updated_at: "2026-08-23T00:00:00Z", updated_by: "test" };
const basePlace = { schema_version: 1, id: "synthetic-place", editorial_status: "research", relationships: {}, approvals: [], audit };
const baseNarrative = { schema_version: 1, place_id: "synthetic-place", locale: "sr", editorial_status: "research", translation_status: "source", approvals: [], audit };

test("place schema accepts canonical IDs and temporary legacy patronal feast shapes", () => {
  assert.equal(validatePlace({ ...basePlace, patronal_feast_ids: ["nikoljdan"] }), true);
  assert.equal(validatePlace({ ...basePlace, patronal_feast_ids: ["nikoljdan", "nikoljdan"] }), false);
  assert.equal(validatePlace({ ...basePlace, patronal_feast: { name: "Слава" } }), true);
  assert.equal(validatePlace({ ...basePlace, patronal_feasts: [{ name: "Прва" }, { name: "Друга" }] }), true);
  assert.equal(validatePlace({ ...basePlace, patronal_feast: { name: "Слава" }, patronal_feasts: [{ name: "Друга" }] }), false);
  assert.equal(validatePlace({ ...basePlace, patronal_feasts: [] }), false);
  assert.equal(validatePlace({ ...basePlace, patronal_feasts: [{ name: "   " }] }), false);
});

test("narrative schema permits localized feasts and nonblank multiline schedules only", () => {
  assert.equal(validateNarrative(baseNarrative), true);
  assert.equal(validateNarrative({ ...baseNarrative, patronal_feasts: ["Dormition", "Saint Nicholas"], service_schedule: "Sunday 9:00\nEvening 18:00" }), true);
  assert.equal(validateNarrative({ ...baseNarrative, patronal_feasts: [] }), false);
  assert.equal(validateNarrative({ ...baseNarrative, patronal_feasts: [" "] }), false);
  assert.equal(validateNarrative({ ...baseNarrative, service_schedule: "   " }), false);
});

test("localized narrative parsing preserves locale-only feast order and multiline schedule", () => {
  const narrative = parseLocalizedNarrative(`---\nschema_version: 1\nplace_id: synthetic-place\nlocale: en\neditorial_status: research\ntranslation_status: draft\nsource_revision: ${"a".repeat(40)}\npatronal_feasts: [Dormition, Saint Nicholas]\nservice_schedule: |\n  Sunday 9:00\n  Evening 18:00\napprovals: []\naudit: { created_at: 2026-08-23T00:00:00Z, created_by: test, updated_at: 2026-08-23T00:00:00Z, updated_by: test }\n---\n\nSynthetic body.\n`);
  assert.deepEqual(narrative.patronalFeasts, ["Dormition", "Saint Nicholas"]);
  assert.equal(narrative.serviceSchedule, "Sunday 9:00\nEvening 18:00");
});

test("shared public components implement absent, singular, plural, localized, and safe schedule contracts", async () => {
  const [page, practical, schedule, localized, copy, styles] = await Promise.all([
    source("src/components/PlaceDetailPage.astro"),
    source("src/components/place-detail/PlacePracticalPanel.astro"),
    source("src/components/place-detail/PlaceServiceSchedule.astro"),
    source("src/lib/content/localized-publication.ts"),
    source("src/i18n/public-copy.ts"),
    source("src/styles/global.css"),
  ]);
  assert.match(practical, /patronalFeasts\.length === 1 \? copy\.feast : copy\.feasts/);
  assert.match(practical, /patronalFeasts\.length > 0/);
  assert.match(practical, /place\.patronalFeastReferences\.map/);
  assert.match(practical, /availableFeastIdSet\.has\(feast\.id\) \? feastPath\(feast\.id\) : undefined/);
  assert.match(practical, /feast\.href \? <a href=\{feast\.href\}>\{feast\.name\}<\/a> : feast\.name/);
  assert.match(practical, /feast\.dateLabel && <span> — \{feast\.dateLabel\}<\/span>/);
  assert.match(copy, /feast: "Слава", feasts: "Славе"/);
  assert.match(copy, /feast: "Престольный праздник", feasts: "Престольные праздники"/);
  assert.match(copy, /feast: "Patronal feast", feasts: "Patronal feasts"/);
  assert.match(page, /<PlaceDetailGallery[\s\S]*<PlaceServiceSchedule[\s\S]*<PlacePracticalPanel/);
  assert.match(schedule, /normalizedSchedule &&/);
  assert.match(schedule, /<p>\{normalizedSchedule\}<\/p>/);
  assert.doesNotMatch(schedule, /set:html|innerHTML/);
  assert.match(styles, /"gallery"\s+"schedule"\s+"practical"/);
  assert.match(styles, /"gallery practical"\s+"schedule practical"/);
  assert.match(styles, /"about gallery practical"\s+"about schedule practical"/);
  assert.match(styles, /\.place-service-schedule p[\s\S]*white-space: pre-line/);
  assert.match(localized, /patronalFeastReferences: _serbianFeastReferences/);
  assert.match(localized, /unlinkedPatronalFeasts: _serbianUnlinkedFeasts/);
  assert.match(localized, /patronalFeasts: narrative\.patronalFeasts/);
  assert.match(localized, /patronalFeastReferences: \[\]/);
  assert.match(localized, /narrative\.serviceSchedule \? \{ serviceSchedule: narrative\.serviceSchedule \} : \{\}/);
});
