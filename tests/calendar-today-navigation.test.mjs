import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  calendarNavigationHref,
  podgoricaDateKey,
} from "../src/lib/calendar/today-calendar.ts";
import {
  VERIFIED_CALENDAR_END,
  VERIFIED_CALENDAR_START,
} from "../src/lib/calendar/verified-dataset.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(ROOT, file), "utf8");
}

test("Calendar navigation resolves the Podgorica civil date within verified coverage", () => {
  assert.equal(calendarNavigationHref(new Date("2026-08-24T12:00:00Z")), "/kalendar/2026-08-24/");
  assert.equal(calendarNavigationHref(new Date(`${VERIFIED_CALENDAR_START}T12:00:00Z`)), "/kalendar/2026-08-01/");
  assert.equal(calendarNavigationHref(new Date(`${VERIFIED_CALENDAR_END}T12:00:00Z`)), "/kalendar/2026-12-31/");
  assert.equal(calendarNavigationHref(new Date("2026-07-31T12:00:00Z")), "/kalendar/");
  assert.equal(calendarNavigationHref(new Date("2027-01-01T12:00:00Z")), "/kalendar/");
});

test("Calendar navigation uses Europe/Podgorica instead of the UTC date", () => {
  const nearMidnight = new Date("2026-08-23T22:30:00Z");
  assert.equal(nearMidnight.toISOString().slice(0, 10), "2026-08-23");
  assert.equal(podgoricaDateKey(nearMidnight), "2026-08-24");
  assert.equal(calendarNavigationHref(nearMidnight), "/kalendar/2026-08-24/");
});

test("the shared Header enhances only Serbian Calendar links at runtime", async () => {
  const header = await source("src/components/Header.astro");

  assert.match(header, /\{ href: routeFor\(locale, "calendar"\), label: copy\.nav\.calendar \}/);
  assert.match(header, /const calendarRoot = routeFor\(locale, "calendar"\)/);
  assert.match(header, /data-calendar-today-link=\{locale === "sr" && item\.href === calendarRoot/);
  assert.equal((header.match(/data-calendar-today-link=/g) ?? []).length, 2);
  assert.match(header, /import \{ calendarNavigationHref \} from "\.\.\/lib\/calendar\/today-calendar"/);
  assert.match(header, /link\.href = calendarNavigationHref\(new Date\(\)\)/);
  assert.match(header, /link\.addEventListener\("click", updateDestination\)/);
  assert.match(header, /const isActive = \(href: string\) => [^\n]*currentPath\.startsWith\(href\)/);
  assert.doesNotMatch(header, /loadCalendarDays|loadGospelReadingsDataset|fetch\(|source_ref|gospel-readings/);
});

test("Calendar index and dated-day navigation remain unchanged", async () => {
  const [indexPage, dayPage] = await Promise.all([
    source("src/pages/kalendar/index.astro"),
    source("src/pages/kalendar/[date].astro"),
  ]);

  assert.match(indexPage, /<CalendarIndexPage days=\{days\} locale="sr"/);
  assert.doesNotMatch(indexPage, /redirect|location\.replace|meta http-equiv/i);
  assert.match(dayPage, /<a href="\/kalendar\/">Календар 2026<\/a>/);
  assert.match(dayPage, /href=\{`\/kalendar\/\$\{previous\.date\}\/`\}/);
  assert.match(dayPage, /href=\{`\/kalendar\/\$\{next\.date\}\/`\}/);
});
