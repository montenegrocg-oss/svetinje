import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { formatCatalogueCount, formatCatalogueResultCount } from "../src/i18n/catalogue-count.ts";
import { mapLibreLocale } from "../src/i18n/maplibre-locale.ts";
import { localizedCalendarDate, loadCalendarDays } from "../src/lib/calendar/content.ts";
import { derivePlaceAddedNews } from "../src/lib/content/news.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("Serbian catalogue nouns follow 1, 2–4, 5+, and 11–14 rules", () => {
  for (const [count, expected] of [[1, "1 манастир"], [2, "2 манастира"], [5, "5 манастира"], [11, "11 манастира"], [14, "14 манастира"], [21, "21 манастир"]]) {
    assert.equal(formatCatalogueCount(count, "sr", "monasteries"), expected);
  }
  for (const [count, expected] of [[1, "1 црква"], [2, "2 цркве"], [5, "5 цркава"], [11, "11 цркава"], [14, "14 цркава"], [23, "23 цркве"]]) {
    assert.equal(formatCatalogueCount(count, "sr", "churches"), expected);
  }
  assert.equal(formatCatalogueResultCount(1, "sr", "monasteries"), "Пронађено: 1 манастир");
});

test("Russian and English catalogue nouns use locale-appropriate forms", () => {
  for (const [count, expected] of [[1, "1 монастырь"], [2, "2 монастыря"], [5, "5 монастырей"], [11, "11 монастырей"], [22, "22 монастыря"]]) {
    assert.equal(formatCatalogueCount(count, "ru", "monasteries"), expected);
  }
  for (const [count, expected] of [[1, "1 церковь"], [2, "2 церкви"], [5, "5 церквей"], [14, "14 церквей"]]) {
    assert.equal(formatCatalogueCount(count, "ru", "churches"), expected);
  }
  assert.equal(formatCatalogueCount(1, "en", "monasteries"), "1 monastery");
  assert.equal(formatCatalogueCount(2, "en", "monasteries"), "2 monasteries");
  assert.equal(formatCatalogueCount(1, "en", "churches"), "1 church");
  assert.equal(formatCatalogueCount(5, "en", "churches"), "5 churches");
});

test("derived place news titles are gender-neutral for monasteries and churches", () => {
  const base = { createdAt: "2026-08-01T00:00:00Z", preview: true, summary: "", browseAreaId: undefined };
  const places = [
    { ...base, id: "monastery", slug: "monastery", name: "Манастир Острог" },
    { ...base, id: "church", slug: "church", name: "Црква Свете Тројице" },
  ];
  assert.deepEqual(derivePlaceAddedNews(places, "sr").map((item) => item.title).sort(), [
    "Додато у каталог: Манастир Острог",
    "Додато у каталог: Црква Свете Тројице",
  ].sort());
  assert.equal(derivePlaceAddedNews([{ ...places[1], name: "Церковь Святой Троицы" }], "ru")[0]?.title, "Добавлено в каталог: Церковь Святой Троицы");
  assert.equal(derivePlaceAddedNews([{ ...places[0], name: "Ostrog Monastery" }], "en")[0]?.title, "Added to the catalogue: Ostrog Monastery");
});

test("Serbian calendar dates keep lowercase month names and canonical coverage", async () => {
  const [days, css] = await Promise.all([loadCalendarDays(ROOT), source("src/styles/global.css")]);
  assert.equal(localizedCalendarDate("2026-08-28", { day: "numeric", month: "long", year: "numeric" }), "28. август 2026.");
  assert.equal(days.length, 153);
  const calendarTimeRule = css.match(/\.calendar-day__header time\s*\{[^}]*\}/s)?.[0] ?? "";
  assert.doesNotMatch(calendarTimeRule, /text-transform:\s*capitalize/);
});

test("MapLibre controlled strings are Serbian, Russian, and English", () => {
  assert.equal(mapLibreLocale("sr")["NavigationControl.ZoomIn"], "Увећај карту");
  assert.match(mapLibreLocale("sr")["CooperativeGesturesHandler.WindowsHelpText"], /Ctrl/);
  assert.match(mapLibreLocale("sr")["CooperativeGesturesHandler.MobileHelpText"], /два прста/);
  assert.equal(mapLibreLocale("ru")["Popup.Close"], "Закрыть окно");
  assert.match(mapLibreLocale("ru")["CooperativeGesturesHandler.WindowsHelpText"], /Удерживайте Ctrl/);
  assert.equal(mapLibreLocale("en")["NavigationControl.ZoomOut"], "Zoom out");
  assert.equal(mapLibreLocale("en")["Map.Title"], "Interactive map of Montenegro");
});

test("language cleanup preserves protected homepage and privacy behavior", async () => {
  const [copy, gallery, policy] = await Promise.all([
    source("src/i18n/public-copy.ts"),
    source("src/components/place-detail/PlaceDetailGallery.astro"),
    source("validation/publication-policy.json").then(JSON.parse),
  ]);
  assert.match(copy, /Најпосјећеније светиње/);
  assert.doesNotMatch(gallery, /<iframe\b/);
  assert.match(gallery, /document\.createElement\("iframe"\)/);
  assert.equal(policy.public_publication_locked, true);
});
