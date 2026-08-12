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
} from "../src/lib/category-catalogue.ts";
import {
  buildCatalogueSearchText,
  matchesCatalogueSearch,
} from "../src/lib/catalogue-search.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(PROJECT_ROOT, file), "utf8");
}

test("the shared place-type mapping implements every approved filter category", () => {
  assert.deepEqual(PLACE_FILTER_IDS, ["all", "monasteries", "churches", "holy-places", "routes"]);
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
    assert.equal(matchesPlaceFilter(placeType, "holy-places"), true);
  }
  assert.equal(matchesPlaceFilter("monastery", "all"), true);
  assert.equal(matchesPlaceFilter("monastery", "routes"), false);
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

test("homepage sidebar preview paginates matched places two at a time", () => {
  const places = Array.from({ length: 25 }, (_, index) => ({
    id: `place-${index + 1}`,
    category: index % 2 === 0 ? "monasteries" : "churches",
    searchText: index === 9 ? "манастир острог" : `мјесто ${index + 1}`,
  }));
  const fiveMatches = places.slice(0, 5);
  const searchMatches = places.filter((place) => place.searchText.includes("острог"));

  assert.equal(HOMEPAGE_PREVIEW_LIMIT, 2);
  assert.equal(pageCountForHomepagePreview(5), 3);
  assert.equal(pageCountForHomepagePreview(2), 1);
  assert.equal(pageCountForHomepagePreview(1), 1);
  assert.equal(pageCountForHomepagePreview(0), 0);
  assert.deepEqual(paginateHomepagePreview(fiveMatches, 1).pagePlaces.map(({ id }) => id), ["place-1", "place-2"]);
  assert.deepEqual(paginateHomepagePreview(fiveMatches, 2).pagePlaces.map(({ id }) => id), ["place-3", "place-4"]);
  assert.deepEqual(paginateHomepagePreview(fiveMatches, 3).pagePlaces.map(({ id }) => id), ["place-5"]);
  assert.deepEqual(searchMatches.map(({ id }) => id), ["place-10"]);
  assert.deepEqual(paginateHomepagePreview(searchMatches, 1).pagePlaces, searchMatches);
  assert.equal(pageForHomepagePreviewPlace(places, places[9]), 5);
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

test("the explorer keeps one shared filter state across cards, controls, and map markers", async () => {
  const [explorer, sidebar, card, mapCanvas, filters, controls] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/MapControls.astro"),
  ]);

  assert.match(card, /data-place-category=\{category \?\? ""\}/);
  assert.match(mapCanvas, /category: categoryForPlaceType\(place\.placeType\)/);
  assert.match(mapCanvas, /button\.dataset\.placeCategory = place\.category \?\? ""/);
  assert.match(explorer, /const matchesCategory = activeFilter === "all" \|\| card\.dataset\.placeCategory === activeFilter/);
  assert.match(explorer, /const matchesSearch = matchesCatalogueSearch\(card\.dataset\.placeSearch \?\? "", query\)/);
  assert.match(explorer, /new CustomEvent\("svetinje:filter-change"/);
  assert.match(explorer, /new CustomEvent\("svetinje:place-visibility-change"/);
  assert.match(explorer, /const initialPlaces = places\.slice\(0, HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /const inventoryPlaces = places\.slice\(HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /<ExplorerSidebar places=\{initialPlaces\} totalPlaces=\{places\.length\} \/>/);
  assert.match(explorer, /data-explorer-card-pool hidden/);
  assert.match(explorer, /matchedCards = placeCards\.filter/);
  assert.match(explorer, /paginateHomepagePreview\(matchedCards, currentPage\)/);
  assert.match(explorer, /previewCards\.forEach/);
  assert.match(explorer, /if \(resetSelection\)[\s\S]*?currentPage = 1/);
  assert.match(explorer, /applyExplorerState\(true\)/);
  assert.match(explorer, /const visibleIds = matchedCards\.map/);
  assert.match(explorer, /paginationPrev\?\.addEventListener\("click"/);
  assert.match(explorer, /paginationNext\?\.addEventListener\("click"/);
  assert.match(explorer, /pageForHomepagePreviewPlace\(matchedCards, selectedCard\)/);
  assert.match(explorer, /selectedPlaceId = event\.detail\.id;[\s\S]*?renderPreview\(\)/);
  assert.match(explorer, /selectedPlaceId = null;[\s\S]*?renderPreview\(\)/);
  assert.match(sidebar, /data-homepage-pagination/);
  assert.match(sidebar, /data-homepage-pagination-prev/);
  assert.match(sidebar, /data-homepage-pagination-status/);
  assert.match(sidebar, /data-homepage-pagination-next/);
  assert.doesNotMatch(sidebar, /data-explorer-catalogue-link/);
  assert.doesNotMatch(sidebar, /Све светиње —/);
  assert.doesNotMatch(explorer, /innerHTML/);
  assert.doesNotMatch(explorer, /ExplorerContinuation|ExplorerPagination|ResizeObserver|continuation|--explorer-continuation-height/);
  assert.match(mapCanvas, /window\.addEventListener\("svetinje:filter-change", handleFilterChange\)/);
  assert.match(mapCanvas, /window\.addEventListener\("svetinje:place-visibility-change", handlePlaceVisibilityChange\)/);
  assert.match(mapCanvas, /button\.hidden = !visible/);
  assert.match(filters, /id: "all"/);
  assert.match(controls, /data-filter="all" aria-pressed="true"/);
  assert.match(controls, /<InterfaceIcon name="grid" size=\{18\} \/><span>Све<\/span>/);
  assert.ok(
    controls.indexOf('data-filter="all"') < controls.indexOf('data-filter="monasteries"'),
    "the map all filter must appear before monasteries",
  );
  assert.match(controls, /data-filter="monasteries"/);
  assert.match(controls, /data-filter="monasteries" aria-pressed="false"/);
  assert.match(controls, /data-filter="churches" aria-pressed="false"/);
  assert.match(controls, /data-filter="holy-places" aria-pressed="false"/);
  assert.match(controls, /data-filter="routes" aria-pressed="false"/);
  const routeBuilder = controls.match(/<button[^>]*data-notice-trigger="route-notice"[^>]*>/)?.[0];
  assert.ok(routeBuilder, "the route builder action must remain present");
  assert.doesNotMatch(routeBuilder, /data-filter=/);
});

test("filtering has accessible preview feedback and catalogue pagination remains reusable", async () => {
  const [explorer, sidebar, catalogue, pagination, styles] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/CategoryCatalogue.astro"),
    source("src/components/ExplorerPagination.astro"),
    source("src/styles/global.css"),
  ]);

  assert.match(sidebar, /data-explorer-no-results hidden role="status" aria-live="polite"/);
  assert.match(explorer, /Поклоничке руте су у припреми/);
  assert.match(explorer, /Нема храмова у овом приказу/);
  assert.match(explorer, /Нема светих мјеста у овом приказу/);
  assert.match(explorer, /Нема резултата/);
  assert.match(explorer, /Нема записа за изабрани филтер\./);
  assert.match(explorer, /Приказана су \$\{shown\} од \$\{matched\} резултата\. \$\{pageCopy\}/);
  assert.match(explorer, /Страница \$\{currentPage\} од \$\{totalPages\}/);
  assert.match(explorer, /document\.addEventListener\("astro:before-swap"/);
  assert.match(explorer, /window\.removeEventListener\("svetinje:place-select", handlePlaceSelection\)/);
  assert.match(styles, /\.explorer-no-results\s*\{/);
  assert.match(styles, /\.map-explorer__content\s*\{[\s\S]*?align-items: start/);
  assert.match(sidebar, /aria-label="Странице прегледа светиња"/);
  assert.match(sidebar, /aria-label="Претходна страница"/);
  assert.match(sidebar, /aria-label="Сљедећа страница"/);
  assert.match(catalogue, /data-catalogue-search/);
  assert.match(catalogue, /data-catalogue-area/);
  assert.match(catalogue, /data-catalogue-result-status role="status" aria-live="polite"/);
  assert.match(catalogue, /data-catalogue-featured-item/);
  assert.match(catalogue, /<ExplorerPagination totalPlaces=\{cataloguePlaces\.length\} \/>/);
  assert.match(catalogue, /matchedItems = items\.filter/);
  assert.match(catalogue, /currentPage = 1;[\s\S]*?renderPage\(1\)/);
  assert.match(catalogue, /pagination\.hidden = totalPages <= 1/);
  assert.match(catalogue, /renderPage\(currentPage - 1\)/);
  assert.match(catalogue, /renderPage\(currentPage \+ 1\)/);
  assert.match(pagination, /aria-label="Претходна страница"/);
  assert.match(pagination, /aria-label="Сљедећа страница"/);
  assert.match(pagination, /aria-current=\{page === 1 \? "page" : undefined\}/);
  assert.match(styles, /\.explorer-pagination button\s*\{[\s\S]*?min-width: 2\.75rem;[\s\S]*?min-height: 2\.75rem;/);
  assert.doesNotMatch(styles, /explorer-continuation|--explorer-continuation-height/);
});
