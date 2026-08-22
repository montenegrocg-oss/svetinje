import { loadVisiblePlaces } from "../../src/lib/content/publication.ts";
import { loadVisibleNews } from "../../src/lib/content/news.ts";
import { categoryForPlaceType } from "../../src/lib/place-filters.ts";
import { selectPublicDiscoveryPlaces } from "../../src/lib/public-place-discovery.ts";
import { paginatePlaces, PLACES_PER_PAGE } from "../../src/lib/explorer-pagination.ts";
import { HOMEPAGE_PREVIEW_LIMIT } from "../../src/lib/explorer-preview.ts";
import { PLACE_AREAS } from "../../src/lib/place-areas.ts";
import { loadVisibleRoutes } from "../../src/lib/content/routes.ts";

export const STATIC_HTML_ROUTES = Object.freeze([
  "index.html",
  "mapa/index.html",
  "svetinje/index.html",
  "manastiri/index.html",
  "manastiri/muski/index.html",
  "manastiri/zenski/index.html",
  "crkve/index.html",
  "o-projektu/index.html",
  "izvori/index.html",
  "novosti/index.html",
  "rute/index.html",
  "kalendar/index.html",
]);

export const CALENDAR_HTML_ROUTES = Object.freeze(
  Array.from({ length: 365 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, index + 1));
    return `kalendar/${date.toISOString().slice(0, 10)}/index.html`;
  }),
);

export const CATEGORY_HTML_ROUTES = Object.freeze({
  monasteries: "manastiri/index.html",
  churches: "crkve/index.html",
});

export const MONASTERY_SUBCATEGORY_HTML_ROUTES = Object.freeze({
  male: "manastiri/muski/index.html",
  female: "manastiri/zenski/index.html",
});

export const CATEGORY_HREFS = Object.freeze({
  monasteries: "/manastiri/",
  churches: "/crkve/",
  "holy-places": "/svetinje/",
});

const hasCoordinates = (place) =>
  Number.isFinite(place.latitude) && Number.isFinite(place.longitude);

export function createOutputModel(places, news = [], routes = []) {
  const normalizedPlaces = [...places];
  const discoveryPlaces = selectPublicDiscoveryPlaces(normalizedPlaces);
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
  const monasteryCommunityMembership = {
    male: categoryMembership.monasteries.filter((place) => place.monasticCommunity === "male"),
    female: categoryMembership.monasteries.filter((place) => place.monasticCommunity === "female"),
  };
  const cataloguePagination = paginatePlaces(discoveryPlaces, 1);
  const homepagePreviewPlaces = discoveryPlaces.slice(0, HOMEPAGE_PREVIEW_LIMIT);
  const newsDetailRoutes = news.flatMap((item) => item.slug ? [{
    item,
    route: `novosti/${item.slug}/index.html`,
  }] : []);
  const areaMembership = Object.fromEntries(
    PLACE_AREAS.map((area) => [area.id, discoveryPlaces.filter((place) => place.browseAreaId === area.id)]),
  );
  const routeDetailRoutes = routes.map((route) => ({ route, path: `rute/${route.slug}/index.html` }));

  return {
    places: normalizedPlaces,
    discoveryPlaces,
    staticRoutes: [...STATIC_HTML_ROUTES],
    detailRoutes,
    news: [...news],
    newsDetailRoutes,
    routes: [...routes],
    routeDetailRoutes,
    allExpectedRoutes: [
      ...STATIC_HTML_ROUTES,
      ...detailRoutes.map(({ route }) => route),
      ...newsDetailRoutes.map(({ route }) => route),
      ...routeDetailRoutes.map(({ path }) => path),
      ...CALENDAR_HTML_ROUTES,
    ],
    expectedPageCount: STATIC_HTML_ROUTES.length + normalizedPlaces.length + newsDetailRoutes.length + routeDetailRoutes.length + CALENDAR_HTML_ROUTES.length,
    categoryMembership,
    monasteryCommunityMembership,
    areaMembership,
    placesById: new Map(normalizedPlaces.map((place) => [place.id, place])),
    discoveryPlacesById: new Map(discoveryPlaces.map((place) => [place.id, place])),
    markerPlaces: normalizedPlaces.filter(hasCoordinates),
    mediaPlaces: normalizedPlaces.filter((place) => typeof place.previewImageSrc === "string"),
    homepagePreviewPlaces,
    homepagePooledPlaces: discoveryPlaces.slice(HOMEPAGE_PREVIEW_LIMIT),
    homepagePreviewLimit: HOMEPAGE_PREVIEW_LIMIT,
    cataloguePageCount: cataloguePagination.totalPages,
    catalogueFirstPagePlaces: cataloguePagination.pagePlaces,
    cataloguePlacesPerPage: PLACES_PER_PAGE,
    expectedRealRelatedCount,
    expectedRelatedPlaceholderCount: 4 - expectedRealRelatedCount,
  };
}

export async function createOutputExpectations(root, { editorialPreview }) {
  const places = await loadVisiblePlaces(root, { editorialPreview });
  const news = await loadVisibleNews(root, { editorialPreview, visiblePlaces: places });
  const routes = await loadVisibleRoutes(root, { editorialPreview });
  return createOutputModel(places, news, routes);
}
