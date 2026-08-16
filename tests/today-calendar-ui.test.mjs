import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { presentCalendarTitle } from "../src/lib/presentation/calendar-title.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

test("Today places the dynamic date in its shared header and presents canonical uppercase titles", async () => {
  const [component, styles] = await Promise.all([
    readFile(path.join(ROOT, "src/components/TodayCalendar.astro"), "utf8"),
    readFile(path.join(ROOT, "src/styles/global.css"), "utf8"),
  ]);

  assert.match(component, /<header class="today-calendar__header">[\s\S]*?data-calendar-date/);
  assert.match(component, /<div class="today-calendar__calendar">[\s\S]*?data-calendar-title/);
  assert.equal((component.match(/data-calendar-date/g) ?? []).length, 2, "one server node and one client lookup retain a single public date");
  assert.match(component, /presentCalendarTitle\(fallback\.title\)/);
  assert.match(component, /presentCalendarTitle\(day\.title\)/);
  assert.match(styles, /\.today-calendar__header\s*\{[\s\S]*?display: flex;[\s\S]*?justify-content: space-between;/);
  assert.match(styles, /\.today-calendar h2\s*\{[\s\S]*?font-size: clamp\(1\.2rem, 1\.05rem \+ 0\.35vw, 1\.55rem\);[\s\S]*?line-height: 1\.16;/);
  assert.doesNotMatch(styles.match(/\.today-calendar h2\s*\{[\s\S]*?\}/)?.[0] ?? "", /text-transform:/);
});

test("calendar title presentation changes only all-uppercase display text", () => {
  assert.equal(presentCalendarTitle("НЕДЕЉА ЈЕДАНАЕСТА ПО ПЕДЕСЕТНИЦИ"), "Недеља једанаеста по Педесетници");
  assert.equal(presentCalendarTitle("Преподобни Исакије"), "Преподобни Исакије");
});
