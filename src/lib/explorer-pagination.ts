export const PLACES_PER_PAGE = 8;

export interface PaginatedPlaces<T> {
  currentPage: number;
  totalPages: number;
  pagePlaces: T[];
}

export const pageCountForPlaces = (placeCount: number) =>
  Math.ceil(Math.max(0, placeCount) / PLACES_PER_PAGE);

export function paginatePlaces<T>(places: readonly T[], requestedPage: number): PaginatedPlaces<T> {
  const totalPages = pageCountForPlaces(places.length);
  const currentPage = totalPages === 0
    ? 1
    : Math.min(Math.max(1, requestedPage), totalPages);
  const pageStart = (currentPage - 1) * PLACES_PER_PAGE;
  const pagePlaces = places.slice(pageStart, pageStart + PLACES_PER_PAGE);

  return {
    currentPage,
    totalPages,
    pagePlaces,
  };
}
