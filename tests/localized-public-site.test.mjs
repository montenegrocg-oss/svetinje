import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { routeConfig } from "../src/i18n/config.ts";
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
  assert.equal(ru.length, sr.length);
  assert.equal(en.length, sr.length);
  assert.equal(productionRu.length, 0, "draft Russian narratives must not leak through the production gate");
  assert.equal(productionEn.length, 0, "draft English narratives must not leak through the production gate");
  for (const localized of [...ru, ...en]) {
    const sourcePlace = sr.find((place) => place.id === localized.id);
    assert.ok(sourcePlace);
    assert.equal(localized.placeType, sourcePlace.placeType);
    assert.equal(localized.latitude, sourcePlace.latitude);
    assert.notEqual(localized.slug, sourcePlace.slug);
    assert.ok(localized.catalogueSearchText.includes(localized.name));
    assert.equal(localized.catalogueSearchText.includes(sourcePlace.name), false);
  }
  const slugs = await localizedSlugsForPlace(sr[0].id, ROOT, { editorialPreview: true });
  assert.deepEqual(Object.keys(slugs).sort(), ["en", "ru", "sr"]);
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
  assert.match(localizedPage, /DedicatedMap places=\{places\} locale=\{locale\}/);
  assert.doesNotMatch(localizedPage, /routeFor\(locale, "holyPlaces"\)/);
});
