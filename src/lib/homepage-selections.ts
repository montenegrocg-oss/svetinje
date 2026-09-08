import {
  catalogueSearchTokens,
  scoreCatalogueSearch,
  type CatalogueSearchFields,
} from "./catalogue-search.ts";

export const MOST_VISITED_PLACE_IDS = Object.freeze([
  "manastir-ostrog",
  "cetinjski-manastir",
  "manastir-moraca",
  "dajbabe",
  "saborni-hram-podgorica",
] as const);

export const HOMEPAGE_DISCOVERY_PRIORITY_IDS = Object.freeze([
  "podmaine",
  "saborni-hram-bar",
  "cetinjski-manastir",
  "crkva-svetog-djordja-donja-gorica",
  "manastir-moraca",
  "saborni-hram-svetog-vasilija",
  "manastir-savina",
  "crkva-na-cipuru",
  "manastir-djurdjevi-stupovi",
  "crkva-svetih-apostola-petra-i-pavla",
  "manastir-ostrog",
  "miholjska-prevlaka",
  "crkva-svete-trojice-budva",
  "manastir-bijela",
  "manastir-svetog-sergija-radonjeskog",
] as const);

const homepageDiscoveryPriorityRank = new Map<string, number>(
  HOMEPAGE_DISCOVERY_PRIORITY_IDS.map((id, index) => [id, index]),
);

export function orderHomepageDiscoveryPlaces<T extends { id: string }>(places: readonly T[]): T[] {
  const placeById = new Map(places.map((place) => [place.id, place]));
  const prioritized = HOMEPAGE_DISCOVERY_PRIORITY_IDS.flatMap((id) => {
    const place = placeById.get(id);
    return place ? [place] : [];
  });
  const priorityIds = new Set<string>(HOMEPAGE_DISCOVERY_PRIORITY_IDS);
  return [...prioritized, ...places.filter((place) => !priorityIds.has(place.id))];
}

export function rankHomepageDiscoverySearch<T extends { id: string }>(
  places: readonly T[],
  query: string,
  searchFieldsById: ReadonlyMap<string, CatalogueSearchFields>,
  originalOrderById: ReadonlyMap<string, number>,
): T[] {
  if (catalogueSearchTokens(query).length === 0) return [...places];

  return places
    .flatMap((place) => {
      const fields = searchFieldsById.get(place.id);
      if (!fields) return [];
      const score = scoreCatalogueSearch(fields, query);
      return score === null ? [] : [{ place, score }];
    })
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;

      const leftPriority = homepageDiscoveryPriorityRank.get(left.place.id) ?? Number.POSITIVE_INFINITY;
      const rightPriority = homepageDiscoveryPriorityRank.get(right.place.id) ?? Number.POSITIVE_INFINITY;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;

      const leftOriginalOrder = originalOrderById.get(left.place.id) ?? Number.POSITIVE_INFINITY;
      const rightOriginalOrder = originalOrderById.get(right.place.id) ?? Number.POSITIVE_INFINITY;
      if (leftOriginalOrder !== rightOriginalOrder) return leftOriginalOrder - rightOriginalOrder;

      return left.place.id < right.place.id ? -1 : left.place.id > right.place.id ? 1 : 0;
    })
    .map(({ place }) => place);
}
