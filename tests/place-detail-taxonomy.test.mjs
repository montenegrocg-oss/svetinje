import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publicCopy } from "../src/i18n/public-copy.ts";
import { placePracticalTaxonomy } from "../src/lib/place-practical-taxonomy.ts";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const regressionChurch = {
  placeType: "church",
  settlement: undefined,
  municipality: "Цетиње",
  municipalityId: "cetinje",
  eparchyId: "mitropolija-crnogorsko-primorska",
  ecclesiasticalJurisdiction: "Митрополија црногорско-приморска",
};

test("canonical municipality and eparchy render together without duplicate legacy values", () => {
  const details = placePracticalTaxonomy(regressionChurch, "sr");
  assert.equal(details.location, "");
  assert.deepEqual(details.municipality, { value: "Цетиње", href: "/crkve/?municipality=cetinje" });
  assert.deepEqual(details.eparchy, {
    value: "Митрополија црногорско-приморска",
    href: "/crkve/?eparchy=mitropolija-crnogorsko-primorska",
  });
  assert.equal(details.legacyJurisdiction, undefined);
});

test("church and monastery taxonomy links use locale-aware catalogue roots", () => {
  const monastery = { ...regressionChurch, placeType: "monastery", municipalityId: "budva", municipality: "Будва" };
  assert.equal(placePracticalTaxonomy(monastery, "sr").municipality?.href, "/manastiri/?municipality=budva");
  assert.equal(placePracticalTaxonomy(monastery, "sr").eparchy?.href, "/manastiri/?eparchy=mitropolija-crnogorsko-primorska");
  assert.equal(placePracticalTaxonomy(regressionChurch, "ru").municipality?.href, "/ru/tserkvi/?municipality=cetinje");
  assert.equal(placePracticalTaxonomy(regressionChurch, "ru").eparchy?.href, "/ru/tserkvi/?eparchy=mitropolija-crnogorsko-primorska");
  assert.equal(placePracticalTaxonomy(monastery, "en").municipality?.href, "/en/monasteries/?municipality=budva");
  assert.equal(placePracticalTaxonomy(monastery, "en").eparchy?.href, "/en/monasteries/?eparchy=mitropolija-crnogorsko-primorska");
});

test("taxonomy labels are localized while stable IDs stay out of visible values", () => {
  assert.equal(placePracticalTaxonomy(regressionChurch, "sr").municipality?.value, "Цетиње");
  assert.equal(placePracticalTaxonomy(regressionChurch, "ru").municipality?.value, "Цетине");
  assert.equal(placePracticalTaxonomy(regressionChurch, "en").municipality?.value, "Cetinje");
  assert.equal(placePracticalTaxonomy(regressionChurch, "sr").eparchy?.value, "Митрополија црногорско-приморска");
  assert.equal(placePracticalTaxonomy(regressionChurch, "ru").eparchy?.value, "Черногорско-Приморская митрополия");
  assert.equal(placePracticalTaxonomy(regressionChurch, "en").eparchy?.value, "Metropolitanate of Montenegro and the Littoral");
});

test("legacy location and jurisdiction remain fallbacks only when canonical taxonomy is absent", () => {
  const legacy = placePracticalTaxonomy({
    placeType: "church",
    settlement: "Стари град",
    municipality: "Будва",
    ecclesiasticalJurisdiction: "Митрополија црногорско-приморска",
  }, "sr");
  assert.equal(legacy.location, "Стари град · Будва");
  assert.equal(legacy.municipality, undefined);
  assert.equal(legacy.eparchy, undefined);
  assert.equal(legacy.legacyJurisdiction, "Митрополија црногорско-приморска");

  const canonicalMunicipality = placePracticalTaxonomy({ ...regressionChurch, settlement: "Стари град" }, "sr");
  assert.equal(canonicalMunicipality.location, "Стари град");
  assert.equal(canonicalMunicipality.location.includes("Цетиње"), false);
});

test("unsupported place types show taxonomy labels without false catalogue URLs", () => {
  const details = placePracticalTaxonomy({ ...regressionChurch, placeType: "holy-place" }, "en");
  assert.deepEqual(details.municipality, { value: "Cetinje" });
  assert.deepEqual(details.eparchy, { value: "Metropolitanate of Montenegro and the Littoral" });
});

test("practical panel keeps non-taxonomy rows and uses localized canonical labels", async () => {
  const [panel, card, styles] = await Promise.all([
    source("src/components/place-detail/PlacePracticalPanel.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/styles/global.css"),
  ]);
  assert.equal(publicCopy.sr.pages.placeDetail.practical.municipality, "Општина");
  assert.equal(publicCopy.sr.pages.placeDetail.practical.eparchy, "Епархија");
  assert.equal(publicCopy.ru.pages.placeDetail.practical.municipality, "Община");
  assert.equal(publicCopy.ru.pages.placeDetail.practical.eparchy, "Епархия");
  assert.equal(publicCopy.en.pages.placeDetail.practical.municipality, "Municipality");
  assert.equal(publicCopy.en.pages.placeDetail.practical.eparchy, "Eparchy");
  assert.match(panel, /placePracticalTaxonomy\(place, locale\)/);
  assert.match(panel, /copy\.municipality/);
  assert.match(panel, /taxonomy\.eparchy \? copy\.eparchy : copy\.jurisdiction/);
  assert.match(panel, /row\.href \? <a class="place-practical-list__taxonomy-link"/);
  for (const preserved of ["copy.address", "place.typeLabel", "place.patronalFeasts", "coordinateText", "PlaceMiniMap"]) {
    assert.match(panel, new RegExp(preserved.replaceAll(".", "\\.")));
  }
  assert.match(card, /placeTaxonomyCatalogueHref\(locale, category, item\.kind, item\.id\)/);
  assert.match(styles, /\.place-practical-list__taxonomy-link/);
  assert.doesNotMatch(panel, /content\/places|place\.ecclesiastical\?\.authority_id|place\.location\?\.municipality_id/);
});
