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
  CONTINUATION_PLACES_PER_PAGE,
  paginatePlaces,
  pageCountForPlaces,
  pageForPlace,
  PLACES_PER_PAGE,
  PRIMARY_PLACES_PER_PAGE,
} from "../src/lib/explorer-pagination.ts";

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

test("the explorer pagination model derives compact four-plus-four pages", () => {
  const places = Array.from({ length: 25 }, (_, index) => ({ id: `place-${index + 1}` }));

  assert.equal(PLACES_PER_PAGE, 8);
  assert.equal(PRIMARY_PLACES_PER_PAGE, 4);
  assert.equal(CONTINUATION_PLACES_PER_PAGE, 4);
  assert.equal(pageCountForPlaces(8), 1);
  assert.equal(pageCountForPlaces(9), 2);
  assert.equal(pageCountForPlaces(25), 4);

  const expectedDistributions = [[4, 4], [4, 4], [4, 4], [1, 0]];
  expectedDistributions.forEach(([primaryCount, continuationCount], index) => {
    const page = paginatePlaces(places, index + 1);
    assert.equal(page.totalPages, 4);
    assert.equal(page.primaryPlaces.length, primaryCount);
    assert.equal(page.continuationPlaces.length, continuationCount);
    assert.ok(page.primaryPlaces.length + page.continuationPlaces.length <= 8);
  });

  assert.equal(pageForPlace(places, places[9]), 2);
  assert.equal(pageForPlace(places, places[24]), 4);
});

test("filtered explorer records are compactly paginated after full-inventory matching", () => {
  const places = Array.from({ length: 25 }, (_, index) => ({
    id: `place-${index + 1}`,
    category: index % 2 === 0 ? "monasteries" : "churches",
    searchText: index === 9 ? "манастир острог" : `мјесто ${index + 1}`,
  }));
  const searchMatches = places.filter((place) => place.searchText.includes("острог"));
  const monasteryMatches = places.filter((place) => place.category === "monasteries");

  assert.deepEqual(searchMatches.map(({ id }) => id), ["place-10"]);
  assert.deepEqual(paginatePlaces(searchMatches, 1).primaryPlaces, searchMatches);
  assert.equal(pageCountForPlaces(monasteryMatches.length), 2);
  assert.deepEqual(
    paginatePlaces(monasteryMatches, 2).primaryPlaces.map(({ id }) => id),
    monasteryMatches.slice(8, 12).map(({ id }) => id),
  );
  assert.equal(paginatePlaces(monasteryMatches, 2).continuationPlaces.length, 1);
});

test("the explorer keeps one shared filter state across cards, controls, and map markers", async () => {
  const [explorer, card, mapCanvas, filters, controls] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/MapControls.astro"),
  ]);

  assert.match(card, /data-place-category=\{category \?\? ""\}/);
  assert.match(mapCanvas, /category: categoryForPlaceType\(place\.placeType\)/);
  assert.match(mapCanvas, /button\.dataset\.placeCategory = place\.category \?\? ""/);
  assert.match(explorer, /const matchesCategory = activeFilter === "all" \|\| card\.dataset\.placeCategory === activeFilter/);
  assert.match(explorer, /const matchesSearch = !query \|\| \(card\.dataset\.placeSearch \?\? ""\)\.includes\(query\)/);
  assert.match(explorer, /new CustomEvent\("svetinje:filter-change"/);
  assert.match(explorer, /new CustomEvent\("svetinje:place-visibility-change"/);
  assert.match(explorer, /new ResizeObserver\(syncContinuationHeight\)/);
  assert.match(explorer, /const initialPage = paginatePlaces\(places, 1\)/);
  assert.match(explorer, /const inventoryPlaces = places\.slice\(PLACES_PER_PAGE\)/);
  assert.match(explorer, /<ExplorerSidebar places=\{initialPage\.primaryPlaces\} totalPlaces=\{places\.length\} \/>/);
  assert.match(explorer, /<ExplorerContinuation places=\{initialPage\.continuationPlaces\} \/>/);
  assert.match(explorer, /data-explorer-card-pool hidden/);
  assert.match(explorer, /matchedCards = placeCards\.filter/);
  assert.match(explorer, /const page = paginatePlaces\(matchedCards, currentPage\)/);
  assert.match(explorer, /page\.primaryPlaces\.forEach/);
  assert.match(explorer, /page\.continuationPlaces\.forEach/);
  assert.match(explorer, /if \(resetPage\) currentPage = 1/);
  assert.match(explorer, /applyExplorerState\(true\)/);
  assert.match(explorer, /const visibleIds = matchedCards\.map/);
  assert.match(explorer, /const selectedPage = selectedCard \? pageForPlace\(matchedCards, selectedCard\) : null/);
  assert.match(explorer, /currentPage = selectedPage;[\s\S]*?renderCurrentPage\(\)/);
  assert.doesNotMatch(explorer, /innerHTML/);
  assert.match(explorer, /sidebarBottom - continuationTop/);
  assert.match(explorer, /\[data-testid='recommended-places'\]/);
  assert.match(explorer, /\[data-testid='popular-routes'\]/);
  assert.match(explorer, /\[data-testid='explorer-continuation'\]/);
  assert.match(explorer, /continuationResizeObserver\?\.observe\(explorerSidebar\)/);
  assert.match(explorer, /continuationResizeObserver\?\.observe\(recommendedShelf\)/);
  assert.match(explorer, /continuationResizeObserver\?\.observe\(routesShelf\)/);
  assert.doesNotMatch(explorer, /continuationResizeObserver\?\.observe\(continuationShelf\)/);
  assert.match(explorer, /--explorer-continuation-height/);
  assert.doesNotMatch(explorer, /--explorer-bottom-clearance|--explorer-sidebar-clearance|syncSidebarClearance/);
  assert.match(explorer, /continuationResizeObserver\?\.disconnect\(\)/);
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

test("filtering has accessible no-result feedback and lifecycle cleanup", async () => {
  const [explorer, sidebar, continuation, pagination, styles] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/ExplorerContinuation.astro"),
    source("src/components/ExplorerPagination.astro"),
    source("src/styles/global.css"),
  ]);

  assert.match(sidebar, /data-explorer-no-results hidden role="status" aria-live="polite"/);
  assert.match(explorer, /Поклоничке руте су у припреми/);
  assert.match(explorer, /Нема храмова у овом приказу/);
  assert.match(explorer, /Нема светих мјеста у овом приказу/);
  assert.match(explorer, /Нема резултата/);
  assert.match(explorer, /Нема записа за изабрани филтер\./);
  assert.match(explorer, /document\.addEventListener\("astro:before-swap"/);
  assert.match(explorer, /window\.removeEventListener\("svetinje:place-select", handlePlaceSelection\)/);
  assert.match(styles, /\.explorer-no-results\s*\{/);
  assert.match(styles, /min-height: var\(--explorer-continuation-height, 0px\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(continuation, /Math\.max\(MINIMUM_SLOT_COUNT, places\.length\)/);
  assert.doesNotMatch(continuation, /explorer-continuation-placeholder/);
  assert.match(pagination, /aria-label="Претходна страница"/);
  assert.match(pagination, /aria-label="Сљедећа страница"/);
  assert.match(pagination, /aria-current=\{page === 1 \? "page" : undefined\}/);
  assert.match(styles, /\.explorer-pagination button\s*\{[\s\S]*?min-width: 2\.75rem;[\s\S]*?min-height: 2\.75rem;/);
  assert.doesNotMatch(styles, /--explorer-bottom-clearance|--explorer-sidebar-clearance/);
});
