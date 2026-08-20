export const PLACE_CATEGORIES = ["monasteries", "churches", "holy-places"] as const;
export const PLACE_FILTER_IDS = ["all", "monasteries", "churches", "routes"] as const;

export type PlaceFilterId = (typeof PLACE_FILTER_IDS)[number];
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

const PLACE_TYPE_TO_CATEGORY = {
  monastery: "monasteries",
  skete: "monasteries",
  hermitage: "monasteries",
  church: "churches",
  chapel: "churches",
  cathedral: "churches",
  "holy-spring": "holy-places",
  cave: "holy-places",
  shrine: "holy-places",
  other: "holy-places",
} as const satisfies Record<string, PlaceCategory>;

export function categoryForPlaceType(placeType: string): PlaceCategory | null {
  return PLACE_TYPE_TO_CATEGORY[placeType as keyof typeof PLACE_TYPE_TO_CATEGORY] ?? null;
}

export function matchesPlaceFilter(placeType: string, filter: PlaceFilterId): boolean {
  if (filter === "all") return true;
  if (filter === "routes") return false;
  return categoryForPlaceType(placeType) === filter;
}
