import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import commonSchema from "../schemas/common.schema.json" with { type: "json" };
import feastRegistrySchema from "../schemas/feast-registry.schema.json" with { type: "json" };
import {
  feastIdsForDate,
  loadFeastRegistry,
  patronalFeastIds,
  patronalFeastNames,
  placeIdsForFeast,
} from "../src/lib/content/feast-registry.ts";
import { loadEditorialPreviewPlaces, loadPublishablePlaces } from "../src/lib/content/publication.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const registry = await loadFeastRegistry(ROOT);
const migration = JSON.parse(await readFile(path.join(ROOT, "data", "migrations", "feast-registry-foundation.json"), "utf8"));

test("fixed and movable feast records validate without fixed fields on movable dates", () => {
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  ajv.addSchema(commonSchema);
  const validate = ajv.compile(feastRegistrySchema);
  const base = { schema_version: 1, feasts: [{ id: "fixed-feast", name_sr: "Фиксна слава", legacy_names: ["Фиксна слава"], date: { kind: "fixed", month: 12, day: 19 } }] };
  assert.equal(validate(base), true);
  assert.equal(validate({ ...base, feasts: [{ id: "movable-feast", name_sr: "Подвижна слава", legacy_names: ["Подвижна слава"], date: { kind: "movable" } }] }), true);
  assert.equal(validate({ ...base, feasts: [{ id: "invalid-movable", name_sr: "Неисправно", legacy_names: ["Неисправно"], date: { kind: "movable", month: 4, day: 1 } }] }), false);
});

test("canonical feast IDs win, followed by plural and singular legacy fallbacks", () => {
  assert.deepEqual(patronalFeastNames({ patronal_feast_ids: ["nikoljdan"], patronal_feasts: [{ name: "Погрешан fallback" }] }, registry), ["Никољдан"]);
  assert.deepEqual(patronalFeastIds({ patronal_feasts: [{ name: "Никољдан 19. децембар" }] }, registry), ["nikoljdan"]);
  assert.deepEqual(patronalFeastNames({ patronal_feasts: [{ name: "Никољдан 19. децембар" }] }, registry), ["Никољдан 19. децембар"]);
  assert.deepEqual(patronalFeastIds({ patronal_feast: { name: "Никољдан 19. децембар" } }, registry), ["nikoljdan"]);
});

test("the complete legacy inventory migrated losslessly to resolving canonical IDs", async () => {
  assert.ok(registry.feasts.length >= migration.counts.feast_ids_created);
  assert.deepEqual(migration.counts, {
    place_records_migrated: 61,
    legacy_values_migrated: 63,
    unique_legacy_values: 39,
    feast_ids_created: 39,
  });
  const knownIds = new Set(registry.feasts.map((feast) => feast.id));
  const placeDirectories = await readdir(path.join(ROOT, "content", "places"));
  const migrated = [];
  for (const placeId of placeDirectories) {
    let place;
    try { place = parse(await readFile(path.join(ROOT, "content", "places", placeId, "place.yaml"), "utf8")); } catch { continue; }
    if (!Array.isArray(place.patronal_feast_ids)) continue;
    migrated.push(place);
    assert.equal(place.patronal_feast, undefined);
    assert.equal(place.patronal_feasts, undefined);
    assert.equal(new Set(place.patronal_feast_ids).size, place.patronal_feast_ids.length);
    for (const id of place.patronal_feast_ids) assert.equal(knownIds.has(id), true, `${place.id}: ${id}`);
  }
  assert.equal(migrated.length, 61);
  assert.equal(migration.legacy_inventory.length, 39);
  assert.equal(new Set(migration.legacy_inventory.map((entry) => entry.legacy_name)).size, 39);
  assert.deepEqual(placeIdsForFeast(migrated, registry, "nikoljdan").sort(), ["crkva-svetog-nikole", "manastir-donje-brcele", "manastir-praskvica", "obodski-manastir"]);
});

test("fixed dates come only from explicit legacy text and verified coverage creates deterministic links", async () => {
  const monthTokens = {
    1: ["јануар"], 2: ["фебруар"], 3: ["март"], 4: ["април"], 5: ["мај"], 6: ["јун"],
    7: ["јул", "jul"], 8: ["август", "августа"], 9: ["септембар", "септембер"],
    10: ["октобар"], 11: ["новембар"], 12: ["децембар"],
  };
  for (const feast of registry.feasts.filter((entry) => entry.date?.kind === "fixed")) {
    assert.equal(feast.legacy_names.some((name) => monthTokens[feast.date.month].some((month) => name.includes(`${feast.date.day}. ${month}`) || name.includes(`${feast.date.day} ${month}`))), true, feast.id);
  }
  const calendar = JSON.parse(await readFile(path.join(ROOT, "data", "calendar", "2026-08-01_2026-12-31.json"), "utf8"));
  const bindings = calendar.days.flatMap((day) => feastIdsForDate(registry, day.date).map((feastId) => ({ date: day.date, feastId })));
  assert.ok(bindings.length >= 19);
  assert.ok(bindings.some((binding) => binding.date === "2026-12-19" && binding.feastId === "nikoljdan"));
  assert.equal(bindings.some((binding) => binding.feastId === "cvijeti"), false);
});

test("calendar bytes and publication inventories remain unchanged", async () => {
  const calendarBytes = await readFile(path.join(ROOT, "data", "calendar", "2026-08-01_2026-12-31.json"));
  assert.equal(createHash("sha256").update(calendarBytes).digest("hex"), "bab3f91a65c0c3ec3be684db34e1b22af54923a4c31c8bdf391ab8bd951f7a57");
  assert.deepEqual(await loadPublishablePlaces(ROOT), []);
  const expectedPreview = JSON.parse(await readFile(path.join(ROOT, "validation", "editorial-preview.json"), "utf8")).place_ids.sort();
  const preview = (await loadEditorialPreviewPlaces(ROOT)).map((place) => place.id).sort();
  assert.deepEqual(preview, expectedPreview);
});
