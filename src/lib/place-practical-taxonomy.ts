import type { Locale } from "../i18n/config.ts";
import { placeTaxonomyCatalogueHref, placeTaxonomyLabel } from "../i18n/place-taxonomy.ts";
import type { VisiblePlace } from "./content/publication.ts";
import { categoryForPlaceType } from "./place-filters.ts";

type PlacePracticalTaxonomyInput = Pick<
  VisiblePlace,
  "placeType" | "settlement" | "municipality" | "municipalityId" | "eparchyId" | "ecclesiasticalJurisdiction"
>;

export interface PlacePracticalTaxonomyValue {
  value: string;
  href?: string;
}

export interface PlacePracticalTaxonomy {
  location: string;
  municipality?: PlacePracticalTaxonomyValue;
  eparchy?: PlacePracticalTaxonomyValue;
  legacyJurisdiction?: string;
}

function linkedTaxonomyValue(
  locale: Locale,
  category: ReturnType<typeof categoryForPlaceType>,
  kind: "eparchy" | "municipality",
  id: string | undefined,
): PlacePracticalTaxonomyValue | undefined {
  if (!id) return undefined;
  const value = placeTaxonomyLabel(locale, kind, id);
  if (!value) return undefined;
  const href = placeTaxonomyCatalogueHref(locale, category, kind, id);
  return { value, ...(href ? { href } : {}) };
}

export function placePracticalTaxonomy(
  place: PlacePracticalTaxonomyInput,
  locale: Locale,
): PlacePracticalTaxonomy {
  const category = categoryForPlaceType(place.placeType);
  const municipality = linkedTaxonomyValue(locale, category, "municipality", place.municipalityId);
  const eparchy = linkedTaxonomyValue(locale, category, "eparchy", place.eparchyId);
  const location = [place.settlement, municipality ? undefined : place.municipality].filter(Boolean).join(" · ");

  return {
    location,
    ...(municipality ? { municipality } : {}),
    ...(eparchy ? { eparchy } : {}),
    ...(!eparchy && place.ecclesiasticalJurisdiction
      ? { legacyJurisdiction: place.ecclesiasticalJurisdiction }
      : {}),
  };
}
