import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import { isVerifiedCalendarDate } from "../calendar/coverage.ts";

export interface FixedFeastDate {
  kind: "fixed";
  month: number;
  day: number;
}

export interface MovableFeastDate {
  kind: "movable";
}

export interface FeastRecord {
  id: string;
  name_sr: string;
  legacy_names: string[];
  date?: FixedFeastDate | MovableFeastDate;
  calendar_bindings?: string[];
}

export interface FeastRegistry {
  schema_version: 1;
  feasts: FeastRecord[];
}

export interface VisibleFeastReference {
  id: string;
  name: string;
  dateKind: "fixed" | "movable" | "undated";
  month?: number;
  day?: number;
  calendarPath?: string;
}

export interface PatronalFeastSource {
  id?: string;
  patronal_feast_ids?: string[];
  patronal_feasts?: Array<{ name?: string }>;
  patronal_feast?: { name?: string };
}

const EMPTY_REGISTRY: FeastRegistry = { schema_version: 1, feasts: [] };

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("sr-Cyrl");
}

function calendarPathForFeast(feast: FeastRecord): string | undefined {
  if (feast.date?.kind === "fixed") {
    const date = `2026-${String(feast.date.month).padStart(2, "0")}-${String(feast.date.day).padStart(2, "0")}`;
    return isVerifiedCalendarDate(date) ? `/kalendar/${date}/` : undefined;
  }
  if (feast.date?.kind === "movable") {
    const date = feast.calendar_bindings?.find((binding) => binding.startsWith("2026-") && isVerifiedCalendarDate(binding));
    return date ? `/kalendar/${date}/` : undefined;
  }
  return undefined;
}

function visibleReference(feast: FeastRecord): VisibleFeastReference {
  const calendarPath = calendarPathForFeast(feast);
  if (feast.date?.kind === "fixed") {
    return {
      id: feast.id,
      name: feast.name_sr,
      dateKind: "fixed",
      month: feast.date.month,
      day: feast.date.day,
      ...(calendarPath ? { calendarPath } : {}),
    };
  }
  return {
    id: feast.id,
    name: feast.name_sr,
    dateKind: feast.date?.kind === "movable" ? "movable" : "undated",
    ...(calendarPath ? { calendarPath } : {}),
  };
}

export async function loadFeastRegistry(root = process.cwd()): Promise<FeastRegistry> {
  const file = path.join(root, "content", "feasts", "registry.yaml");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return EMPTY_REGISTRY;
    throw error;
  }
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  if (document.errors.length > 0) throw new Error(`Cannot parse ${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  const value = document.toJS({ maxAliasCount: 0 }) as FeastRegistry;
  if (value?.schema_version !== 1 || !Array.isArray(value.feasts)) throw new Error(`${file} must contain a version 1 feast registry`);
  return value;
}

export function patronalFeastIds(place: PatronalFeastSource, registry: FeastRegistry): string[] {
  if (Array.isArray(place.patronal_feast_ids)) return [...place.patronal_feast_ids];
  const legacy = Array.isArray(place.patronal_feasts)
    ? place.patronal_feasts
    : place.patronal_feast
      ? [place.patronal_feast]
      : [];
  const byLegacyName = new Map(registry.feasts.flatMap((feast) => feast.legacy_names.map((name) => [normalizedName(name), feast.id])));
  return legacy.flatMap((entry) => {
    const name = typeof entry?.name === "string" ? entry.name : "";
    const id = name.trim() ? byLegacyName.get(normalizedName(name)) : undefined;
    return id ? [id] : [];
  });
}

export function patronalFeastNames(place: PatronalFeastSource, registry: FeastRegistry): string[] {
  if (Array.isArray(place.patronal_feast_ids)) {
    const byId = new Map(registry.feasts.map((feast) => [feast.id, feast.name_sr]));
    return place.patronal_feast_ids.flatMap((id) => byId.get(id) ?? []);
  }
  const legacy = Array.isArray(place.patronal_feasts)
    ? place.patronal_feasts
    : place.patronal_feast
      ? [place.patronal_feast]
      : [];
  return legacy.flatMap((entry) => typeof entry?.name === "string" && entry.name.trim() ? [entry.name.trim()] : []);
}

export function patronalFeastReferences(place: PatronalFeastSource, registry: FeastRegistry): VisibleFeastReference[] {
  const byId = new Map(registry.feasts.map((feast) => [feast.id, feast]));
  return [...new Set(patronalFeastIds(place, registry))].flatMap((id) => {
    const feast = byId.get(id);
    return feast ? [visibleReference(feast)] : [];
  });
}

export function unresolvedLegacyPatronalFeastNames(place: PatronalFeastSource, registry: FeastRegistry): string[] {
  if (Array.isArray(place.patronal_feast_ids)) return [];
  const resolvedIds = patronalFeastIds(place, registry);
  if (resolvedIds.length > 0) {
    const resolvedLegacyNames = new Set(registry.feasts
      .filter((feast) => resolvedIds.includes(feast.id))
      .flatMap((feast) => feast.legacy_names.map(normalizedName)));
    return patronalFeastNames(place, registry).filter((name) => !resolvedLegacyNames.has(normalizedName(name)));
  }
  return patronalFeastNames(place, registry);
}

export function feastIdsForDate(registry: FeastRegistry, dateKey: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateKey);
  if (!match) return [];
  const month = Number(match[2]);
  const day = Number(match[3]);
  return registry.feasts.flatMap((feast) => {
    if (feast.date?.kind === "fixed" && feast.date.month === month && feast.date.day === day) return [feast.id];
    if (feast.date?.kind === "movable" && feast.calendar_bindings?.includes(dateKey)) return [feast.id];
    return [];
  });
}

export function placeIdsForFeast(places: PatronalFeastSource[], registry: FeastRegistry, feastId: string): string[] {
  return places.flatMap((place) => place.id && patronalFeastIds(place, registry).includes(feastId) ? [place.id] : []);
}
