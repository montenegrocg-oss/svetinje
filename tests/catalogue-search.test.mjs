import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  buildCatalogueSearchText,
  matchesCatalogueSearch,
  normalizeCatalogueSearchText,
  transliterateSerbianCyrillic,
} from "../src/lib/catalogue-search.ts";
import { loadVisiblePlaces } from "../src/lib/content/publication.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

test("Serbian Cyrillic transliteration covers letters and digraphs deterministically", () => {
  assert.equal(
    transliterateSerbianCyrillic("Абвгдђежзијклљмнњопрстћуфхцчџш"),
    "Abvgdđežzijklljmnnjoprstćufhcčdžš",
  );
  assert.equal(transliterateSerbianCyrillic("Љубав Његош Џин"), "Ljubav Njegoš Džin");
  assert.equal(normalizeCatalogueSearchText("Ђурђеви ЋИРИЛИЦА"), "djurdjevi cirilica");
});

test("catalogue search accepts Cyrillic, Serbian Latin, ASCII Latin, case, and token prefixes", () => {
  const indexedText = buildCatalogueSearchText({
    name: "Цетињски манастир",
    slug: "cetinjski-manastir",
    alternateNames: ["Манастир Рођења Пресвете Богородице"],
    municipality: "Цетиње",
    summary: "Историјско сједиште.",
  });

  for (const query of ["цетиње", "Цетињски манастир", "cetinje", "CETINJE", "Cetinjski manastir", "cetinjski", "cetinjski-manastir", "cetin man"]) {
    assert.equal(matchesCatalogueSearch(indexedText, query), true, query);
  }
  assert.equal(matchesCatalogueSearch(indexedText, "cetinja"), false);
});

test("catalogue search folds Serbian Latin diacritics and Cyrillic digraphs", () => {
  const indexedText = buildCatalogueSearchText({
    name: "Ђурђеви Ступови",
    alternateNames: ["Љубостиња", "Његош", "Џин"],
    municipality: "Никшић",
    settlement: "Жабљак",
    browseAreaLabel: "Морача",
  });

  for (const query of ["nikšić", "niksic", "morača", "moraca", "žabljak", "zabljak", "đurđevi", "djurdjevi", "ljub", "njeg", "džin", "dzin"]) {
    assert.equal(matchesCatalogueSearch(indexedText, query), true, query);
  }
});

test("publication-aware place projection indexes canonical slugs without changing inventory", async () => {
  const places = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  const byId = new Map(places.map((place) => [place.id, place]));
  const expectations = [
    ["cetinjski-manastir", ["cetinje", "cetinjski", "cetinjski-manastir"]],
    ["manastir-moraca", ["morača", "moraca"]],
    ["manastir-ostrog", ["ostrog", "manastir-ostrog"]],
    ["podmaine", ["podmaine", "manastir-podmaine"]],
    ["manastir-djurdjevi-stupovi", ["đurđevi", "djurdjevi"]],
  ];

  for (const [placeId, queries] of expectations) {
    const place = byId.get(placeId);
    assert.ok(place, `${placeId} is available in editorial preview`);
    assert.ok(place.catalogueSearchText.includes(place.slug), `${placeId} slug is projected`);
    for (const query of queries) {
      assert.equal(matchesCatalogueSearch(place.catalogueSearchText, query), true, `${placeId}: ${query}`);
    }
  }
});
