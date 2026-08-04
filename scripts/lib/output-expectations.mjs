import { loadVisiblePlaces } from "../../src/lib/content/publication.ts";
import { categoryForPlaceType } from "../../src/lib/place-filters.ts";

export const STATIC_HTML_ROUTES = Object.freeze([
  "index.html",
  "svetinje/index.html",
  "manastiri/index.html",
  "crkve/index.html",
  "sveta-mjesta/index.html",
  "o-projektu/index.html",
  "izvori/index.html",
]);

export const CATEGORY_HTML_ROUTES = Object.freeze({
  monasteries: "manastiri/index.html",
  churches: "crkve/index.html",
  "holy-places": "sveta-mjesta/index.html",
});

export const CATEGORY_HREFS = Object.freeze({
  monasteries: "/manastiri/",
  churches: "/crkve/",
  "holy-places": "/sveta-mjesta/",
});

const hasCoordinates = (place) =>
  Number.isFinite(place.latitude) && Number.isFinite(place.longitude);

export function createOutputModel(places) {
  const normalizedPlaces = [...places];
  const categoryMembership = {
    monasteries: [],
    churches: [],
    "holy-places": [],
  };
  const detailRoutes = normalizedPlaces.map((place) => {
    const category = categoryForPlaceType(place.placeType);
    if (!category) throw new Error(`Unsupported place type for ${place.id}: ${place.placeType}`);
    categoryMembership[category].push(place);
    return {
      place,
      category,
      categoryHref: CATEGORY_HREFS[category],
      route: `svetinje/${place.slug}/index.html`,
      hasCoordinates: hasCoordinates(place),
      previewImageSrc: place.previewImageSrc,
    };
  });
  const expectedRealRelatedCount = Math.min(4, Math.max(0, normalizedPlaces.length - 1));

  return {
    places: normalizedPlaces,
    staticRoutes: [...STATIC_HTML_ROUTES],
    detailRoutes,
    allExpectedRoutes: [...STATIC_HTML_ROUTES, ...detailRoutes.map(({ route }) => route)],
    expectedPageCount: STATIC_HTML_ROUTES.length + normalizedPlaces.length,
    categoryMembership,
    placesById: new Map(normalizedPlaces.map((place) => [place.id, place])),
    markerPlaces: normalizedPlaces.filter(hasCoordinates),
    mediaPlaces: normalizedPlaces.filter((place) => typeof place.previewImageSrc === "string"),
    expectedRealRelatedCount,
    expectedRelatedPlaceholderCount: 4 - expectedRealRelatedCount,
  };
}

export async function createOutputExpectations(root, { editorialPreview }) {
  const places = await loadVisiblePlaces(root, { editorialPreview });
  return createOutputModel(places);
}
