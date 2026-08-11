export const HOMEPAGE_PREVIEW_LIMIT = 2;

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
