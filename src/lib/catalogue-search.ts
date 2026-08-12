export interface CatalogueSearchFields {
  name: string;
  alternateNames?: readonly string[] | undefined;
  municipality?: string | undefined;
  settlement?: string | undefined;
  browseAreaLabel?: string | undefined;
  summary?: string | undefined;
}

export function catalogueSearchTokens(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("sr")
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function buildCatalogueSearchText(fields: CatalogueSearchFields): string {
  return [
    fields.name,
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
