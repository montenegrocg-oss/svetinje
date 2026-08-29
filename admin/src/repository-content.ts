import { parse, stringify } from "yaml";
import { parseEditorialPreviewRegistry } from "../../src/lib/content/editorial-preview-eligibility.ts";
import { resolveMediaUrl } from "../../src/lib/media-url.ts";
import { PLACE_AREAS } from "../../src/lib/place-areas.ts";
import { AdminError, internalFailure } from "./errors.ts";
import {
  parseFeastRegistry,
  resolvePatronalFeastIds,
  type FeastRecord,
  type FeastRegistrySnapshot,
} from "./feast-registry.ts";
import type { BranchState, GitRepository, TreeEntry } from "./types.ts";

export type MonasticCommunity = "male" | "female";
export type NarrativeLocale = "sr" | "ru" | "en";

export interface TaxonomyOption {
  id: string;
  labelSr: string;
}

export interface AdminLocalizedNarrative {
  locale: NarrativeLocale;
  exists: boolean;
  editorialStatus: string;
  translationStatus: string;
  sourceRevision?: string;
  preferredName?: string;
  shortName?: string;
  slug?: string;
  summary?: string;
  seoTitle?: string;
  seoDescription?: string;
  patronalFeasts: string[];
  serviceSchedule?: string;
  alternateNames: unknown[];
  narrativeBody: string;
}

export interface AdminPlace {
  id: string;
  preferredName: string;
  slug?: string;
  placeType?: string;
  monasticCommunity?: MonasticCommunity;
  editorialStatus: string;
  browseAreaId?: string;
  eparchyId?: string;
  municipalityId?: string;
  municipality?: string;
  settlement?: string;
  latitude?: number;
  longitude?: number;
  summary?: string;
  sourcesCount: number;
  mediaCount: number;
  inPreview: boolean;
}

export interface EditablePlace extends AdminPlace {
  shortName?: string;
  alternateNames: Array<{ name: string; context: string; verificationStatus: string }>;
  jurisdiction?: string;
  countryCode?: string;
  postalAddress?: string;
  coordinateAccuracy?: string;
  publicationSafety?: string;
  narrativeBody: string;
  narratives: Record<NarrativeLocale, AdminLocalizedNarrative>;
  patronalFeastIds: string[];
  serviceSchedule?: string;
  youtubeUrl?: string;
  media: AdminMedia[];
}

export interface AdminMedia {
  id: string;
  objectKey: string;
  src: string;
  mimeType: string;
  width?: number;
  height?: number;
  altText: string;
  isPrimary: boolean;
}

export interface CanonicalOptions {
  placeTypes: string[];
  monasticCommunities: MonasticCommunity[];
  eparchies: TaxonomyOption[];
  municipalities: TaxonomyOption[];
  browseAreas: typeof PLACE_AREAS;
  coordinateAccuracy: string[];
  publicationSafety: string[];
  verificationStatuses: string[];
  translationStatuses: string[];
  feasts: FeastRecord[];
  feastRegistryBlobSha: string;
}

export interface AdminRepositorySnapshot {
  branch: string;
  state: BranchState;
  supportedPlaceTypes: string[];
  options: CanonicalOptions;
  schemas: EditablePlaceRecord["schemas"];
  feastRegistry: FeastRegistrySnapshot;
  places: AdminPlace[];
  stats: { total: number; preview: number; withCoordinates: number; withoutCoordinates: number; statuses: Record<string, number> };
}

export interface EditablePlaceRecord {
  place: EditablePlace;
  rawPlace: Record<string, any>;
  rawNarrative: Record<string, any>;
  rawNarratives: Partial<Record<NarrativeLocale, Record<string, any>>>;
  narrativeBody: string;
  narrativeBodies: Partial<Record<NarrativeLocale, string>>;
  options: CanonicalOptions;
  branch: string;
  state: BranchState;
  schemas: { common: Record<string, any>; media: Record<string, any>; place: Record<string, any>; narrative: Record<string, any>; feastRegistry: Record<string, any> };
  feastRegistry: FeastRegistrySnapshot;
  rawMedia: Array<{ path: string; record: Record<string, any> }>;
  previewPlaceIds: string[];
  knownSourceIds: ReadonlySet<string>;
  repositoryPaths: ReadonlySet<string>;
}

export interface PlaceDeletionRecord {
  branch: string;
  state: BranchState;
  tree: TreeEntry[];
  rawPlace: Record<string, any>;
  rawMedia: Array<{ path: string; record: Record<string, any> }>;
  previewPlaceIds: string[];
  ownedPaths: string[];
  externalReferences: string[];
}

const blob = (tree: TreeEntry[], path: string) => tree.find((entry) => entry.type === "blob" && entry.path === path);

const localizedPatronalFeasts = (narrative: Record<string, any> | undefined): string[] =>
  Array.isArray(narrative?.patronal_feasts)
    ? narrative.patronal_feasts.flatMap((entry: unknown) => typeof entry === "string" && entry.trim() ? [entry.trim()] : [])
    : [];

export function parseNarrative(markdown: string): { frontMatter: Record<string, any>; body: string } {
  if (!markdown.startsWith("---\n")) throw new AdminError("internal_error", 500, "Narrative has no front matter");
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) throw new AdminError("internal_error", 500, "Narrative front matter is not closed");
  try {
    return { frontMatter: parse(markdown.slice(4, end)) as Record<string, any>, body: markdown.slice(end + 5) };
  } catch {
    throw internalFailure("catalog_yaml_parse_failed");
  }
}

export function serializeNarrative(frontMatter: Record<string, any>, body: string): string {
  return `---\n${stringify(frontMatter, { lineWidth: 0 })}---\n${body.startsWith("\n") ? body : `\n${body}`}`.replace(/\n*$/, "\n");
}

const factValue = (record: unknown): string | undefined => {
  if (!record || typeof record !== "object") return undefined;
  const value = (record as { value?: unknown }).value;
  return typeof value === "string" ? value : undefined;
};

const monasticCommunityValue = (record: unknown): MonasticCommunity | undefined => {
  const value = factValue(record);
  return value === "male" || value === "female" ? value : undefined;
};

async function readBlobContents(repository: GitRepository, entries: TreeEntry[]): Promise<Map<string, string>> {
  const shas = entries.map((entry) => entry.sha);
  const contents = repository.readBlobs
    ? await repository.readBlobs(shas)
    : new Map(await Promise.all(shas.map(async (sha) => [sha, await repository.readBlob(sha)] as const)));
  if (shas.some((sha) => !contents.has(sha))) throw internalFailure("catalog_blob_decode_failed");
  return contents;
}

function contentFor(contents: Map<string, string>, entry: TreeEntry): string {
  const content = contents.get(entry.sha);
  if (content === undefined) throw internalFailure("catalog_blob_decode_failed");
  return content;
}

function parseCatalogYaml(content: string): Record<string, any> {
  try {
    return parse(content) as Record<string, any>;
  } catch {
    throw internalFailure("catalog_yaml_parse_failed");
  }
}

function schemaEnums(placeSchema: any, _narrativeSchema: any, commonSchema: any): Omit<CanonicalOptions, "feasts" | "feastRegistryBlobSha"> {
  const stringArray = (value: unknown, label: string): string[] => {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`Cannot read ${label} from canonical schema`);
    return value as string[];
  };
  const taxonomyOptions = (value: unknown, label: string): TaxonomyOption[] => {
    if (!Array.isArray(value)) throw new Error(`Cannot read ${label} from canonical schema`);
    const options = value.map((entry) => {
      if (!entry || typeof entry !== "object" || typeof (entry as any).const !== "string" || typeof (entry as any).title !== "string") {
        throw new Error(`Cannot read ${label} from canonical schema`);
      }
      return { id: (entry as any).const, labelSr: (entry as any).title };
    });
    if (new Set(options.map(({ id }) => id)).size !== options.length || new Set(options.map(({ labelSr }) => labelSr)).size !== options.length) {
      throw new Error(`Canonical ${label} contain duplicates`);
    }
    return options;
  };
  return {
    placeTypes: stringArray(placeSchema.$defs?.placeType?.enum, "place types"),
    monasticCommunities: stringArray(placeSchema.$defs?.monasticCommunity?.enum, "monastic communities") as MonasticCommunity[],
    eparchies: taxonomyOptions(placeSchema.$defs?.eparchyId?.oneOf, "eparchies"),
    municipalities: taxonomyOptions(placeSchema.$defs?.municipalityId?.oneOf, "municipalities"),
    browseAreas: PLACE_AREAS,
    coordinateAccuracy: stringArray(placeSchema.$defs?.coordinateAccuracy?.enum, "coordinate accuracy"),
    publicationSafety: stringArray(commonSchema.$defs?.publicationSafety?.enum, "publication safety"),
    verificationStatuses: stringArray(commonSchema.$defs?.verificationStatus?.enum, "verification statuses"),
    translationStatuses: Array.isArray(commonSchema.$defs?.translationStatus?.enum)
      ? stringArray(commonSchema.$defs.translationStatus.enum, "translation statuses")
      : ["source", "missing", "draft", "in-review", "approved", "published", "outdated", "archived"],
  };
}

async function loadContext(repository: GitRepository, branch: string) {
  const state = await repository.readBranchState(branch);
  const tree = await repository.readTree(state.treeSha);
  const required = [
    "schemas/place.schema.json",
    "schemas/narrative.schema.json",
    "schemas/common.schema.json",
    "schemas/media.schema.json",
    "schemas/feast-registry.schema.json",
    "validation/editorial-preview.json",
    "content/feasts/registry.yaml",
  ];
  const entries = required.map((path) => blob(tree, path));
  if (entries.some((entry) => !entry)) throw internalFailure("catalog_tree_processing_failed");
  const requiredEntries = entries as TreeEntry[];
  const contents = await readBlobContents(repository, requiredEntries);
  let placeSchema: Record<string, any>;
  let narrativeSchema: Record<string, any>;
  let commonSchema: Record<string, any>;
  let mediaSchema: Record<string, any>;
  let feastRegistrySchema: Record<string, any>;
  let previewData: Record<string, any>;
  let feastRegistry: FeastRegistrySnapshot;
  try {
    const parsed = requiredEntries.slice(0, 6).map((entry) => JSON.parse(contentFor(contents, entry)) as Record<string, any>);
    placeSchema = parsed[0]!;
    narrativeSchema = parsed[1]!;
    commonSchema = parsed[2]!;
    mediaSchema = parsed[3]!;
    feastRegistrySchema = parsed[4]!;
    previewData = parsed[5]!;
    feastRegistry = parseFeastRegistry(contentFor(contents, requiredEntries[6]!), requiredEntries[6]!.sha);
  } catch {
    throw internalFailure("catalog_tree_processing_failed");
  }
  let previewPlaceIds: string[];
  try {
    previewPlaceIds = parseEditorialPreviewRegistry(previewData);
  } catch {
    throw internalFailure("catalog_tree_processing_failed");
  }
  return {
    state,
    tree,
    options: {
      ...schemaEnums(placeSchema, narrativeSchema, commonSchema),
      feasts: structuredClone(feastRegistry.registry.feasts).sort((left, right) => left.name_sr.localeCompare(right.name_sr, "sr")),
      feastRegistryBlobSha: feastRegistry.blobSha,
    },
    previewIds: new Set(previewPlaceIds),
    previewPlaceIds,
    schemas: { common: commonSchema, media: mediaSchema, place: placeSchema, narrative: narrativeSchema, feastRegistry: feastRegistrySchema },
    feastRegistry,
  };
}

export async function loadAdminRepository(repository: GitRepository, branch: string): Promise<AdminRepositorySnapshot> {
  const { state, tree, options, previewIds, schemas, feastRegistry } = await loadContext(repository, branch);
  const placeEntries = tree.filter((entry) => entry.type === "blob" && /^content\/places\/[^/]+\/place\.yaml$/.test(entry.path));
  const mediaEntries = tree.filter((entry) => entry.type === "blob" && /^content\/media\/[^/]+\.ya?ml$/.test(entry.path));
  const narrativeEntries = tree.filter((entry) => entry.type === "blob" && /^content\/places\/[^/]+\/narratives\/sr\.md$/.test(entry.path));
  const contents = await readBlobContents(repository, [...mediaEntries, ...placeEntries, ...narrativeEntries]);
  const mediaRecords = mediaEntries.map((entry) => parseCatalogYaml(contentFor(contents, entry)) as { related_place_ids?: unknown });
  const mediaCounts = new Map<string, number>();
  for (const media of mediaRecords) if (Array.isArray(media.related_place_ids)) for (const id of media.related_place_ids) if (typeof id === "string") mediaCounts.set(id, (mediaCounts.get(id) ?? 0) + 1);

  const places = placeEntries.map((entry): AdminPlace => {
    const record = parseCatalogYaml(contentFor(contents, entry));
    const id = String(record.id ?? entry.path.split("/")[2]);
    const narrativeEntry = blob(tree, `content/places/${id}/narratives/sr.md`);
    const narrative = narrativeEntry ? parseNarrative(contentFor(contents, narrativeEntry)).frontMatter : {};
    const sourceIds = new Set([...(Array.isArray(record.source_ids) ? record.source_ids : []), ...(Array.isArray(narrative.source_ids) ? narrative.source_ids : [])].filter((value): value is string => typeof value === "string"));
    const coordinates = record.location?.coordinates;
    const monasticCommunity = monasticCommunityValue(record.ecclesiastical?.community_type);
    const eparchyId = factValue(record.ecclesiastical?.authority_id);
    const municipalityId = factValue(record.location?.municipality_id);
    const municipality = factValue(record.location?.municipality);
    const settlement = factValue(record.location?.settlement);
    return {
      id,
      preferredName: typeof narrative.preferred_name === "string" ? narrative.preferred_name : id,
      ...(typeof narrative.slug === "string" ? { slug: narrative.slug } : {}),
      ...(typeof record.place_type?.value === "string" ? { placeType: record.place_type.value } : {}),
      ...(monasticCommunity ? { monasticCommunity } : {}),
      editorialStatus: typeof record.editorial_status === "string" ? record.editorial_status : "unknown",
      ...(typeof record.browse_area_id === "string" ? { browseAreaId: record.browse_area_id } : {}),
      ...(eparchyId ? { eparchyId } : {}),
      ...(municipalityId ? { municipalityId } : {}),
      ...(municipality ? { municipality } : {}),
      ...(settlement ? { settlement } : {}),
      ...(typeof coordinates?.latitude === "number" ? { latitude: coordinates.latitude } : {}),
      ...(typeof coordinates?.longitude === "number" ? { longitude: coordinates.longitude } : {}),
      ...(typeof narrative.summary === "string" ? { summary: narrative.summary } : {}),
      sourcesCount: sourceIds.size,
      mediaCount: mediaCounts.get(id) ?? 0,
      inPreview: previewIds.has(id),
    };
  });
  places.sort((left, right) => left.preferredName.localeCompare(right.preferredName, "sr"));
  const statuses: Record<string, number> = {};
  for (const place of places) statuses[place.editorialStatus] = (statuses[place.editorialStatus] ?? 0) + 1;
  const withCoordinates = places.filter((place) => place.latitude !== undefined && place.longitude !== undefined).length;
  return { branch, state, supportedPlaceTypes: options.placeTypes, options, schemas, feastRegistry, places, stats: { total: places.length, preview: places.filter((place) => place.inPreview).length, withCoordinates, withoutCoordinates: places.length - withCoordinates, statuses } };
}

export async function loadEditablePlace(repository: GitRepository, branch: string, id: string): Promise<EditablePlaceRecord> {
  const { state, tree, options, previewIds, previewPlaceIds, schemas, feastRegistry } = await loadContext(repository, branch);
  const placeEntry = blob(tree, `content/places/${id}/place.yaml`);
  const narrativeEntry = blob(tree, `content/places/${id}/narratives/sr.md`);
  if (!placeEntry || !narrativeEntry) throw new AdminError("not_found", 404, "Place does not exist");
  const mediaEntries = tree.filter((entry) => entry.type === "blob" && /^content\/media\/[^/]+\.ya?ml$/.test(entry.path));
  const sourceEntries = tree.filter((entry) => entry.type === "blob" && /^content\/sources\/[^/]+\.ya?ml$/.test(entry.path));
  const localizedEntries = (["ru", "en"] as const)
    .map((locale) => blob(tree, `content/places/${id}/narratives/${locale}.md`))
    .filter((entry): entry is TreeEntry => Boolean(entry));
  const contents = await readBlobContents(repository, [placeEntry, narrativeEntry, ...localizedEntries, ...mediaEntries, ...sourceEntries]);
  const rawPlace = parseCatalogYaml(contentFor(contents, placeEntry));
  const parsedNarrative = parseNarrative(contentFor(contents, narrativeEntry));
  const rawNarrative = parsedNarrative.frontMatter;
  const localized = Object.fromEntries(localizedEntries.map((entry) => {
    const locale = entry.path.endsWith("/ru.md") ? "ru" : "en";
    const parsed = parseNarrative(contentFor(contents, entry));
    if (parsed.frontMatter.place_id !== id || parsed.frontMatter.locale !== locale) {
      throw internalFailure("catalog_tree_processing_failed");
    }
    return [locale, parsed];
  })) as Partial<Record<"ru" | "en", ReturnType<typeof parseNarrative>>>;
  const rawNarratives: EditablePlaceRecord["rawNarratives"] = {
    sr: rawNarrative,
    ...Object.fromEntries(Object.entries(localized).map(([locale, parsed]) => [locale, parsed.frontMatter])),
  };
  const narrativeBodies: EditablePlaceRecord["narrativeBodies"] = {
    sr: parsedNarrative.body,
    ...Object.fromEntries(Object.entries(localized).map(([locale, parsed]) => [locale, parsed.body])),
  };
  const coordinates = rawPlace.location?.coordinates;
  const placeSourceIds = Array.isArray(rawPlace.source_ids) ? rawPlace.source_ids.filter((value: unknown): value is string => typeof value === "string") : [];
  const narrativeSourceIds = Array.isArray(rawNarrative.source_ids) ? rawNarrative.source_ids.filter((value: unknown): value is string => typeof value === "string") : [];
  const alternateNames = Array.isArray(rawNarrative.alternate_names) ? rawNarrative.alternate_names.map((entry: any) => ({
    name: String(entry.name ?? ""), context: String(entry.context ?? ""), verificationStatus: String(entry.verification_status ?? "requires-verification"),
  })) : [];
  const rawMedia = mediaEntries.map((entry) => ({ path: entry.path, record: parseCatalogYaml(contentFor(contents, entry)) }));
  const knownSourceIds = new Set(sourceEntries.flatMap((entry) => {
    const source = parseCatalogYaml(contentFor(contents, entry));
    return typeof source.id === "string" ? [source.id] : [];
  }));
  const placeMedia = rawMedia.filter(({ record }) => Array.isArray(record.related_place_ids) && record.related_place_ids.includes(id));
  const mediaOrder = Array.isArray(rawPlace.relationships?.media_ids)
    ? rawPlace.relationships.media_ids.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const orderedMedia = [...placeMedia].sort((left, right) => {
    const leftIndex = mediaOrder.indexOf(String(left.record.id));
    const rightIndex = mediaOrder.indexOf(String(right.record.id));
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
  const media = orderedMedia.flatMap(({ record }) => {
    const objectKey = typeof record.object_key === "string" ? record.object_key.replaceAll("\\", "/") : "";
    const src = resolveMediaUrl(
      { storageProvider: record.storage_provider, objectKey },
      { localPublicOrigin: "https://staging-svetinje.montenegro-cg.workers.dev" },
    );
    if (!src) return [];
    const localized = record.localized_text?.sr;
    return [{
      id: String(record.id),
      objectKey,
      src,
      mimeType: typeof record.mime_type === "string" ? record.mime_type : "application/octet-stream",
      ...(Number.isInteger(record.width) ? { width: record.width } : {}),
      ...(Number.isInteger(record.height) ? { height: record.height } : {}),
      altText: typeof localized?.alt_text === "string" ? localized.alt_text : String(rawNarrative.preferred_name ?? id),
      isPrimary: mediaOrder[0] === record.id || (mediaOrder.length === 0 && orderedMedia[0]?.record.id === record.id),
    }];
  });
  const jurisdiction = factValue(rawPlace.ecclesiastical?.jurisdiction);
  const eparchyId = factValue(rawPlace.ecclesiastical?.authority_id);
  const monasticCommunity = monasticCommunityValue(rawPlace.ecclesiastical?.community_type);
  const countryCode = factValue(rawPlace.location?.country_code);
  const municipality = factValue(rawPlace.location?.municipality);
  const municipalityId = factValue(rawPlace.location?.municipality_id);
  const settlement = factValue(rawPlace.location?.settlement);
  const postalAddress = factValue(rawPlace.location?.postal_address);
  const localizedView = (locale: NarrativeLocale): AdminLocalizedNarrative => {
    const raw = rawNarratives[locale];
    const body = narrativeBodies[locale] ?? "";
    return {
      locale,
      exists: Boolean(raw),
      editorialStatus: typeof raw?.editorial_status === "string" ? raw.editorial_status : "research",
      translationStatus: typeof raw?.translation_status === "string" ? raw.translation_status : locale === "sr" ? "source" : "missing",
      ...(typeof raw?.source_revision === "string" ? { sourceRevision: raw.source_revision } : {}),
      ...(typeof raw?.preferred_name === "string" ? { preferredName: raw.preferred_name } : {}),
      ...(typeof raw?.short_name === "string" ? { shortName: raw.short_name } : {}),
      ...(typeof raw?.slug === "string" ? { slug: raw.slug } : {}),
      ...(typeof raw?.summary === "string" ? { summary: raw.summary } : {}),
      ...(typeof raw?.seo_title === "string" ? { seoTitle: raw.seo_title } : {}),
      ...(typeof raw?.seo_description === "string" ? { seoDescription: raw.seo_description } : {}),
      patronalFeasts: localizedPatronalFeasts(raw),
      ...(typeof raw?.service_schedule === "string" && raw.service_schedule.trim() ? { serviceSchedule: raw.service_schedule.trim() } : {}),
      alternateNames: Array.isArray(raw?.alternate_names) ? structuredClone(raw.alternate_names) : [],
      narrativeBody: body.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd(),
    };
  };
  return {
    rawPlace, rawNarrative, rawNarratives, rawMedia, narrativeBody: parsedNarrative.body, narrativeBodies, options, branch, state, schemas, feastRegistry,
    previewPlaceIds,
    knownSourceIds,
    repositoryPaths: new Set(tree.filter((entry) => entry.type === "blob").map((entry) => entry.path)),
    place: {
      id,
      preferredName: String(rawNarrative.preferred_name ?? id),
      ...(typeof rawNarrative.short_name === "string" ? { shortName: rawNarrative.short_name } : {}),
      ...(typeof rawNarrative.slug === "string" ? { slug: rawNarrative.slug } : {}),
      ...(typeof rawPlace.place_type?.value === "string" ? { placeType: rawPlace.place_type.value } : {}),
      editorialStatus: String(rawPlace.editorial_status ?? "unknown"),
      ...(typeof rawPlace.browse_area_id === "string" ? { browseAreaId: rawPlace.browse_area_id } : {}),
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(eparchyId ? { eparchyId } : {}),
      ...(monasticCommunity ? { monasticCommunity } : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(municipality ? { municipality } : {}),
      ...(municipalityId ? { municipalityId } : {}),
      ...(settlement ? { settlement } : {}),
      ...(postalAddress ? { postalAddress } : {}),
      ...(typeof coordinates?.latitude === "number" ? { latitude: coordinates.latitude } : {}),
      ...(typeof coordinates?.longitude === "number" ? { longitude: coordinates.longitude } : {}),
      ...(typeof coordinates?.accuracy === "string" ? { coordinateAccuracy: coordinates.accuracy } : {}),
      ...(typeof coordinates?.publication_safety === "string" ? { publicationSafety: coordinates.publication_safety } : {}),
      ...(typeof rawNarrative.summary === "string" ? { summary: rawNarrative.summary } : {}),
      patronalFeastIds: resolvePatronalFeastIds(rawPlace, feastRegistry.registry),
      ...(typeof rawNarrative.service_schedule === "string" && rawNarrative.service_schedule.trim() ? { serviceSchedule: rawNarrative.service_schedule.trim() } : {}),
      ...(typeof rawPlace.video?.youtube_url === "string" ? { youtubeUrl: rawPlace.video.youtube_url } : {}),
      alternateNames,
      narrativeBody: parsedNarrative.body.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd(),
      narratives: { sr: localizedView("sr"), ru: localizedView("ru"), en: localizedView("en") },
      media,
      sourcesCount: new Set([...placeSourceIds, ...narrativeSourceIds]).size,
      mediaCount: media.length,
      inPreview: previewIds.has(id),
    },
  };
}

const PLACE_REFERENCE_KEYS = new Set([
  "place_id",
  "place_ids",
  "related_place_id",
  "related_place_ids",
  "parent_place_id",
  "associated_entity_ids",
]);

function referenceValueContainsId(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((entry) => entry === id);
  if (value && typeof value === "object" && "value" in value) {
    return referenceValueContainsId((value as { value?: unknown }).value, id);
  }
  return false;
}

function structuredRecordReferencesPlace(value: unknown, id: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => structuredRecordReferencesPlace(entry, id));
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (PLACE_REFERENCE_KEYS.has(key) && referenceValueContainsId(nested, id)) return true;
    if (structuredRecordReferencesPlace(nested, id)) return true;
  }
  return false;
}

function parseStructuredDependency(path: string, content: string): Record<string, any> | undefined {
  try {
    if (/\.md$/i.test(path)) return parseNarrative(content).frontMatter;
    if (/\.json$/i.test(path)) return JSON.parse(content) as Record<string, any>;
    if (/\.ya?ml$/i.test(path)) return parse(content) as Record<string, any>;
  } catch {
    throw internalFailure("catalog_tree_processing_failed");
  }
  return undefined;
}

/**
 * Loads only the repository facts required to safely delete a place. It is
 * intentionally tolerant of legacy/schema-invalid research content and does
 * not require a Serbian narrative or canonical validation.
 */
export async function loadPlaceDeletionRecord(repository: GitRepository, branch: string, id: string): Promise<PlaceDeletionRecord> {
  const { state, tree, previewPlaceIds } = await loadContext(repository, branch);
  const placePath = `content/places/${id}/place.yaml`;
  const placeEntry = blob(tree, placePath);
  if (!placeEntry) throw new AdminError("not_found", 404, "Place does not exist");

  const placePrefix = `content/places/${id}/`;
  const practicalPrefix = `content/practical/${id}/`;
  const ownedEntries = tree.filter((entry) => entry.type === "blob" && (
    entry.path.startsWith(placePrefix) || entry.path.startsWith(practicalPrefix)
  ));
  const mediaEntries = tree.filter((entry) => entry.type === "blob" && /^content\/media\/[^/]+\.ya?ml$/.test(entry.path));
  const dependencyEntries = tree.filter((entry) => {
    if (entry.type !== "blob" || !entry.path.startsWith("content/")) return false;
    if (entry.path.startsWith(placePrefix) || entry.path.startsWith(practicalPrefix)) return false;
    if (entry.path.startsWith("content/media/") || entry.path.startsWith("content/sources/")) return false;
    if (/^content\/places\/[^/]+\/(?!place\.yaml$)/.test(entry.path)) return false;
    return /\.(?:ya?ml|json)$/i.test(entry.path) || /^content\/news\/[^/]+\.md$/i.test(entry.path);
  });
  const contents = await readBlobContents(repository, [placeEntry, ...mediaEntries, ...dependencyEntries]);
  const rawPlace = parseCatalogYaml(contentFor(contents, placeEntry));
  const rawMedia = mediaEntries.map((entry) => ({ path: entry.path, record: parseCatalogYaml(contentFor(contents, entry)) }));
  const externalReferences = dependencyEntries.flatMap((entry) => {
    const record = parseStructuredDependency(entry.path, contentFor(contents, entry));
    return record && structuredRecordReferencesPlace(record, id) ? [entry.path] : [];
  });

  return {
    branch,
    state,
    tree,
    rawPlace,
    rawMedia,
    previewPlaceIds,
    ownedPaths: ownedEntries.map((entry) => entry.path),
    externalReferences: [...new Set(externalReferences)].sort(),
  };
}
