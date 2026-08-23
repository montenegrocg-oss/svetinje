import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

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
  assert.match(component, /fallback\.commemoration_sr/);
  assert.match(component, /fallback\.week_context_sr/);
  assert.match(hydration, /day\.commemoration_sr/);
  assert.match(hydration, /day\.week_context_sr/);
  assert.match(component, /locale === "sr" && <TodayCalendarHydration \/>/);
  assert.match(styles, /\.today-calendar__header\s*\{[\s\S]*?display: flex;[\s\S]*?justify-content: space-between;/);
  assert.match(styles, /\.today-calendar h2\s*\{[\s\S]*?font-size: clamp\(1\.2rem, 1\.05rem \+ 0\.35vw, 1\.55rem\);[\s\S]*?line-height: 1\.16;/);
  assert.doesNotMatch(styles.match(/\.today-calendar h2\s*\{[\s\S]*?\}/)?.[0] ?? "", /text-transform:/);
});

test("homepage calendar presentation applies no generic casing or Gospel fallback", async () => {
  const [component, hydration] = await Promise.all([
    readFile(path.join(ROOT, "src/components/TodayCalendar.astro"), "utf8"),
    readFile(path.join(ROOT, "src/components/TodayCalendarHydration.astro"), "utf8"),
  ]);
  const implementation = `${component}\n${hydration}`;
  assert.doesNotMatch(implementation, /toLowerCase|toUpperCase|toLocaleLowerCase|toLocaleUpperCase|capitalize|titleCase|sentenceCase/);
  assert.doesNotMatch(implementation, /day\.gospel|primaryReading|data-calendar-excerpt/);
  assert.match(implementation, /data-calendar-empty/);
});
