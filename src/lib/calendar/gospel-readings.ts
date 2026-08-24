import { readFile } from "node:fs/promises";
import path from "node:path";

export const GOSPEL_BY_DATE_DATASET = "data/gospel-readings/svetinje-gospel-by-date-2026.json";

export interface GospelVerse {
  chapter: number;
  verse: number;
  text: string;
}

export interface GospelReading {
  entry_id: string;
  reading_id: string;
  book: "Мф" | "Мк" | "Лк" | "Ин";
  zachalo: string;
  passage: string;
  reading_type: "saint" | "sunday_matins" | "sunday" | "daily" | "theotokos" | "transferred" | "feast";
  feast_or_reason: string;
  conditional: boolean;
  needs_review: boolean;
  verses: GospelVerse[];
  text: string;
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

export function formatGospelPassageSr(passage: string): string {
  return passage
    .replace(/^Мф\./u, "Мт.")
    .replace(/^Ин\./u, "Јн.")
    .replace(/:(\d+)/gu, ", $1");
}

export function formatGospelReferenceSr(reading: Pick<GospelReading, "passage" | "zachalo">): string {
  return `${formatGospelPassageSr(reading.passage)} · зач. ${reading.zachalo}`;
}
