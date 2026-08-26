import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  localizedStaticRouteKeys,
  routeConfig,
  staticEquivalentForPath,
  staticLocaleLinksForRoute,
} from "../src/i18n/config.ts";
import { loadLocalizedNarrative } from "../src/lib/content/localized-narrative.ts";
import { loadLocalizedVisiblePlaces, localizedSlugsForPlace, translationIsVisible } from "../src/lib/content/localized-publication.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("translation visibility is fail-closed in production and permits working translations only in preview", () => {
  for (const status of ["draft", "in-review", "approved", "published"]) assert.equal(translationIsVisible(status, true), true);
  for (const status of ["source", "missing", "outdated", "archived"]) assert.equal(translationIsVisible(status, true), false);
  for (const status of ["draft", "in-review", "approved", "outdated", "archived"]) assert.equal(translationIsVisible(status, false), false);
  assert.equal(translationIsVisible("published", false), true);
});

test("localized place overlay preserves stable identity while replacing searchable narrative fields", async () => {
  const [sr, ru, en, productionRu, productionEn] = await Promise.all([
    loadLocalizedVisiblePlaces("sr", ROOT, { editorialPreview: true }),
    loadLocalizedVisiblePlaces("ru", ROOT, { editorialPreview: true }),
    loadLocalizedVisiblePlaces("en", ROOT, { editorialPreview: true }),
    loadLocalizedVisiblePlaces("ru", ROOT, { editorialPreview: false }),
    loadLocalizedVisiblePlaces("en", ROOT, { editorialPreview: false }),
  ]);
  assert.equal(productionRu.length, 0, "draft Russian narratives must not leak through the production gate");
  assert.equal(productionEn.length, 0, "draft English narratives must not leak through the production gate");
  const srById = new Map(sr.map((place) => [place.id, place]));
  const localizedInventories = { ru, en };
  for (const [locale, inventory] of Object.entries(localizedInventories)) {
    assert.equal(new Set(inventory.map((place) => place.id)).size, inventory.length);
    assert.equal(inventory.every((place) => srById.has(place.id)), true, `${locale} inventory must be a stable-ID subset of Serbian`);
  }
  for (const localized of [...ru, ...en]) {
    const sourcePlace = srById.get(localized.id);
    assert.ok(sourcePlace);
    const narrative = await loadLocalizedNarrative(ROOT, localized.id, localized.locale);
    assert.ok(narrative);
    assert.equal(localized.placeType, sourcePlace.placeType);
    assert.equal(localized.latitude, sourcePlace.latitude);
    assert.equal(localized.longitude, sourcePlace.longitude);
    assert.equal(localized.createdAt, sourcePlace.createdAt);
    assert.equal(localized.slug, narrative.slug);
    assert.equal(localized.name, narrative.preferredName);
    assert.equal(localized.summary, narrative.summary ?? "");
    assert.equal(localized.narrativeBody, narrative.body);
    assert.ok(localized.catalogueSearchText.includes(localized.name));
  }
  for (const sourcePlace of sr) {
    const expectedSlugs = Object.fromEntries(
      Object.entries({ sr, ru, en }).flatMap(([locale, inventory]) => {
        const place = inventory.find((candidate) => candidate.id === sourcePlace.id);
        return place ? [[locale, place.slug]] : [];
      }),
    );
    assert.deepEqual(
      await localizedSlugsForPlace(sourcePlace.id, ROOT, { editorialPreview: true }),
      expectedSlugs,
    );
  }
});

test("localized route layer exposes exact archives without restoring holy-place discovery", async () => {
  assert.equal(routeConfig.home.ru, "/ru/");
  assert.equal(routeConfig.maleMonasteries.en, "/en/monasteries/men/");
  const [ruRoutes, enRoutes, layout, metadata, switcher, catalogue, localizedPage] = await Promise.all([
    source("src/pages/ru/[...path].astro"), source("src/pages/en/[...path].astro"), source("src/layouts/BaseLayout.astro"),
    source("src/components/PageMetadata.astro"), source("src/components/LanguageSwitcher.astro"), source("src/components/CategoryCatalogue.astro"), source("src/components/LocalizedPublicPage.astro"),
  ]);
  assert.match(ruRoutes, /localizedStaticPaths\("ru"\)/);
  assert.match(enRoutes, /localizedStaticPaths\("en"\)/);
  assert.match(layout, /localeConfig\[locale\]\.htmlLang/);
  assert.match(metadata, /hreflang/);
  assert.match(metadata, /x-default/);
  assert.match(switcher, /destinations\[locale\]/);
  assert.match(catalogue, /places: suppliedPlaces/);
  assert.match(localizedPage, /<MapPage locale=\{locale\} places=\{places\} \/>/);
  assert.doesNotMatch(localizedPage, /routeFor\(locale, "holyPlaces"\)/);
});

test("available static routes expose symmetric Serbian, Russian, and English equivalents", async () => {
  assert.deepEqual(localizedStaticRouteKeys, [
    "home", "monasteries", "maleMonasteries", "femaleMonasteries", "churches",
    "map", "routes", "calendar", "news", "about", "privacy", "cookies", "favorites",
  ]);

  for (const route of ["maleMonasteries", "churches", "map"]) {
    const expected = routeConfig[route];
    assert.deepEqual(staticLocaleLinksForRoute(route), expected);
    for (const path of Object.values(expected)) assert.deepEqual(staticEquivalentForPath(path), expected);
  }

  assert.deepEqual(staticEquivalentForPath("/ru/monastyri/muzhskie/"), {
    sr: "/manastiri/muski/",
    ru: "/ru/monastyri/muzhskie/",
    en: "/en/monasteries/men/",
  });
  assert.deepEqual(staticEquivalentForPath("/en/monasteries/men/"), routeConfig.maleMonasteries);
  assert.equal(staticLocaleLinksForRoute("holyPlaces"), undefined);
  assert.equal(staticLocaleLinksForRoute("sources"), undefined);
  for (const path of [...Object.values(routeConfig.holyPlaces), ...Object.values(routeConfig.sources)]) {
    assert.equal(staticEquivalentForPath(path), undefined);
  }

  const [layout, localizedPage, cataloguePage, mapPage] = await Promise.all([
    source("src/layouts/BaseLayout.astro"), source("src/components/LocalizedPublicPage.astro"),
    source("src/components/CataloguePage.astro"), source("src/components/MapPage.astro"),
  ]);
  assert.match(layout, /staticEquivalentForPath\(canonicalPath\)/);
  assert.doesNotMatch(layout, /Object\.values\(routeConfig\)/);
  assert.match(localizedPage, /<CataloguePage locale=\{locale\}/);
  assert.match(localizedPage, /<MapPage locale=\{locale\}/);
  assert.match(cataloguePage, /canonicalPath=\{routeFor\(locale, page\)\}/);
  assert.match(mapPage, /canonicalPath=\{routeFor\(locale, "map"\)\}/);
});

test("Serbian, Russian, and English home routes share the complete homepage architecture", async () => {
  const [srPage, ruPage, enPage, home, explorer, localizedPage, copy, today, routes, areas, card] = await Promise.all([
    source("src/pages/index.astro"), source("src/pages/ru/index.astro"), source("src/pages/en/index.astro"),
    source("src/components/HomePage.astro"), source("src/components/MapExplorer.astro"), source("src/components/LocalizedPublicPage.astro"),
    source("src/i18n/public-copy.ts"), source("src/components/TodayCalendar.astro"), source("src/components/PopularRoutes.astro"),
    source("src/components/PlaceAreas.astro"), source("src/components/PlaceCard.astro"),
  ]);
  assert.match(srPage, /<HomePage locale="sr" \/>/);
  assert.match(ruPage, /<HomePage locale="ru" \/>/);
  assert.match(enPage, /<HomePage locale="en" \/>/);
  assert.match(home, /loadLocalizedVisiblePlaces\(locale\)/);
  assert.match(home, /<MapExplorer[\s\S]*?locale=\{locale\}/);
  assert.match(home, /<PlaceAreas places=\{places\} locale=\{locale\} \/>/);
  assert.doesNotMatch(localizedPage, /page === "home"|pageCopy\.home/);

  for (const component of ["ExplorerSidebar", "RecommendedPlaces", "TodayCalendar", "PopularRoutes"]) {
    assert.match(explorer, new RegExp(`<${component}[^>]+locale=\\{locale\\}`));
  }
  assert.match(explorer, /data-explorer-copy/);
  assert.match(explorer, /runtimeCopy\.status/);
  assert.doesNotMatch(explorer, /Нема резултата|Нема записа|Приказана су|Страница \$\{currentPage\}/);
  assert.match(copy, /searchPlaceholder: "Поиск по святыням…"/);
  assert.match(copy, /searchPlaceholder: "Search holy places…"/);
  assert.match(card, /placeDetailRoot\[locale\]/);
  assert.match(today, /locale !== "sr"[\s\S]*?copy\.translationTitle/);
  assert.match(today, /locale === "sr" && <TodayCalendarHydration \/>/);
  assert.match(routes, /const featuredRoutes = locale === "sr"/);
  assert.match(areas, /areaLabels\[locale\]/);
  assert.match(areas, /routeFor\(locale, "home"\)/);
});
