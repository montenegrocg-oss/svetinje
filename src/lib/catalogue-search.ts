export interface CatalogueSearchFields {
  name: string;
  slug?: string | undefined;
  alternateNames?: readonly string[] | undefined;
  municipality?: string | undefined;
  settlement?: string | undefined;
  browseAreaLabel?: string | undefined;
  summary?: string | undefined;
}

const SERBIAN_CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  А: "A", а: "a", Б: "B", б: "b", В: "V", в: "v", Г: "G", г: "g",
  Д: "D", д: "d", Ђ: "Đ", ђ: "đ", Е: "E", е: "e", Ж: "Ž", ж: "ž",
  З: "Z", з: "z", И: "I", и: "i", Ј: "J", ј: "j", К: "K", к: "k",
  Л: "L", л: "l", Љ: "Lj", љ: "lj", М: "M", м: "m", Н: "N", н: "n",
  Њ: "Nj", њ: "nj", О: "O", о: "o", П: "P", п: "p", Р: "R", р: "r",
  С: "S", с: "s", Т: "T", т: "t", Ћ: "Ć", ћ: "ć", У: "U", у: "u",
  Ф: "F", ф: "f", Х: "H", х: "h", Ц: "C", ц: "c", Ч: "Č", ч: "č",
  Џ: "Dž", џ: "dž", Ш: "Š", ш: "š",
};

export function transliterateSerbianCyrillic(value: string): string {
  return Array.from(value, (character) => SERBIAN_CYRILLIC_TO_LATIN[character] ?? character).join("");
}

export function normalizeCatalogueSearchText(value: string): string {
  return transliterateSerbianCyrillic(value.normalize("NFKC"))
    .toLocaleLowerCase("sr")
    .replaceAll("đ", "dj")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

export function catalogueSearchTokens(value: string): string[] {
  return normalizeCatalogueSearchText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function buildCatalogueSearchText(fields: CatalogueSearchFields): string {
  return [
    fields.name,
    fields.slug,
    ...(fields.alternateNames ?? []),
    fields.municipality,
    fields.settlement,
    fields.browseAreaLabel,
    fields.summary,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

export function matchesCatalogueSearch(indexedText: string, query: string): boolean {
  const queryTokens = catalogueSearchTokens(query);
  if (queryTokens.length === 0) return true;

  const indexedTokens = catalogueSearchTokens(indexedText);
  return queryTokens.every((queryToken) =>
    indexedTokens.some((indexedToken) => indexedToken.startsWith(queryToken))
  );
}
