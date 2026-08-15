import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { assembleReading, loadCalendarDays, loadScriptureCorpus, primaryReading, readingExcerpt } from "../src/lib/calendar/content.ts";
import { createTodayCalendarModel, podgoricaDateKey, todayCalendarDay } from "../src/lib/calendar/today-calendar.ts";
import { cleanCalendarTitle } from "../scripts/lib/calendar-import.mjs";
import { serbianLatinToCyrillic } from "../scripts/lib/serbian-transliteration.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

test("calendar 2026 is complete, continuous, and backed by public-domain Scripture", async () => {
  const [days, corpus] = await Promise.all([loadCalendarDays(ROOT), loadScriptureCorpus(ROOT)]);
  assert.equal(days.length, 365);
  assert.equal(days[0].date, "2026-01-01");
  assert.equal(days.at(-1).date, "2026-12-31");
  assert.equal(new Set(days.map((day) => day.date)).size, 365);
  assert.equal(corpus.translation_id, "vuk-karadzic-1847");
  assert.equal(corpus.licence, "public-domain");
  assert.deepEqual(Object.keys(corpus.books).sort(), ["jn", "lk", "mk", "mt"]);
  for (const day of days) {
    assert.doesNotMatch(JSON.stringify(day), /<[^>]+>|mso-|class=/i);
    assert.doesNotMatch(`${day.title} ${day.commemorations.join(" ")}`, /служб[\p{L}]*\s+пој[\p{L}]*|на\s+повечер[\p{L}]*|Типик/iu);
    const reading = primaryReading(day);
    if (reading) assert.ok(assembleReading(corpus, reading).length > 0, `${day.date} primary reading must resolve`);
  }
});

test("calendar titles remove service instructions and Serbian transliteration is deterministic", () => {
  assert.equal(cleanCalendarTitle("Свети мученик – њему службу појати на повечерју"), "Свети мученик");
  assert.equal(serbianLatinToCyrillic("Ljubljeni Njegoš, Džem i Isus!"), "Љубљени Његош, Џем и Исус!");
});

test("TodayCalendarService uses Europe/Podgorica across winter, summer, and boundaries", async () => {
  const [days, corpus] = await Promise.all([loadCalendarDays(ROOT), loadScriptureCorpus(ROOT)]);
  assert.equal(podgoricaDateKey(new Date("2026-01-01T23:30:00Z")), "2026-01-02");
  assert.equal(podgoricaDateKey(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
  assert.equal(podgoricaDateKey(new Date("2026-03-29T00:30:00Z")), "2026-03-29");
  assert.equal(podgoricaDateKey(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(todayCalendarDay(days, new Date("2026-08-15T12:00:00Z"))?.date, "2026-08-15");
  assert.equal(todayCalendarDay(days, new Date("2025-12-31T23:30:00Z"))?.date, "2026-01-01");
  assert.equal(todayCalendarDay(days, new Date("2026-12-31T12:00:00Z"))?.date, "2026-12-31");
  assert.equal(todayCalendarDay(days, new Date("2027-01-01T12:00:00Z")), undefined);
  const model = createTodayCalendarModel(days, corpus, new Date("2026-08-16T12:00:00Z"));
  assert.equal(model?.day.date, "2026-08-16");
  assert.equal(model?.reference, "Мт. 18, 23–35");
  assert.ok(model?.excerpt.length > 0);
});

test("calendar boundary and focused-day facts retain resolved Gospel readings", async () => {
  const [days, corpus] = await Promise.all([loadCalendarDays(ROOT), loadScriptureCorpus(ROOT)]);
  const byDate = new Map(days.map((day) => [day.date, day]));
  assert.equal(byDate.get("2026-01-01")?.julian_date, "2025-12-19");
  assert.equal(byDate.get("2026-01-13")?.julian_date, "2025-12-31");
  assert.equal(byDate.get("2026-01-14")?.julian_date, "2026-01-01");
  assert.equal(byDate.get("2026-12-31")?.julian_date, "2026-12-18");
  const samples = {
    "2026-08-14": ["jn", 60, 0],
    "2026-08-15": ["mt", 78, 1],
    "2026-08-16": ["mt", 77, 0],
  };
  for (const [date, [book, zachalo, primaryIndex]] of Object.entries(samples)) {
    const day = byDate.get(date);
    assert.ok(day?.gospel, `${date} must have Gospel readings`);
    assert.equal(day.gospel.primary_reading, primaryIndex);
    assert.equal(primaryReading(day)?.book, book);
    assert.equal(primaryReading(day)?.zachalo, zachalo);
  }
  const composite = byDate.get("2026-08-14").gospel.readings[0];
  assert.deepEqual(composite.ranges[0].verses, ["6-11", "13-20", "25-28", "30-35"]);
  const assembled = assembleReading(corpus, composite);
  assert.equal(assembled[0].verse, 6);
  assert.equal(assembled[6].verse, 13);
  const excerpt = readingExcerpt(assembled);
  assert.ok(excerpt.endsWith(assembled[1].text) || excerpt === assembled[0].text);
});

test("calendar import is deterministic, nested-archive safe, and keeps provenance internal", async () => {
  const [importer, helper, provenance] = await Promise.all([
    readFile(path.join(ROOT, "scripts/import-calendar-2026.mjs"), "utf8"),
    readFile(path.join(ROOT, "scripts/lib/calendar-import.mjs"), "utf8"),
    readFile(path.join(ROOT, "content/calendar/2026/_provenance.yaml"), "utf8").then(parse),
  ]);
  assert.match(importer, /mkdtemp/);
  assert.match(importer, /finally\s*\{/);
  assert.match(importer, /rm\(temporaryDirectory, \{ recursive: true, force: true \}\)/);
  assert.match(importer, /titles_combined\.json/);
  assert.match(helper, /selectPrimaryReading/);
  assert.equal(provenance.scripture_translation_id, "vuk-karadzic-1847");
  assert.equal(provenance.scripture_licence, "public-domain");
  assert.ok(/^[a-f0-9]{64}$/.test(provenance.normalized_calendar_sha256));
});

test("raw application archives are never stored in content or public output", async () => {
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(async (entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }))).flat();
  }
  const files = [...await walk(path.join(ROOT, "content")), ...await walk(path.join(ROOT, "public"))];
  assert.equal(files.some((file) => /\.(?:xapk|apk)$/i.test(file) || /data_data\.zip$/i.test(file)), false);
});
