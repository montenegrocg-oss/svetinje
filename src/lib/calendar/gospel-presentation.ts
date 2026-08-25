export interface GospelVerse {
  chapter: number;
  verse: number;
  text: string;
}

export interface DailyGospelReading {
  reading_id: string;
  book: "Мф" | "Мк" | "Лк" | "Ин";
  zachalo: string;
  passage: string;
  conditional?: true;
  verses: GospelVerse[];
  text: string;
}

export function formatGospelPassageSr(passage: string): string {
  return passage
    .replace(/^Мф\./u, "Мт.")
    .replace(/^Ин\./u, "Јн.")
    .replace(/:(\d+)/gu, ", $1");
}

export function formatGospelReferenceSr(reading: Pick<DailyGospelReading, "passage" | "zachalo">): string {
  return `${formatGospelPassageSr(reading.passage)} · зач. ${reading.zachalo}`;
}
