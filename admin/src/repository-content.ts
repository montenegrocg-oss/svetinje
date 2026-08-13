import { parse, stringify } from "yaml";
import { PLACE_AREAS } from "../../src/lib/place-areas.ts";
import { AdminError } from "./errors.ts";
import type { BranchState, GitRepository, TreeEntry } from "./types.ts";

export interface AdminPlace {
  id: string;
  preferredName: string;
  slug?: string;
  placeType?: string;
  editorialStatus: string;
  browseAreaId?: string;
  municipality?: string;
  settlement?: string;
  latitude?: number;
  longitude?: number;
  summary?: string;
  sourcesCount: number;
  mediaCount: number;
  inPreview: boolean;
}

export interface NarrativeSection {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface EditablePlace extends AdminPlace {
  shortName?: string;
  alternateNames: Array<{ name: string; context: string; sourceIds: string[]; verificationStatus: string }>;
  jurisdiction?: string;
  countryCode?: string;
  postalAddress?: string;
  coordinateAccuracy?: string;
  publicationSafety?: string;
  sections: NarrativeSection[];
  placeSourceIds: string[];
  narrativeSourceIds: string[];
  sectionSources: Record<string, string[]>;
}

export interface CanonicalOptions {
  placeTypes: string[];
  browseAreas: typeof PLACE_AREAS;
  coordinateAccuracy: string[];
  publicationSafety: string[];
  narrativeSectionIds: string[];
  verificationStatuses: string[];
  sourceIds: string[];
}

export interface AdminRepositorySnapshot {
  branch: string;
  state: BranchState;
  supportedPlaceTypes: string[];
  options: CanonicalOptions;
  places: AdminPlace[];
  stats: { total: number; preview: number; withCoordinates: number; withoutCoordinates: number; statuses: Record<string, number> };
}

export interface EditablePlaceRecord {
  place: EditablePlace;
  rawPlace: Record<string, any>;
  rawNarrative: Record<string, any>;
  narrativeBody: string;
  options: CanonicalOptions;
  branch: string;
  state: BranchState;
  schemas: { common: Record<string, any>; place: Record<string, any>; narrative: Record<string, any> };
}

const blob = (tree: TreeEntry[], path: string) => tree.find((entry) => entry.type === "blob" && entry.path === path);

export function parseNarrative(markdown: string): { frontMatter: Record<string, any>; body: string } {
  if (!markdown.startsWith("---\n")) throw new AdminError("internal_error", 500, "Narrative has no front matter");
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) throw new AdminError("internal_error", 500, "Narrative front matter is not closed");
  return { frontMatter: parse(markdown.slice(4, end)) as Record<string, any>, body: markdown.slice(end + 5) };
}

export function serializeNarrative(frontMatter: Record<string, any>, body: string): string {
  return `---\n${stringify(frontMatter, { lineWidth: 0 })}---\n${body.startsWith("\n") ? body : `\n${body}`}`.replace(/\n*$/, "\n");
}

export function parseNarrativeSections(body: string): NarrativeSection[] {
  const headings = [...body.matchAll(/^##\s+(.+?)\s+\{#([a-z0-9-]+)\}\s*$/gm)];
  return headings.map((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    const content = body.slice(start, end).trim();
    return {
      title: heading[1] ?? "",
      id: heading[2] ?? "",
      paragraphs: content ? content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()) : [],
    };
  });
}

export function serializeNarrativeSections(sections: NarrativeSection[], originalBody = ""): string {
  const firstHeading = originalBody.search(/^##\s+/m);
  const prefix = firstHeading > 0 ? originalBody.slice(0, firstHeading).trimEnd() : "";
  const headings = [...originalBody.matchAll(/^##\s+(.+?)\s+\{#([a-z0-9-]+)\}\s*$/gm)];
  const originalBlocks = new Map(headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? originalBody.length;
    return [heading[2] ?? "", originalBody.slice(start, end).trimEnd()];
  }));
  const originalSections = new Map(parseNarrativeSections(originalBody).map((section) => [section.id, section]));
  const rendered = sections.map((section) => {
    const original = originalSections.get(section.id);
    const block = originalBlocks.get(section.id);
    return block && original && JSON.stringify(original) === JSON.stringify(section)
      ? block
      : `## ${section.title} {#${section.id}}\n\n${section.paragraphs.join("\n\n")}`;
  }).join("\n\n");
  return `${prefix ? `${prefix}\n\n` : ""}${rendered}${rendered ? "\n" : ""}`;
}

const factValue = (record: unknown): string | undefined => {
  if (!record || typeof record !== "object") return undefined;
  const value = (record as { value?: unknown }).value;
  return typeof value === "string" ? value : undefined;
};

function schemaEnums(placeSchema: any, narrativeSchema: any, commonSchema: any, sourceIds: string[]): CanonicalOptions {
  const stringArray = (value: unknown, label: string): string[] => {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error(`Cannot read ${label} from canonical schema`);
    return value as string[];
  };
  return {
    placeTypes: stringArray(placeSchema.$defs?.placeType?.enum, "place types"),
    browseAreas: PLACE_AREAS,
    coordinateAccuracy: stringArray(placeSchema.$defs?.coordinateAccuracy?.enum, "coordinate accuracy"),
    publicationSafety: stringArray(commonSchema.$defs?.publicationSafety?.enum, "publication safety"),
    narrativeSectionIds: stringArray(narrativeSchema.$defs?.sectionKey?.enum, "narrative sections"),
    verificationStatuses: stringArray(commonSchema.$defs?.verificationStatus?.enum, "verification statuses"),
    sourceIds,
  };
}

async function loadContext(repository: GitRepository, branch: string) {
  const state = await repository.readBranchState(branch);
  const tree = await repository.readTree(state.treeSha);
  const required = ["schemas/place.schema.json", "schemas/narrative.schema.json", "schemas/common.schema.json", "validation/editorial-preview.json"];
  const entries = required.map((path) => blob(tree, path));
  if (entries.some((entry) => !entry)) throw new Error("Canonical schemas or preview allowlist are missing");
  const [placeSchema, narrativeSchema, commonSchema, previewData] = await Promise.all(entries.map(async (entry) => JSON.parse(await repository.readBlob(entry!.sha))));
  return {
    state,
    tree,
    options: schemaEnums(placeSchema, narrativeSchema, commonSchema, tree
      .filter((entry) => entry.type === "blob" && /^content\/sources\/[^/]+\.ya?ml$/.test(entry.path))
      .map((entry) => entry.path.split("/").at(-1)!.replace(/\.ya?ml$/, ""))),
    previewIds: new Set(Array.isArray(previewData.place_ids) ? previewData.place_ids.filter((id: unknown): id is string => typeof id === "string") : []),
    schemas: { common: commonSchema, place: placeSchema, narrative: narrativeSchema },
  };
}

export async function loadAdminRepository(repository: GitRepository, branch: string): Promise<AdminRepositorySnapshot> {
  const { state, tree, options, previewIds } = await loadContext(repository, branch);
  const placeEntries = tree.filter((entry) => entry.type === "blob" && /^content\/places\/[^/]+\/place\.yaml$/.test(entry.path));
  const mediaEntries = tree.filter((entry) => entry.type === "blob" && /^content\/media\/[^/]+\.ya?ml$/.test(entry.path));
  const mediaRecords = await Promise.all(mediaEntries.map(async (entry) => parse(await repository.readBlob(entry.sha)) as { related_place_ids?: unknown }));
  const mediaCounts = new Map<string, number>();
  for (const media of mediaRecords) if (Array.isArray(media.related_place_ids)) for (const id of media.related_place_ids) if (typeof id === "string") mediaCounts.set(id, (mediaCounts.get(id) ?? 0) + 1);

  const places = await Promise.all(placeEntries.map(async (entry): Promise<AdminPlace> => {
    const record = parse(await repository.readBlob(entry.sha)) as Record<string, any>;
    const id = String(record.id ?? entry.path.split("/")[2]);
    const narrativeEntry = blob(tree, `content/places/${id}/narratives/sr.md`);
    const narrative = narrativeEntry ? parseNarrative(await repository.readBlob(narrativeEntry.sha)).frontMatter : {};
    const sourceIds = new Set([...(Array.isArray(record.source_ids) ? record.source_ids : []), ...(Array.isArray(narrative.source_ids) ? narrative.source_ids : [])].filter((value): value is string => typeof value === "string"));
    const coordinates = record.location?.coordinates;
    const municipality = factValue(record.location?.municipality);
    const settlement = factValue(record.location?.settlement);
    return {
      id,
      preferredName: typeof narrative.preferred_name === "string" ? narrative.preferred_name : id,
      ...(typeof narrative.slug === "string" ? { slug: narrative.slug } : {}),
      ...(typeof record.place_type?.value === "string" ? { placeType: record.place_type.value } : {}),
      editorialStatus: typeof record.editorial_status === "string" ? record.editorial_status : "unknown",
      ...(typeof record.browse_area_id === "string" ? { browseAreaId: record.browse_area_id } : {}),
      ...(municipality ? { municipality } : {}),
      ...(settlement ? { settlement } : {}),
      ...(typeof coordinates?.latitude === "number" ? { latitude: coordinates.latitude } : {}),
      ...(typeof coordinates?.longitude === "number" ? { longitude: coordinates.longitude } : {}),
      ...(typeof narrative.summary === "string" ? { summary: narrative.summary } : {}),
      sourcesCount: sourceIds.size,
      mediaCount: mediaCounts.get(id) ?? 0,
      inPreview: previewIds.has(id),
    };
  }));
  places.sort((left, right) => left.preferredName.localeCompare(right.preferredName, "sr"));
  const statuses: Record<string, number> = {};
  for (const place of places) statuses[place.editorialStatus] = (statuses[place.editorialStatus] ?? 0) + 1;
  const withCoordinates = places.filter((place) => place.latitude !== undefined && place.longitude !== undefined).length;
  return { branch, state, supportedPlaceTypes: options.placeTypes, options, places, stats: { total: places.length, preview: places.filter((place) => place.inPreview).length, withCoordinates, withoutCoordinates: places.length - withCoordinates, statuses } };
}

export async function loadEditablePlace(repository: GitRepository, branch: string, id: string): Promise<EditablePlaceRecord> {
  const { state, tree, options, previewIds, schemas } = await loadContext(repository, branch);
  const placeEntry = blob(tree, `content/places/${id}/place.yaml`);
  const narrativeEntry = blob(tree, `content/places/${id}/narratives/sr.md`);
  if (!placeEntry || !narrativeEntry) throw new AdminError("not_found", 404, "Place does not exist");
  const rawPlace = parse(await repository.readBlob(placeEntry.sha)) as Record<string, any>;
  const parsedNarrative = parseNarrative(await repository.readBlob(narrativeEntry.sha));
  const rawNarrative = parsedNarrative.frontMatter;
  const coordinates = rawPlace.location?.coordinates;
  const placeSourceIds = Array.isArray(rawPlace.source_ids) ? rawPlace.source_ids.filter((value: unknown): value is string => typeof value === "string") : [];
  const narrativeSourceIds = Array.isArray(rawNarrative.source_ids) ? rawNarrative.source_ids.filter((value: unknown): value is string => typeof value === "string") : [];
  const alternateNames = Array.isArray(rawNarrative.alternate_names) ? rawNarrative.alternate_names.map((entry: any) => ({
    name: String(entry.name ?? ""), context: String(entry.context ?? ""), sourceIds: Array.isArray(entry.source_ids) ? entry.source_ids.filter((value: unknown): value is string => typeof value === "string") : [], verificationStatus: String(entry.verification_status ?? "requires-verification"),
  })) : [];
  const jurisdiction = factValue(rawPlace.ecclesiastical?.jurisdiction);
  const countryCode = factValue(rawPlace.location?.country_code);
  const municipality = factValue(rawPlace.location?.municipality);
  const settlement = factValue(rawPlace.location?.settlement);
  const postalAddress = factValue(rawPlace.location?.postal_address);
  return {
    rawPlace, rawNarrative, narrativeBody: parsedNarrative.body, options, branch, state, schemas,
    place: {
      id,
      preferredName: String(rawNarrative.preferred_name ?? id),
      ...(typeof rawNarrative.short_name === "string" ? { shortName: rawNarrative.short_name } : {}),
      ...(typeof rawNarrative.slug === "string" ? { slug: rawNarrative.slug } : {}),
      ...(typeof rawPlace.place_type?.value === "string" ? { placeType: rawPlace.place_type.value } : {}),
      editorialStatus: String(rawPlace.editorial_status ?? "unknown"),
      ...(typeof rawPlace.browse_area_id === "string" ? { browseAreaId: rawPlace.browse_area_id } : {}),
      ...(jurisdiction ? { jurisdiction } : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(municipality ? { municipality } : {}),
      ...(settlement ? { settlement } : {}),
      ...(postalAddress ? { postalAddress } : {}),
      ...(typeof coordinates?.latitude === "number" ? { latitude: coordinates.latitude } : {}),
      ...(typeof coordinates?.longitude === "number" ? { longitude: coordinates.longitude } : {}),
      ...(typeof coordinates?.accuracy === "string" ? { coordinateAccuracy: coordinates.accuracy } : {}),
      ...(typeof coordinates?.publication_safety === "string" ? { publicationSafety: coordinates.publication_safety } : {}),
      ...(typeof rawNarrative.summary === "string" ? { summary: rawNarrative.summary } : {}),
      alternateNames,
      sections: parseNarrativeSections(parsedNarrative.body),
      placeSourceIds,
      narrativeSourceIds,
      sectionSources: rawNarrative.section_sources && typeof rawNarrative.section_sources === "object" ? rawNarrative.section_sources : {},
      sourcesCount: new Set([...placeSourceIds, ...narrativeSourceIds]).size,
      mediaCount: 0,
      inPreview: previewIds.has(id),
    },
  };
}
