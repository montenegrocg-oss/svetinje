import { parse } from "yaml";
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

export interface AdminRepositorySnapshot {
  branch: string;
  state: BranchState;
  supportedPlaceTypes: string[];
  places: AdminPlace[];
  stats: {
    total: number;
    preview: number;
    withCoordinates: number;
    withoutCoordinates: number;
    statuses: Record<string, number>;
  };
}

function blob(tree: TreeEntry[], path: string): TreeEntry | undefined {
  return tree.find((entry) => entry.type === "blob" && entry.path === path);
}

function frontMatter(markdown: string): Record<string, unknown> {
  if (!markdown.startsWith("---\n")) return {};
  const end = markdown.indexOf("\n---\n", 4);
  return end > 0 ? parse(markdown.slice(4, end)) as Record<string, unknown> : {};
}

function factValue(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const value = (record as { value?: unknown }).value;
  return typeof value === "string" ? value : undefined;
}

export async function loadAdminRepository(repository: GitRepository, branch: string): Promise<AdminRepositorySnapshot> {
  const state = await repository.readBranchState(branch);
  const tree = await repository.readTree(state.treeSha);
  const placeEntries = tree.filter((entry) => entry.type === "blob" && /^content\/places\/[^/]+\/place\.yaml$/.test(entry.path));
  const schemaEntry = blob(tree, "schemas/place.schema.json");
  const previewEntry = blob(tree, "validation/editorial-preview.json");
  if (!schemaEntry || !previewEntry) throw new Error("Canonical schema or preview allowlist is missing");

  const [schemaText, previewText] = await Promise.all([
    repository.readBlob(schemaEntry.sha),
    repository.readBlob(previewEntry.sha),
  ]);
  const schema = JSON.parse(schemaText) as { $defs?: { placeType?: { enum?: unknown } } };
  const supportedPlaceTypes = schema.$defs?.placeType?.enum;
  if (!Array.isArray(supportedPlaceTypes) || supportedPlaceTypes.some((value) => typeof value !== "string")) {
    throw new Error("Cannot read place types from canonical schema");
  }
  const previewData = JSON.parse(previewText) as { place_ids?: unknown };
  const previewIds = new Set(Array.isArray(previewData.place_ids) ? previewData.place_ids.filter((id): id is string => typeof id === "string") : []);

  const mediaEntries = tree.filter((entry) => entry.type === "blob" && /^content\/media\/[^/]+\.ya?ml$/.test(entry.path));
  const mediaRecords = await Promise.all(mediaEntries.map(async (entry) => parse(await repository.readBlob(entry.sha)) as { related_place_ids?: unknown }));
  const mediaCounts = new Map<string, number>();
  for (const media of mediaRecords) {
    if (!Array.isArray(media.related_place_ids)) continue;
    for (const id of media.related_place_ids) {
      if (typeof id === "string") mediaCounts.set(id, (mediaCounts.get(id) ?? 0) + 1);
    }
  }

  const places = await Promise.all(placeEntries.map(async (entry): Promise<AdminPlace> => {
    const record = parse(await repository.readBlob(entry.sha)) as Record<string, any>;
    const id = String(record.id ?? entry.path.split("/")[2]);
    const narrativeEntry = blob(tree, `content/places/${id}/narratives/sr.md`);
    const narrative = narrativeEntry ? frontMatter(await repository.readBlob(narrativeEntry.sha)) : {};
    const sourceIds = new Set([
      ...(Array.isArray(record.source_ids) ? record.source_ids : []),
      ...(Array.isArray(narrative.source_ids) ? narrative.source_ids : []),
    ].filter((id): id is string => typeof id === "string"));
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
  return {
    branch,
    state,
    supportedPlaceTypes: supportedPlaceTypes as string[],
    places,
    stats: {
      total: places.length,
      preview: places.filter((place) => place.inPreview).length,
      withCoordinates,
      withoutCoordinates: places.length - withCoordinates,
      statuses,
    },
  };
}
