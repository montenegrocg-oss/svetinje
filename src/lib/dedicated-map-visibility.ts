import {
  matchesCatalogueSearchFields,
  type CatalogueSearchFields,
} from "./catalogue-search.ts";
import { categoryForPlaceType } from "./place-filters.ts";
import { selectMappablePlaces, type MappablePlaceCoordinates } from "./public-place-discovery.ts";

export const DEDICATED_MAP_CATEGORIES = ["all", "monasteries", "churches"] as const;

export type DedicatedMapCategory = (typeof DEDICATED_MAP_CATEGORIES)[number];
export type DedicatedMapPlaceCategory = Exclude<DedicatedMapCategory, "all">;

export interface DedicatedMapSearchEntry {
  id: string;
  category: DedicatedMapPlaceCategory;
  fields: CatalogueSearchFields;
}

interface DedicatedMapSearchSource extends MappablePlaceCoordinates {
  id: string;
  placeType: string;
  catalogueSearchFields: CatalogueSearchFields;
}

export function createDedicatedMapSearchIndex(
  places: readonly DedicatedMapSearchSource[],
): DedicatedMapSearchEntry[] {
  return selectMappablePlaces(places).flatMap((place) => {
    const category = categoryForPlaceType(place.placeType);
    if (category !== "monasteries" && category !== "churches") return [];
    return [{ id: place.id, category, fields: place.catalogueSearchFields }];
  });
}

export function filterDedicatedMapPlaces({
  places,
  category,
  query,
}: {
  places: readonly DedicatedMapSearchEntry[];
  category: DedicatedMapCategory;
  query: string;
}): string[] {
  return places
    .filter((place) => (
      (category === "all" || place.category === category)
      && matchesCatalogueSearchFields(place.fields, query)
    ))
    .map((place) => place.id);
}
