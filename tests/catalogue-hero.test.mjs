import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { routeConfig } from "../src/i18n/config.ts";
import { publicCopy } from "../src/i18n/public-copy.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("all monastery and church catalogue kinds suppress the duplicate visual hero", async () => {
  const [page, catalogue] = await Promise.all([
    source("src/components/CataloguePage.astro"),
    source("src/components/CategoryCatalogue.astro"),
  ]);

  assert.match(page, /type CataloguePageKind = "monasteries" \| "maleMonasteries" \| "femaleMonasteries" \| "churches"/);
  assert.match(page, /<CategoryCatalogue[\s\S]*?showHero=\{false\}/);
  assert.doesNotMatch(page, /const showHero/);
  assert.match(catalogue, /\{showHero && \([\s\S]*?<header class="page-hero compact category-page-hero">/);
  assert.match(catalogue, /<h2 id="catalogue-main-title">\{copy\.allHeading\}<\/h2>/);
  assert.match(catalogue, /data-catalogue-result-status/);
  assert.match(catalogue, /<aside class="catalogue-sidebar"/);
});

test("Serbian monastery subcategory routes retain their exact community scopes", async () => {
  const [monasteries, male, female, churches] = await Promise.all([
    source("src/pages/manastiri/index.astro"),
    source("src/pages/manastiri/muski/index.astro"),
    source("src/pages/manastiri/zenski/index.astro"),
    source("src/pages/crkve/index.astro"),
  ]);

  assert.match(monasteries, /page="monasteries" category="monasteries"/);
  assert.match(male, /page="maleMonasteries" category="monasteries" monasticCommunity="male"/);
  assert.match(female, /page="femaleMonasteries" category="monasteries" monasticCommunity="female"/);
  assert.match(churches, /page="churches" category="churches"/);
});

test("Russian and English subcategory routes use the same hero-less catalogue contract", async () => {
  const localizedPage = await source("src/components/LocalizedPublicPage.astro");

  assert.deepEqual(routeConfig.maleMonasteries, {
    sr: "/manastiri/muski/",
    ru: "/ru/monastyri/muzhskie/",
    en: "/en/monasteries/men/",
  });
  assert.deepEqual(routeConfig.femaleMonasteries, {
    sr: "/manastiri/zenski/",
    ru: "/ru/monastyri/zhenskie/",
    en: "/en/monasteries/women/",
  });
  assert.match(localizedPage, /const community = page === "maleMonasteries" \? "male" : page === "femaleMonasteries" \? "female" : undefined/);
  assert.match(localizedPage, /<CataloguePage locale=\{locale\}[\s\S]*?monasticCommunity=\{community\}/);
});

test("hero removal preserves catalogue copy and SEO metadata descriptions", async () => {
  const page = await source("src/components/CataloguePage.astro");

  assert.match(page, /title=\{metadataTitle \?\? copy\.title\}/);
  assert.match(page, /description=\{metadataDescription \?\? copy\.description\}/);
  assert.match(page, /heading=\{copy\.title\}/);
  assert.match(page, /catalogueHeading=\{copy\.listTitle\}/);

  for (const locale of ["sr", "ru", "en"]) {
    for (const kind of ["monasteries", "maleMonasteries", "femaleMonasteries", "churches"]) {
      const copy = publicCopy[locale].pages.catalogues[kind];
      assert.ok(copy.title.length > 0, `${locale}/${kind} title must remain available`);
      assert.ok(copy.listTitle.length > 0, `${locale}/${kind} list heading must remain available`);
      assert.ok(copy.description.length > 0, `${locale}/${kind} metadata description must remain available`);
    }
  }
});

test("monastic community filtering remains ahead of catalogue rendering", async () => {
  const catalogue = await source("src/components/CategoryCatalogue.astro");

  assert.match(catalogue, /const places = category === "monasteries"[\s\S]*?selectMonasticCommunityPlaces\(categoryPlaces, monasticCommunity\)/);
  assert.ok(catalogue.indexOf("selectMonasticCommunityPlaces(categoryPlaces, monasticCommunity)") < catalogue.indexOf("const relevantAreaIds"));
  assert.match(catalogue, /data-monastic-community=\{monasticCommunity\}/);
});
