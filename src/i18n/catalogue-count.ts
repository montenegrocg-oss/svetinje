import type { Locale } from "./config.ts";

export type CatalogueCountKind = "monasteries" | "churches" | "holyPlaces";

const nounForms: Record<Locale, Record<CatalogueCountKind, readonly [string, string, string]>> = {
  sr: {
    monasteries: ["манастир", "манастира", "манастира"],
    churches: ["црква", "цркве", "цркава"],
    holyPlaces: ["светиња", "светиње", "светиња"],
  },
  ru: {
    monasteries: ["монастырь", "монастыря", "монастырей"],
    churches: ["церковь", "церкви", "церквей"],
    holyPlaces: ["святыня", "святыни", "святынь"],
  },
  en: {
    monasteries: ["monastery", "monasteries", "monasteries"],
    churches: ["church", "churches", "churches"],
    holyPlaces: ["holy place", "holy places", "holy places"],
  },
};

export function pluralFormIndex(count: number): 0 | 1 | 2 {
  const normalized = Math.abs(Math.trunc(count));
  const finalTwoDigits = normalized % 100;
  if (finalTwoDigits >= 11 && finalTwoDigits <= 14) return 2;
  const finalDigit = normalized % 10;
  if (finalDigit === 1) return 0;
  if (finalDigit >= 2 && finalDigit <= 4) return 1;
  return 2;
}

export function formatCatalogueCount(count: number, locale: Locale, kind: CatalogueCountKind): string {
  const formIndex = locale === "en" ? (count === 1 ? 0 : 2) : pluralFormIndex(count);
  return `${count} ${nounForms[locale][kind][formIndex]}`;
}

export function formatCatalogueResultCount(count: number, locale: Locale, kind: CatalogueCountKind): string {
  const prefix = locale === "sr" ? "Пронађено:" : locale === "ru" ? "Найдено:" : "Found:";
  return `${prefix} ${formatCatalogueCount(count, locale, kind)}`;
}
