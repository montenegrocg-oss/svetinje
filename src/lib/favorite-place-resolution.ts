import { normalizeFavoriteIds } from "./favorites.ts";
import { selectPublicDiscoveryPlaces } from "./public-place-discovery.ts";

export function resolveFavoritePlaces<T extends { id: string; placeType: string }>(
  ids: unknown,
  allowedPublicInventory: readonly T[],
): T[] {
  const byId = new Map(
    selectPublicDiscoveryPlaces(allowedPublicInventory).map((place) => [place.id, place]),
  );
  return normalizeFavoriteIds(ids).flatMap((id) => {
    const place = byId.get(id);
    return place ? [place] : [];
  });
}
