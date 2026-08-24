import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  FAVORITES_CHANGE_EVENT,
  FAVORITES_STORAGE_KEY,
  addFavorite,
  getFavoriteCount,
  getFavoriteIds,
  isFavorite,
  normalizeFavoriteIds,
  parseFavoriteIds,
  removeFavorite,
  subscribeFavorites,
  toggleFavorite,
} from "../src/lib/favorites.ts";
import { resolveFavoritePlaces } from "../src/lib/favorite-place-resolution.ts";
import { routeConfig } from "../src/i18n/config.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

function storageEvent(key, newValue) {
  const event = new Event("storage");
  Object.defineProperties(event, {
    key: { value: key },
    newValue: { value: newValue },
  });
  return event;
}

test("Favorites storage normalizes untrusted values without changing deterministic order", () => {
  assert.deepEqual(normalizeFavoriteIds(undefined), []);
  assert.deepEqual(normalizeFavoriteIds({ ids: ["a"] }), []);
  assert.deepEqual(normalizeFavoriteIds([" a ", "a", 1, null, true, "", "  ", "b"]), ["a", "b"]);
  assert.deepEqual(parseFavoriteIds(null), []);
  assert.deepEqual(parseFavoriteIds("not-json"), []);
  assert.deepEqual(parseFavoriteIds("null"), []);
  assert.deepEqual(parseFavoriteIds('{"id":"a"}'), []);
  assert.deepEqual(parseFavoriteIds('["a","a","b"]'), ["a", "b"]);
});

test("Favorites add, remove, toggle, membership, and count store only unique canonical IDs", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(getFavoriteIds(storage), []);
  assert.equal(getFavoriteCount(storage), 0);
  assert.deepEqual(addFavorite("place-a", storage), ["place-a"]);
  assert.deepEqual(addFavorite("place-a", storage), ["place-a"]);
  assert.deepEqual(addFavorite("place-b", storage), ["place-a", "place-b"]);
  assert.equal(isFavorite("place-a", storage), true);
  assert.equal(getFavoriteCount(storage), 2);
  assert.deepEqual(toggleFavorite("place-a", storage), ["place-b"]);
  assert.deepEqual(toggleFavorite("place-a", storage), ["place-b", "place-a"]);
  assert.deepEqual(removeFavorite("place-b", storage), ["place-a"]);
  assert.deepEqual(removeFavorite("missing", storage), ["place-a"]);
  assert.equal(storage.getItem(FAVORITES_STORAGE_KEY), '["place-a"]');
});

test("Favorites storage read and write failures fail closed without throwing", () => {
  const readFailure = { getItem() { throw new Error("blocked"); }, setItem() {} };
  const writeFailure = {
    getItem() { return '["existing"]'; },
    setItem() { throw new Error("quota"); },
  };
  assert.deepEqual(getFavoriteIds(readFailure), []);
  assert.deepEqual(addFavorite("new", readFailure), []);
  assert.deepEqual(addFavorite("new", writeFailure), ["existing"]);
  assert.deepEqual(removeFavorite("existing", writeFailure), ["existing"]);
});

test("Favorites notify same-tab subscribers and normalize cross-tab storage events", () => {
  const storage = new MemoryStorage();
  const target = new EventTarget();
  const updates = [];
  const unsubscribe = subscribeFavorites((ids) => updates.push(ids), { storage, target });

  addFavorite("place-a", storage, target);
  assert.deepEqual(updates, [["place-a"]]);
  target.dispatchEvent(storageEvent(FAVORITES_STORAGE_KEY, '["place-b","place-b",1]'));
  assert.deepEqual(updates.at(-1), ["place-b"]);
  target.dispatchEvent(storageEvent("unrelated", '["ignored"]'));
  assert.equal(updates.length, 2);
  target.dispatchEvent(storageEvent(FAVORITES_STORAGE_KEY, "malformed"));
  assert.deepEqual(updates.at(-1), []);

  unsubscribe();
  target.dispatchEvent(new Event(FAVORITES_CHANGE_EVENT));
  assert.equal(updates.length, 3);
});

test("Favorites resolution preserves add order and cannot escape the supplied public-discovery inventory", () => {
  const publicMonastery = { id: "public-monastery", placeType: "monastery", name: "Public monastery" };
  const publicChurch = { id: "public-church", placeType: "church", name: "Public church" };
  const excludedType = { id: "excluded-other", placeType: "other", name: "Excluded" };
  const allowedInventory = [publicMonastery, publicChurch, excludedType];

  assert.deepEqual(
    resolveFavoritePlaces(["public-church", "unknown", "private-monastery", "excluded-other", "public-monastery"], allowedInventory),
    [publicChurch, publicMonastery],
  );
});

test("Header activates the existing heart, keeps count lightweight, and preserves Calendar Today navigation", async () => {
  const header = await source("src/components/Header.astro");
  assert.match(header, /<a class="favourites-control" href=\{favoritesRoot\}/);
  assert.match(header, /data-favorites-label=\{copy\.favorites\.collectionLabel\}/);
  assert.match(header, /link\.setAttribute\("aria-label"/);
  assert.equal((header.match(/<span data-favorites-count/g) ?? []).length, 2);
  assert.match(header, /getFavoriteIds/);
  assert.match(header, /subscribeFavorites\(render\)/);
  assert.match(header, /header\.dataset\.favoritesInitialised/);
  assert.doesNotMatch(header, /favourites-control" type="button" disabled/);
  assert.doesNotMatch(header, /loadVisiblePlaces|selectPublicDiscoveryPlaces/);
  assert.match(header, /data-calendar-today-link=\{locale === "sr"/);
  assert.match(header, /calendarNavigationHref\(new Date\(\)\)/);
  assert.equal(routeConfig.favorites.sr, "/omiljeno/");
  assert.equal(routeConfig.favorites.ru, "/ru/izbrannoe/");
  assert.equal(routeConfig.favorites.en, "/en/favorites/");
});

test("Favorites pages use production-visible discovery data, existing cards, and client-aware states", async () => {
  const [page, srRoute, localizedPage, copy] = await Promise.all([
    source("src/components/FavoritesPage.astro"),
    source("src/pages/omiljeno/index.astro"),
    source("src/components/LocalizedPublicPage.astro"),
    source("src/i18n/public-copy.ts"),
  ]);
  assert.match(page, /loadVisiblePlaces\(\)/);
  assert.match(page, /loadLocalizedVisiblePlaces\(locale\)/);
  assert.match(page, /resolveFavoritePlaces\(inventory\.map\(\(place\) => place\.id\), inventory\)/);
  assert.match(page, /<PlaceCard place=\{place\}/);
  assert.match(page, /data-favorites-empty/);
  assert.match(page, /data-favorites-grid/);
  assert.match(page, /data-favorite-remove=\{place\.id\}/);
  assert.match(page, /ids\.flatMap/);
  assert.match(page, /grid\?\.append\(item\)/);
  assert.match(page, /removeFavorite/);
  assert.match(srRoute, /<FavoritesPage locale="sr"/);
  assert.match(localizedPage, /page === "favorites" && <FavoritesPage locale=\{locale\}/);
  assert.match(copy, /Омиљене светиње/);
  assert.match(copy, /Избранные святыни/);
  assert.match(copy, /Favourite holy places/);
});

test("Place detail Favorites toggle carries canonical identity and accessible synchronized states", async () => {
  const hero = await source("src/components/place-detail/PlaceDetailHero.astro");
  assert.match(hero, /data-favorite-id=\{place\.id\}/);
  assert.match(hero, /data-favorite-toggle/);
  assert.match(hero, /aria-pressed="false"/);
  assert.match(hero, /aria-label=\{detailCopy\.addFavorite\}/);
  assert.match(hero, /toggleFavorite/);
  assert.match(hero, /subscribeFavorites\(render\)/);
  assert.match(hero, /button\.setAttribute\("aria-pressed", String\(active\)\)/);
  assert.match(hero, /active \? removeLabel : addLabel/);
});
