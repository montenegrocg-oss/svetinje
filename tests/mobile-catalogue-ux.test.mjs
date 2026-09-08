import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { publicCopy } from "../src/i18n/public-copy.ts";
import { activeAdvancedFilterCount } from "../src/lib/catalogue-filter-state.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("hero-less monastery and church pages opt into one semantic catalogue H1", async () => {
  const [page, catalogue, monasteries, male, female, churches] = await Promise.all([
    source("src/components/CataloguePage.astro"),
    source("src/components/CategoryCatalogue.astro"),
    source("src/pages/manastiri/index.astro"),
    source("src/pages/manastiri/muski/index.astro"),
    source("src/pages/manastiri/zenski/index.astro"),
    source("src/pages/crkve/index.astro"),
  ]);

  assert.match(page, /showHero=\{false\}[\s\S]*?catalogueHeadingLevel=\{1\}[\s\S]*?mobileFilterDisclosure=\{true\}/);
  assert.match(catalogue, /catalogueHeadingLevel = 2/);
  assert.match(catalogue, /const CatalogueHeading = catalogueHeadingLevel === 1 \? "h1" : "h2"/);
  assert.match(catalogue, /<CatalogueHeading id="catalogue-main-title" aria-describedby="catalogue-result-status">/);
  assert.match(catalogue, /\{showHero && \([\s\S]*?<h1>\{heading\}<\/h1>/);
  assert.match(monasteries, /page="monasteries"/);
  assert.match(male, /page="maleMonasteries"/);
  assert.match(female, /page="femaleMonasteries"/);
  assert.match(churches, /page="churches"/);
});

test("sidebar catalogue DOM orders heading and live count before search and results", async () => {
  const catalogue = await source("src/components/CategoryCatalogue.astro");
  const heading = catalogue.indexOf('data-catalogue-heading');
  const sidebar = catalogue.indexOf('<aside class="catalogue-sidebar"');
  const main = catalogue.indexOf('<section class="catalogue-main"');

  assert.ok(heading > 0 && heading < sidebar && sidebar < main);
  assert.match(catalogue, /id="catalogue-result-status"[\s\S]*?data-catalogue-result-status role="status" aria-live="polite"/);
  assert.match(catalogue, /\{!usesMobileCatalogueLayout && \([\s\S]*?<CatalogueHeading id="catalogue-main-title">/);
  assert.match(catalogue, /if \(mainSection\) mainSection\.hidden = matchedItems\.length === 0/);
});

test("mobile toolbar keeps search outside a controlled advanced-filter panel", async () => {
  const toolbar = await source("src/components/CatalogueToolbar.astro");
  const search = toolbar.indexOf('class="catalogue-toolbar__search"');
  const toggle = toolbar.indexOf('data-catalogue-filter-toggle');
  const panel = toolbar.indexOf('data-catalogue-advanced-filters');

  assert.ok(search > 0 && search < toggle && toggle < panel);
  assert.match(toolbar, /<button[\s\S]*?type="button"[\s\S]*?aria-expanded="false"[\s\S]*?aria-controls=\{advancedFiltersId\}/);
  assert.match(toolbar, /data-catalogue-advanced-filters[\s\S]*?data-catalogue-area[\s\S]*?data-catalogue-eparchy[\s\S]*?data-catalogue-municipality[\s\S]*?catalogue-toolbar__actions/);
  assert.match(toolbar, /copy\.filterToggle/);
});

test("mobile filter-toggle copy is localized through the shared public copy layer", () => {
  assert.equal(publicCopy.sr.filterToggle, "Филтери");
  assert.equal(publicCopy.ru.filterToggle, "Фильтры");
  assert.equal(publicCopy.en.filterToggle, "Filters");
});

test("advanced filter count excludes search and category scope", () => {
  assert.equal(activeAdvancedFilterCount({}), 0);
  assert.equal(activeAdvancedFilterCount({ municipalityId: "budva" }), 1);
  assert.equal(activeAdvancedFilterCount({ eparchyId: "mitropolija-crnogorsko-primorska", municipalityId: "budva" }), 2);
  assert.equal(activeAdvancedFilterCount({ areaId: "budva-pastrovici", eparchyId: "mitropolija-crnogorsko-primorska", municipalityId: "budva" }), 3);
});

test("badge synchronizes through filtering, URL hydration, popstate, and reset", async () => {
  const catalogue = await source("src/components/CategoryCatalogue.astro");

  assert.match(catalogue, /activeAdvancedFilterCount\(\{[\s\S]*?areaId:[\s\S]*?eparchyId:[\s\S]*?municipalityId:/);
  assert.match(catalogue, /filterCount\.textContent = String\(activeCount\)/);
  assert.match(catalogue, /filterCount\.hidden = activeCount === 0/);
  assert.match(catalogue, /const applyFilters = \(\) => \{[\s\S]*?updateAdvancedFilterCount\(\)/);
  assert.match(catalogue, /window\.addEventListener\("popstate", \(\) => \{ syncTaxonomyFromUrl\(\); applyFilters\(\); \}\)/);
  assert.match(catalogue, /syncTaxonomyFromUrl\(\);\s*applyFilters\(\);/);
  assert.match(catalogue, /if \(areaSelect\) areaSelect\.value = ""[\s\S]*?if \(eparchySelect\) eparchySelect\.value = ""[\s\S]*?if \(municipalitySelect\) municipalitySelect\.value = ""/);
});

test("mobile disclosure is collapsed, accessible, and desktop-safe", async () => {
  const [catalogue, styles] = await Promise.all([
    source("src/components/CategoryCatalogue.astro"),
    source("src/styles/global.css"),
  ]);

  assert.match(catalogue, /setAdvancedFiltersOpen\(filterToggle\.getAttribute\("aria-expanded"\) !== "true"\)/);
  assert.match(catalogue, /filterToggle\.setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(styles, /@media \(max-width: 47\.99rem\)[\s\S]*?\[data-mobile-filter-disclosure\][\s\S]*?\.catalogue-toolbar__advanced\s*\{\s*display: none;/);
  assert.match(styles, /\[data-mobile-filters-open="true"\][\s\S]*?\.catalogue-toolbar__advanced\s*\{\s*display: flex;/);
  assert.match(styles, /\.catalogue-toolbar__filter-toggle[\s\S]*?min-height: 2\.75rem/);
  assert.match(styles, /\.catalogue-toolbar__filter-toggle:focus-visible[\s\S]*?outline: 3px solid var\(--gold\)/);
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar__advanced\s*\{[\s\S]*?display: flex/);
});

test("desktop grid keeps heading and results beside the sticky sidebar", async () => {
  const styles = await source("src/styles/global.css");

  assert.match(styles, /@media \(min-width: 68rem\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\) clamp\(18rem, 25vw, 22rem\)/);
  assert.match(styles, /"heading sidebar"[\s\S]*?"main sidebar"[\s\S]*?"empty sidebar"/);
  assert.match(styles, /\.catalogue-sidebar\s*\{[\s\S]*?position: sticky;[\s\S]*?top: 6\.25rem;/);
});

test("non-place sidebar catalogues do not opt into mobile filter disclosure", async () => {
  const [feast, page] = await Promise.all([
    source("src/components/FeastCataloguePage.astro"),
    source("src/components/CataloguePage.astro"),
  ]);

  assert.match(feast, /forceSidebar=\{true\}/);
  assert.doesNotMatch(feast, /mobileFilterDisclosure/);
  assert.match(page, /mobileFilterDisclosure=\{true\}/);
  assert.match(await source("src/components/CategoryCatalogue.astro"), /const usesMobileCatalogueLayout = usesSidebarCatalogue && mobileFilterDisclosure/);
});
