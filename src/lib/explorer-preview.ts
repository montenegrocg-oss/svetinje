export const HOMEPAGE_PREVIEW_LIMIT = 3;

export interface HomepagePreviewPage<T> {
  currentPage: number;
  totalPages: number;
  pagePlaces: T[];
}

export const pageCountForHomepagePreview = (placeCount: number) =>
  Math.ceil(Math.max(0, placeCount) / HOMEPAGE_PREVIEW_LIMIT);

export function paginateHomepagePreview<T>(
  places: readonly T[],
  requestedPage: number,
): HomepagePreviewPage<T> {
  const totalPages = pageCountForHomepagePreview(places.length);
  const currentPage = totalPages === 0
    ? 1
    : Math.min(Math.max(1, requestedPage), totalPages);
  const pageStart = (currentPage - 1) * HOMEPAGE_PREVIEW_LIMIT;
  const pagePlaces = places.slice(pageStart, pageStart + HOMEPAGE_PREVIEW_LIMIT);

  return {
    currentPage,
    totalPages,
    pagePlaces,
  };
}

export function pageForHomepagePreviewPlace<T>(places: readonly T[], place: T): number | null {
  const placeIndex = places.indexOf(place);
  if (placeIndex < 0) return null;

  return Math.floor(placeIndex / HOMEPAGE_PREVIEW_LIMIT) + 1;
}

export function selectHomepagePreview<T>(
  places: readonly T[],
  selectedPlace: T | null = null,
): T[] {
  const normalPreview = places.slice(0, HOMEPAGE_PREVIEW_LIMIT);
  if (!selectedPlace || normalPreview.includes(selectedPlace)) return normalPreview;

  return [
    selectedPlace,
    ...places.filter((place) => place !== selectedPlace),
  ].slice(0, HOMEPAGE_PREVIEW_LIMIT);
}
