import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

export const placeLocales = ["sr", "ru", "en"] as const;
export const translationStatuses = ["source", "missing", "draft", "in-review", "approved", "published", "outdated", "archived"] as const;
export type PlaceLocale = (typeof placeLocales)[number];
export type TranslationStatus = (typeof translationStatuses)[number];

export interface LocalizedNarrative {
  placeId: string;
  locale: PlaceLocale;
  editorialStatus: string;
  translationStatus: TranslationStatus;
  slug?: string;
  preferredName?: string;
  shortName?: string;
  alternateNames: unknown[];
  summary?: string;
  seoTitle?: string;
  seoDescription?: string;
  sourceRevision?: string;
  body: string;
  raw: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function isPlaceLocale(value: string): value is PlaceLocale {
  return (placeLocales as readonly string[]).includes(value);
}

export function parseLocalizedNarrative(
  text: string,
  file = "localized narrative",
): LocalizedNarrative {
  if (!text.startsWith("---\n")) throw new Error(`${file} has no front matter`);
  const closing = text.indexOf("\n---\n", 4);
  if (closing === -1) throw new Error(`${file} has unclosed front matter`);

  const document = parseDocument(`${text.slice(4, closing)}\n`, {
    uniqueKeys: true,
    prettyErrors: false,
  });
  if (document.errors.length > 0) {
    throw new Error(`${file} has invalid front matter: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (!isObject(value)) throw new Error(`${file} front matter must be a mapping`);
  if (typeof value.place_id !== "string") throw new Error(`${file} has no place_id`);
  if (typeof value.locale !== "string" || !isPlaceLocale(value.locale)) {
    throw new Error(`${file} has an unsupported locale`);
  }
  if (typeof value.editorial_status !== "string" || typeof value.translation_status !== "string") {
    throw new Error(`${file} has incomplete editorial state`);
  }
  if (!(translationStatuses as readonly string[]).includes(value.translation_status)) {
    throw new Error(`${file} has an unsupported translation status`);
  }
  if (value.locale === "sr" && value.translation_status !== "source") {
    throw new Error(`${file} must use translation_status: source for Serbian`);
  }
  if (value.locale !== "sr" && typeof value.source_revision !== "string") {
    throw new Error(`${file} must bind the translation to source_revision`);
  }

  const slug = optionalString(value.slug);
  const preferredName = optionalString(value.preferred_name);
  const shortName = optionalString(value.short_name);
  const summary = optionalString(value.summary);
  const seoTitle = optionalString(value.seo_title);
  const seoDescription = optionalString(value.seo_description);
  const sourceRevision = optionalString(value.source_revision);

  return {
    placeId: value.place_id,
    locale: value.locale,
    editorialStatus: value.editorial_status,
    translationStatus: value.translation_status as TranslationStatus,
    ...(slug !== undefined ? { slug } : {}),
    ...(preferredName !== undefined ? { preferredName } : {}),
    ...(shortName !== undefined ? { shortName } : {}),
    alternateNames: Array.isArray(value.alternate_names) ? value.alternate_names : [],
    ...(summary !== undefined ? { summary } : {}),
    ...(seoTitle !== undefined ? { seoTitle } : {}),
    ...(seoDescription !== undefined ? { seoDescription } : {}),
    ...(sourceRevision !== undefined ? { sourceRevision } : {}),
    body: text.slice(closing + 5),
    raw: value,
  };
}

export async function loadLocalizedNarrative(
  root: string,
  placeId: string,
  locale: PlaceLocale,
): Promise<LocalizedNarrative | undefined> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(placeId)) throw new Error(`Invalid place id: ${placeId}`);
  const file = path.join(root, "content", "places", placeId, "narratives", `${locale}.md`);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
  const narrative = parseLocalizedNarrative(text, file);
  if (narrative.placeId !== placeId || narrative.locale !== locale) {
    throw new Error(`${file} identity does not match its path`);
  }
  return narrative;
}
