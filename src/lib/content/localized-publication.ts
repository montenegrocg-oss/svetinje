import { buildCatalogueSearchText } from "../catalogue-search.ts";
import { areaLabels, localizedPlaceType } from "../../i18n/public-copy.ts";
import type { Locale } from "../../i18n/config.ts";
import { loadLocalizedNarrative, type TranslationStatus } from "./localized-narrative.ts";
import { isEditorialPreviewBuild, loadVisiblePlaces, type VisiblePlace } from "./publication.ts";

export interface LocalizedVisiblePlace extends VisiblePlace {
  locale: Locale;
  seoTitle?: string;
  seoDescription?: string;
  translationStatus?: TranslationStatus;
}

const previewTranslationStatuses = new Set<TranslationStatus>(["draft", "in-review", "approved", "published"]);
const localizedPlacesCache = new Map<string, Promise<LocalizedVisiblePlace[]>>();
export function translationIsVisible(status: TranslationStatus, editorialPreview: boolean): boolean {
  return editorialPreview ? previewTranslationStatuses.has(status) : status === "published";
}

function alternateNames(value: unknown[]): string[] {
  return value.flatMap((item) => item && typeof item === "object" && "name" in item && typeof item.name === "string" ? [item.name] : []);
}

async function loadLocalizedVisiblePlacesUncached(locale: Locale, root: string, editorialPreview: boolean): Promise<LocalizedVisiblePlace[]> {
  const basePlaces = await loadVisiblePlaces(root, { editorialPreview });
  if (locale === "sr") return basePlaces.map((place) => ({ ...place, locale }));
  const localized = await Promise.all(basePlaces.map(async (place) => {
    const narrative = await loadLocalizedNarrative(root, place.id, locale);
    if (!narrative || !translationIsVisible(narrative.translationStatus, editorialPreview)) return undefined;
    if (!narrative.slug?.trim() || !narrative.preferredName?.trim()) return undefined;
    const summary = narrative.summary?.trim() ?? "";
    const names = alternateNames(narrative.alternateNames);
    const browseAreaLabel = place.browseAreaId ? areaLabels[locale][place.browseAreaId] : undefined;
    const catalogueSearchText = buildCatalogueSearchText({ name: narrative.preferredName, slug: narrative.slug, alternateNames: names, municipality: place.municipality, settlement: place.settlement, browseAreaLabel, summary });
    const {
      patronalFeasts: _serbianFeasts,
      patronalFeastReferences: _serbianFeastReferences,
      unlinkedPatronalFeasts: _serbianUnlinkedFeasts,
      serviceSchedule: _serbianSchedule,
      ...localeNeutralPlace
    } = place;
    return {
      ...localeNeutralPlace, locale, slug: narrative.slug, name: narrative.preferredName, summary,
      patronalFeasts: narrative.patronalFeasts,
      patronalFeastReferences: [],
      unlinkedPatronalFeasts: narrative.patronalFeasts,
      ...(narrative.serviceSchedule ? { serviceSchedule: narrative.serviceSchedule } : {}),
      typeLabel: localizedPlaceType(locale, place.placeType), catalogueSearchText,
      searchText: [narrative.preferredName, ...names, summary, narrative.body, place.municipality, place.settlement, browseAreaLabel].filter(Boolean).join(" "),
      narrativeBody: narrative.body, narrativeSections: [], previewImageAlt: narrative.preferredName,
      galleryImages: place.galleryImages.map((image) => ({ ...image, alt: narrative.preferredName! })),
      ...(narrative.seoTitle ? { seoTitle: narrative.seoTitle } : {}),
      ...(narrative.seoDescription ? { seoDescription: narrative.seoDescription } : {}),
      translationStatus: narrative.translationStatus,
    } satisfies LocalizedVisiblePlace;
  }));
  return localized.flatMap((place) => place ? [place as LocalizedVisiblePlace] : []);
}

export function loadLocalizedVisiblePlaces(locale: Locale, root = process.cwd(), options: { editorialPreview?: boolean } = {}): Promise<LocalizedVisiblePlace[]> {
  const editorialPreview = options.editorialPreview ?? isEditorialPreviewBuild();
  const key = `${root}\0${editorialPreview ? "preview" : "production"}\0${locale}`;
  const existing = localizedPlacesCache.get(key);
  if (existing) return existing;
  const pending = loadLocalizedVisiblePlacesUncached(locale, root, editorialPreview).catch((error) => {
    localizedPlacesCache.delete(key);
    throw error;
  });
  localizedPlacesCache.set(key, pending);
  return pending;
}

export async function localizedSlugsForPlace(placeId: string, root = process.cwd(), options: { editorialPreview?: boolean } = {}): Promise<Partial<Record<Locale, string>>> {
  const entries = await Promise.all((["sr", "ru", "en"] as const).map(async (locale) => {
    const place = (await loadLocalizedVisiblePlaces(locale, root, options)).find((candidate) => candidate.id === placeId);
    return place ? [locale, place.slug] as const : undefined;
  }));
  return Object.fromEntries(entries.filter(Boolean) as Array<readonly [Locale, string]>);
}
