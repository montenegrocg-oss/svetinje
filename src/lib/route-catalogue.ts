import type { Locale } from "../i18n/config.ts";
import { buildCatalogueSearchText, matchesCatalogueSearch } from "./catalogue-search.ts";

export const ROUTE_DIFFICULTY_FILTERS = ["all", "easy", "moderate", "demanding"] as const;

export type RouteDifficultyFilter = typeof ROUTE_DIFFICULTY_FILTERS[number];
export type RouteDifficulty = Exclude<RouteDifficultyFilter, "all">;

interface RouteCatalogueSearchFields {
  title: string;
  summary: string;
  endpointLabels?: readonly string[];
}

interface RouteCatalogueFilterItem {
  searchText: string;
  difficulty: RouteDifficulty;
}

export function isRouteDifficultyFilter(value: string | null | undefined): value is RouteDifficultyFilter {
  return ROUTE_DIFFICULTY_FILTERS.includes(value as RouteDifficultyFilter);
}

export function buildRouteCatalogueSearchText(fields: RouteCatalogueSearchFields): string {
  return buildCatalogueSearchText({
    name: fields.title,
    alternateNames: fields.endpointLabels,
    summary: fields.summary,
  });
}

export function matchesRouteCatalogueFilters(
  item: RouteCatalogueFilterItem,
  query: string,
  difficulty: RouteDifficultyFilter,
): boolean {
  return matchesCatalogueSearch(item.searchText, query)
    && (difficulty === "all" || item.difficulty === difficulty);
}

export function formatRouteResultCount(count: number, locale: Locale): string {
  const safeCount = Math.max(0, Math.trunc(count));
  if (locale === "en") return `Found ${safeCount} ${safeCount === 1 ? "route" : "routes"}`;

  const lastTwo = safeCount % 100;
  const last = safeCount % 10;
  if (locale === "ru") {
    if (last === 1 && lastTwo !== 11) return `Найден ${safeCount} маршрут`;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `Найдено ${safeCount} маршрута`;
    return `Найдено ${safeCount} маршрутов`;
  }

  if (last === 1 && lastTwo !== 11) return `Пронађена је ${safeCount} рута`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `Пронађене су ${safeCount} руте`;
  return `Пронађено је ${safeCount} рута`;
}
