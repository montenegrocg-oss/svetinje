import type { VisibleFeastReference } from "./content/feast-registry.ts";
import type { VisiblePlace } from "./content/publication.ts";
import { selectPublicDiscoveryPlaces } from "./public-place-discovery.ts";

export interface VisibleFeastCatalogue extends VisibleFeastReference {
  places: VisiblePlace[];
}

const SR_MONTHS = [
  "јануар",
  "фебруар",
  "март",
  "април",
  "мај",
  "јун",
  "јул",
  "август",
  "септембар",
  "октобар",
  "новембар",
  "децембар",
] as const;

export function feastPath(feastId: string): string {
  return `/slave/${feastId}/`;
}

export function feastDateLabel(feast: VisibleFeastReference): string | undefined {
  if (feast.dateKind === "movable") return "покретни празник";
  if (feast.dateKind !== "fixed" || feast.month === undefined || feast.day === undefined) return undefined;
  const month = SR_MONTHS[feast.month - 1];
  return month ? `${feast.day}. ${month}` : undefined;
}

export function feastPlaceCountLabel(count: number): string {
  const value = Math.abs(count);
  if (value % 100 >= 11 && value % 100 <= 14) return `${count} светиња`;
  if (value % 10 === 1) return `${count} светиња`;
  if (value % 10 >= 2 && value % 10 <= 4) return `${count} светиње`;
  return `${count} светиња`;
}

function compareFeasts(left: VisibleFeastReference, right: VisibleFeastReference): number {
  const rank = (feast: VisibleFeastReference) => feast.dateKind === "fixed" ? 0 : feast.dateKind === "movable" ? 1 : 2;
  const rankDifference = rank(left) - rank(right);
  if (rankDifference !== 0) return rankDifference;
  if (left.dateKind === "fixed" && right.dateKind === "fixed") {
    const dateDifference = (left.month ?? 0) - (right.month ?? 0) || (left.day ?? 0) - (right.day ?? 0);
    if (dateDifference !== 0) return dateDifference;
  }
  return left.name.localeCompare(right.name, "sr-Cyrl");
}

export function selectVisibleFeastCatalogues(places: readonly VisiblePlace[]): VisibleFeastCatalogue[] {
  const byFeastId = new Map<string, VisibleFeastCatalogue>();
  for (const place of selectPublicDiscoveryPlaces(places)) {
    for (const feast of place.patronalFeastReferences ?? []) {
      const catalogue = byFeastId.get(feast.id);
      if (catalogue) catalogue.places.push(place);
      else byFeastId.set(feast.id, { ...feast, places: [place] });
    }
  }
  return [...byFeastId.values()].sort(compareFeasts);
}
