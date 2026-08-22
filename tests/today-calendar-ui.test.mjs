import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { presentCalendarTitle } from "../src/lib/presentation/calendar-title.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

test("Today places the dynamic date in its shared header and preserves canonical title casing", async () => {
  const [component, hydration, styles] = await Promise.all([
    readFile(path.join(ROOT, "src/components/TodayCalendar.astro"), "utf8"),
    readFile(path.join(ROOT, "src/components/TodayCalendarHydration.astro"), "utf8"),
    readFile(path.join(ROOT, "src/styles/global.css"), "utf8"),
  ]);
  const implementation = `${component}\n${hydration}`;

  assert.match(component, /<header class="today-calendar__header">[\s\S]*?data-calendar-date/);
  assert.match(component, /<div class="today-calendar__calendar">[\s\S]*?data-calendar-title/);
  assert.equal((implementation.match(/data-calendar-date/g) ?? []).length, 2, "one server node and one client lookup retain a single public date");
  assert.match(component, /presentCalendarTitle\(fallback\.title\)/);
  assert.match(hydration, /presentCalendarTitle\(day\.title\)/);
  assert.match(component, /locale === "sr" && <TodayCalendarHydration \/>/);
  assert.match(styles, /\.today-calendar__header\s*\{[\s\S]*?display: flex;[\s\S]*?justify-content: space-between;/);
  assert.match(styles, /\.today-calendar h2\s*\{[\s\S]*?font-size: clamp\(1\.2rem, 1\.05rem \+ 0\.35vw, 1\.55rem\);[\s\S]*?line-height: 1\.16;/);
  assert.doesNotMatch(styles.match(/\.today-calendar h2\s*\{[\s\S]*?\}/)?.[0] ?? "", /text-transform:/);
});

test("homepage calendar title presentation does not apply generic case transformations", () => {
  const titles = [
    "СВЕТО ПРЕОБРАЖЕЊЕ ГОСПОДА И БОГА И СПАСА НАШЕГА ИСУСА ХРИСТА",
    "Попразништво Преображења",
    "НЕДЕЉА ЈЕДАНАЕСТА ПО ПЕДЕСЕТНИЦИ",
    "недеља једанаеста по педесетници",
  ];

  for (const title of titles) assert.equal(presentCalendarTitle(title), title);
});
