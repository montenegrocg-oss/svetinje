import { resolveMediaUrl } from "../media-url.ts";

const ENTITY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SERBIAN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type UnknownRecord = Record<string, any>;

export interface EditorialPreviewEligibilityInput {
  id: string;
  place: UnknownRecord;
  narrative: UnknownRecord;
  narrativeBody: string;
  mediaRecords?: UnknownRecord[];
  knownSourceIds?: ReadonlySet<string>;
  repositoryPaths?: ReadonlySet<string>;
  validateMediaRecord?: (record: UnknownRecord) => boolean;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function mediaRightsAreComplete(media: UnknownRecord): boolean {
  return nonEmpty(media.creator)
    && nonEmpty(media.copyright_owner)
    && nonEmpty(media.rights_basis)
    && nonEmpty(media.credit_line)
    && Array.isArray(media.allowed_uses)
    && media.allowed_uses.includes("web-display")
    && media.publication_safety === "public";
}

function narrativeHasSection(body: string): boolean {
  return /^##\s+.+?\s+\{#[a-z0-9-]+\}\s*$/m.test(body);
}

export function editorialPreviewEligibilityErrors({
  id,
  place,
  narrative,
  narrativeBody,
  mediaRecords = [],
  knownSourceIds,
  repositoryPaths,
  validateMediaRecord,
}: EditorialPreviewEligibilityInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!ENTITY_ID.test(id) || place.id !== id) errors.id = "Објекат нема важећи технички ID.";
  if (["archived", "rejected"].includes(place.editorial_status)) errors.editorialStatus = "Архивиран или одбијен објекат не може бити у радном приказу.";
  if (narrative.place_id !== id || narrative.locale !== "sr") errors.narrative = "Објекат нема важећи српски текст.";
  if (["archived", "rejected"].includes(narrative.editorial_status)) errors.narrativeStatus = "Архивиран или одбијен српски текст не може бити у радном приказу.";
  if (narrative.translation_status !== "source") errors.translationStatus = "Српски текст мора бити изворни текст.";
  if (!nonEmpty(narrative.slug) || !SERBIAN_SLUG.test(narrative.slug)) errors.slug = "Унесите важећи српски slug прије додавања у радни приказ.";
  if (!nonEmpty(narrative.preferred_name)) errors.preferredName = "Попуните пожељни назив прије додавања у радни приказ.";
  if (!nonEmpty(narrative.summary)) errors.summary = "Попуните сажетак прије додавања у радни приказ.";
  if (!nonEmpty(place.place_type?.value)) errors.placeType = "Изаберите врсту објекта прије додавања у радни приказ.";
  if (!narrativeHasSection(narrativeBody)) errors.sections = "Објекат нема важеће одјељке српског текста.";

  const coordinates = place.location?.coordinates;
  if (coordinates !== undefined) {
    if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) errors.coordinates = "Координате морају садржати важећу ширину и дужину.";
    if (!nonEmpty(coordinates.accuracy)) errors.coordinateAccuracy = "Изаберите тачност координата.";
    if (coordinates.publication_safety !== "public") errors.publicationSafety = "Координате морају бити означене као јавне.";
  }

  if (knownSourceIds) {
    const sourceIds = [...new Set([
      ...(Array.isArray(place.source_ids) ? place.source_ids : []),
      ...(Array.isArray(narrative.source_ids) ? narrative.source_ids : []),
    ].filter((value): value is string => typeof value === "string"))];
    const missing = sourceIds.filter((sourceId) => !knownSourceIds.has(sourceId));
    if (missing.length > 0) errors.sources = `Недостају регистровани извори: ${missing.join(", ")}.`;
  }

  const relatedMedia = mediaRecords.filter((media) => Array.isArray(media.related_place_ids) && media.related_place_ids.includes(id));
  for (const media of relatedMedia) {
    const mediaId = nonEmpty(media.id) ? media.id : "непознат-медиј";
    const field = `media.${mediaId}`;
    if (validateMediaRecord && !validateMediaRecord(media)) {
      errors[field] = "Медијски запис није у складу са канонском шемом.";
      continue;
    }
    if (!["approved", "published"].includes(media.editorial_status)) {
      errors[field] = "Медиј мора бити одобрен за радни приказ.";
      continue;
    }
    if (!mediaRightsAreComplete(media)) {
      errors[field] = "Медиј нема потпуне податке о правима за веб-приказ.";
      continue;
    }
    const localized = media.localized_text?.sr;
    if (!localized || (!nonEmpty(localized.alt_text) && localized.decorative !== true)) {
      errors[field] = "Медиј нема важећи српски алтернативни опис.";
      continue;
    }
    if (!resolveMediaUrl({ storageProvider: media.storage_provider, objectKey: media.object_key })) {
      errors[field] = "Медиј нема подржану R2 или локалну путању.";
      continue;
    }
    if (media.storage_provider === "local-public" && repositoryPaths && !repositoryPaths.has(media.object_key)) {
      errors[field] = "Локална медијска датотека не постоји у уређивачкој грани.";
    }
  }

  return errors;
}

export function parseEditorialPreviewRegistry(value: unknown, knownPlaceIds?: ReadonlySet<string>): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("validation/editorial-preview.json must contain a JSON object");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.hasOwn(record, "place_ids")) throw new Error("validation/editorial-preview.json may contain only place_ids");
  if (!Array.isArray(record.place_ids)) throw new Error("place_ids must be an array");
  if (!record.place_ids.every((id) => typeof id === "string" && ENTITY_ID.test(id))) throw new Error("place_ids must contain valid lowercase ASCII kebab-case entity IDs");
  const ids = record.place_ids as string[];
  if (new Set(ids).size !== ids.length) throw new Error("place_ids must not contain duplicates");
  if (knownPlaceIds) for (const id of ids) if (!knownPlaceIds.has(id)) throw new Error(`unknown allowlisted place ID ${id}`);
  return ids;
}

export function serializeEditorialPreviewRegistry(ids: readonly string[]): string {
  return `${JSON.stringify({ place_ids: [...ids] }, null, 2)}\n`;
}
