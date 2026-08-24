import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  PLACE_FILTER_IDS,
  categoryForPlaceType,
  matchesPlaceFilter,
} from "../src/lib/place-filters.ts";
import {
  paginatePlaces,
  pageCountForPlaces,
  PLACES_PER_PAGE,
} from "../src/lib/explorer-pagination.ts";
import {
  HOMEPAGE_PREVIEW_LIMIT,
  pageCountForHomepagePreview,
  pageForHomepagePreviewPlace,
  paginateHomepagePreview,
} from "../src/lib/explorer-preview.ts";
import {
  FEATURED_CATALOGUE_LIMIT,
  selectFeaturedCataloguePlaces,
  selectMonasticCommunityPlaces,
} from "../src/lib/category-catalogue.ts";
import {
  buildCatalogueSearchText,
  matchesCatalogueSearch,
} from "../src/lib/catalogue-search.ts";
import {
  PUBLIC_DISCOVERY_CATEGORIES,
  isPublicDiscoveryPlaceType,
  selectPublicDiscoveryPlaces,
} from "../src/lib/public-place-discovery.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(PROJECT_ROOT, file), "utf8");
}

test("the shared place-type mapping implements every approved filter category", () => {
  assert.deepEqual(PLACE_FILTER_IDS, ["all", "monasteries", "churches", "routes"]);
  for (const placeType of ["monastery", "skete", "hermitage"]) {
    assert.equal(categoryForPlaceType(placeType), "monasteries");
    assert.equal(matchesPlaceFilter(placeType, "monasteries"), true);
  }
  for (const placeType of ["church", "chapel", "cathedral"]) {
    assert.equal(categoryForPlaceType(placeType), "churches");
    assert.equal(matchesPlaceFilter(placeType, "churches"), true);
  }
  for (const placeType of ["holy-spring", "cave", "shrine", "other"]) {
    assert.equal(categoryForPlaceType(placeType), "holy-places");
  }
  assert.equal(matchesPlaceFilter("monastery", "all"), true);
  assert.equal(matchesPlaceFilter("monastery", "routes"), false);
});

test("public discovery includes church taxonomy and preserves canonical holy-place records outside discovery", () => {
  const records = [
    { id: "monastery", placeType: "monastery" },
    { id: "skete", placeType: "skete" },
    { id: "church", placeType: "church" },
    { id: "cathedral", placeType: "cathedral" },
    { id: "holy-spring", placeType: "holy-spring" },
    { id: "shrine", placeType: "shrine" },
  ];

  assert.deepEqual(PUBLIC_DISCOVERY_CATEGORIES, ["monasteries", "churches"]);
  assert.deepEqual(selectPublicDiscoveryPlaces(records).map(({ id }) => id), ["monastery", "skete", "church", "cathedral"]);
  assert.equal(isPublicDiscoveryPlaceType("holy-spring"), false);
  assert.equal(isPublicDiscoveryPlaceType("shrine"), false);
  assert.ok(records.some(({ placeType }) => placeType === "holy-spring"), "selection must not mutate canonical records");
});

test("the catalogue pagination model derives flat eight-place pages", () => {
  const places = Array.from({ length: 25 }, (_, index) => ({ id: `place-${index + 1}` }));

  assert.equal(PLACES_PER_PAGE, 8);
  assert.equal(pageCountForPlaces(8), 1);
  assert.equal(pageCountForPlaces(9), 2);
  assert.equal(pageCountForPlaces(25), 4);

  const expectedPageSizes = [8, 8, 8, 1];
  expectedPageSizes.forEach((pageSize, index) => {
    const page = paginatePlaces(places, index + 1);
    assert.equal(page.totalPages, 4);
    assert.equal(page.pagePlaces.length, pageSize);
    assert.ok(page.pagePlaces.length <= PLACES_PER_PAGE);
  });
});

test("category catalogues feature the first two image-bearing places without changing inventory order", () => {
  const places = [
    { id: "text-1" },
    { id: "image-1", previewImageSrc: "/image-1.webp" },
    { id: "text-2" },
    { id: "image-2", previewImageSrc: "/image-2.webp" },
    { id: "image-3", previewImageSrc: "/image-3.webp" },
  ];

  assert.equal(FEATURED_CATALOGUE_LIMIT, 2);
  assert.deepEqual(selectFeaturedCataloguePlaces(places).map(({ id }) => id), ["image-1", "image-2"]);
  assert.deepEqual(selectFeaturedCataloguePlaces(places.slice(0, 3)).map(({ id }) => id), ["image-1"]);
  assert.deepEqual(selectFeaturedCataloguePlaces([{ id: "text-only" }]), []);
});

test("monastery community scope precedes search and area filters and survives reset", () => {
  const records = [
    { id: "male-coast", placeType: "monastery", monasticCommunity: "male", browseAreaId: "coast", searchText: "манастир савина" },
    { id: "male-central", placeType: "skete", monasticCommunity: "male", browseAreaId: "central", searchText: "мушки скит" },
    { id: "female-coast", placeType: "monastery", monasticCommunity: "female", browseAreaId: "coast", searchText: "женски манастир" },
    { id: "unclassified", placeType: "hermitage", browseAreaId: "coast", searchText: "пустиња" },
    { id: "church", placeType: "church", monasticCommunity: "male", browseAreaId: "coast", searchText: "савина" },
  ];
  const monasteries = records.filter((record) => categoryForPlaceType(record.placeType) === "monasteries");
  const maleScope = selectMonasticCommunityPlaces(monasteries, "male");
  const femaleScope = selectMonasticCommunityPlaces(monasteries, "female");
  const allScope = selectMonasticCommunityPlaces(monasteries);

  assert.deepEqual(allScope.map(({ id }) => id), ["male-coast", "male-central", "female-coast", "unclassified"]);
  assert.deepEqual(maleScope.map(({ id }) => id), ["male-coast", "male-central"]);
  assert.deepEqual(femaleScope.map(({ id }) => id), ["female-coast"]);
  assert.deepEqual(maleScope.filter((record) => matchesCatalogueSearch(record.searchText, "савина")).map(({ id }) => id), ["male-coast"]);
  assert.deepEqual(femaleScope.filter((record) => matchesCatalogueSearch(record.searchText, "савина")), []);
  assert.deepEqual(maleScope.filter((record) => record.browseAreaId === "coast").map(({ id }) => id), ["male-coast"]);
  assert.deepEqual(femaleScope.filter((record) => record.browseAreaId === "central"), []);
  assert.deepEqual(selectMonasticCommunityPlaces(monasteries, "male"), maleScope, "reset must retain the route community scope");
});

test("homepage sidebar preview paginates matched places three at a time", () => {
  const places = Array.from({ length: 25 }, (_, index) => ({
    id: `place-${index + 1}`,
    category: index % 2 === 0 ? "monasteries" : "churches",
    searchText: index === 9 ? "манастир острог" : `мјесто ${index + 1}`,
  }));
  const fiveMatches = places.slice(0, 5);
  const searchMatches = places.filter((place) => place.searchText.includes("острог"));

  assert.equal(HOMEPAGE_PREVIEW_LIMIT, 3);
  assert.equal(pageCountForHomepagePreview(5), 2);
  assert.equal(pageCountForHomepagePreview(3), 1);
  assert.equal(pageCountForHomepagePreview(1), 1);
  assert.equal(pageCountForHomepagePreview(0), 0);
  assert.deepEqual(paginateHomepagePreview(fiveMatches, 1).pagePlaces.map(({ id }) => id), ["place-1", "place-2", "place-3"]);
  assert.deepEqual(paginateHomepagePreview(fiveMatches, 2).pagePlaces.map(({ id }) => id), ["place-4", "place-5"]);
  assert.deepEqual(searchMatches.map(({ id }) => id), ["place-10"]);
  assert.deepEqual(paginateHomepagePreview(searchMatches, 1).pagePlaces, searchMatches);
  assert.equal(pageForHomepagePreviewPlace(places, places[9]), 4);
});

test("catalogue search uses narrow fields and token-prefix matching", () => {
  const catalogueSearchText = buildCatalogueSearchText({
    name: "Манастир Острог",
    alternateNames: ["Острошки манастир"],
    municipality: "Даниловград",
    settlement: "Острог",
    browseAreaLabel: "Острог и средишња Црна Гора",
    summary: "Православни манастир усјечен у стијену.",
    narrativeText: "Историјски помен Подострога није каталошки податак.",
  });

  assert.equal(matchesCatalogueSearch(catalogueSearchText, "Острог"), true);
  assert.equal(matchesCatalogueSearch("Манастир Подострог", "Острог"), false);
  assert.equal(matchesCatalogueSearch(catalogueSearchText, "Ост"), true);
  assert.equal(matchesCatalogueSearch(catalogueSearchText, "Историјски"), false);
  assert.equal(matchesCatalogueSearch(catalogueSearchText, "Данилов"), true);
  assert.equal(matchesCatalogueSearch(catalogueSearchText, "средишња црна"), true);
  assert.equal(matchesCatalogueSearch(catalogueSearchText, "ман ост"), true);
  assert.equal(matchesCatalogueSearch(catalogueSearchText, "ман будва"), false);
});

test("the explorer keeps one shared filter and pagination state across cards, controls, and map markers", async () => {
  const [explorer, sidebar, homepagePagination, card, mapCanvas, filters, controls] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/HomepagePagination.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/MapControls.astro"),
  ]);

  assert.match(card, /data-place-category=\{category \?\? ""\}/);
  assert.match(mapCanvas, /category: categoryForPlaceType\(place\.placeType\)/);
  assert.match(mapCanvas, /link\.dataset\.placeCategory = place\.category \?\? ""/);
  assert.match(explorer, /const matchesCategory = activeFilter === "all" \|\| card\.dataset\.placeCategory === activeFilter/);
  assert.match(explorer, /const matchesSearch = matchesCatalogueSearch\(card\.dataset\.placeSearch \?\? "", query\)/);
  assert.match(explorer, /new CustomEvent\("svetinje:filter-change"/);
  assert.match(explorer, /new CustomEvent\("svetinje:place-visibility-change"/);
  assert.match(explorer, /const discoveryPlaces = selectPublicDiscoveryPlaces\(places\)/);
  assert.match(explorer, /<MapCanvas places=\{discoveryPlaces\} routes=\{routes\} locale=\{locale\} \/>/);
  assert.doesNotMatch(explorer, /discoveryPlaceIds|mapOnlyPlaceIds|data-map-only-place-ids/);
  assert.match(explorer, /const initialPlaces = discoveryPlaces\.slice\(0, HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /const inventoryPlaces = discoveryPlaces\.slice\(HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /<ExplorerSidebar places=\{initialPlaces\} totalPlaces=\{discoveryPlaces\.length\} locale=\{locale\} \/>/);
  assert.match(explorer, /data-explorer-card-pool hidden/);
  assert.match(explorer, /matchedCards = placeCards\.filter/);
  assert.match(explorer, /paginateHomepagePreview\(matchedCards, currentPage\)/);
  assert.match(explorer, /previewCards\.forEach/);
  assert.match(explorer, /if \(resetSelection\)[\s\S]*?currentPage = 1/);
  assert.match(explorer, /applyExplorerState\(true\)/);
  assert.match(explorer, /const visibleIds = matchedCards\.map\(\(card\) => card\.dataset\.placeCard \?\? ""\)/);
  assert.match(explorer, /const paginations = \[\.\.\.\(explorerRoot\?\.querySelectorAll<HTMLElement>\("\[data-homepage-pagination\]"\)/);
  assert.match(explorer, /paginations\.forEach\(\(pagination\) => \{[\s\S]*?previousButton\.disabled = page <= 1;[\s\S]*?nextButton\.disabled = page >= totalPages;[\s\S]*?status\.textContent = `\$\{page\} \/ \$\{totalPages\}`/);
  assert.match(explorer, /paginations\.forEach\(\(pagination\) => \{[\s\S]*?data-homepage-pagination-prev[\s\S]*?currentPage -= 1;[\s\S]*?data-homepage-pagination-next[\s\S]*?currentPage \+= 1/);
  assert.doesNotMatch(explorer, /pageForHomepagePreviewPlace\(matchedCards|selectedPlaceId/);
  assert.equal([...sidebar.matchAll(/<HomepagePagination totalPages=\{totalPages\} position="(top|bottom)" locale=\{locale\} \/>/g)].length, 2);
  assert.match(sidebar, /position="top"[\s\S]*?explorer-results[\s\S]*?position="bottom"/);
  assert.match(homepagePagination, /data-homepage-pagination-position=\{position\}/);
  assert.match(homepagePagination, /data-homepage-pagination-prev/);
  assert.match(homepagePagination, /data-homepage-pagination-status/);
  assert.match(homepagePagination, /data-homepage-pagination-next/);
  assert.doesNotMatch(sidebar, /data-explorer-catalogue-link/);
  assert.doesNotMatch(sidebar, /Све светиње —/);
  assert.doesNotMatch(explorer, /innerHTML/);
  assert.doesNotMatch(explorer, /ExplorerContinuation|ExplorerPagination|ResizeObserver|continuation|--explorer-continuation-height/);
  assert.match(mapCanvas, /window\.addEventListener\("svetinje:filter-change", handleFilterChange\)/);
  assert.match(mapCanvas, /window\.addEventListener\("svetinje:place-visibility-change", handlePlaceVisibilityChange\)/);
  assert.match(mapCanvas, /link\.hidden = !visible/);
  assert.match(filters, /id: "all"/);
  assert.match(controls, /data-filter="all" aria-pressed="true"/);
  assert.match(controls, /<InterfaceIcon name="grid" size=\{18\} \/><span>\{copy\.filters\.all\}<\/span>/);
  assert.ok(
    controls.indexOf('data-filter="all"') < controls.indexOf('data-filter="monasteries"'),
    "the map all filter must appear before monasteries",
  );
  assert.match(controls, /data-filter="monasteries"/);
  assert.match(controls, /data-filter="monasteries" aria-pressed="false"/);
  assert.match(controls, /data-filter="churches" aria-pressed="false"/);
  assert.doesNotMatch(controls, /data-filter="holy-places"|Света мјеста/);
  assert.match(controls, /hasEditorialRoutes && <button[^>]*data-route-toggle aria-pressed="false"/);
  assert.doesNotMatch(controls, /data-filter="routes"/);
  assert.match(explorer, /const filterIds = new Set\(\["all", "monasteries", "churches"\]\)/);
  const routeBuilder = controls.match(/<button[^>]*data-notice-trigger="route-notice"[^>]*>/)?.[0];
  assert.ok(routeBuilder, "the route builder action must remain present");
  assert.doesNotMatch(routeBuilder, /data-filter=/);
});

test("mobile map and panel filters expose distinct responsive sets with one shared state", async () => {
  const [explorer, sidebar, filters, controls, styles] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/MapControls.astro"),
    source("src/styles/global.css"),
  ]);

  for (const filter of ["all", "monasteries", "churches"]) {
    assert.match(controls, new RegExp(`class="map-action" data-filter="${filter}"`));
  }
  assert.doesNotMatch(controls, /data-filter="holy-places"|Света мјеста/);
  assert.match(controls, /data-route-toggle/);
  assert.doesNotMatch(controls, /data-filter="routes"/);
  assert.match(controls, /class="map-action map-route-toggle--mobile"/);
  assert.match(controls, /map-action--primary map-action--mobile-hidden/);
  assert.match(sidebar, /<FilterChips group="catalogue" includeRoutes=\{false\} locale=\{locale\} \/>/);
  assert.match(filters, /includeRoutes \|\| filter\.id !== "routes"/);
  assert.doesNotMatch(filters, /id: "holy-places"|Света мјеста/);

  assert.match(explorer, /const filterButtons = \[\.\.\.document\.querySelectorAll<HTMLButtonElement>\("button\[data-filter\]"\)\]/);
  assert.match(explorer, /filterButtons\.forEach\(\(button\) => \{[\s\S]*?aria-pressed[\s\S]*?activeFilter/);
  assert.match(explorer, /filterButtons\.forEach\(\(button\) => \{[\s\S]*?activeFilter = filter;[\s\S]*?applyExplorerState\(true\)/);

  const mobileRules = styles.match(/@media \(max-width: 47\.99rem\) \{([\s\S]*?)\r?\n  \}\r?\n\r?\n  @media \(min-width: 48rem\)/)?.[1] ?? "";
  assert.match(mobileRules, /\.map-actions\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?overflow: visible/);
  assert.match(mobileRules, /\.map-action--mobile-hidden\s*\{[\s\S]*?display: none/);
  assert.match(mobileRules, /\.explorer-sidebar \.filter-chips\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?overflow: visible/);
  assert.match(mobileRules, /\.map-action\s*\{[\s\S]*?min-height: 2\.75rem/);
  assert.match(mobileRules, /\.explorer-sidebar \.filter-chip\s*\{[\s\S]*?min-height: 2\.75rem/);

  assert.match(styles, /@media \(min-width: 48rem\) and \(max-width: 67\.99rem\)/);
  assert.match(styles, /@media \(min-width: 68rem\)/);
  assert.equal([...styles.matchAll(/\.map-action--mobile-hidden\s*\{[\s\S]*?display: none;[\s\S]*?\}/g)].length, 1);
});

test("filtering has accessible preview feedback and catalogue pagination remains reusable", async () => {
  const [explorer, sidebar, homepagePagination, catalogue, toolbar, pagination, styles] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/HomepagePagination.astro"),
    source("src/components/CategoryCatalogue.astro"),
    source("src/components/CatalogueToolbar.astro"),
    source("src/components/ExplorerPagination.astro"),
    source("src/styles/global.css"),
  ]);

  assert.match(sidebar, /data-explorer-no-results hidden role="status" aria-live="polite"/);
  assert.match(explorer, /noResults: copy\.explorer\.noResults/);
  assert.match(explorer, /const noResultCopy = runtimeCopy\.noResults/);
  assert.doesNotMatch(explorer, /Нема светих мјеста у овом приказу/);
  assert.match(explorer, /resultStatus\.textContent = runtimeCopy\.status\.none/);
  assert.match(explorer, /formatCopy\(runtimeCopy\.status\.many, \{ shown, matched, page: pageCopy \}\)/);
  assert.match(explorer, /formatCopy\(runtimeCopy\.status\.page, \{ current: currentPage, total: totalPages \}\)/);
  assert.match(explorer, /document\.addEventListener\("astro:before-swap"/);
  assert.doesNotMatch(explorer, /svetinje:place-select|svetinje:place-selection-cleared/);
  assert.match(styles, /\.explorer-no-results\s*\{/);
  assert.match(styles, /\.map-explorer__content\s*\{[\s\S]*?align-items: start/);
  assert.match(homepagePagination, /aria-label=\{ariaLabel\}/);
  assert.match(homepagePagination, /aria-label=\{copy\.previous\}/);
  assert.match(homepagePagination, /aria-label=\{copy\.next\}/);
  assert.match(toolbar, /data-catalogue-search/);
  assert.match(toolbar, /data-catalogue-area/);
  assert.match(toolbar, /data-catalogue-reset hidden disabled/);
  assert.match(catalogue, /data-catalogue-result-status role="status" aria-live="polite"/);
  assert.match(catalogue, /data-catalogue-featured-item/);
  assert.match(catalogue, /<ExplorerPagination totalPlaces=\{cataloguePlaces\.length\} locale=\{locale\} \/>/);
  assert.match(catalogue, /matchedItems = items\.filter/);
  assert.match(catalogue, /currentPage = 1;[\s\S]*?renderPage\(1\)/);
  assert.match(catalogue, /button\.hidden = !hasFilters/);
  assert.match(catalogue, /pagination\.hidden = totalPages <= 1/);
  assert.match(catalogue, /renderPage\(currentPage - 1\)/);
  assert.match(catalogue, /renderPage\(currentPage \+ 1\)/);
  assert.match(pagination, /aria-label=\{copy\.homepage\.explorer\.pagination\.previous\}/);
  assert.match(pagination, /aria-label=\{copy\.homepage\.explorer\.pagination\.next\}/);
  assert.match(pagination, /aria-current=\{page === 1 \? "page" : undefined\}/);
  assert.match(pagination, /data-pagination-status[\s\S]*?\{copy\.page\} 1 \{copy\.of\} \{totalPages\}/);
  assert.match(styles, /\.explorer-pagination button\s*\{[\s\S]*?min-width: 2\.75rem;[\s\S]*?min-height: 2\.75rem;/);
  assert.match(styles, /@media \(max-width: 47\.99rem\)[\s\S]*?\.catalogue-pagination\s*\{[\s\S]*?grid-template-columns: 2\.75rem minmax\(0, 1fr\) 2\.75rem;/);
  assert.match(styles, /\.catalogue-pagination \.explorer-pagination__pages\s*\{[\s\S]*?display: none;/);
  assert.match(styles, /\.catalogue-pagination \[data-pagination-previous\][\s\S]*?grid-column: 1;[\s\S]*?\.catalogue-pagination \[data-pagination-status\][\s\S]*?grid-column: 2;[\s\S]*?\.catalogue-pagination \[data-pagination-next\][\s\S]*?grid-column: 3;/);
  assert.doesNotMatch(styles, /explorer-continuation|--explorer-continuation-height/);
});
