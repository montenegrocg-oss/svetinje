export const NEWS_TYPES = [
  "place-added",
  "place-updated",
  "site-update",
  "announcement",
  "news",
] as const;

export type NewsType = (typeof NEWS_TYPES)[number];

export const NEWS_TYPE_LABELS: Readonly<Record<NewsType, string>> = Object.freeze({
  "place-added": "НОВИ ОБЈЕКАТ",
  "place-updated": "АЖУРИРАНО",
  "site-update": "САЈТ",
  announcement: "ОБАВЈЕШТЕЊЕ",
  news: "НОВОСТ",
});

export function isNewsType(value: unknown): value is NewsType {
  return typeof value === "string" && NEWS_TYPES.includes(value as NewsType);
}

export function newsTypeLabel(type: NewsType): string {
  return NEWS_TYPE_LABELS[type];
}

const SERBIAN_MONTH_ABBREVIATIONS = [
  "јан", "феб", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "нов", "дец",
] as const;

const SERBIAN_MONTH_NAMES = [
  "јануар", "фебруар", "март", "април", "мај", "јун", "јул", "август", "септембар", "октобар", "новембар", "децембар",
] as const;

export interface SerbianNewsDateParts {
  day: string;
  monthYear: string;
  archiveKey: string;
  archiveLabel: string;
}

export function serbianNewsDateParts(timestamp: string): SerbianNewsDateParts {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error(`Cannot format invalid news timestamp ${timestamp}`);
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    monthYear: `${SERBIAN_MONTH_ABBREVIATIONS[month]} ${year}.`,
    archiveKey: `${year}-${String(month + 1).padStart(2, "0")}`,
    archiveLabel: `${SERBIAN_MONTH_NAMES[month]} ${year}.`,
  };
}
