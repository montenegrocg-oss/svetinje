import { parse, stringify } from "yaml";
import { isPlaceAreaId } from "../../src/lib/place-areas.ts";
import { canonicalYoutubeUrl, normalizeUnifiedNarrativeBody } from "../../src/lib/place-content.ts";
import {
  CANONICAL_SCHEMA_FINGERPRINT,
  validateNarrative,
  validatePlace,
} from "./generated/canonical-validators.js";
import { AdminError, internalFailure } from "./errors.ts";
import type { CanonicalOptions, EditablePlaceRecord } from "./repository-content.ts";
import { parseNarrative, serializeNarrative } from "./repository-content.ts";
import { fingerprintCanonicalSchemas } from "./schema-fingerprint.ts";

export interface UpdatePlaceBody {
  expectedHeadSha?: unknown;
  preferredName?: unknown;
  shortName?: unknown;
  slug?: unknown;
  placeType?: unknown;
  monasticCommunity?: unknown;
  browseAreaId?: unknown;
  summary?: unknown;
  jurisdiction?: unknown;
  municipality?: unknown;
  settlement?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  alternateNames?: unknown;
  narrativeBody?: unknown;
  patronalFeast?: unknown;
  youtubeUrl?: unknown;
}

export interface UpdatedCanonicalFiles {
  placeYaml: string;
  narrativeMarkdown: string;
  place: Record<string, any>;
  narrative: Record<string, any>;
  unchanged: boolean;
}

const text = (value: unknown) => typeof value === "string" ? value.trim() : undefined;
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
};
const same = (left: unknown, right: unknown) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
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

function validateAlternateNames(value: unknown, original: unknown, options: CanonicalOptions, errors: Record<string, string>) {
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
    const verificationStatus = text(record.verificationStatus);
    if (!verificationStatus || !options.verificationStatuses.includes(verificationStatus)) errors[`alternateNames.${index}.verificationStatus`] = "Статус провјере није подржан.";
    const legacy = Array.isArray(original) && original[index] && typeof original[index] === "object"
      ? original[index] as Record<string, unknown>
      : undefined;
    const sourceIds = Array.isArray(legacy?.source_ids)
      ? legacy.source_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    return name && context && verificationStatus ? [{ name, context, ...(sourceIds.length ? { source_ids: [...new Set(sourceIds)] } : {}), verification_status: verificationStatus }] : [];
  });
}

function assertSafeMarkdown(body: string, errors: Record<string, string>): void {
  if (/<\/?(?:script|iframe|object|embed|form|input|button|style|link|meta)\b/i.test(body) || /\son[a-z]+\s*=/i.test(body) || /(?:javascript|data|vbscript):/i.test(body)) {
    errors.narrativeBody = "Текст садржи небезбједан HTML или URI.";
  }
}

export function migrateLegacyNarrativeProvenance(narrative: Record<string, any>) {
  const sourceIds: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || seen.has(value)) return;
    seen.add(value);
    sourceIds.push(value);
  };
  for (const value of Array.isArray(narrative.source_ids) ? narrative.source_ids : []) add(value);
  for (const values of Object.values(narrative.section_sources ?? {})) {
    for (const value of Array.isArray(values) ? values : []) add(value);
  }
  if (sourceIds.length > 0) narrative.source_ids = sourceIds;
  else delete narrative.source_ids;
  delete narrative.section_sources;
  return narrative;
}

export async function updateCanonicalPlace(record: EditablePlaceRecord, body: UpdatePlaceBody, actor: string, now: Date): Promise<UpdatedCanonicalFiles> {
  const errors: Record<string, string> = {};
  const preferredName = requiredText(body.preferredName, "preferredName", errors);
  const slug = requiredText(body.slug, "slug", errors);
  const placeType = requiredText(body.placeType, "placeType", errors);
  const monasticCommunity = text(body.monasticCommunity);
  const browseAreaId = text(body.browseAreaId);
  const summary = text(body.summary);
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Slug мора бити lowercase ASCII kebab-case.";
  if (placeType && !record.options.placeTypes.includes(placeType)) errors.placeType = "Врста објекта није подржана.";
  if (
    body.monasticCommunity !== undefined
    && body.monasticCommunity !== null
    && body.monasticCommunity !== ""
    && (!monasticCommunity || !record.options.monasticCommunities.includes(monasticCommunity as "male" | "female"))
  ) {
    errors.monasticCommunity = "Тип манастира није подржан.";
  }
  if (browseAreaId && !isPlaceAreaId(browseAreaId)) errors.browseAreaId = "Област није дио важећег каталога.";
  const latitude = parseOptionalNumber(body.latitude, "latitude", -90, 90, errors);
  const longitude = parseOptionalNumber(body.longitude, "longitude", -180, 180, errors);
  if ((latitude === undefined) !== (longitude === undefined)) errors.coordinates = "Унесите и географску ширину и географску дужину.";
  const currentCoordinates = record.rawPlace.location?.coordinates;
  const coordinateAccuracy = record.options.coordinateAccuracy.includes(currentCoordinates?.accuracy)
    ? currentCoordinates.accuracy
    : "complex-centroid";
  const publicationSafety = record.options.publicationSafety.includes(currentCoordinates?.publication_safety)
    ? currentCoordinates.publication_safety
    : "public";
  const coordinateCrs = currentCoordinates?.crs === "EPSG:4326" ? currentCoordinates.crs : "EPSG:4326";
  if (record.place.inPreview && latitude !== undefined && longitude !== undefined && publicationSafety !== "public") {
    errors.publicationSafety = "Координате објављеног објекта морају бити означене као јавне.";
  }
  const alternateNames = validateAlternateNames(body.alternateNames ?? [], record.rawNarrative.alternate_names, record.options, errors);
  const narrativeBody = normalizeUnifiedNarrativeBody(body.narrativeBody);
  if (narrativeBody === undefined) errors.narrativeBody = "Главни текст мора бити текстуално поље.";
  const rawYoutubeUrl = text(body.youtubeUrl);
  const youtubeUrl = rawYoutubeUrl ? canonicalYoutubeUrl(rawYoutubeUrl) : undefined;
  if (rawYoutubeUrl && !youtubeUrl) errors.youtubeUrl = "Унесите важећи YouTube линк.";
  const patronalFeast = text(body.patronalFeast);
  assertSafeMarkdown(narrativeBody ?? "", errors);
  if (Object.keys(errors).length > 0) throw new AdminError("invalid_form_data", 400, "Place update is invalid", errors);

  const place = structuredClone(record.rawPlace);
  const narrative = migrateLegacyNarrativeProvenance(structuredClone(record.rawNarrative));
  if (browseAreaId) place.browse_area_id = browseAreaId; else delete place.browse_area_id;
  place.place_type ??= {};
  if (place.place_type.value !== placeType) place.place_type = { value: placeType, verification: resetVerification() };
  place.ecclesiastical ??= {};
  setFact(place.ecclesiastical, "jurisdiction", text(body.jurisdiction));
  setFact(place.ecclesiastical, "community_type", placeType === "monastery" ? monasticCommunity : undefined);
  if (patronalFeast) place.patronal_feast = { name: patronalFeast }; else delete place.patronal_feast;
  if (youtubeUrl) place.video = { youtube_url: youtubeUrl }; else delete place.video;
  place.location ??= {};
  setFact(place.location, "municipality", text(body.municipality));
  setFact(place.location, "settlement", text(body.settlement));
  if (latitude === undefined || longitude === undefined) {
    delete place.location.coordinates;
  } else {
    const nextCoordinateValues = { latitude, longitude, accuracy: coordinateAccuracy, publication_safety: publicationSafety, crs: coordinateCrs };
    const current = place.location.coordinates;
    const currentValues = current && { latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy, publication_safety: current.publication_safety, crs: current.crs };
    if (!same(currentValues, nextCoordinateValues)) place.location.coordinates = { ...nextCoordinateValues, verification: resetVerification() };
  }

  narrative.preferred_name = preferredName;
  narrative.slug = slug;
  if (summary) narrative.summary = summary; else delete narrative.summary;
  const shortName = text(body.shortName);
  if (shortName) narrative.short_name = shortName; else delete narrative.short_name;
  if (alternateNames.length > 0) narrative.alternate_names = alternateNames; else delete narrative.alternate_names;
  const unchanged = same(place, record.rawPlace)
    && same(narrative, record.rawNarrative)
    && narrativeBody === normalizeUnifiedNarrativeBody(record.narrativeBody);
  if (!unchanged) {
    const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
    place.audit = { ...place.audit, updated_at: timestamp, updated_by: actor };
    narrative.audit = { ...narrative.audit, updated_at: timestamp, updated_by: actor };
  }

  const placeYaml = stringify(place, { lineWidth: 0 });
  const narrativeMarkdown = serializeNarrative(narrative, narrativeBody ?? "");
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
