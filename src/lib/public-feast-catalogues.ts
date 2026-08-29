import type { FeastRecord, FeastRegistry, VisibleFeastReference } from "./content/feast-registry.ts";
import type { VisiblePlace } from "./content/publication.ts";
import { isVerifiedCalendarDate } from "./calendar/coverage.ts";
import { selectPublicDiscoveryPlaces } from "./public-place-discovery.ts";

export interface VisibleFeastCatalogue extends VisibleFeastReference {
  places: VisiblePlace[];
}

export interface PublicPatronalFeastPlace {
  id: string;
  name: string;
  href: string;
  meta?: string;
}

export interface PublicPatronalFeastGroup {
  id: string;
  name: string;
  href: string;
  places: PublicPatronalFeastPlace[];
}

export interface UpcomingPatronalFeasts {
  date: string;
  dateLabel: string;
  calendarHref?: string;
  feasts: PublicPatronalFeastGroup[];
}

export interface PublicPatronalFeastDay {
  date: string;
  feasts: PublicPatronalFeastGroup[];
  upcoming?: UpcomingPatronalFeasts;
}

export const PATRONAL_FEAST_PROJECTION_YEAR = 2026;

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

function compareFeastNames(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, "sr-Cyrl");
}

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function fixedDateKey(year: number, feast: FeastRecord): string | undefined {
  if (feast.date?.kind !== "fixed") return undefined;
  const value = `${year}-${String(feast.date.month).padStart(2, "0")}-${String(feast.date.day).padStart(2, "0")}`;
  return validDateKey(value) ? value : undefined;
}

function nextFixedDateKey(feast: FeastRecord, anchorDate: string): string | undefined {
  const anchorYear = Number(anchorDate.slice(0, 4));
  for (let year = anchorYear; year <= anchorYear + 8; year += 1) {
    const candidate = fixedDateKey(year, feast);
    if (candidate && candidate > anchorDate) return candidate;
  }
  return undefined;
}

function occurrenceMatches(feast: FeastRecord, dateKey: string): boolean {
  if (feast.date?.kind === "fixed") return fixedDateKey(Number(dateKey.slice(0, 4)), feast) === dateKey;
  return feast.date?.kind === "movable" && feast.calendar_bindings?.includes(dateKey) === true;
}

function publicPlace(place: VisiblePlace): PublicPatronalFeastPlace {
  const location = place.settlement ?? place.municipality;
  const meta = [place.typeLabel, location].filter(Boolean).join(" · ");
  return {
    id: place.id,
    name: place.name,
    href: `/svetinje/${place.slug}/`,
    ...(meta ? { meta } : {}),
  };
}

function publicGroup(catalogue: VisibleFeastCatalogue): PublicPatronalFeastGroup {
  return {
    id: catalogue.id,
    name: catalogue.name,
    href: feastPath(catalogue.id),
    places: catalogue.places.map(publicPlace),
  };
}

function groupsForDate(
  registry: FeastRegistry,
  catalogues: readonly VisibleFeastCatalogue[],
  dateKey: string,
): PublicPatronalFeastGroup[] {
  if (!validDateKey(dateKey)) return [];
  const byId = new Map(registry.feasts.map((feast) => [feast.id, feast]));
  return catalogues
    .filter((catalogue) => {
      const feast = byId.get(catalogue.id);
      return feast !== undefined && catalogue.places.length > 0 && occurrenceMatches(feast, dateKey);
    })
    .map(publicGroup)
    .sort(compareFeastNames);
}

function nextOccurrenceDate(
  registry: FeastRegistry,
  catalogues: readonly VisibleFeastCatalogue[],
  anchorDate: string,
): string | undefined {
  if (!validDateKey(anchorDate)) return undefined;
  const visibleIds = new Set(catalogues.filter((catalogue) => catalogue.places.length > 0).map((catalogue) => catalogue.id));
  const candidates = registry.feasts.flatMap((feast) => {
    if (!visibleIds.has(feast.id)) return [];
    if (feast.date?.kind === "fixed") {
      const candidate = nextFixedDateKey(feast, anchorDate);
      return candidate ? [candidate] : [];
    }
    if (feast.date?.kind === "movable") {
      return (feast.calendar_bindings ?? []).filter((binding) => validDateKey(binding) && binding > anchorDate);
    }
    return [];
  });
  return candidates.sort()[0];
}

export function formatPatronalFeastDate(dateKey: string, anchorDate: string): string {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = dateKey.split("-").map(Number);
  const monthName = SR_MONTHS[month - 1];
  if (!monthName || !validDateKey(dateKey)) return dateKey;
  return year === Number(anchorDate.slice(0, 4))
    ? `${day}. ${monthName}`
    : `${day}. ${monthName} ${year}.`;
}

export function patronalFeastDay(
  registry: FeastRegistry,
  catalogues: readonly VisibleFeastCatalogue[],
  dateKey: string,
): PublicPatronalFeastDay {
  const nextDate = nextOccurrenceDate(registry, catalogues, dateKey);
  const upcomingFeasts = nextDate ? groupsForDate(registry, catalogues, nextDate) : [];
  return {
    date: dateKey,
    feasts: groupsForDate(registry, catalogues, dateKey),
    ...(nextDate && upcomingFeasts.length > 0 ? {
      upcoming: {
        date: nextDate,
        dateLabel: formatPatronalFeastDate(nextDate, dateKey),
        ...(isVerifiedCalendarDate(nextDate) ? { calendarHref: `/kalendar/${nextDate}/` } : {}),
        feasts: upcomingFeasts,
      },
    } : {}),
  };
}

export function patronalFeastProjectionDates(year = PATRONAL_FEAST_PROJECTION_YEAR): string[] {
  const dates: string[] = [];
  for (let date = new Date(Date.UTC(year, 0, 1)); date.getUTCFullYear() === year; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

export function selectVisibleFeastCatalogues(places: readonly VisiblePlace[]): VisibleFeastCatalogue[] {
  const byFeastId = new Map<string, VisibleFeastCatalogue>();
  for (const place of selectPublicDiscoveryPlaces(places)) {
    for (const feast of place.patronalFeastReferences ?? []) {
      const catalogue = byFeastId.get(feast.id);
      if (catalogue) {
        if (!catalogue.places.some((candidate) => candidate.id === place.id)) catalogue.places.push(place);
      } else {
        byFeastId.set(feast.id, { ...feast, places: [place] });
      }
    }
  }
  return [...byFeastId.values()].sort(compareFeasts);
}
