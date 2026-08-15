import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export type GospelBook = "mt" | "mk" | "lk" | "jn";
export interface GospelRange { chapter: number; verses: string[] }
export interface CalendarReading {
  book: GospelBook;
  zachalo: number;
  scope: "day" | "sunday" | "feast" | "saint" | "unknown";
  label: string;
  ranges: GospelRange[];
}
export interface CalendarDay {
  schema_version: 1;
  date: string;
  julian_date: string;
  title: string;
  commemorations: string[];
  gospel?: { primary_reading: number; readings: CalendarReading[] };
}
export interface ScriptureVerse { chapter: number; verse: number; text: string }

export const GOSPEL_BOOK_LABELS: Record<GospelBook, string> = {
  mt: "Јеванђеље по Матеју",
  mk: "Јеванђеље по Марку",
  lk: "Јеванђеље по Луки",
  jn: "Јеванђеље по Јовану",
};

const GOSPEL_BOOK_ABBREVIATIONS: Record<GospelBook, string> = {
  mt: "Мт.",
  mk: "Мк.",
  lk: "Лк.",
  jn: "Јн.",
};

export async function loadCalendarDays(root = process.cwd()): Promise<CalendarDay[]> {
  const directory = path.join(root, "content", "calendar", "2026");
  const names = (await readdir(directory)).filter((name) => /^2026-\d{2}-\d{2}\.yaml$/.test(name)).sort();
  return Promise.all(names.map(async (name) => parse(await readFile(path.join(directory, name), "utf8")) as CalendarDay));
}

export async function loadScriptureCorpus(root = process.cwd()) {
  return JSON.parse(await readFile(path.join(root, "content", "scripture", "sr-vuk-karadzic-1847", "gospels.json"), "utf8"));
}

export function assembleReading(corpus: any, reading: CalendarReading): ScriptureVerse[] {
  const verses: ScriptureVerse[] = [];
  for (const range of reading.ranges) {
    for (const spec of range.verses) {
      const [startValue, endValue] = spec.split("-").map(Number);
      if (!startValue) throw new Error(`Invalid Gospel verse range ${spec}`);
      const start = startValue;
      const end = endValue ?? start;
      for (let verse = start; verse <= end; verse += 1) {
        verses.push({ chapter: range.chapter, verse, text: corpus.books[reading.book][String(range.chapter)][String(verse)] });
      }
    }
  }
  return verses;
}

export function readingReference(reading: CalendarReading): string {
  const parts = reading.ranges.map((range) => `${range.chapter}:${range.verses.join(",")}`);
  return `${GOSPEL_BOOK_LABELS[reading.book]} ${parts.join("; ")} (зач. ${reading.zachalo})`;
}

export function shortReadingReference(reading: CalendarReading): string {
  const ranges = reading.ranges.map((range) => `${range.chapter}, ${range.verses.join(", ").replaceAll("-", "–")}`);
  return `${GOSPEL_BOOK_ABBREVIATIONS[reading.book]} ${ranges.join("; ")}`;
}

export function primaryReading(day: CalendarDay): CalendarReading | undefined {
  return day.gospel?.readings[day.gospel.primary_reading];
}

export function readingExcerpt(verses: ScriptureVerse[], maximumLength = 320): string {
  const selected: string[] = [];
  for (const verse of verses.slice(0, 2)) {
    const candidate = [...selected, verse.text].join(" ");
    if (selected.length > 0 && candidate.length > maximumLength) break;
    selected.push(verse.text);
  }
  return selected.join(" ");
}

export function localizedCalendarDate(date: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("sr-Cyrl-ME", { timeZone: "Europe/Podgorica", ...options }).format(new Date(`${date}T12:00:00Z`));
}
