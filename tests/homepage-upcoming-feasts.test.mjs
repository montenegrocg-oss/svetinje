import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { homepageUpcomingFeasts } from "../src/lib/calendar/homepage-patronal-feasts.ts";
import {
  activeHomepagePatronalFeastDate,
  loadPublicPatronalFeastDay,
} from "../src/lib/calendar/patronal-feast-client.ts";

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const place = (id) => ({ id, name: `Светиња ${id}`, href: `/svetinje/${id}/`, meta: "Манастир" });
const group = (id, placeCount) => ({
  id,
  name: `Слава ${id}`,
  href: `/slave/${id}/`,
  places: Array.from({ length: placeCount }, (_, index) => place(`${id}-${index + 1}`)),
});

test("homepage compact model fails closed without an upcoming feast", () => {
  assert.equal(homepageUpcomingFeasts({ date: "2026-08-28", feasts: [] }), undefined);
  assert.equal(homepageUpcomingFeasts({ date: "2026-08-28", feasts: [], upcoming: { date: "2026-08-29", dateLabel: "29. август", feasts: [] } }), undefined);
});

test("homepage compact model keeps canonical links and caps each feast at three places", () => {
  const model = homepageUpcomingFeasts({
    date: "2026-08-28",
    feasts: [],
    upcoming: {
      date: "2026-12-19",
      dateLabel: "19. децембар",
      calendarHref: "/kalendar/2026-12-19/",
      feasts: [group("nikoljdan", 5), group("second-feast", 2)],
    },
  });

  assert.equal(model?.date, "2026-12-19");
  assert.equal(model?.calendarHref, "/kalendar/2026-12-19/");
  assert.deepEqual(model?.feasts.map(({ id }) => id), ["nikoljdan", "second-feast"]);
  assert.deepEqual(model?.feasts[0]?.places.map(({ id }) => id), ["nikoljdan-1", "nikoljdan-2", "nikoljdan-3"]);
  assert.equal(model?.feasts[0]?.href, "/slave/nikoljdan/");
  assert.equal(model?.feasts[0]?.places[0]?.href, "/svetinje/nikoljdan-1/");
  assert.equal(model?.feasts[0]?.totalPlaces, 5);
  assert.equal(model?.feasts[0]?.allPlacesHref, "/slave/nikoljdan/");
  assert.equal(model?.feasts[1]?.places.length, 2);
  assert.equal(model?.feasts[1]?.allPlacesHref, undefined);
});

test("homepage compact model never invents a Calendar link", () => {
  const model = homepageUpcomingFeasts({
    date: "2026-12-31",
    feasts: [],
    upcoming: { date: "2027-01-07", dateLabel: "7. јануар 2027.", feasts: [group("bozic", 1)] },
  });
  assert.equal(model?.calendarHref, undefined);
});

test("homepage Today and Upcoming share one cached feast-day request and preview date", async () => {
  const originalFetch = globalThis.fetch;
  const payload = { date: "2099-08-28", feasts: [] };
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests += 1;
    assert.equal(url, "/feast-days/2099-08-28.json");
    return { ok: true, json: async () => payload };
  };
  try {
    const first = loadPublicPatronalFeastDay("2099-08-28");
    const second = loadPublicPatronalFeastDay("2099-08-28");
    assert.equal(first, second);
    assert.deepEqual(await first, payload);
    assert.deepEqual(await second, payload);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(
    activeHomepagePatronalFeastDate(
      { dataset: { previewTodayOverride: "true" } },
      new Date("2026-01-01T00:30:00Z"),
      "?calendar-date=2026-08-28",
    ),
    "2026-08-28",
  );
});

test("homepage composition is SR-only, route-free, and follows Today", async () => {
  const [home, explorer, hydration, todayHydration, client, calendarIndex, gospelHydration, verifier] = await Promise.all([
    source("src/components/HomePage.astro"),
    source("src/components/MapExplorer.astro"),
    source("src/components/HomepageUpcomingPatronalFeasts.astro"),
    source("src/components/TodayCalendarHydration.astro"),
    source("src/lib/calendar/patronal-feast-client.ts"),
    source("src/components/CalendarIndexPage.astro"),
    source("src/components/TodayCalendarHydration.astro"),
    source("scripts/verify-production-output.mjs"),
  ]);

  assert.doesNotMatch(home, /loadVisibleRoutes|routes=\{routes\}/);
  assert.doesNotMatch(explorer, /PopularRoutes|VisibleRoute/);
  assert.match(explorer, /locale === "sr" && <HomepageUpcomingPatronalFeasts \/>/);
  assert.ok(explorer.indexOf("<TodayCalendar days={calendarDays} locale={locale} />") < explorer.indexOf("<HomepageUpcomingPatronalFeasts />"));
  assert.match(hydration, /activeHomepagePatronalFeastDate\(todayRoot\)/);
  assert.match(hydration, /loadPublicPatronalFeastDay\(activeDate\)/);
  assert.match(todayHydration, /loadPublicPatronalFeastDay\(date\)/);
  assert.equal((client.match(/fetch\(`\/feast-days\/\$\{date\}\.json`\)/g) ?? []).length, 1);
  assert.match(client, /homepageUpcomingFeasts\(payload\)/);
  assert.match(calendarIndex, /<PatronalFeastGroups[\s\S]*feasts=\{patronalFeasts\.upcoming\.feasts\}/);
  assert.doesNotMatch(calendarIndex, /slice\(0,\s*3\)/);
  assert.match(gospelHydration, /fetch\(`\/gospel\/\$\{date\}\.json`\)/);
  assert.doesNotMatch(verifier, /homepage featured routes are missing/);
  assert.match(verifier, /homepage still renders the removed Popular Routes section/);
  assert.match(verifier, /homepage must not render the removed Popular Routes card/);
});
