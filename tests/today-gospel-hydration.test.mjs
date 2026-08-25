import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { dailyGospelReadingsForDate, loadGospelReadingsDataset } from "../src/lib/calendar/gospel-readings.ts";
import { podgoricaDateKey } from "../src/lib/calendar/today-calendar.ts";
import { GET, getStaticPaths } from "../src/pages/gospel/[date].json.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("daily Gospel endpoints cover all 153 verified Calendar dates with public-only fields", async () => {
  const routes = await getStaticPaths();
  assert.equal(routes.length, 153);
  assert.equal(routes[0].params.date, "2026-08-01");
  assert.equal(routes.at(-1).params.date, "2026-12-31");
  assert.equal(new Set(routes.map((route) => route.params.date)).size, 153);

  const routeByDate = new Map(routes.map((route) => [route.params.date, route]));
  const august25Response = GET({ props: routeByDate.get("2026-08-25").props });
  const august25Payload = await august25Response.json();
  assert.deepEqual(august25Payload.readings.map((reading) => reading.reading_id), ["jn-36", "mk-12"]);
  assert.equal(august25Payload.readings[0].conditional, true);
  assert.equal(Object.hasOwn(august25Payload.readings[1], "conditional"), false);

  const allowedReadingFields = new Set(["book", "conditional", "passage", "reading_id", "text", "verses", "zachalo"]);
  for (const reading of august25Payload.readings) {
    assert.equal(Object.keys(reading).every((key) => allowedReadingFields.has(key)), true);
    assert.equal(reading.text, reading.verses.map((verse) => verse.text).join("\n"));
    for (const forbidden of ["entry_id", "reading_type", "feast_or_reason", "needs_review", "source_ref"]) {
      assert.equal(Object.hasOwn(reading, forbidden), false);
    }
  }
});

test("daily Gospel projection preserves multiple readings and supports a true empty day", async () => {
  const dataset = await loadGospelReadingsDataset(ROOT);
  assert.deepEqual(dailyGospelReadingsForDate(dataset, "2026-08-19").map((reading) => reading.reading_id), ["lk-45", "mt-70"]);
  assert.deepEqual(dailyGospelReadingsForDate(dataset, "2026-07-31"), []);

  const withEmptyDay = structuredClone(dataset);
  withEmptyDay.dates["2026-08-25"] = { readings: [] };
  assert.deepEqual(dailyGospelReadingsForDate(withEmptyDay, "2026-08-25"), []);
});

test("Today hydration resolves the Podgorica date at runtime and fetches only that day's Gospel", async () => {
  const [today, hydration, gospelComponent] = await Promise.all([
    source("src/components/TodayCalendar.astro"),
    source("src/components/TodayCalendarHydration.astro"),
    source("src/components/CalendarGospelReadings.astro"),
  ]);
  const nearMidnight = new Date("2026-08-24T22:30:00Z");
  assert.equal(nearMidnight.toISOString().slice(0, 10), "2026-08-24");
  assert.equal(podgoricaDateKey(nearMidnight), "2026-08-25");
  assert.match(today, /data-calendar-gospel-content/);
  assert.match(hydration, /const dateKey = podgoricaDateKey\(new Date\(\)\)/);
  assert.match(hydration, /fetch\(`\/gospel\/\$\{date\}\.json`\)/);
  assert.match(hydration, /renderGospelReadings\(payload\.readings\)/);
  assert.match(hydration, /readings\.forEach/);
  assert.match(hydration, /readings\.length === 0/);
  assert.match(hydration, /data-calendar-gospel-content/);
  assert.doesNotMatch(hydration, /calendarGospelDate !== day\.date|loadGospelReadingsDataset|data\/gospel-readings|360|186/);
  assert.match(gospelComponent, /<style is:global>/);
});
