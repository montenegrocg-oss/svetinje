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

const MONTH_LABELS: Record<Locale, { abbreviations: readonly string[]; names: readonly string[] }> = {
  sr: {
    abbreviations: ["јан", "феб", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "нов", "дец"],
    names: ["јануар", "фебруар", "март", "април", "мај", "јун", "јул", "август", "септембар", "октобар", "новембар", "децембар"],
  },
  ru: {
    abbreviations: ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
    names: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  },
  en: {
    abbreviations: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    names: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  },
};

export interface SerbianNewsDateParts {
  day: string;
  monthYear: string;
  archiveKey: string;
  archiveLabel: string;
}

export function newsDateParts(timestamp: string, locale: Locale = "sr"): SerbianNewsDateParts {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error(`Cannot format invalid news timestamp ${timestamp}`);
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const labels = MONTH_LABELS[locale];
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    monthYear: `${labels.abbreviations[month]} ${year}${locale === "en" ? "" : "."}`,
    archiveKey: `${year}-${String(month + 1).padStart(2, "0")}`,
    archiveLabel: `${labels.names[month]} ${year}${locale === "en" ? "" : "."}`,
  };
}

export function serbianNewsDateParts(timestamp: string): SerbianNewsDateParts {
  return newsDateParts(timestamp, "sr");
}
import type { Locale } from "../i18n/config.ts";
