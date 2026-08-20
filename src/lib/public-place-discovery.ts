import { categoryForPlaceType } from "./place-filters.ts";

export const PUBLIC_DISCOVERY_CATEGORIES = ["monasteries", "churches"] as const;

export type PublicDiscoveryCategory = (typeof PUBLIC_DISCOVERY_CATEGORIES)[number];

const publicDiscoveryCategories = new Set<string>(PUBLIC_DISCOVERY_CATEGORIES);

export function isPublicDiscoveryPlaceType(placeType: string): boolean {
  const category = categoryForPlaceType(placeType);
  return category !== null && publicDiscoveryCategories.has(category);
}

export function selectPublicDiscoveryPlaces<T extends { placeType: string }>(places: readonly T[]): T[] {
  return places.filter((place) => isPublicDiscoveryPlaceType(place.placeType));
}
