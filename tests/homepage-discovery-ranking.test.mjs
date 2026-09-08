import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  CATALOGUE_SEARCH_RELEVANCE,
  buildCatalogueSearchText,
  matchesCatalogueSearchFields,
  scoreCatalogueSearch,
} from "../src/lib/catalogue-search.ts";
import { loadVisiblePlaces } from "../src/lib/content/publication.ts";
import { HOMEPAGE_PREVIEW_LIMIT, paginateHomepagePreview } from "../src/lib/explorer-preview.ts";
import {
  HOMEPAGE_DISCOVERY_PRIORITY_IDS,
  MOST_VISITED_PLACE_IDS,
  orderHomepageDiscoveryPlaces,
  rankHomepageDiscoverySearch,
} from "../src/lib/homepage-selections.ts";
import { selectPublicDiscoveryPlaces } from "../src/lib/public-place-discovery.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

function rank(items, query, fieldsById, originalOrderById = new Map(items.map(({ id }, index) => [id, index]))) {
  return rankHomepageDiscoverySearch(items, query, fieldsById, originalOrderById);
}

test("homepage discovery priority is explicit, stable, unique, and syntactically valid", () => {
  assert.equal(HOMEPAGE_DISCOVERY_PRIORITY_IDS.length, 15);
  assert.equal(new Set(HOMEPAGE_DISCOVERY_PRIORITY_IDS).size, HOMEPAGE_DISCOVERY_PRIORITY_IDS.length);
  for (const id of HOMEPAGE_DISCOVERY_PRIORITY_IDS) {
    assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
  assert.equal(HOMEPAGE_PREVIEW_LIMIT, 3);
  assert.deepEqual(MOST_VISITED_PLACE_IDS, [
    "manastir-ostrog",
    "cetinjski-manastir",
    "manastir-moraca",
    "dajbabe",
    "saborni-hram-podgorica",
  ]);
});

test("editorial ordering skips unavailable IDs and preserves every eligible fallback exactly once", () => {
  const inventory = [
    { id: "fallback-b" },
    { id: "saborni-hram-bar" },
    { id: "fallback-a" },
    { id: "podmaine" },
  ];
  const ordered = orderHomepageDiscoveryPlaces(inventory);

  assert.deepEqual(ordered.map(({ id }) => id), [
    "podmaine",
    "saborni-hram-bar",
    "fallback-b",
    "fallback-a",
  ]);
  assert.equal(ordered.length, inventory.length);
  assert.equal(new Set(ordered.map(({ id }) => id)).size, inventory.length);
});

test("one editorial order survives category and area filtering", () => {
  const inventory = [
    { id: "manastir-moraca", category: "monasteries", area: "north" },
    { id: "crkva-na-cipuru", category: "churches", area: "cetinje" },
    { id: "podmaine", category: "monasteries", area: "budva" },
    { id: "saborni-hram-bar", category: "churches", area: "bar" },
    { id: "fallback", category: "churches", area: "budva" },
  ];
  const ordered = orderHomepageDiscoveryPlaces(inventory);

  assert.deepEqual(ordered.filter(({ category }) => category === "monasteries").map(({ id }) => id), [
    "podmaine",
    "manastir-moraca",
  ]);
  assert.deepEqual(ordered.filter(({ category }) => category === "churches").map(({ id }) => id), [
    "saborni-hram-bar",
    "crkva-na-cipuru",
    "fallback",
  ]);
  assert.deepEqual(ordered.filter(({ area }) => area === "budva").map(({ id }) => id), [
    "podmaine",
    "fallback",
  ]);
});

test("search scoring fixes the nine-tier relevance hierarchy", () => {
  const query = "sveti sava";
  const scores = [
    scoreCatalogueSearch({ name: "Свети Сава" }, query),
    scoreCatalogueSearch({ name: "Храм", alternateNames: ["Свети Сава"] }, query),
    scoreCatalogueSearch({ name: "Свети Сава у Тивту" }, query),
    scoreCatalogueSearch({ name: "Храм", alternateNames: ["Свети Сава у Тивту"] }, query),
    scoreCatalogueSearch({ name: "Манастир Свети Сава" }, query),
    scoreCatalogueSearch({ name: "Храм", canonicalId: "sveti-sava" }, query),
    scoreCatalogueSearch({ name: "Храм", settlement: "Свети Сава" }, query),
    scoreCatalogueSearch({ name: "Храм", browseAreaLabel: "Свети Сава" }, query),
    scoreCatalogueSearch({ name: "Свети Никола", summary: "Храм Свети Сава." }, query),
  ];

  assert.deepEqual(scores, [
    CATALOGUE_SEARCH_RELEVANCE.exactName,
    CATALOGUE_SEARCH_RELEVANCE.exactAlternateName,
    CATALOGUE_SEARCH_RELEVANCE.nameStart,
    CATALOGUE_SEARCH_RELEVANCE.alternateNameStart,
    CATALOGUE_SEARCH_RELEVANCE.nameTokens,
    CATALOGUE_SEARCH_RELEVANCE.canonical,
    CATALOGUE_SEARCH_RELEVANCE.location,
    CATALOGUE_SEARCH_RELEVANCE.browseArea,
    CATALOGUE_SEARCH_RELEVANCE.broadText,
  ]);
});

test("search keeps AND semantics and rewards a strong multi-token name match", () => {
  const query = "sveti sava";
  const strongName = { name: "Манастир Свети Сава" };
  const distributed = { name: "Свети Никола", summary: "Задужбина Свети Сава." };

  assert.ok(scoreCatalogueSearch(strongName, query) > scoreCatalogueSearch(distributed, query));
  assert.equal(scoreCatalogueSearch({ name: "Свети Никола", summary: "Манастир" }, query), null);
  assert.equal(matchesCatalogueSearchFields({ name: "Свети Никола", summary: "Сава" }, query), true);
  assert.equal(matchesCatalogueSearchFields({ name: "Свети Никола" }, query), false);
});

test("structured scoring preserves Cyrillic, Latin, ASCII, case, diacritics, and Serbian digraphs", () => {
  const fields = {
    name: "Манастир Ђурђеви Ступови",
    municipality: "Никшић",
    browseAreaLabel: "Морача",
  };

  assert.equal(scoreCatalogueSearch(fields, "Ђурђеви"), scoreCatalogueSearch(fields, "Djurdjevi"));
  assert.equal(scoreCatalogueSearch(fields, "Nikšić"), scoreCatalogueSearch(fields, "NIKSIC"));
  assert.equal(scoreCatalogueSearch(fields, "Morača"), scoreCatalogueSearch(fields, "moraca"));
});

test("active search uses relevance before editorial, original-order, and canonical-ID tie breaks", () => {
  const items = [
    { id: "fallback-z" },
    { id: "saborni-hram-bar" },
    { id: "podmaine" },
    { id: "fallback-a" },
  ];
  const fieldsById = new Map([
    ["fallback-z", { name: "Храм", summary: "Будва" }],
    ["saborni-hram-bar", { name: "Храм", municipality: "Будва" }],
    ["podmaine", { name: "Манастир Будва" }],
    ["fallback-a", { name: "Храм", summary: "Будва" }],
  ]);
  const originalOrder = new Map([
    ["fallback-z", 8],
    ["saborni-hram-bar", 3],
    ["podmaine", 1],
    ["fallback-a", 8],
  ]);

  assert.deepEqual(rank(items, "budva", fieldsById, originalOrder).map(({ id }) => id), [
    "podmaine",
    "saborni-hram-bar",
    "fallback-a",
    "fallback-z",
  ]);
});

test("ranking runs before pagination and filters do not change relative relevance", () => {
  const items = [
    { id: "summary", category: "churches", area: "coast" },
    { id: "location", category: "churches", area: "coast" },
    { id: "exact", category: "monasteries", area: "central" },
    { id: "prefix", category: "churches", area: "coast" },
  ];
  const fieldsById = new Map([
    ["summary", { name: "Храм", summary: "Морача" }],
    ["location", { name: "Храм", settlement: "Морача" }],
    ["exact", { name: "Морача" }],
    ["prefix", { name: "Морача код мора" }],
  ]);
  const ranked = rank(items, "moraca", fieldsById);

  assert.deepEqual(ranked.map(({ id }) => id), ["exact", "prefix", "location", "summary"]);
  assert.deepEqual(paginateHomepagePreview(ranked, 1).pagePlaces.map(({ id }) => id), [
    "exact",
    "prefix",
    "location",
  ]);
  assert.deepEqual(
    rank(items.filter(({ category }) => category === "churches"), "moraca", fieldsById).map(({ id }) => id),
    ["prefix", "location", "summary"],
  );
  assert.deepEqual(
    rank(items.filter(({ area }) => area === "coast"), "moraca", fieldsById).map(({ id }) => id),
    ["prefix", "location", "summary"],
  );
});

test("empty and no-result queries remain explicit and deterministic", () => {
  const editorial = orderHomepageDiscoveryPlaces([
    { id: "fallback" },
    { id: "saborni-hram-bar" },
    { id: "podmaine" },
  ]);
  const fieldsById = new Map(editorial.map(({ id }) => [id, { name: id }]));

  assert.deepEqual(rank(editorial, "", fieldsById), editorial);
  assert.deepEqual(rank(editorial, "   ", fieldsById), editorial);
  assert.deepEqual(rank(editorial, "nema-rezultata", fieldsById), []);
});

test("current preview inventory is gated before ordering and exposes only public-safe search fields", async () => {
  const visiblePlaces = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  const discoveryPlaces = selectPublicDiscoveryPlaces(visiblePlaces);
  const orderedPlaces = orderHomepageDiscoveryPlaces(discoveryPlaces);
  const configured = new Set(HOMEPAGE_DISCOVERY_PRIORITY_IDS);

  assert.deepEqual(orderedPlaces.slice(0, configured.size).map(({ id }) => id), HOMEPAGE_DISCOVERY_PRIORITY_IDS);
  assert.equal(orderedPlaces.length, discoveryPlaces.length);
  assert.equal(new Set(orderedPlaces.map(({ id }) => id)).size, discoveryPlaces.length);
  assert.ok(orderedPlaces.every(({ placeType }) => !["holy-spring", "cave", "shrine", "other"].includes(placeType)));
  for (const place of orderedPlaces) {
    assert.equal(place.catalogueSearchText, buildCatalogueSearchText(place.catalogueSearchFields));
    assert.deepEqual(
      Object.keys(place.catalogueSearchFields).sort(),
      Object.keys(place.catalogueSearchFields).filter((key) => [
        "name",
        "canonicalId",
        "slug",
        "alternateNames",
        "municipality",
        "settlement",
        "browseAreaLabel",
        "summary",
      ].includes(key)).sort(),
    );
  }
  assert.deepEqual(await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: false }), []);
  assert.deepEqual(orderHomepageDiscoveryPlaces(selectPublicDiscoveryPlaces([
    { id: "hidden-compatibility-record", placeType: "holy-spring" },
  ])), []);
});

test("homepage runtime ranks the full filtered set before pagination and dispatches all matched IDs", async () => {
  const explorer = await readFile(path.join(PROJECT_ROOT, "src/components/MapExplorer.astro"), "utf8");

  assert.match(explorer, /const discoveryPlaces = selectPublicDiscoveryPlaces\(places\)/);
  assert.match(explorer, /const orderedDiscoveryPlaces = orderHomepageDiscoveryPlaces\(discoveryPlaces\)/);
  assert.match(explorer, /data-explorer-search-index/);
  assert.match(explorer, /const rankedCards = rankHomepageDiscoverySearch\([\s\S]*?card\.dataset\.placeCard/);
  assert.match(explorer, /matchedCards = rankedCards\.map\(\(\{ card \}\) => card\)/);
  assert.ok(explorer.indexOf("rankHomepageDiscoverySearch(") < explorer.indexOf("const shown = renderPreview()"));
  assert.match(explorer, /const visibleIds = matchedCards\.map\(\(card\) => card\.dataset\.placeCard \?\? ""\)/);
  assert.match(explorer, /new CustomEvent\("svetinje:place-visibility-change", \{ detail: \{ visibleIds \} \}\)/);
  assert.doesNotMatch(explorer, /sourceIds|narrativeBody|searchText:/);
});
