import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  formatGospelPassageSr,
  formatGospelReferenceSr,
  gospelReadingsForDate,
  loadGospelReadingsDataset,
} from "../src/lib/calendar/gospel-readings.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("Gospel runtime lookup preserves every raw ISO-date binding and fails closed", async () => {
  const dataset = await loadGospelReadingsDataset(ROOT);
  const august19 = gospelReadingsForDate(dataset, "2026-08-19");
  const august20 = gospelReadingsForDate(dataset, "2026-08-20");
  const september17 = gospelReadingsForDate(dataset, "2026-09-17");

  assert.equal(august19.length, 2);
  assert.deepEqual(august19.map((reading) => reading.reading_id), ["lk-45", "mt-70"]);
  assert.equal(august20.length, 4);
  assert.deepEqual(august20.map((reading) => reading.reading_id), ["jn-35b", "jn-36", "jn-52", "mk-5"]);
  assert.equal(september17.filter((reading) => reading.reading_id === "jn-36").length, 2);
  assert.equal(Object.values(dataset.dates).reduce((count, day) => count + day.readings.length, 0), 360);
  assert.deepEqual(gospelReadingsForDate(dataset, "2026-07-31"), []);
  assert.deepEqual(gospelReadingsForDate(dataset, "not-a-date"), []);

  for (const reading of [...august19, ...august20]) {
    assert.equal(reading.text, reading.verses.map((verse) => verse.text).join("\n"));
  }
});

test("public Serbian references are presentation-only and retain Gospel text metadata", async () => {
  const dataset = await loadGospelReadingsDataset(ROOT);
  const [luke, matthew] = gospelReadingsForDate(dataset, "2026-08-19");
  assert.equal(formatGospelReferenceSr(luke), "Лк. 9, 28–36 · зач. 45");
  assert.equal(formatGospelReferenceSr(matthew), "Мт. 17, 1–9 · зач. 70");
  assert.equal(formatGospelPassageSr("Ин. 15:17–16:2"), "Јн. 15, 17–16, 2");

  const conditional = Object.values(dataset.dates).flatMap((day) => day.readings).find((reading) => reading.conditional);
  const review = Object.values(dataset.dates).flatMap((day) => day.readings).find((reading) => reading.needs_review);
  assert.ok(conditional);
  assert.ok(review);
});

test("homepage and selected calendar day share the server-rendered Gospel UI without a corpus client payload", async () => {
  const [component, today, hydration, dayPage, calendarJson, homepage, explorer] = await Promise.all([
    source("src/components/CalendarGospelReadings.astro"),
    source("src/components/TodayCalendar.astro"),
    source("src/components/TodayCalendarHydration.astro"),
    source("src/pages/kalendar/[date].astro"),
    source("src/pages/calendar/2026.json.ts"),
    source("src/components/HomePage.astro"),
    source("src/components/MapExplorer.astro"),
  ]);

  assert.match(component, /<details/);
  assert.match(component, /<summary>Прочитај Јеванђеље<\/summary>/);
  assert.match(component, /reading\.text/);
  assert.match(component, /reading\.conditional/);
  assert.doesNotMatch(component, /needs_review|feast_or_reason/);
  assert.match(today, /gospelReadingsForDate\(await loadGospelReadingsDataset\(\), fallback\.date\)/);
  assert.match(today, /<CalendarGospelReadings readings=\{gospelReadings\} compact \/>/);
  assert.match(dayPage, /gospelReadingsForDate\(gospelDataset, day\.date\)/);
  assert.match(dayPage, /<CalendarGospelReadings readings=\{gospelReadings\} \/>/);
  assert.match(hydration, /root\.dataset\.calendarGospelDate !== day\.date/);
  assert.doesNotMatch(hydration, /gospel-readings|loadGospelReadingsDataset|reading\.text/);
  assert.doesNotMatch(calendarJson, /gospel|reading|Gospel/);
  assert.doesNotMatch(`${homepage}\n${explorer}`, /loadScriptureCorpus|scriptureCorpus|corpus=/);
});
