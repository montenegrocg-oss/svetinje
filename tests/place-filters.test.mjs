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
  selectHomepagePreview,
} from "../src/lib/explorer-preview.ts";

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

test("homepage preview is capped at two and can surface a selected matched place", () => {
  const places = Array.from({ length: 25 }, (_, index) => ({
    id: `place-${index + 1}`,
    category: index % 2 === 0 ? "monasteries" : "churches",
    searchText: index === 9 ? "манастир острог" : `мјесто ${index + 1}`,
  }));
  const searchMatches = places.filter((place) => place.searchText.includes("острог"));
  const monasteryMatches = places.filter((place) => place.category === "monasteries");

  assert.equal(HOMEPAGE_PREVIEW_LIMIT, 2);
  assert.deepEqual(searchMatches.map(({ id }) => id), ["place-10"]);
  assert.deepEqual(selectHomepagePreview(searchMatches), searchMatches);
  assert.deepEqual(
    selectHomepagePreview(places, places[9]).map(({ id }) => id),
    ["place-10", "place-1"],
  );
  assert.equal(pageCountForPlaces(monasteryMatches.length), 2);
  assert.deepEqual(
    paginatePlaces(monasteryMatches, 2).pagePlaces.map(({ id }) => id),
    monasteryMatches.slice(8, 13).map(({ id }) => id),
  );
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
  assert.match(explorer, /const initialPlaces = places\.slice\(0, HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /const inventoryPlaces = places\.slice\(HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /<ExplorerSidebar places=\{initialPlaces\} totalPlaces=\{places\.length\} \/>/);
  assert.match(explorer, /data-explorer-card-pool hidden/);
  assert.match(explorer, /matchedCards = placeCards\.filter/);
  assert.match(explorer, /selectHomepagePreview\(matchedCards, selectedCard\)/);
  assert.match(explorer, /previewCards\.forEach/);
  assert.match(explorer, /if \(resetSelection\)/);
  assert.match(explorer, /applyExplorerState\(true\)/);
  assert.match(explorer, /const visibleIds = matchedCards\.map/);
  assert.match(explorer, /selectedPlaceId = event\.detail\.id;[\s\S]*?renderPreview\(\)/);
  assert.match(explorer, /selectedPlaceId = null;[\s\S]*?renderPreview\(\)/);
  assert.doesNotMatch(explorer, /innerHTML/);
  assert.doesNotMatch(explorer, /ExplorerContinuation|ExplorerPagination|paginatePlaces|pageForPlace|currentPage/);
  assert.doesNotMatch(explorer, /ResizeObserver|continuation|--explorer-continuation-height/);
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
  assert.match(explorer, /Приказана су \$\{shown\} од \$\{matched\} резултата\./);
  assert.match(explorer, /document\.addEventListener\("astro:before-swap"/);
  assert.match(explorer, /window\.removeEventListener\("svetinje:place-select", handlePlaceSelection\)/);
  assert.match(styles, /\.explorer-no-results\s*\{/);
  assert.match(styles, /\.map-explorer__content\s*\{[\s\S]*?align-items: start/);
  assert.match(sidebar, /data-explorer-catalogue-link/);
  assert.match(sidebar, /Све светиње — \$\{totalPlaces\}/);
  assert.match(catalogue, /data-catalogue-item hidden=\{index >= PLACES_PER_PAGE\}/);
  assert.match(catalogue, /renderPage\(currentPage - 1\)/);
  assert.match(catalogue, /renderPage\(currentPage \+ 1\)/);
  assert.match(pagination, /aria-label="Претходна страница"/);
  assert.match(pagination, /aria-label="Сљедећа страница"/);
  assert.match(pagination, /aria-current=\{page === 1 \? "page" : undefined\}/);
  assert.match(styles, /\.explorer-pagination button\s*\{[\s\S]*?min-width: 2\.75rem;[\s\S]*?min-height: 2\.75rem;/);
  assert.doesNotMatch(styles, /explorer-continuation|--explorer-continuation-height/);
});
