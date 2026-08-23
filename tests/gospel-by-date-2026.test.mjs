import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  EXPECTED_BINDING_COUNT,
  EXPECTED_DATE_COUNT,
  EXPECTED_INVENTORY_COUNT,
  serializeDataset,
} from "../scripts/generate-gospel-by-date-2026.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_PATH = path.join(ROOT, "data/gospel-readings/svetinje-gospel-by-date-2026.json");
const CALENDAR_PATH = path.join(ROOT, "data/calendar/2026-08-01_2026-12-31.json");
const EXPECTED_CALENDAR_SHA256 = "bab3f91a65c0c3ec3be684db34e1b22af54923a4c31c8bdf391ab8bd951f7a57";
const EXPECTED_INPUT_SHA256 = "2f101b45e916f59cc738fce271a11e853e8a355d446110ed979398a7713ca5fc";

async function loadOutput() {
  const text = await readFile(OUTPUT_PATH, "utf8");
  return { text, dataset: JSON.parse(text) };
}

function allBindings(dataset) {
  return Object.entries(dataset.dates).flatMap(([date, day]) => day.readings.map((reading) => ({ date, ...reading })));
}

function duplicateKey(binding) {
  const { entry_id: _entryId, ...stableBinding } = binding;
  return JSON.stringify(stableBinding);
}

test("Gospel-by-date output is deterministic UTF-8 JSON with exact date and binding cardinality", async () => {
  const { text, dataset } = await loadOutput();
  assert.equal(text, serializeDataset(dataset));
  assert.equal(Buffer.from(text, "utf8").toString("utf8"), text);
  const dates = Object.keys(dataset.dates);
  assert.equal(dates.length, EXPECTED_DATE_COUNT);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(dates[0], "2026-08-01");
  assert.equal(dates.at(-1), "2026-12-31");
  assert.equal(allBindings(dataset).length, EXPECTED_BINDING_COUNT);
  assert.equal(dataset.metadata.canonical_date_existence.verified_dates, EXPECTED_DATE_COUNT);
});

test("every binding has a stable reading ID, passage, zachalo, and non-empty Scripture text", async () => {
  const { dataset } = await loadOutput();
  const bindings = allBindings(dataset);
  const contentById = new Map();
  const idByBookZachalo = new Map();
  for (const binding of bindings) {
    for (const field of ["entry_id", "reading_id", "book", "zachalo", "passage", "reading_type", "feast_or_reason", "text"]) {
      assert.equal(typeof binding[field], "string", `${binding.date}: ${field}`);
      assert.ok(binding[field].trim(), `${binding.date}: ${field}`);
    }
    assert.equal(typeof binding.conditional, "boolean");
    assert.equal(typeof binding.needs_review, "boolean");
    assert.ok(binding.verses.length > 0);
    for (const verse of binding.verses) assert.ok(verse.text.trim());
    const content = JSON.stringify({ book: binding.book, zachalo: binding.zachalo, passage: binding.passage, verses: binding.verses, text: binding.text });
    const previousContent = contentById.get(binding.reading_id);
    if (previousContent) assert.equal(previousContent, content, binding.reading_id);
    contentById.set(binding.reading_id, content);
    const stableKey = `${binding.book}\u001f${binding.zachalo}`;
    const previousId = idByBookZachalo.get(stableKey);
    if (previousId) assert.equal(previousId, binding.reading_id, stableKey);
    idByBookZachalo.set(stableKey, binding.reading_id);
  }
  assert.equal(contentById.size, 178);
  assert.equal(dataset.unassigned_readings.length, 8);
  assert.equal(new Set([...contentById.keys(), ...dataset.unassigned_readings.map((reading) => reading.reading_id)]).size, EXPECTED_INVENTORY_COUNT);
});

test("review and conditional semantics plus the exact duplicate binding are preserved", async () => {
  const { dataset } = await loadOutput();
  const bindings = allBindings(dataset);
  assert.equal(bindings.filter((binding) => binding.needs_review).length, 35);
  assert.equal(bindings.filter((binding) => binding.conditional).length, 44);
  const duplicateGroups = [...Map.groupBy(bindings, duplicateKey).values()].filter((group) => group.length > 1);
  assert.equal(duplicateGroups.length, 1);
  assert.deepEqual(duplicateGroups[0].map((binding) => binding.entry_id), [
    "2026-09-17-jn-36-1",
    "2026-09-17-jn-36-2",
  ]);
  assert.equal(dataset.metadata.counts.exact_duplicate_bindings, 1);
});

test("provenance is fixed-input only and canonical calendar bytes remain unchanged", async () => {
  const [{ text, dataset }, calendarBytes] = await Promise.all([loadOutput(), readFile(CALENDAR_PATH)]);
  assert.equal(dataset.metadata.date_reading_bindings.sha256, EXPECTED_INPUT_SHA256);
  assert.equal(dataset.metadata.scripture_text.source, "user-provided nzavet.pdf");
  assert.equal(dataset.metadata.external_research_performed, false);
  assert.equal(dataset.metadata.canonical_calendar.modified, false);
  assert.equal(createHash("sha256").update(calendarBytes).digest("hex"), EXPECTED_CALENDAR_SHA256);
  assert.equal(dataset.metadata.canonical_calendar.repository_dataset_sha256, EXPECTED_CALENDAR_SHA256);
  assert.doesNotMatch(text, /[A-Za-z]:\\|localhost|127\.0\.0\.1/iu);
  assert.doesNotMatch(text, /azbyka|pravoslavie\.ru|12apostol/iu);
});
