import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadCalendarDays } from "../src/lib/calendar/content.ts";
import { createTodayCalendarModel, podgoricaDateKey, todayCalendarDay } from "../src/lib/calendar/today-calendar.ts";
import { loadVerifiedCalendarDataset } from "../src/lib/calendar/verified-dataset.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

test("frontend calendar inventory is the exact public projection of the verified dataset", async () => {
  const [days, dataset] = await Promise.all([loadCalendarDays(ROOT), loadVerifiedCalendarDataset(ROOT)]);
  assert.equal(days.length, 153);
  assert.equal(days[0].date, "2026-08-01");
  assert.equal(days.at(-1).date, "2026-12-31");
  assert.equal(new Set(days.map((day) => day.date)).size, 153);
  assert.deepEqual(days.map((day) => day.date), dataset.days.map((day) => day.date));
  for (const [index, day] of days.entries()) {
    const { source_ref, ...expectedPublicDay } = dataset.days[index];
    assert.ok(source_ref);
    assert.deepEqual(day, expectedPublicDay);
    assert.equal(Object.hasOwn(day, "source_ref"), false);
    assert.equal(Object.hasOwn(day, "gospel"), false);
    assert.equal(Object.hasOwn(day, "title"), false);
    assert.equal(Object.hasOwn(day, "commemorations"), false);
  }
});

test("public calendar data and TodayCalendarService preserve exact verified control-day text", async () => {
  const [days, calendarDayPage, calendarJsonEndpoint, todayCalendar] = await Promise.all([
    loadCalendarDays(ROOT),
    readFile(path.join(ROOT, "src/pages/kalendar/[date].astro"), "utf8"),
    readFile(path.join(ROOT, "src/pages/calendar/2026.json.ts"), "utf8"),
    readFile(path.join(ROOT, "src/components/TodayCalendar.astro"), "utf8"),
  ]);
  const byDate = new Map(days.map((day) => [day.date, day]));
  assert.equal(byDate.get("2026-08-19")?.commemoration_sr, "Преображење Господње");
  assert.equal(byDate.get("2026-08-20")?.commemoration_sr, "Свети преподобномученик Дометије; Преподобни Ор");
  assert.equal(createTodayCalendarModel(days, new Date("2026-08-19T12:00:00Z"))?.day.commemoration_sr, "Преображење Господње");
  assert.equal(createTodayCalendarModel(days, new Date("2026-08-20T12:00:00Z"))?.day.commemoration_sr, "Свети преподобномученик Дометије; Преподобни Ор");
  assert.match(calendarDayPage, /<h1>\{day\.commemoration_sr\}<\/h1>/);
  assert.match(calendarJsonEndpoint, /JSON\.stringify\(\{ year: 2026, time_zone: "Europe\/Podgorica", days \}\)/);
  assert.match(todayCalendar, /fallback\.commemoration_sr/);
});

test("TodayCalendarService uses Europe/Podgorica and fails closed outside the verified range", async () => {
  const days = await loadCalendarDays(ROOT);
  assert.equal(podgoricaDateKey(new Date("2026-01-01T23:30:00Z")), "2026-01-02");
  assert.equal(podgoricaDateKey(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
  assert.equal(podgoricaDateKey(new Date("2026-03-29T00:30:00Z")), "2026-03-29");
  assert.equal(podgoricaDateKey(new Date("2026-10-25T23:30:00Z")), "2026-10-26");
  assert.equal(todayCalendarDay(days, new Date("2026-08-15T12:00:00Z"))?.date, "2026-08-15");
  assert.equal(todayCalendarDay(days, new Date("2026-01-15T12:00:00Z")), undefined);
  assert.equal(todayCalendarDay(days, new Date("2026-07-31T12:00:00Z")), undefined);
  assert.equal(todayCalendarDay(days, new Date("2026-12-31T12:00:00Z"))?.date, "2026-12-31");
  assert.equal(todayCalendarDay(days, new Date("2027-01-01T12:00:00Z")), undefined);
  const model = createTodayCalendarModel(days, new Date("2026-08-16T12:00:00Z"));
  assert.equal(model?.day.date, "2026-08-16");
  assert.deepEqual(Object.keys(model ?? {}), ["day"]);
});

test("runtime has no legacy YAML, Tipik provenance, XAPK importer, or Gospel fallback", async () => {
  const [legacyFiles, contentLoader, datasetLoader, dayPage, todayCalendar, hydration] = await Promise.all([
    readdir(path.join(ROOT, "content", "calendar", "2026")),
    readFile(path.join(ROOT, "src/lib/calendar/content.ts"), "utf8"),
    readFile(path.join(ROOT, "src/lib/calendar/verified-dataset.ts"), "utf8"),
    readFile(path.join(ROOT, "src/pages/kalendar/[date].astro"), "utf8"),
    readFile(path.join(ROOT, "src/components/TodayCalendar.astro"), "utf8"),
    readFile(path.join(ROOT, "src/components/TodayCalendarHydration.astro"), "utf8"),
  ]);
  assert.deepEqual(legacyFiles, ["_reading-overrides.yaml"]);
  await assert.rejects(access(path.join(ROOT, "scripts/import-calendar-2026.mjs")), { code: "ENOENT" });
  await assert.rejects(access(path.join(ROOT, "content/calendar/2026/_provenance.yaml")), { code: "ENOENT" });
  assert.match(contentLoader, /loadVerifiedCalendarDataset/);
  assert.match(datasetLoader, /data\/calendar\/2026-08-01_2026-12-31\.json/);
  assert.doesNotMatch(contentLoader, /content["', ]+calendar|readdir|\.yaml|from "yaml"/);
  for (const source of [dayPage, todayCalendar, hydration]) {
    assert.doesNotMatch(source, /day\.gospel|primaryReading|loadScriptureCorpus|assembleReading/);
  }
  assert.match(dayPage, /calendar-day__empty/);
  assert.match(todayCalendar, /data-calendar-empty/);
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
