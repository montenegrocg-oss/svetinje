import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadFeastRegistry } from "../src/lib/content/feast-registry.ts";
import { loadVisiblePlaces } from "../src/lib/content/publication.ts";
import {
  patronalFeastDay,
  patronalFeastProjectionDates,
  selectVisibleFeastCatalogues,
} from "../src/lib/public-feast-catalogues.ts";
import { GET, getStaticPaths } from "../src/pages/feast-days/[date].json.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");
const place = (id, name = id) => ({
  id,
  name,
  slug: id,
  placeType: "church",
  typeLabel: "Храм",
  patronalFeastReferences: [],
});
const catalogue = (id, name, places = [place(`${id}-place`)]) => ({
  id,
  name,
  dateKind: "fixed",
  places,
});

test("fixed feast occurrences preserve distinct same-day groups and canonical links", () => {
  const registry = {
    schema_version: 1,
    feasts: [
      { id: "feast-b", name_sr: "Б слава", legacy_names: [], date: { kind: "fixed", month: 8, day: 28 } },
      { id: "feast-a", name_sr: "А слава", legacy_names: [], date: { kind: "fixed", month: 8, day: 28 } },
    ],
  };
  const shared = place("shared", "Заједнички храм");
  const projection = patronalFeastDay(registry, [
    catalogue("feast-b", "Б слава", [shared]),
    catalogue("feast-a", "А слава", [shared]),
  ], "2026-08-28");

  assert.deepEqual(projection.feasts.map(({ id }) => id), ["feast-a", "feast-b"]);
  assert.equal(projection.feasts[0].href, "/slave/feast-a/");
  assert.equal(projection.feasts[0].places[0].href, "/svetinje/shared/");
  assert.equal(projection.feasts[0].places[0].meta, "Храм");
  const upcoming = patronalFeastDay(registry, [
    catalogue("feast-b", "Б слава", [shared]),
    catalogue("feast-a", "А слава", [shared]),
  ], "2026-08-27");
  assert.equal(upcoming.upcoming.date, "2026-08-28");
  assert.deepEqual(upcoming.upcoming.feasts.map(({ id }) => id), ["feast-a", "feast-b"]);
});

test("upcoming search is strict, supports fixed recurrence, and wraps into the next year", () => {
  const registry = {
    schema_version: 1,
    feasts: [
      { id: "today", name_sr: "Данашња", legacy_names: [], date: { kind: "fixed", month: 12, day: 19 } },
      { id: "january", name_sr: "Јануарска", legacy_names: [], date: { kind: "fixed", month: 1, day: 27 } },
    ],
  };
  const catalogues = [catalogue("today", "Данашња"), catalogue("january", "Јануарска")];

  const onFeast = patronalFeastDay(registry, catalogues, "2026-12-19");
  assert.deepEqual(onFeast.feasts.map(({ id }) => id), ["today"]);
  assert.equal(onFeast.upcoming.date, "2027-01-27");
  assert.equal(onFeast.upcoming.dateLabel, "27. јануар 2027.");
  assert.equal(onFeast.upcoming.calendarHref, undefined, "out-of-range recurrence must not invent a Calendar route");

  const beforeFeast = patronalFeastDay(registry, catalogues, "2026-12-18");
  assert.equal(beforeFeast.upcoming.date, "2026-12-19");
  assert.equal(beforeFeast.upcoming.calendarHref, "/kalendar/2026-12-19/");
});

test("movable feasts require explicit future bindings and undated feasts never resolve", () => {
  const registry = {
    schema_version: 1,
    feasts: [
      { id: "bound", name_sr: "Везана", legacy_names: [], date: { kind: "movable" }, calendar_bindings: ["2026-09-05"] },
      { id: "unbound", name_sr: "Невезана", legacy_names: [], date: { kind: "movable" } },
      { id: "undated", name_sr: "Без датума", legacy_names: [] },
    ],
  };
  const catalogues = [catalogue("bound", "Везана"), catalogue("unbound", "Невезана"), catalogue("undated", "Без датума")];

  const before = patronalFeastDay(registry, catalogues, "2026-09-04");
  assert.equal(before.upcoming.date, "2026-09-05");
  assert.deepEqual(before.upcoming.feasts.map(({ id }) => id), ["bound"]);
  assert.equal(before.upcoming.calendarHref, "/kalendar/2026-09-05/");
  assert.deepEqual(patronalFeastDay(registry, catalogues, "2026-09-05").feasts.map(({ id }) => id), ["bound"]);
  assert.equal(patronalFeastDay(registry, catalogues, "2026-09-06").upcoming, undefined);
});

test("empty or excluded inventories fail closed and duplicate place relations are removed", () => {
  const reference = { id: "fixed", name: "Фиксна", dateKind: "fixed", month: 8, day: 28 };
  const visible = { ...place("visible"), patronalFeastReferences: [reference, reference] };
  const catalogues = selectVisibleFeastCatalogues([
    visible,
    { ...place("excluded"), placeType: "holy-spring", patronalFeastReferences: [reference] },
  ]);
  assert.deepEqual(catalogues[0].places.map(({ id }) => id), ["visible"]);
  assert.equal(catalogues[0].places.length, 1);
  assert.deepEqual(patronalFeastDay({ schema_version: 1, feasts: [] }, [], "2026-08-28"), { date: "2026-08-28", feasts: [] });
});

test("actual preview inventory resolves the canonical August 28 groups and hides August 29 today state", async () => {
  const [registry, previewPlaces, productionPlaces] = await Promise.all([
    loadFeastRegistry(ROOT),
    loadVisiblePlaces(ROOT, { editorialPreview: true }),
    loadVisiblePlaces(ROOT, { editorialPreview: false }),
  ]);
  const previewCatalogues = selectVisibleFeastCatalogues(previewPlaces);
  const august28 = patronalFeastDay(registry, previewCatalogues, "2026-08-28");
  const august29 = patronalFeastDay(registry, previewCatalogues, "2026-08-29");

  assert.deepEqual(august28.feasts.map(({ id }) => id), [
    "velika-gospojina",
    "uspenije-presvete-bogorodice-velika-gospojina",
  ]);
  assert.equal(august28.feasts.every((feast) => feast.places.length > 0), true);
  assert.equal(august28.feasts.flatMap((feast) => feast.places).every((entry) => entry.href.startsWith("/svetinje/")), true);
  assert.deepEqual(august29.feasts, []);
  assert.equal(productionPlaces.length, 0, "current publication lock must fail closed");
  assert.deepEqual(patronalFeastDay(registry, selectVisibleFeastCatalogues(productionPlaces), "2026-08-28"), { date: "2026-08-28", feasts: [] });
});

test("daily public endpoint covers 2026 without exposing canonical place records", async () => {
  const dates = patronalFeastProjectionDates();
  assert.equal(dates.length, 365);
  assert.equal(dates[0], "2026-01-01");
  assert.equal(dates.at(-1), "2026-12-31");

  const routes = await getStaticPaths();
  assert.equal(routes.length, 365);
  const response = GET({ props: routes.find((route) => route.params.date === "2026-08-28").props });
  const payload = await response.json();
  assert.deepEqual(Object.keys(payload).sort(), ["date", "feasts"]);
  assert.deepEqual(payload.feasts, []);
  for (const forbidden of ["summary", "narrativeBody", "sourceIds", "sources", "previewStatus", "latitude", "longitude"]) {
    assert.equal(JSON.stringify(payload).includes(forbidden), false);
  }
});

test("Today and Calendar integrations stay SR-only and preserve daily Gospel hydration", async () => {
  const [today, todayHydration, calendarIndex, datedPage, upcomingHydration] = await Promise.all([
    source("src/components/TodayCalendar.astro"),
    source("src/components/TodayCalendarHydration.astro"),
    source("src/components/CalendarIndexPage.astro"),
    source("src/pages/kalendar/[date].astro"),
    source("src/components/UpcomingPatronalFeastsHydration.astro"),
  ]);

  assert.match(today, /locale === "sr" \? <>[\s\S]*data-patronal-feasts-anchor="today"/);
  assert.doesNotMatch(today, /Данас славе/);
  assert.match(today, /process\.env\.EDITORIAL_PREVIEW === "true"/);
  assert.match(todayHydration, /const dateKey = podgoricaDateKey\(new Date\(\)\)[\s\S]*dataset\.previewTodayOverride === "true"/);
  assert.match(todayHydration, /fetch\(`\/feast-days\/\$\{date\}\.json`\)/);
  assert.match(todayHydration, /title: "Данас славе"[\s\S]*feasts: payload\.feasts/);
  assert.match(todayHydration, /fetch\(`\/gospel\/\$\{date\}\.json`\)/);
  assert.match(todayHydration, /renderGospelReadings\(payload\.readings\)/);
  assert.match(calendarIndex, /locale === "sr" && <>[\s\S]*Предстојеће славе/);
  assert.match(upcomingHydration, /podgoricaDateKey\(new Date\(\)\)/);
  assert.match(datedPage, /title="Славе овог дана"[\s\S]*feasts=\{patronalFeasts\.feasts\}/);
  assert.match(datedPage, /patronalFeastDay\(registry, catalogues, day\.date\)/);
});

test("canonical Calendar dataset remains byte-for-byte unchanged", async () => {
  const buffer = await readFile(path.join(ROOT, "data/calendar/2026-08-01_2026-12-31.json"));
  assert.equal(createHash("sha256").update(buffer).digest("hex"), "bab3f91a65c0c3ec3be684db34e1b22af54923a4c31c8bdf391ab8bd951f7a57");
});
