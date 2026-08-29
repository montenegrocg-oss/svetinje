import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  patronalFeastReferences,
  unresolvedLegacyPatronalFeastNames,
} from "../src/lib/content/feast-registry.ts";
import {
  feastDateLabel,
  feastPath,
  feastPlaceCountLabel,
  selectVisibleFeastCatalogues,
} from "../src/lib/public-feast-catalogues.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");
const registry = {
  schema_version: 1,
  feasts: [
    { id: "fixed", name_sr: "Фиксна слава", legacy_names: ["Фиксна слава 19. децембар"], date: { kind: "fixed", month: 12, day: 19 } },
    { id: "outside-coverage", name_sr: "Рана слава", legacy_names: ["Рана слава 2. јун"], date: { kind: "fixed", month: 6, day: 2 } },
    { id: "movable", name_sr: "Покретна слава", legacy_names: ["Покретна слава"], date: { kind: "movable" } },
    { id: "undated", name_sr: "Слава без датума", legacy_names: ["Слава без датума"] },
  ],
};

const place = (id, placeType, patronalFeastReferences = []) => ({
  id,
  placeType,
  patronalFeastReferences,
});

test("canonical feast projection is safe, deterministic, and wins over legacy data", () => {
  const references = patronalFeastReferences({ patronal_feast_ids: ["fixed", "unknown"], patronal_feasts: [{ name: "Погрешно" }] }, registry);
  assert.deepEqual(references, [{
    id: "fixed",
    name: "Фиксна слава",
    dateKind: "fixed",
    month: 12,
    day: 19,
    calendarPath: "/kalendar/2026-12-19/",
  }]);
  assert.deepEqual(Object.keys(references[0]).sort(), ["calendarPath", "dateKind", "day", "id", "month", "name"]);
});

test("legacy values link only through deterministic registry mappings", () => {
  assert.deepEqual(patronalFeastReferences({ patronal_feasts: [{ name: "Фиксна слава 19. децембар" }] }, registry).map(({ id }) => id), ["fixed"]);
  assert.deepEqual(unresolvedLegacyPatronalFeastNames({ patronal_feasts: [{ name: "Фиксна слава 19. децембар" }, { name: "Непозната слава" }] }, registry), ["Непозната слава"]);
  assert.deepEqual(patronalFeastReferences({ patronal_feast: { name: "Непозната слава" } }, registry), []);
  assert.deepEqual(unresolvedLegacyPatronalFeastNames({ patronal_feast: { name: "Непозната слава" } }, registry), ["Непозната слава"]);
});

test("fixed, movable, and undated display contracts never invent dates", () => {
  const [fixed, outside, movable, undated] = registry.feasts.map((feast) => patronalFeastReferences({ patronal_feast_ids: [feast.id] }, registry)[0]);
  assert.equal(feastDateLabel(fixed), "19. децембар");
  assert.equal(fixed.calendarPath, "/kalendar/2026-12-19/");
  assert.equal(feastDateLabel(outside), "2. јун");
  assert.equal(outside.calendarPath, undefined);
  assert.equal(feastDateLabel(movable), "покретни празник");
  assert.equal(movable.calendarPath, undefined);
  assert.equal(feastDateLabel(undated), undefined);
  assert.equal(undated.calendarPath, undefined);
});

test("feast catalogues are scoped to public discovery, counted, and ordered", () => {
  const refs = registry.feasts.map((feast) => patronalFeastReferences({ patronal_feast_ids: [feast.id] }, registry)[0]);
  const catalogues = selectVisibleFeastCatalogues([
    place("monastery-a", "monastery", [refs[0], refs[2], refs[3]]),
    place("church-b", "church", [refs[0]]),
    place("hidden-holy-place", "holy-spring", [{ id: "hidden", name: "Скривена", dateKind: "undated" }]),
  ]);
  assert.deepEqual(catalogues.map(({ id }) => id), ["fixed", "movable", "undated"]);
  assert.deepEqual(catalogues[0].places.map(({ id }) => id), ["monastery-a", "church-b"]);
  assert.equal(catalogues.some(({ id }) => id === "hidden"), false);
  assert.equal(feastPath("fixed"), "/slave/fixed/");
});

test("Serbian result counts use deterministic public labels", () => {
  assert.equal(feastPlaceCountLabel(1), "1 светиња");
  assert.equal(feastPlaceCountLabel(2), "2 светиње");
  assert.equal(feastPlaceCountLabel(14), "14 светиња");
  assert.equal(feastPlaceCountLabel(21), "21 светиња");
});

test("feast routes reuse the shared catalogue state and remain Serbian-only", async () => {
  const [page, index, detailRoute, indexRoute, placeRoute, practical, catalogue, toolbar, config] = await Promise.all([
    source("src/components/FeastCataloguePage.astro"),
    source("src/components/FeastIndexPage.astro"),
    source("src/pages/slave/[id]/index.astro"),
    source("src/pages/slave/index.astro"),
    source("src/pages/svetinje/[slug].astro"),
    source("src/components/place-detail/PlacePracticalPanel.astro"),
    source("src/components/CategoryCatalogue.astro"),
    source("src/components/CatalogueToolbar.astro"),
    source("src/i18n/config.ts"),
  ]);
  assert.match(detailRoute, /selectVisibleFeastCatalogues\(await loadVisiblePlaces\(\)\)/);
  assert.match(detailRoute, /params: \{ id: feast\.id \}/);
  assert.match(indexRoute, /selectVisibleFeastCatalogues\(await loadVisiblePlaces\(\)\)/);
  assert.match(placeRoute, /const availableFeastIds = selectVisibleFeastCatalogues\(places\)\.map/);
  assert.match(placeRoute, /availableFeastIds=\{availableFeastIds\}/);
  assert.doesNotMatch(practical, /loadVisiblePlaces/);
  assert.match(page, /<CategoryCatalogue[\s\S]*places=\{feast\.places\}[\s\S]*forceSidebar=\{true\}[\s\S]*showMapAction=\{false\}/);
  assert.match(page, /statusPrefix: "Пронађено је"/);
  assert.match(catalogue, /matchesCatalogueSearch/);
  assert.match(catalogue, /&& \(!areaId[\s\S]*&& \(!eparchyId[\s\S]*&& \(!municipalityId/);
  assert.match(catalogue, /currentPage = 1;[\s\S]*renderPage\(1\)/);
  assert.match(toolbar, /data-catalogue-search/);
  assert.match(index, /localeLinks=\{\{ sr: "\/slave\/" \}\}/);
  assert.doesNotMatch(config, /slave:\s*\{\s*sr:[\s\S]*ru:/);
});
