export interface CatalogueSearchFields {
  name: string;
  canonicalId?: string | undefined;
  slug?: string | undefined;
  alternateNames?: readonly string[] | undefined;
  municipality?: string | undefined;
  settlement?: string | undefined;
  browseAreaLabel?: string | undefined;
  summary?: string | undefined;
}

export const CATALOGUE_SEARCH_RELEVANCE = Object.freeze({
  exactName: 9_000,
  exactAlternateName: 8_000,
  nameStart: 7_000,
  alternateNameStart: 6_000,
  nameTokens: 5_000,
  canonical: 4_000,
  location: 3_000,
  browseArea: 2_000,
  broadText: 1_000,
} as const);

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

function normalizedPhrase(value: string): string {
  return catalogueSearchTokens(value).join(" ");
}

function tokensMatchField(field: string | undefined, queryTokens: readonly string[]): boolean {
  if (!field) return false;
  const fieldTokens = catalogueSearchTokens(field);
  return queryTokens.every((queryToken) =>
    fieldTokens.some((fieldToken) => fieldToken.startsWith(queryToken))
  );
}

function fieldMatchesExact(field: string | undefined, queryPhrase: string): boolean {
  return Boolean(field) && normalizedPhrase(field ?? "") === queryPhrase;
}

function fieldStartsWithQuery(field: string | undefined, queryPhrase: string): boolean {
  return Boolean(field) && normalizedPhrase(field ?? "").startsWith(queryPhrase);
}

/**
 * Returns a deterministic relevance score for an active catalogue query.
 * Empty queries and non-matches return null so callers can keep their own
 * default ordering without accidentally treating it as search relevance.
 */
export function scoreCatalogueSearch(
  fields: CatalogueSearchFields,
  query: string,
): number | null {
  const queryTokens = catalogueSearchTokens(query);
  if (queryTokens.length === 0) return null;

  const queryPhrase = queryTokens.join(" ");
  const alternateNames = fields.alternateNames ?? [];
  const broadText = [buildCatalogueSearchText(fields), fields.canonicalId]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" ");

  if (!tokensMatchField(broadText, queryTokens)) return null;
  if (fieldMatchesExact(fields.name, queryPhrase)) return CATALOGUE_SEARCH_RELEVANCE.exactName;
  if (alternateNames.some((name) => fieldMatchesExact(name, queryPhrase))) {
    return CATALOGUE_SEARCH_RELEVANCE.exactAlternateName;
  }
  if (fieldStartsWithQuery(fields.name, queryPhrase)) return CATALOGUE_SEARCH_RELEVANCE.nameStart;
  if (alternateNames.some((name) => fieldStartsWithQuery(name, queryPhrase))) {
    return CATALOGUE_SEARCH_RELEVANCE.alternateNameStart;
  }
  if (tokensMatchField(fields.name, queryTokens)) return CATALOGUE_SEARCH_RELEVANCE.nameTokens;
  if (
    tokensMatchField(fields.canonicalId, queryTokens) ||
    tokensMatchField(fields.slug, queryTokens)
  ) {
    return CATALOGUE_SEARCH_RELEVANCE.canonical;
  }
  if (
    tokensMatchField(fields.settlement, queryTokens) ||
    tokensMatchField(fields.municipality, queryTokens)
  ) {
    return CATALOGUE_SEARCH_RELEVANCE.location;
  }
  if (tokensMatchField(fields.browseAreaLabel, queryTokens)) {
    return CATALOGUE_SEARCH_RELEVANCE.browseArea;
  }

  return CATALOGUE_SEARCH_RELEVANCE.broadText;
}

export function matchesCatalogueSearchFields(
  fields: CatalogueSearchFields,
  query: string,
): boolean {
  return catalogueSearchTokens(query).length === 0 || scoreCatalogueSearch(fields, query) !== null;
}
