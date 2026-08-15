import type { CalendarDay, CalendarReading, ScriptureVerse } from "./content.ts";

const GOSPEL_BOOK_ABBREVIATIONS: Record<CalendarReading["book"], string> = {
  mt: "Мт.",
  mk: "Мк.",
  lk: "Лк.",
  jn: "Јн.",
};

function primaryReading(day: CalendarDay): CalendarReading | undefined {
  return day.gospel?.readings[day.gospel.primary_reading];
}

function assembleReading(corpus: any, reading: CalendarReading): ScriptureVerse[] {
  const verses: ScriptureVerse[] = [];
  for (const range of reading.ranges) {
    for (const spec of range.verses) {
      const [startValue, endValue] = spec.split("-").map(Number);
      if (!startValue) throw new Error(`Invalid Gospel verse range ${spec}`);
      const end = endValue ?? startValue;
      for (let verse = startValue; verse <= end; verse += 1) {
        verses.push({
          chapter: range.chapter,
          verse,
          text: corpus.books[reading.book][String(range.chapter)][String(verse)],
        });
      }
    }
  }
  return verses;
}

function shortReadingReference(reading: CalendarReading): string {
  const ranges = reading.ranges.map((range) => `${range.chapter}, ${range.verses.join(", ").replaceAll("-", "–")}`);
  return `${GOSPEL_BOOK_ABBREVIATIONS[reading.book]} ${ranges.join("; ")}`;
}

function readingExcerpt(verses: ScriptureVerse[], maximumLength = 320): string {
  const selected: string[] = [];
  for (const verse of verses.slice(0, 2)) {
    const candidate = [...selected, verse.text].join(" ");
    if (selected.length > 0 && candidate.length > maximumLength) break;
    selected.push(verse.text);
  }
  return selected.join(" ");
}

export const CALENDAR_TIME_ZONE = "Europe/Podgorica";

export function podgoricaDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function todayCalendarDay(days: CalendarDay[], now: Date): CalendarDay | undefined {
  return days.find((day) => day.date === podgoricaDateKey(now));
}

export function createTodayCalendarModel(days: CalendarDay[], corpus: any, now: Date) {
  const day = todayCalendarDay(days, now);
  if (!day) return undefined;
  const reading = primaryReading(day);
  return {
    day,
    ...(reading ? {
      reading,
      reference: shortReadingReference(reading),
      excerpt: readingExcerpt(assembleReading(corpus, reading)),
    } : {}),
  };
}
