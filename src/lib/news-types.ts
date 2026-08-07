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
