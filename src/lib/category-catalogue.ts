export const FEATURED_CATALOGUE_LIMIT = 2;

export type MonasticCommunityFilter = "male" | "female";

export function selectMonasticCommunityPlaces<T extends { monasticCommunity?: MonasticCommunityFilter }>(
  places: readonly T[],
  monasticCommunity?: MonasticCommunityFilter,
): T[] {
  return monasticCommunity
    ? places.filter((place) => place.monasticCommunity === monasticCommunity)
    : [...places];
}

export function selectFeaturedCataloguePlaces<T extends { previewImageSrc?: string | null }>(
  places: readonly T[],
): T[] {
  return places
    .filter((place) => Boolean(place.previewImageSrc))
    .slice(0, FEATURED_CATALOGUE_LIMIT);
}
