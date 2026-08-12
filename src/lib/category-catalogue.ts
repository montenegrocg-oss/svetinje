export const FEATURED_CATALOGUE_LIMIT = 2;

export function selectFeaturedCataloguePlaces<T extends { previewImageSrc?: string | null }>(
  places: readonly T[],
): T[] {
  return places
    .filter((place) => Boolean(place.previewImageSrc))
    .slice(0, FEATURED_CATALOGUE_LIMIT);
}
