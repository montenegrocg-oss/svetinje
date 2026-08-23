import type { Locale } from "../i18n/config.ts";
import type { VisiblePlace } from "./content/publication.ts";

export interface RelatedPlace {
  place: VisiblePlace;
  distanceKm: number | undefined;
}

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => degrees * Math.PI / 180;

export function coordinateDistance(from: VisiblePlace, to: VisiblePlace): number | undefined {
  if (
    from.latitude === undefined || from.longitude === undefined
    || to.latitude === undefined || to.longitude === undefined
  ) return undefined;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function relatedPlacesFor(
  place: VisiblePlace,
  places: VisiblePlace[],
  locale: Locale = "sr",
  limit = 4,
): RelatedPlace[] {
  return places
    .filter((candidate) => candidate.id !== place.id)
    .map((candidate) => ({
      place: candidate,
      distanceKm: coordinateDistance(place, candidate),
      hasCoordinates: candidate.latitude !== undefined && candidate.longitude !== undefined,
    }))
    .sort((left, right) => {
      if (left.distanceKm !== undefined && right.distanceKm !== undefined) return left.distanceKm - right.distanceKm;
      if (left.distanceKm !== undefined) return -1;
      if (right.distanceKm !== undefined) return 1;
      if (left.hasCoordinates !== right.hasCoordinates) return left.hasCoordinates ? -1 : 1;
      return left.place.name.localeCompare(right.place.name, locale);
    })
    .slice(0, limit)
    .map(({ place: relatedPlace, distanceKm }) => ({ place: relatedPlace, distanceKm }));
}
