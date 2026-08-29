import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  eparchyOptionsFor,
  municipalityOptionsFor,
  placeTaxonomyCatalogueHref,
  placeTaxonomyLabel,
} from "../src/i18n/place-taxonomy.ts";
import {
  isPlaceEparchyId,
  isPlaceMunicipalityId,
  PLACE_EPARCHIES,
  PLACE_MUNICIPALITIES,
} from "../src/lib/place-taxonomy.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public taxonomy options derive the complete canonical registry in every locale", () => {
  assert.equal(PLACE_EPARCHIES.length, 4);
  assert.equal(PLACE_MUNICIPALITIES.length, 25);
  for (const locale of ["sr", "ru", "en"]) {
    const eparchies = eparchyOptionsFor(locale);
    const municipalities = municipalityOptionsFor(locale);
    assert.deepEqual(eparchies.map(({ id }) => id), PLACE_EPARCHIES.map(({ id }) => id));
    assert.deepEqual(municipalities.map(({ id }) => id), PLACE_MUNICIPALITIES.map(({ id }) => id));
    assert.ok(eparchies.every(({ label }) => label.trim()));
    assert.ok(municipalities.every(({ label }) => label.trim()));
  }
  assert.equal(isPlaceEparchyId("mitropolija-crnogorsko-primorska"), true);
  assert.equal(isPlaceEparchyId("unknown-eparchy"), false);
  assert.equal(isPlaceMunicipalityId("budva"), true);
  assert.equal(isPlaceMunicipalityId("unknown-municipality"), false);
});

test("localized taxonomy labels and card catalogue links use stable exact query parameters", () => {
  assert.equal(placeTaxonomyLabel("sr", "municipality", "budva"), "Будва");
  assert.equal(placeTaxonomyLabel("ru", "municipality", "budva"), "Будва");
  assert.equal(placeTaxonomyLabel("en", "municipality", "budva"), "Budva");
  assert.equal(placeTaxonomyLabel("en", "eparchy", "mitropolija-crnogorsko-primorska"), "Metropolitanate of Montenegro and the Littoral");
  assert.equal(placeTaxonomyLabel("en", "municipality", "unknown"), undefined);
  assert.equal(placeTaxonomyCatalogueHref("sr", "monasteries", "eparchy", "eparhija-milesevska"), "/manastiri/?eparchy=eparhija-milesevska");
  assert.equal(placeTaxonomyCatalogueHref("ru", "monasteries", "municipality", "niksic"), "/ru/monastyri/?municipality=niksic");
  assert.equal(placeTaxonomyCatalogueHref("en", "churches", "municipality", "budva"), "/en/churches/?municipality=budva");
  assert.equal(placeTaxonomyCatalogueHref("en", undefined, "municipality", "budva"), undefined);
});

test("monastery and church catalogues share one combined taxonomy filter state", async () => {
  const [catalogue, toolbar, card, publication, localizedPublication, styles] = await Promise.all([
    source("src/components/CategoryCatalogue.astro"),
    source("src/components/CatalogueToolbar.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/lib/content/publication.ts"),
    source("src/lib/content/localized-publication.ts"),
    source("src/styles/global.css"),
  ]);

  assert.match(catalogue, /const usesSidebarCatalogue = forceSidebar \|\| category === "monasteries" \|\| category === "churches"/);
  assert.match(catalogue, /eparchyOptionsFor\(locale\)/);
  assert.match(catalogue, /municipalityOptionsFor\(locale\)/);
  assert.match(toolbar, /data-catalogue-eparchy/);
  assert.match(toolbar, /data-catalogue-municipality/);
  assert.match(toolbar, /copy\.catalogueTaxonomy\.allEparchies/);
  assert.match(toolbar, /copy\.catalogueTaxonomy\.allMunicipalities/);
  assert.match(catalogue, /data-place-eparchy=\{place\.eparchyId \?\? ""\}/);
  assert.match(catalogue, /data-place-municipality=\{place\.municipalityId \?\? ""\}/);
  assert.match(catalogue, /!eparchyId \|\| item\.dataset\.placeEparchy === eparchyId/);
  assert.match(catalogue, /!municipalityId \|\| item\.dataset\.placeMunicipality === municipalityId/);
  assert.match(catalogue, /query, areaId, eparchyId, municipalityId/);
  assert.match(catalogue, /currentPage = 1;[\s\S]*?renderPage\(1\)/);

  assert.match(publication, /eparchyId\?: string/);
  assert.match(publication, /municipalityId\?: string/);
  assert.match(publication, /isPlaceEparchyId\(place\.ecclesiastical\?\.authority_id\?\.value\)/);
  assert.match(publication, /isPlaceMunicipalityId\(place\.location\?\.municipality_id\?\.value\)/);
  assert.match(localizedPublication, /\.\.\.localeNeutralPlace/);
  assert.doesNotMatch(catalogue, /content\/places|readFile/);

  assert.match(card, /editorial-place-card__taxonomy/);
  assert.match(card, /placeTaxonomyCatalogueHref\(locale, category, item\.kind, item\.id\)/);
  assert.match(card, /place\.municipalityId \? undefined : place\.municipality/);
  assert.ok(card.indexOf("editorial-place-card__taxonomy") < card.indexOf("editorial-place-card__link"));
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar\s*\{[\s\S]*?flex-direction: column/);
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar__eparchy/);
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar__municipality/);
  assert.match(styles, /\.catalogue-toolbar input,[\s\S]*?\.catalogue-toolbar select\s*\{[\s\S]*?width: 100%/);
});

test("taxonomy URL hydration is shareable, cleans invalid values, supports history, and resets fully", async () => {
  const catalogue = await source("src/components/CategoryCatalogue.astro");
  assert.match(catalogue, /url\.searchParams\.get\(key\)/);
  assert.match(catalogue, /if \(value && !validIds\.has\(value\)\)/);
  assert.match(catalogue, /url\.searchParams\.delete\(key\)/);
  assert.match(catalogue, /history\.replaceState/);
  assert.match(catalogue, /history\[replace \? "replaceState" : "pushState"\]/);
  assert.match(catalogue, /window\.addEventListener\("popstate"/);
  assert.match(catalogue, /updateParam\("eparchy", eparchySelect\?\.value \?\? ""\)/);
  assert.match(catalogue, /updateParam\("municipality", municipalitySelect\?\.value \?\? ""\)/);
  assert.match(catalogue, /if \(eparchySelect\) eparchySelect\.value = ""/);
  assert.match(catalogue, /if \(municipalitySelect\) municipalitySelect\.value = ""/);
  assert.match(catalogue, /updateTaxonomyUrl\(\);\s*applyFilters\(\);\s*searchInput\?\.focus\(\)/);
});
