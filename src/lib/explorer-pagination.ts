export const PLACES_PER_PAGE = 8;
export const PRIMARY_PLACES_PER_PAGE = 4;
export const CONTINUATION_PLACES_PER_PAGE = 4;

export interface ExplorerPage<T> {
  currentPage: number;
  totalPages: number;
  primaryPlaces: T[];
  continuationPlaces: T[];
}

export const pageCountForPlaces = (placeCount: number) =>
  Math.ceil(Math.max(0, placeCount) / PLACES_PER_PAGE);

export function paginatePlaces<T>(places: readonly T[], requestedPage: number): ExplorerPage<T> {
  const totalPages = pageCountForPlaces(places.length);
  const currentPage = totalPages === 0
    ? 1
    : Math.min(Math.max(1, requestedPage), totalPages);
  const pageStart = (currentPage - 1) * PLACES_PER_PAGE;
  const pagePlaces = places.slice(pageStart, pageStart + PLACES_PER_PAGE);

  return {
    currentPage,
    totalPages,
    primaryPlaces: pagePlaces.slice(0, PRIMARY_PLACES_PER_PAGE),
    continuationPlaces: pagePlaces.slice(
      PRIMARY_PLACES_PER_PAGE,
      PRIMARY_PLACES_PER_PAGE + CONTINUATION_PLACES_PER_PAGE,
    ),
  };
}

export function pageForPlace<T>(places: readonly T[], place: T): number | null {
  const index = places.indexOf(place);
  return index < 0 ? null : Math.floor(index / PLACES_PER_PAGE) + 1;
}
