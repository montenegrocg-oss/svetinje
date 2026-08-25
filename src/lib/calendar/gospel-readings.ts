import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DailyGospelReading } from "./gospel-presentation.ts";

export {
  formatGospelPassageSr,
  formatGospelReferenceSr,
  type DailyGospelReading,
  type GospelVerse,
} from "./gospel-presentation.ts";

export const GOSPEL_BY_DATE_DATASET = "data/gospel-readings/svetinje-gospel-by-date-2026.json";

export interface GospelReading extends Omit<DailyGospelReading, "conditional"> {
  entry_id: string;
  reading_type: "saint" | "sunday_matins" | "sunday" | "daily" | "theotokos" | "transferred" | "feast";
  feast_or_reason: string;
  conditional: boolean;
  needs_review: boolean;
}

export interface GospelReadingsDataset {
  schema_version: string;
  dates: Record<string, { readings: GospelReading[] }>;
}

export async function loadGospelReadingsDataset(root = process.cwd()): Promise<GospelReadingsDataset> {
  const dataset = JSON.parse(await readFile(path.join(root, GOSPEL_BY_DATE_DATASET), "utf8")) as GospelReadingsDataset;
  if (dataset?.schema_version !== "1.0" || !dataset.dates || Array.isArray(dataset.dates)) {
    throw new Error("Unsupported Gospel-by-date dataset");
  }
  return dataset;
}

export function gospelReadingsForDate(dataset: GospelReadingsDataset, date: string): readonly GospelReading[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return dataset.dates[date]?.readings ?? [];
}

export function dailyGospelReadingsForDate(dataset: GospelReadingsDataset, date: string): DailyGospelReading[] {
  return gospelReadingsForDate(dataset, date).map(({ reading_id, book, zachalo, passage, conditional, verses, text }) => ({
    reading_id,
    book,
    zachalo,
    passage,
    ...(conditional ? { conditional: true as const } : {}),
    verses: verses.map(({ chapter, verse, text }) => ({ chapter, verse, text })),
    text,
  }));
}
