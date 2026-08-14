import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import { buildCatalogueSearchText } from "../catalogue-search.ts";
import { resolveMediaUrl } from "../media-url.ts";
import type { PlaceAreaId } from "../place-areas.ts";
import { getPlaceArea, isPlaceAreaId } from "../place-areas.ts";
import {
  editorialPreviewEligibilityErrors,
  parseEditorialPreviewRegistry,
} from "./editorial-preview-eligibility.ts";

type ReviewRole = "publishing" | "factual" | "ecclesiastical" | "sr-language" | "media-rights";

interface Approval {
  role: string;
  reviewer_id: string;
  outcome: string;
}

interface PublicationPolicy {
  public_publication_locked: boolean;
  role_assignments: Record<string, string[]>;
}

interface Verification {
  status?: string;
  source_ids?: string[];
  qualification?: string;
}

interface StringFact {
  value?: string;
  verification?: Verification;
}

interface PlaceRecord {
  id: string;
  editorial_status: string;
  browse_area_id?: string;
  place_type?: {
    value?: string;
    verification?: Verification;
  };
  ecclesiastical?: {
    jurisdiction?: StringFact;
  };
  location?: {
    municipality?: StringFact;
    settlement?: StringFact;
    postal_address?: StringFact;
    coordinates?: {
      latitude?: number;
      longitude?: number;
      accuracy?: string;
      publication_safety?: string;
      verification?: Verification;
    };
  };
  source_ids?: string[];
  approvals: Approval[];
  [key: string]: unknown;
}

interface NarrativeRecord {
  place_id: string;
  locale: string;
  editorial_status: string;
  translation_status: string;
  slug?: string;
  preferred_name?: string;
  summary?: string;
  alternate_names?: Array<{ name?: string }>;
  source_ids?: string[];
  approvals: Approval[];
  body: string;
}

interface SourceRecord {
  id: string;
  title: string;
  editorial_status: string;
  status: string;
  approvals: Approval[];
}

interface MediaRecord {
  id: string;
  editorial_status: string;
  media_type: string;
  storage_provider?: string;
  object_key?: string;
  width?: number;
  height?: number;
  creator?: string;
  copyright_owner?: string;
  rights_basis?: string;
  credit_line?: string;
  allowed_uses?: string[];
  publication_safety?: string;
  related_place_ids: string[];
  localized_text?: Record<string, {
    alt_text?: string;
    decorative?: boolean;
    translation_status?: string;
    approvals?: Approval[];
  }>;
  approvals: Approval[];
}

export interface PublishablePlace {
  id: string;
  slug: string;
  name: string;
  summary: string;
  placeType: string;
  browseAreaId?: PlaceAreaId;
  catalogueSearchText: string;
  mediaIds?: string[];
}

export interface NarrativeParagraph {
  text: string;
  sourceIds: string[];
}

export interface VisibleMediaImage {
  id: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface NarrativeSection {
  id: string;
  title: string;
  paragraphs: NarrativeParagraph[];
}

export interface VisiblePlace extends PublishablePlace {
  typeLabel: string;
  municipality?: string;
  settlement?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  coordinateAccuracy?: string;
  ecclesiasticalJurisdiction?: string;
  previewImageSrc?: string;
  previewImageAlt?: string;
  galleryImages: VisibleMediaImage[];
  preview: boolean;
  previewStatus?: string;
  narrativeSections: NarrativeSection[];
  sourceIds: string[];
  sources: Array<{ id: string; title: string }>;
  searchText: string;
}

export interface ExcludedNarrativeMarker {
  placeId: string;
  slug?: string;
  preferredName?: string;
}

export interface ExcludedContentMarker extends ExcludedNarrativeMarker {
  latitude?: number;
  longitude?: number;
  previewImageSrc?: string;
}

interface VisiblePlaceOptions {
  editorialPreview?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseYamlObject(text: string, file: string): Record<string, unknown> {
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(`Cannot parse ${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (!isObject(value)) throw new Error(`${file} must contain a YAML mapping`);
  return value;
}

async function readYamlObject(file: string): Promise<Record<string, unknown>> {
  return parseYamlObject(await readFile(file, "utf8"), file);
}

async function readNarrative(file: string): Promise<NarrativeRecord> {
  const text = await readFile(file, "utf8");
  if (!text.startsWith("---\n")) throw new Error(`${file} has no front matter`);
  const closing = text.indexOf("\n---\n", 4);
  if (closing === -1) throw new Error(`${file} has unclosed front matter`);
  const frontMatter = parseYamlObject(`${text.slice(4, closing)}\n`, file);
  return {
    ...(frontMatter as unknown as Omit<NarrativeRecord, "body">),
    body: text.slice(closing + 5),
  };
}

async function filesIn(directory: string, predicate: (file: string) => boolean): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(full, predicate)));
    else if (entry.isFile() && predicate(full)) files.push(full);
  }
  return files;
}

function assignedApproval(
  approvals: Approval[],
  role: ReviewRole,
  policy: PublicationPolicy,
): boolean {
  const assigned = policy.role_assignments[role] ?? [];
  return approvals.some(
    (approval) =>
      approval.role === role &&
      approval.outcome === "approved" &&
      assigned.includes(approval.reviewer_id),
  );
}

function hasRequiredApprovals(
  approvals: Approval[],
  roles: ReviewRole[],
  policy: PublicationPolicy,
): boolean {
  return roles.every((role) => assignedApproval(approvals, role, policy));
}

function factsArePublishable(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(factsArePublishable);
  if (!isObject(value)) return true;

  if ("verification" in value) {
    const verification = value.verification;
    if (!isObject(verification)) return false;
    if (verification.status === "verified") {
      // Continue through the object so nested values cannot bypass checks.
    } else if (verification.status === "disputed" && typeof verification.qualification === "string") {
      // Qualified disputes still require the record-level factual and ecclesiastical gates.
    } else {
      return false;
    }
  }

  return Object.values(value).every(factsArePublishable);
}

async function loadPolicy(root: string): Promise<PublicationPolicy> {
  return (await readYamlObject(path.join(root, "validation", "publication-policy.json"))) as unknown as PublicationPolicy;
}

async function loadRecords(root: string): Promise<{
  places: PlaceRecord[];
  narratives: NarrativeRecord[];
  sources: SourceRecord[];
  media: MediaRecord[];
}> {
  const contentRoot = path.join(root, "content");
  const [placeFiles, narrativeFiles, sourceFiles, mediaFiles] = await Promise.all([
    filesIn(path.join(contentRoot, "places"), (file) => path.basename(file) === "place.yaml"),
    filesIn(path.join(contentRoot, "places"), (file) => file.endsWith(`${path.sep}narratives${path.sep}sr.md`)),
    filesIn(path.join(contentRoot, "sources"), (file) => file.endsWith(".yaml")),
    filesIn(path.join(contentRoot, "media"), (file) => file.endsWith(".yaml")),
  ]);

  const [places, narratives, sources, media] = await Promise.all([
    Promise.all(placeFiles.map(async (file) => (await readYamlObject(file)) as unknown as PlaceRecord)),
    Promise.all(narrativeFiles.map(readNarrative)),
    Promise.all(sourceFiles.map(async (file) => (await readYamlObject(file)) as unknown as SourceRecord)),
    Promise.all(mediaFiles.map(async (file) => (await readYamlObject(file)) as unknown as MediaRecord)),
  ]);
  return { places, narratives, sources, media };
}

function mediaRightsMetadataIsComplete(media: MediaRecord): boolean {
  return (
    typeof media.creator === "string" &&
    typeof media.copyright_owner === "string" &&
    typeof media.rights_basis === "string" &&
    typeof media.credit_line === "string" &&
    media.allowed_uses?.includes("web-display") === true &&
    media.publication_safety === "public"
  );
}

async function mediaSrc(root: string, media: MediaRecord): Promise<string | undefined> {
  const src = resolveMediaUrl({ storageProvider: media.storage_provider, objectKey: media.object_key });
  if (!src || media.storage_provider !== "local-public") return src;
  const normalized = media.object_key?.replaceAll("\\", "/");
  if (!normalized) return undefined;
  const publicRoot = path.resolve(root, "public");
  const absolute = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(publicRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  try {
    await access(absolute);
  } catch {
    return undefined;
  }
  return src;
}

async function previewMediaForPlace(
  root: string,
  placeId: string,
  placeName: string,
  mediaRecords: MediaRecord[],
  mode: "production" | "editorial-preview",
  policy: PublicationPolicy,
  mediaOrder: string[] = [],
): Promise<Pick<VisiblePlace, "previewImageSrc" | "previewImageAlt" | "galleryImages">> {
  const order = new Map(mediaOrder.map((id, index) => [id, index]));
  const images: VisibleMediaImage[] = [];
  for (const media of [...mediaRecords].sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))) {
    const statusAllowed = mode === "production"
      ? media.editorial_status === "published" && hasRequiredApprovals(media.approvals, ["media-rights", "publishing"], policy)
      : ["approved", "published"].includes(media.editorial_status);
    const localized = media.localized_text?.sr;
    if (
      !statusAllowed ||
      media.media_type !== "image" ||
      !media.related_place_ids.includes(placeId) ||
      !mediaRightsMetadataIsComplete(media) ||
      !localized ||
      (typeof localized.alt_text !== "string" && localized.decorative !== true)
    ) {
      continue;
    }
    const src = await mediaSrc(root, media);
    if (src) {
      images.push({
        id: media.id,
        src,
        alt: typeof localized.alt_text === "string" ? localized.alt_text : placeName,
        ...(typeof media.width === "number" ? { width: media.width } : {}),
        ...(typeof media.height === "number" ? { height: media.height } : {}),
      });
    }
  }
  const primary = images[0];
  return {
    galleryImages: images,
    ...(primary ? { previewImageSrc: primary.src, previewImageAlt: primary.alt } : {}),
  };
}

export async function loadPublishablePlaces(root = process.cwd()): Promise<PublishablePlace[]> {
  const policy = await loadPolicy(root);
  if (policy.public_publication_locked) return [];

  const { places, narratives } = await loadRecords(root);
  const narrativeByPlace = new Map(
    narratives
      .filter((narrative) => narrative.locale === "sr")
      .map((narrative) => [narrative.place_id, narrative]),
  );

  return places.flatMap((place) => {
    const narrative = narrativeByPlace.get(place.id);
    if (
      place.editorial_status !== "published" ||
      !narrative ||
      narrative.editorial_status !== "published" ||
      narrative.translation_status !== "source" ||
      typeof narrative.slug !== "string" ||
      typeof narrative.preferred_name !== "string" ||
      typeof narrative.summary !== "string" ||
      typeof place.place_type?.value !== "string" ||
      place.place_type.verification?.status !== "verified" ||
      !factsArePublishable(place) ||
      !hasRequiredApprovals(place.approvals, ["factual", "ecclesiastical", "publishing"], policy) ||
      !hasRequiredApprovals(
        narrative.approvals,
        ["factual", "ecclesiastical", "sr-language", "publishing"],
        policy,
      )
    ) {
      return [];
    }

    const browseAreaId = isPlaceAreaId(place.browse_area_id) ? place.browse_area_id : undefined;
    return [{
      id: place.id,
      slug: narrative.slug,
      name: narrative.preferred_name,
      summary: narrative.summary,
      placeType: place.place_type.value,
      ...(Array.isArray((place.relationships as { media_ids?: unknown } | undefined)?.media_ids)
        ? { mediaIds: (place.relationships as { media_ids: unknown[] }).media_ids.filter((value): value is string => typeof value === "string") }
        : {}),
      ...(browseAreaId ? { browseAreaId } : {}),
      catalogueSearchText: buildCatalogueSearchText({
        name: narrative.preferred_name,
        alternateNames: (narrative.alternate_names ?? []).flatMap((alternate) => alternate.name ?? []),
        municipality: place.location?.municipality?.value,
        settlement: place.location?.settlement?.value,
        browseAreaLabel: getPlaceArea(browseAreaId)?.label,
        summary: narrative.summary,
      }),
    }];
  });
}

function parseNarrativeSections(body: string): NarrativeSection[] {
  const sections: NarrativeSection[] = [];
  let current: NarrativeSection | undefined;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (!current || paragraphLines.length === 0) return;
    const raw = paragraphLines.join(" ").trim();
    paragraphLines = [];
    if (!raw || /^\[\^[^\]]+\]:/.test(raw)) return;
    const sourceIds = [...new Set(
      [...raw.matchAll(/\[\^([^\]]+)\]/g)]
        .map((match) => match[1])
        .filter((sourceId): sourceId is string => typeof sourceId === "string"),
    )];
    const text = raw.replace(/\[\^[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
    if (text) current.paragraphs.push({ text, sourceIds });
  };

  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s+\{#([a-z0-9-]+)\}\s*$/);
    if (heading) {
      flushParagraph();
      const section = { title: heading[1]!, id: heading[2]!, paragraphs: [] } satisfies NarrativeSection;
      current = section;
      sections.push(section);
      continue;
    }
    if (!current || /^\[\^[^\]]+\]:/.test(line)) continue;
    if (line.trim() === "") flushParagraph();
    else paragraphLines.push(line.trim());
  }
  flushParagraph();
  return sections;
}

function placeTypeLabel(placeType: string): string {
  if (placeType === "monastery") return "Манастир";
  if (placeType === "cathedral") return "Саборни храм";
  if (["church", "chapel"].includes(placeType)) return "Храм";
  return "Свето мјесто";
}

function assertPreviewField(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Editorial preview validation failed: ${message}`);
}

async function loadPreviewAllowlist(root: string, knownPlaceIds: Set<string>): Promise<string[]> {
  const file = path.join(root, "validation", "editorial-preview.json");
  let value: unknown;
  try {
    value = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Editorial preview validation failed: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return parseEditorialPreviewRegistry(value, knownPlaceIds);
  } catch (error) {
    throw new Error(`Editorial preview validation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function isEditorialPreviewBuild(): boolean {
  return process.env.EDITORIAL_PREVIEW === "true";
}

export async function loadEditorialPreviewPlaces(root = process.cwd()): Promise<VisiblePlace[]> {
  const [{ places, narratives, sources, media }, policy] = await Promise.all([loadRecords(root), loadPolicy(root)]);
  const placeById = new Map(places.map((place) => [place.id, place]));
  const narrativeByPlace = new Map(
    narratives.filter((narrative) => narrative.locale === "sr").map((narrative) => [narrative.place_id, narrative]),
  );
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const knownSourceIds = new Set(sourceById.keys());
  const allowlist = await loadPreviewAllowlist(root, new Set(placeById.keys()));

  return Promise.all(allowlist.map(async (id) => {
    const place = placeById.get(id);
    const narrative = narrativeByPlace.get(id);
    assertPreviewField(place, `missing place record for ${id}`);
    assertPreviewField(narrative, `missing Serbian narrative for ${id}`);
    const eligibilityErrors = editorialPreviewEligibilityErrors({
      id,
      place,
      narrative,
      narrativeBody: narrative.body,
      mediaRecords: media,
      knownSourceIds,
    });
    assertPreviewField(
      Object.keys(eligibilityErrors).length === 0,
      `${id} is not eligible for preview: ${Object.values(eligibilityErrors).join(" ")}`,
    );
    const slug = narrative.slug;
    const preferredName = narrative.preferred_name;
    const summary = narrative.summary;
    const placeType = place.place_type?.value;
    assertPreviewField(typeof slug === "string", `${id} requires a valid Serbian slug`);
    assertPreviewField(typeof preferredName === "string", `${id} requires a preferred Serbian name`);
    assertPreviewField(typeof summary === "string", `${id} requires a Serbian summary`);
    assertPreviewField(typeof placeType === "string", `${id} requires a place type`);

    const coordinates = place.location?.coordinates;
    const sourceIds = [...new Set([...(place.source_ids ?? []), ...(narrative.source_ids ?? [])])];
    const registeredSources = sourceIds.map((sourceId) => {
      const source = sourceById.get(sourceId);
      assertPreviewField(source, `${id} references missing source ${sourceId}`);
      return { id: source.id, title: source.title };
    });
    const narrativeSections = parseNarrativeSections(narrative.body);
    assertPreviewField(narrativeSections.length > 0, `${id} requires narrative sections`);

    const municipality = place.location?.municipality?.value;
    const settlement = place.location?.settlement?.value;
    const browseAreaId = isPlaceAreaId(place.browse_area_id) ? place.browse_area_id : undefined;
    const latitude = coordinates?.latitude;
    const longitude = coordinates?.longitude;
    const coordinateAccuracy = coordinates?.accuracy;
    const ecclesiasticalJurisdiction = place.ecclesiastical?.jurisdiction?.value;
    const mediaOrder = Array.isArray((place.relationships as { media_ids?: unknown } | undefined)?.media_ids)
      ? (place.relationships as { media_ids: unknown[] }).media_ids.filter((value): value is string => typeof value === "string")
      : [];
    const previewMedia = await previewMediaForPlace(root, place.id, preferredName, media, "editorial-preview", policy, mediaOrder);
    return {
      id: place.id,
      slug,
      name: preferredName,
      summary,
      placeType,
      ...(browseAreaId ? { browseAreaId } : {}),
      catalogueSearchText: buildCatalogueSearchText({
        name: preferredName,
        alternateNames: (narrative.alternate_names ?? []).flatMap((alternate) => alternate.name ?? []),
        municipality,
        settlement,
        browseAreaLabel: getPlaceArea(browseAreaId)?.label,
        summary,
      }),
      typeLabel: placeTypeLabel(placeType),
      ...(municipality !== undefined ? { municipality } : {}),
      ...(settlement !== undefined ? { settlement } : {}),
      ...(place.location?.postal_address?.value !== undefined ? { address: place.location.postal_address.value } : {}),
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
      ...(coordinateAccuracy !== undefined ? { coordinateAccuracy } : {}),
      ...(ecclesiasticalJurisdiction !== undefined ? { ecclesiasticalJurisdiction } : {}),
      ...previewMedia,
      preview: true,
      previewStatus: place.editorial_status,
      narrativeSections,
      sourceIds,
      sources: registeredSources,
      searchText: [
        preferredName,
        summary,
        ...(narrative.alternate_names ?? []).map((alternate) => alternate.name ?? ""),
        narrative.body,
        municipality,
        settlement,
      ].join(" "),
    };
  }));
}

export async function loadVisiblePlaces(
  root = process.cwd(),
  options: VisiblePlaceOptions = {},
): Promise<VisiblePlace[]> {
  const editorialPreview = options.editorialPreview ?? isEditorialPreviewBuild();
  if (!editorialPreview) {
    const publicPlaces = await loadPublishablePlaces(root);
    const [{ media }, policy] = await Promise.all([loadRecords(root), loadPolicy(root)]);
    return Promise.all(publicPlaces.map(async (place) => ({
      ...place,
      typeLabel: placeTypeLabel(place.placeType),
      ...(await previewMediaForPlace(root, place.id, place.name, media, "production", policy, place.mediaIds ?? [])),
      preview: false,
      narrativeSections: [],
      sourceIds: [],
      sources: [],
      searchText: [place.name, place.summary].join(" "),
    })));
  }

  const [publicPlaces, previewPlaces] = await Promise.all([
    loadVisiblePlaces(root, { editorialPreview: false }),
    loadEditorialPreviewPlaces(root),
  ]);
  const previewIds = new Set(previewPlaces.map((place) => place.id));
  return [...publicPlaces.filter((place) => !previewIds.has(place.id)), ...previewPlaces];
}

export async function loadExcludedNarrativeMarkers(
  root = process.cwd(),
): Promise<ExcludedNarrativeMarker[]> {
  return (await loadExcludedContentMarkers(root)).map(({ placeId, slug, preferredName }) => ({
    placeId,
    ...(slug ? { slug } : {}),
    ...(preferredName ? { preferredName } : {}),
  }));
}

export async function loadExcludedContentMarkers(
  root = process.cwd(),
): Promise<ExcludedContentMarker[]> {
  const [visiblePlaces, records, policy] = await Promise.all([
    loadVisiblePlaces(root, { editorialPreview: false }),
    loadRecords(root),
    loadPolicy(root),
  ]);
  const visibleIds = new Set(visiblePlaces.map((place) => place.id));
  const narrativeByPlace = new Map(
    records.narratives.filter((narrative) => narrative.locale === "sr").map((narrative) => [narrative.place_id, narrative]),
  );

  return Promise.all(records.places.filter((place) => !visibleIds.has(place.id)).map(async (place) => {
    const narrative = narrativeByPlace.get(place.id);
    const latitude = place.location?.coordinates?.latitude;
    const longitude = place.location?.coordinates?.longitude;
    const previewMedia = await previewMediaForPlace(
      root,
      place.id,
      narrative?.preferred_name ?? place.id,
      records.media,
      "editorial-preview",
      policy,
      Array.isArray((place.relationships as { media_ids?: unknown } | undefined)?.media_ids)
        ? (place.relationships as { media_ids: unknown[] }).media_ids.filter((value): value is string => typeof value === "string")
        : [],
    );
    return {
      placeId: place.id,
      ...(narrative?.slug ? { slug: narrative.slug } : {}),
      ...(narrative?.preferred_name ? { preferredName: narrative.preferred_name } : {}),
      ...(typeof latitude === "number" && Number.isFinite(latitude) ? { latitude } : {}),
      ...(typeof longitude === "number" && Number.isFinite(longitude) ? { longitude } : {}),
      ...(previewMedia.previewImageSrc ? { previewImageSrc: previewMedia.previewImageSrc } : {}),
    };
  }));
}
