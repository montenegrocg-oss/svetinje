import { loadVisiblePlaces } from "../../src/lib/content/publication.ts";
import { loadVisibleNews } from "../../src/lib/content/news.ts";
import { categoryForPlaceType } from "../../src/lib/place-filters.ts";

export const STATIC_HTML_ROUTES = Object.freeze([
  "index.html",
  "svetinje/index.html",
  "manastiri/index.html",
  "crkve/index.html",
  "sveta-mjesta/index.html",
  "o-projektu/index.html",
  "izvori/index.html",
  "novosti/index.html",
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

export function createOutputModel(places, news = []) {
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
  const primaryPlaces = normalizedPlaces.slice(0, 4);
  const continuationPlaces = normalizedPlaces.slice(4);
  const continuationSlots = Array.from(
    { length: Math.max(4, continuationPlaces.length) },
    (_, index) => ({ slot: String(index + 5).padStart(2, "0"), place: continuationPlaces[index] }),
  );
  const newsDetailRoutes = news.flatMap((item) => item.slug ? [{
    item,
    route: `novosti/${item.slug}/index.html`,
  }] : []);

  return {
    places: normalizedPlaces,
    staticRoutes: [...STATIC_HTML_ROUTES],
    detailRoutes,
    news: [...news],
    newsDetailRoutes,
    allExpectedRoutes: [
      ...STATIC_HTML_ROUTES,
      ...detailRoutes.map(({ route }) => route),
      ...newsDetailRoutes.map(({ route }) => route),
    ],
    expectedPageCount: STATIC_HTML_ROUTES.length + normalizedPlaces.length + newsDetailRoutes.length,
    categoryMembership,
    placesById: new Map(normalizedPlaces.map((place) => [place.id, place])),
    markerPlaces: normalizedPlaces.filter(hasCoordinates),
    mediaPlaces: normalizedPlaces.filter((place) => typeof place.previewImageSrc === "string"),
    primaryPlaces,
    continuationPlaces,
    continuationSlots,
    primaryPlaceCount: primaryPlaces.length,
    continuationRealCount: continuationPlaces.length,
    continuationPlaceholderCount: Math.max(0, 4 - continuationPlaces.length),
    expectedRealRelatedCount,
    expectedRelatedPlaceholderCount: 4 - expectedRealRelatedCount,
  };
}

export async function createOutputExpectations(root, { editorialPreview }) {
  const places = await loadVisiblePlaces(root, { editorialPreview });
  const news = await loadVisibleNews(root, { editorialPreview, visiblePlaces: places });
  return createOutputModel(places, news);
}
