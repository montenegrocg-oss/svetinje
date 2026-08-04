import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  PLACE_FILTER_IDS,
  categoryForPlaceType,
  matchesPlaceFilter,
} from "../src/lib/place-filters.ts";

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
  const [explorer, sidebar, styles] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
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
  assert.doesNotMatch(styles, /--explorer-bottom-clearance|--explorer-sidebar-clearance/);
});
