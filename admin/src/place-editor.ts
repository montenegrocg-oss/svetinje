import { parse, stringify } from "yaml";
import { isPlaceAreaId } from "../../src/lib/place-areas.ts";
import {
  CANONICAL_SCHEMA_FINGERPRINT,
  validateNarrative,
  validatePlace,
} from "./generated/canonical-validators.js";
import { AdminError, internalFailure } from "./errors.ts";
import type { CanonicalOptions, EditablePlaceRecord, NarrativeSection } from "./repository-content.ts";
import { parseNarrative, serializeNarrative, serializeNarrativeSections } from "./repository-content.ts";
import { fingerprintCanonicalSchemas } from "./schema-fingerprint.ts";

export interface UpdatePlaceBody {
  expectedHeadSha?: unknown;
  preferredName?: unknown;
  shortName?: unknown;
  slug?: unknown;
  placeType?: unknown;
  browseAreaId?: unknown;
  summary?: unknown;
  jurisdiction?: unknown;
  countryCode?: unknown;
  municipality?: unknown;
  settlement?: unknown;
  postalAddress?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  coordinateAccuracy?: unknown;
  publicationSafety?: unknown;
  alternateNames?: unknown;
  sections?: unknown;
}

export interface UpdatedCanonicalFiles {
  placeYaml: string;
  narrativeMarkdown: string;
  place: Record<string, any>;
  narrative: Record<string, any>;
  unchanged: boolean;
}

const text = (value: unknown) => typeof value === "string" ? value.trim() : undefined;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const requiredText = (value: unknown, field: string, errors: Record<string, string>) => {
  const result = text(value);
  if (!result) errors[field] = "Поље је обавезно.";
  return result;
};

function resetVerification() {
  return { status: "requires-verification" };
}

function setFact(container: Record<string, any>, key: string, nextValue: string | undefined): void {
  const current = container[key];
  if (!nextValue) {
    delete container[key];
    return;
  }
  if (current?.value === nextValue) return;
  container[key] = { value: nextValue, verification: resetVerification() };
}

function parseOptionalNumber(value: unknown, field: string, min: number, max: number, errors: Record<string, string>): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    errors[field] = `Унесите број између ${min} и ${max}.`;
    return undefined;
  }
  return numeric;
}

function validateAlternateNames(value: unknown, options: CanonicalOptions, errors: Record<string, string>) {
  if (!Array.isArray(value)) {
    errors.alternateNames = "Алтернативни називи морају бити листа.";
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors[`alternateNames.${index}`] = "Запис није важећи.";
      return [];
    }
    const record = entry as Record<string, unknown>;
    const name = requiredText(record.name, `alternateNames.${index}.name`, errors);
    const context = requiredText(record.context, `alternateNames.${index}.context`, errors);
    const sourceIds = Array.isArray(record.sourceIds) ? record.sourceIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0) : [];
    if (sourceIds.length === 0 || sourceIds.some((id) => !options.sourceIds.includes(id))) errors[`alternateNames.${index}.sourceIds`] = "Изаберите постојећи регистровани извор.";
    const verificationStatus = text(record.verificationStatus);
    if (!verificationStatus || !options.verificationStatuses.includes(verificationStatus)) errors[`alternateNames.${index}.verificationStatus`] = "Статус провјере није подржан.";
    return name && context && verificationStatus ? [{ name, context, source_ids: [...new Set(sourceIds)], verification_status: verificationStatus }] : [];
  });
}

function validateSections(value: unknown, original: NarrativeSection[], options: CanonicalOptions, errors: Record<string, string>): NarrativeSection[] {
  if (!Array.isArray(value)) {
    errors.sections = "Одељци морају бити листа.";
    return [];
  }
  const sections = value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors[`sections.${index}`] = "Одељак није важећи.";
      return [];
    }
    const record = entry as Record<string, unknown>;
    const id = text(record.id);
    const title = requiredText(record.title, `sections.${index}.title`, errors);
    if (!id || !options.narrativeSectionIds.includes(id)) errors[`sections.${index}.id`] = "Канонски ID одељка није подржан.";
    const paragraphs = Array.isArray(record.paragraphs)
      ? record.paragraphs.filter((paragraph): paragraph is string => typeof paragraph === "string").map((paragraph) => paragraph.trim()).filter(Boolean)
      : [];
    if (!Array.isArray(record.paragraphs)) errors[`sections.${index}.paragraphs`] = "Пасуси морају бити листа.";
    return id && title ? [{ id, title, paragraphs }] : [];
  });
  if (new Set(sections.map(({ id }) => id)).size !== sections.length) errors.sections = "ID одељка се не смије поновити.";
  for (const existing of original) if (!sections.some(({ id }) => id === existing.id)) errors.sections = "Постојећи канонски одељци се не смију уклонити у овој фази.";
  return sections;
}

function assertSafeMarkdown(body: string, errors: Record<string, string>): void {
  if (/<\/?(?:script|iframe|object|embed|form|input|button|style|link|meta)\b/i.test(body) || /\son[a-z]+\s*=/i.test(body) || /(?:javascript|data|vbscript):/i.test(body)) {
    errors.sections = "Текст садржи небезбједан HTML или URI.";
  }
}

export async function updateCanonicalPlace(record: EditablePlaceRecord, body: UpdatePlaceBody, actor: string, now: Date): Promise<UpdatedCanonicalFiles> {
  const errors: Record<string, string> = {};
  const preferredName = requiredText(body.preferredName, "preferredName", errors);
  const slug = requiredText(body.slug, "slug", errors);
  const placeType = requiredText(body.placeType, "placeType", errors);
  const browseAreaId = text(body.browseAreaId);
  const summary = requiredText(body.summary, "summary", errors);
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Slug мора бити lowercase ASCII kebab-case.";
  if (placeType && !record.options.placeTypes.includes(placeType)) errors.placeType = "Врста објекта није подржана.";
  if (browseAreaId && !isPlaceAreaId(browseAreaId)) errors.browseAreaId = "Област није дио важећег каталога.";
  const countryCode = text(body.countryCode);
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) errors.countryCode = "Код државе мора имати два велика ASCII слова.";
  const latitude = parseOptionalNumber(body.latitude, "latitude", -90, 90, errors);
  const longitude = parseOptionalNumber(body.longitude, "longitude", -180, 180, errors);
  if ((latitude === undefined) !== (longitude === undefined)) errors.coordinates = "Ширина и дужина морају бити попуњене или обрисане заједно.";
  const coordinateAccuracy = text(body.coordinateAccuracy);
  const publicationSafety = text(body.publicationSafety);
  if (latitude !== undefined && (!coordinateAccuracy || !record.options.coordinateAccuracy.includes(coordinateAccuracy))) errors.coordinateAccuracy = "Изаберите подржану тачност.";
  if (latitude !== undefined && (!publicationSafety || !record.options.publicationSafety.includes(publicationSafety))) errors.publicationSafety = "Изаберите подржан ниво јавне безбједности.";
  if (record.place.inPreview && latitude !== undefined && longitude !== undefined && publicationSafety !== "public") {
    errors.publicationSafety = "Координате објекта у радном приказу морају бити означене као јавне.";
  }
  const alternateNames = validateAlternateNames(body.alternateNames ?? [], record.options, errors);
  const sections = validateSections(body.sections ?? [], record.place.sections, record.options, errors);
  const narrativeBody = serializeNarrativeSections(sections, record.narrativeBody);
  assertSafeMarkdown(narrativeBody, errors);
  if (["approved", "published"].includes(String(record.rawNarrative.editorial_status))) {
    const sectionSources = record.rawNarrative.section_sources && typeof record.rawNarrative.section_sources === "object"
      ? record.rawNarrative.section_sources as Record<string, unknown>
      : {};
    for (const section of sections) {
      const sources = sectionSources[section.id];
      if (!Array.isArray(sources) || sources.length === 0) {
        errors[`sections.${section.id}`] = "Одобрени текст мора задржати регистроване изворе за сваки одјељак.";
      }
    }
  }
  if (Object.keys(errors).length > 0) throw new AdminError("invalid_form_data", 400, "Place update is invalid", errors);

  const place = structuredClone(record.rawPlace);
  const narrative = structuredClone(record.rawNarrative);
  if (browseAreaId) place.browse_area_id = browseAreaId; else delete place.browse_area_id;
  place.place_type ??= {};
  if (place.place_type.value !== placeType) place.place_type = { value: placeType, verification: resetVerification() };
  place.ecclesiastical ??= {};
  setFact(place.ecclesiastical, "jurisdiction", text(body.jurisdiction));
  place.location ??= {};
  setFact(place.location, "country_code", countryCode);
  setFact(place.location, "municipality", text(body.municipality));
  setFact(place.location, "settlement", text(body.settlement));
  setFact(place.location, "postal_address", text(body.postalAddress));
  if (latitude === undefined || longitude === undefined) {
    delete place.location.coordinates;
  } else {
    const nextCoordinateValues = { latitude, longitude, accuracy: coordinateAccuracy, publication_safety: publicationSafety };
    const current = place.location.coordinates;
    const currentValues = current && { latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy, publication_safety: current.publication_safety };
    if (!same(currentValues, nextCoordinateValues)) place.location.coordinates = { ...nextCoordinateValues, crs: "EPSG:4326", verification: resetVerification() };
  }

  narrative.preferred_name = preferredName;
  narrative.slug = slug;
  narrative.summary = summary;
  const shortName = text(body.shortName);
  if (shortName) narrative.short_name = shortName; else delete narrative.short_name;
  if (alternateNames.length > 0) narrative.alternate_names = alternateNames; else delete narrative.alternate_names;
  const unchanged = same(place, record.rawPlace)
    && same(narrative, record.rawNarrative)
    && narrativeBody === record.narrativeBody;
  if (!unchanged) {
    const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
    place.audit = { ...place.audit, updated_at: timestamp, updated_by: actor };
    narrative.audit = { ...narrative.audit, updated_at: timestamp, updated_by: actor };
  }

  const placeYaml = stringify(place, { lineWidth: 0 });
  const narrativeMarkdown = serializeNarrative(narrative, narrativeBody);
  if (!parse(placeYaml) || !parseNarrative(narrativeMarkdown).frontMatter) throw new AdminError("invalid_form_data", 400, "Serialized content is invalid");
  const loadedSchemaFingerprint = await fingerprintCanonicalSchemas(record.schemas);
  if (loadedSchemaFingerprint !== CANONICAL_SCHEMA_FINGERPRINT) {
    throw internalFailure("canonical_schema_fingerprint_mismatch");
  }
  const canonicalErrors: Record<string, string> = {};
  if (!validatePlace(place)) for (const error of validatePlace.errors ?? []) canonicalErrors[`place${error.instancePath || "/"}`] = error.message ?? "Није важеће.";
  if (!validateNarrative(narrative)) for (const error of validateNarrative.errors ?? []) canonicalErrors[`narrative${error.instancePath || "/"}`] = error.message ?? "Није важеће.";
  if (Object.keys(canonicalErrors).length > 0) throw new AdminError("invalid_form_data", 400, "Canonical schema validation failed", canonicalErrors);
  return { placeYaml, narrativeMarkdown, place, narrative, unchanged };
}
