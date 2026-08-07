import assert from "node:assert/strict";
import test from "node:test";
import { STATIC_HTML_ROUTES, createOutputModel } from "../scripts/lib/output-expectations.mjs";

const place = (id, placeType, options = {}) => ({
  id,
  slug: `${id}-slug`,
  name: `Мјесто ${id}`,
  summary: "Неутрални тест.",
  placeType,
  typeLabel: "Свето мјесто",
  preview: true,
  narrativeSections: [],
  sourceIds: [],
  sources: [],
  searchText: id,
  ...options,
});

test("four-place output model derives routes, categories, markers, and media", () => {
  const places = [
    place("alpha", "monastery", { latitude: 42.1, longitude: 19.1, previewImageSrc: "/images/alpha.webp" }),
    place("beta", "cathedral", { latitude: 42.2, longitude: 19.2 }),
    place("gamma", "skete"),
    place("delta", "holy-spring", { previewImageSrc: "/images/delta.webp" }),
  ];
  const model = createOutputModel(places);

  assert.equal(model.expectedPageCount, STATIC_HTML_ROUTES.length + 4);
  assert.deepEqual(model.detailRoutes.map(({ route }) => route), places.map(({ slug }) => `svetinje/${slug}/index.html`));
  assert.deepEqual(model.categoryMembership.monasteries.map(({ id }) => id), ["alpha", "gamma"]);
  assert.deepEqual(model.categoryMembership.churches.map(({ id }) => id), ["beta"]);
  assert.deepEqual(model.categoryMembership["holy-places"].map(({ id }) => id), ["delta"]);
  assert.deepEqual(model.markerPlaces.map(({ id }) => id), ["alpha", "beta"]);
  assert.deepEqual(model.mediaPlaces.map(({ id }) => id), ["alpha", "delta"]);
  assert.equal(model.expectedRealRelatedCount, 3);
  assert.equal(model.expectedRelatedPlaceholderCount, 1);
  assert.equal(model.primaryPlaceCount, 4);
  assert.equal(model.continuationRealCount, 0);
  assert.equal(model.continuationPlaceholderCount, 0);
  assert.equal(model.paginationPageCount, 1);
  assert.deepEqual(model.continuationSlots, []);
  assert.deepEqual(model.pooledPlaces, []);
});

test("a fifth place changes every inventory-derived expectation without helper edits", () => {
  const initial = [
    place("alpha", "monastery"),
    place("beta", "church"),
    place("gamma", "chapel"),
    place("delta", "cave"),
  ];
  const fifth = place("epsilon", "hermitage", {
    latitude: 42.5,
    longitude: 19.5,
    previewImageSrc: "/images/epsilon.webp",
  });
  const fourPlaceModel = createOutputModel(initial);
  const fivePlaceModel = createOutputModel([...initial, fifth]);

  assert.equal(fivePlaceModel.expectedPageCount, fourPlaceModel.expectedPageCount + 1);
  assert.ok(fivePlaceModel.allExpectedRoutes.includes("svetinje/epsilon-slug/index.html"));
  assert.ok(fivePlaceModel.categoryMembership.monasteries.some(({ id }) => id === "epsilon"));
  assert.equal(fivePlaceModel.places.length, 5);
  assert.ok(fivePlaceModel.markerPlaces.some(({ id }) => id === "epsilon"));
  assert.ok(fivePlaceModel.mediaPlaces.some(({ previewImageSrc }) => previewImageSrc === "/images/epsilon.webp"));
  assert.equal(fivePlaceModel.expectedRealRelatedCount, 4);
  assert.equal(fivePlaceModel.expectedRelatedPlaceholderCount, 0);
  assert.equal(fivePlaceModel.primaryPlaceCount, 4);
  assert.equal(fivePlaceModel.continuationRealCount, 1);
  assert.equal(fivePlaceModel.continuationPlaceholderCount, 0);
  assert.equal(fivePlaceModel.paginationPageCount, 1);
  assert.deepEqual(fivePlaceModel.pooledPlaces, []);
  assert.equal(fivePlaceModel.continuationSlots[0].slot, "05");
  assert.equal(fivePlaceModel.continuationSlots[0].place.id, "epsilon");
});

test("a place without coordinates or media still has cards and a detail route", () => {
  const record = place("coordinate-free", "other");
  const model = createOutputModel([record]);

  assert.equal(model.places.length, 1);
  assert.deepEqual(model.detailRoutes.map(({ route }) => route), ["svetinje/coordinate-free-slug/index.html"]);
  assert.deepEqual(model.categoryMembership["holy-places"], [record]);
  assert.deepEqual(model.markerPlaces, []);
  assert.deepEqual(model.mediaPlaces, []);
  assert.equal(model.detailRoutes[0].previewImageSrc, undefined);
  assert.equal(model.expectedRealRelatedCount, 0);
  assert.equal(model.expectedRelatedPlaceholderCount, 4);
  assert.equal(model.primaryPlaceCount, 1);
  assert.equal(model.continuationRealCount, 0);
  assert.equal(model.paginationPageCount, 1);
});

test("news routes extend the derived output model without fixed page counts", () => {
  const places = [place("alpha", "monastery")];
  const news = [
    { id: "related-update", href: "/svetinje/alpha-slug/", publishedAt: "2026-01-02T00:00:00Z" },
    { id: "article-update", href: "/novosti/article-update/", slug: "article-update", publishedAt: "2026-01-01T00:00:00Z" },
  ];
  const model = createOutputModel(places, news);

  assert.ok(STATIC_HTML_ROUTES.includes("novosti/index.html"));
  assert.deepEqual(model.newsDetailRoutes.map(({ route }) => route), ["novosti/article-update/index.html"]);
  assert.ok(model.allExpectedRoutes.includes("novosti/article-update/index.html"));
  assert.equal(model.expectedPageCount, STATIC_HTML_ROUTES.length + places.length + 1);
});
