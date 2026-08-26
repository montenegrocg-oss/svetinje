import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publicCopy } from "../src/i18n/public-copy.ts";
import {
  buildRouteCatalogueSearchText,
  formatRouteResultCount,
  isRouteDifficultyFilter,
  matchesRouteCatalogueFilters,
} from "../src/lib/route-catalogue.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const items = [
  { searchText: buildRouteCatalogueSearchText({ title: "Румија до Свете Тројице", summary: "Планинска стаза", endpointLabels: ["Бар"] }), difficulty: "moderate" },
  { searchText: buildRouteCatalogueSearchText({ title: "Лака приморска рута", summary: "Кратка шетња", endpointLabels: ["Будва"] }), difficulty: "easy" },
  { searchText: buildRouteCatalogueSearchText({ title: "Захтјевни успон", summary: "Дуга каменита стаза", endpointLabels: ["Острог"] }), difficulty: "demanding" },
];

const filtered = (query, difficulty) => items.filter((item) => matchesRouteCatalogueFilters(item, query, difficulty));

test("route catalogue combines publication-safe search text with every difficulty filter", () => {
  assert.equal(filtered("", "easy").length, 1);
  assert.equal(filtered("", "moderate").length, 1);
  assert.equal(filtered("", "demanding").length, 1);
  assert.deepEqual(filtered("Румија", "all"), [items[0]]);
  assert.deepEqual(filtered("план", "moderate"), [items[0]]);
  assert.equal(filtered("Румија", "easy").length, 0);
  assert.deepEqual(filtered("Буд", "all"), [items[1]]);
});

test("route result count is dynamic and naturally localized", () => {
  assert.equal(formatRouteResultCount(1, "sr"), "Пронађена је 1 рута");
  assert.equal(formatRouteResultCount(2, "sr"), "Пронађене су 2 руте");
  assert.equal(formatRouteResultCount(5, "sr"), "Пронађено је 5 рута");
  assert.equal(formatRouteResultCount(11, "sr"), "Пронађено је 11 рута");
  assert.equal(formatRouteResultCount(21, "sr"), "Пронађена је 21 рута");
  assert.equal(formatRouteResultCount(1, "ru"), "Найден 1 маршрут");
  assert.equal(formatRouteResultCount(2, "ru"), "Найдено 2 маршрута");
  assert.equal(formatRouteResultCount(5, "ru"), "Найдено 5 маршрутов");
  assert.equal(formatRouteResultCount(1, "en"), "Found 1 route");
  assert.equal(formatRouteResultCount(2, "en"), "Found 2 routes");
});

test("route difficulty accepts only the canonical filter IDs", () => {
  for (const value of ["all", "easy", "moderate", "demanding"]) assert.equal(isRouteDifficultyFilter(value), true);
  for (const value of ["hard", "", null, undefined]) assert.equal(isRouteDifficultyFilter(value), false);
});

test("route index reuses the place-catalogue composition without the old hero or pills", async () => {
  const [component, css] = await Promise.all([
    source("src/components/RouteCataloguePage.astro"),
    source("src/styles/global.css"),
  ]);
  assert.doesNotMatch(component, /route-catalogue-hero|class="route-filters"|data-route-filter=/);
  assert.doesNotMatch(css, /\.route-catalogue-hero|\.route-filters/);
  assert.match(component, /class="section category-catalogue route-catalogue"/);
  assert.match(component, /class="category-catalogue__body category-catalogue__body--sidebar route-catalogue__body"/);
  assert.match(component, /class="catalogue-sidebar route-catalogue__sidebar"/);
  assert.match(component, /class="catalogue-toolbar route-catalogue__toolbar"/);
  assert.match(component, /<h1 id="route-list-title">\{copy\.list\}<\/h1>/);
  assert.match(component, /data-route-result-status role="status" aria-live="polite"/);
  assert.match(component, /data-route-search/);
  assert.match(component, /data-route-difficulty-filter/);
  assert.match(component, /data-route-filter-empty hidden role="status" aria-live="polite"/);
  assert.match(component, /data-route-reset/);
  assert.match(css, /\.route-catalogue__grid\s*\{[^}]*display:\s*grid;[^}]*list-style:\s*none;/s);
});

test("route catalogue URL state hydrates safely and supports history navigation", async () => {
  const component = await source("src/components/RouteCataloguePage.astro");
  assert.match(component, /url\.searchParams\.get\("difficulty"\)/);
  assert.match(component, /url\.searchParams\.get\("q"\)/);
  assert.match(component, /!isRouteDifficultyFilter\(rawDifficulty\)/);
  assert.match(component, /history\[replace \? "replaceState" : "pushState"\]/);
  assert.match(component, /window\.addEventListener\("popstate", handlePopState\)/);
  assert.match(component, /matchesRouteCatalogueFilters/);
});

test("route catalogue copy has matching Serbian, Russian, and English controls", () => {
  assert.deepEqual(
    [publicCopy.sr.pages.routes.list, publicCopy.ru.pages.routes.list, publicCopy.en.pages.routes.list],
    ["Доступне руте", "Доступные маршруты", "Available routes"],
  );
  assert.deepEqual(
    [publicCopy.sr.pages.routes.searchPlaceholder, publicCopy.ru.pages.routes.searchPlaceholder, publicCopy.en.pages.routes.searchPlaceholder],
    ["Претражите руте...", "Найти маршрут...", "Search routes..."],
  );
  for (const locale of ["sr", "ru", "en"]) {
    assert.ok(publicCopy[locale].pages.routes.difficultyLabel);
    assert.ok(publicCopy[locale].pages.routes.filteredEmpty);
  }
});

test("route catalogue remains loader-driven and homepage Popular Routes remains separate", async () => {
  const [indexPage, localizedPage, component, popularRoutes, homePage] = await Promise.all([
    source("src/pages/rute/index.astro"),
    source("src/components/LocalizedPublicPage.astro"),
    source("src/components/RouteCataloguePage.astro"),
    source("src/components/PopularRoutes.astro"),
    source("src/components/HomePage.astro"),
  ]);
  assert.match(indexPage, /loadVisibleRoutes\(\)/);
  assert.match(indexPage, /<RouteCataloguePage routes=\{routes\}/);
  assert.match(localizedPage, /page === "routes" && <RouteCataloguePage locale=\{locale\} routes=\{\[\]\}/);
  assert.doesNotMatch(component, /readFile|readdir|loadVisibleRoutes/);
  assert.match(popularRoutes, /<RouteCard route=\{route\} compact \/>/);
  assert.match(homePage, /loadVisibleRoutes/);
  assert.match(homePage, /<MapExplorer places=\{places\} routes=\{routes\}/);
});
