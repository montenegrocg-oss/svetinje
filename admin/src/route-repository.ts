import { parse } from "yaml";
import { parseNarrative } from "./repository-content.ts";
import { AdminError, internalFailure } from "./errors.ts";
import type { BranchState, GitRepository, TreeEntry } from "./types.ts";
import { validateRouteGeoJson, type RouteGeoJson } from "../../src/lib/routes/gpx.ts";

export interface AdminRoutePlace { id: string; name: string; latitude?: number; longitude?: number; placeType?: string; inPreview: boolean }
export interface AdminRoutePractical {
  startAccessNote?: string;
  parkingStatus: string; parkingNote?: string;
  trailMarkingStatus: string; trailMarkingNote?: string;
  difficultSectionsStatus: string; difficultSectionsNote?: string;
  footwearRecommendation?: string;
  mobileSignalStatus: string; mobileSignalNote?: string;
  weatherNote?: string; lastVerifiedAt?: string;
}
export interface AdminRoute {
  id: string; name: string; shortName: string; slug: string; editorialStatus: string;
  routeType: string; direction: string; startPlaceId: string; endPlaceId: string;
  waypointPlaceIds: string[]; trackStatus: string; pointCount?: number;
  metrics: Record<string, number>; difficulty: string; waterStatus: string; waterNote?: string;
  practical: AdminRoutePractical;
  surface: string[]; recommendedSeasons: string[]; featured: boolean; featuredOrder: number;
  summary: string; sections: Array<{ id: string; title: string; paragraphs: string[] }>;
  inPreview: boolean; track?: RouteGeoJson;
}
export interface RouteRepositorySnapshot {
  branch: string; state: BranchState; tree: TreeEntry[]; routes: AdminRoute[]; places: AdminRoutePlace[];
  previewRouteIds: string[]; previewPlaceIds: string[];
  schemas: { common: Record<string, unknown>; route: Record<string, unknown>; routeNarrative: Record<string, unknown> };
  rawRoutes: Map<string, { route: Record<string, any>; narrative: Record<string, any>; body: string; track?: RouteGeoJson }>;
}

const blob = (tree: TreeEntry[], file: string) => tree.find((entry) => entry.type === "blob" && entry.path === file);
const parseYaml = (text: string): Record<string, any> => {
  try { return parse(text) as Record<string, any>; } catch { throw internalFailure("catalog_yaml_parse_failed"); }
};
const contentsFor = async (repository: GitRepository, entries: TreeEntry[]) => repository.readBlobs
  ? repository.readBlobs(entries.map((entry) => entry.sha))
  : new Map(await Promise.all(entries.map(async (entry) => [entry.sha, await repository.readBlob(entry.sha)] as const)));

export async function loadRouteRepository(repository: GitRepository, branch: string): Promise<RouteRepositorySnapshot> {
  const state = await repository.readBranchState(branch);
  const tree = await repository.readTree(state.treeSha);
  const requiredPaths = ["schemas/common.schema.json", "schemas/route.schema.json", "schemas/route-narrative.schema.json", "validation/editorial-preview.json", "validation/editorial-preview-routes.json"];
  const required = requiredPaths.map((file) => blob(tree, file));
  if (required.some((entry) => !entry)) throw internalFailure("catalog_tree_processing_failed");
  const routeEntries = tree.filter((entry) => entry.type === "blob" && /^content\/routes\/[^/]+\/route\.yaml$/.test(entry.path));
  const narrativeEntries = tree.filter((entry) => entry.type === "blob" && /^content\/routes\/[^/]+\/narratives\/sr\.md$/.test(entry.path));
  const trackEntries = tree.filter((entry) => entry.type === "blob" && /^content\/routes\/[^/]+\/track\.geojson$/.test(entry.path));
  const placeEntries = tree.filter((entry) => entry.type === "blob" && /^content\/places\/[^/]+\/place\.yaml$/.test(entry.path));
  const placeNarratives = tree.filter((entry) => entry.type === "blob" && /^content\/places\/[^/]+\/narratives\/sr\.md$/.test(entry.path));
  const allEntries = [...required as TreeEntry[], ...routeEntries, ...narrativeEntries, ...trackEntries, ...placeEntries, ...placeNarratives];
  const contents = await contentsFor(repository, allEntries);
  const text = (entry: TreeEntry) => {
    const value = contents.get(entry.sha);
    if (value === undefined) throw internalFailure("catalog_blob_decode_failed");
    return value;
  };
  let common: Record<string, unknown>; let routeSchema: Record<string, unknown>; let routeNarrative: Record<string, unknown>;
  let previewPlaceIds: string[]; let previewRouteIds: string[];
  try {
    common = JSON.parse(text(required[0]!)); routeSchema = JSON.parse(text(required[1]!)); routeNarrative = JSON.parse(text(required[2]!));
    previewPlaceIds = JSON.parse(text(required[3]!)).place_ids; previewRouteIds = JSON.parse(text(required[4]!)).route_ids;
    if (!Array.isArray(previewPlaceIds) || !Array.isArray(previewRouteIds)) throw new Error();
  } catch { throw internalFailure("catalog_tree_processing_failed"); }
  const previewPlaces = new Set(previewPlaceIds);
  const placeNarrativeById = new Map(placeNarratives.map((entry) => [entry.path.split("/")[2]!, parseNarrative(text(entry)).frontMatter]));
  const places = placeEntries.map((entry): AdminRoutePlace => {
    const raw = parseYaml(text(entry)); const id = String(raw.id ?? entry.path.split("/")[2]); const narrative = placeNarrativeById.get(id) ?? {};
    const coordinates = raw.location?.coordinates;
    return { id, name: typeof narrative.preferred_name === "string" ? narrative.preferred_name : id,
      ...(typeof coordinates?.latitude === "number" ? { latitude: coordinates.latitude } : {}),
      ...(typeof coordinates?.longitude === "number" ? { longitude: coordinates.longitude } : {}),
      ...(typeof raw.place_type?.value === "string" ? { placeType: raw.place_type.value } : {}), inPreview: previewPlaces.has(id) };
  }).sort((left, right) => left.name.localeCompare(right.name, "sr"));
  const narrativeById = new Map(narrativeEntries.map((entry) => [entry.path.split("/")[2]!, parseNarrative(text(entry))]));
  const trackById = new Map(trackEntries.map((entry) => {
    const id = entry.path.split("/")[2]!; let value: unknown;
    try { value = JSON.parse(text(entry)); } catch { throw internalFailure("catalog_tree_processing_failed"); }
    if (!validateRouteGeoJson(value, id)) throw internalFailure("catalog_tree_processing_failed");
    return [id, value] as const;
  }));
  const rawRoutes = new Map<string, { route: Record<string, any>; narrative: Record<string, any>; body: string; track?: RouteGeoJson }>();
  const routes = routeEntries.map((entry): AdminRoute => {
    const raw = parseYaml(text(entry)); const id = String(raw.id ?? entry.path.split("/")[2]); const parsedNarrative = narrativeById.get(id);
    if (!parsedNarrative) throw new AdminError("internal_error", 500, `Route ${id} has no Serbian narrative`);
    const track = trackById.get(id);
    rawRoutes.set(id, { route: raw, narrative: parsedNarrative.frontMatter, body: parsedNarrative.body, ...(track ? { track } : {}) });
    const sections = [...parsedNarrative.body.matchAll(/^##\s+(.+?)\s+\{#([a-z0-9-]+)\}\s*$/gm)].map((heading, index, headings) => {
      const start = (heading.index ?? 0) + heading[0].length; const end = headings[index + 1]?.index ?? parsedNarrative.body.length;
      const content = parsedNarrative.body.slice(start, end).trim();
      return { title: heading[1]!, id: heading[2]!, paragraphs: content ? content.split(/\n\s*\n/).map((value) => value.trim()) : [] };
    });
    return {
      id, name: parsedNarrative.frontMatter.preferred_name ?? id, shortName: parsedNarrative.frontMatter.short_name ?? parsedNarrative.frontMatter.preferred_name ?? id,
      slug: parsedNarrative.frontMatter.slug ?? id, editorialStatus: raw.editorial_status ?? "unknown", routeType: raw.route_type ?? "hiking", direction: raw.direction ?? "one-way",
      startPlaceId: raw.relationships?.start_place_id ?? "", endPlaceId: raw.relationships?.end_place_id ?? "", waypointPlaceIds: raw.relationships?.waypoint_place_ids ?? [],
      trackStatus: raw.track?.status ?? "missing", ...(typeof raw.track?.point_count === "number" ? { pointCount: raw.track.point_count } : {}), metrics: raw.metrics ?? {},
      difficulty: raw.difficulty?.value ?? "moderate", waterStatus: raw.water?.status ?? "unknown", ...(typeof raw.water?.note === "string" ? { waterNote: raw.water.note } : {}),
      practical: {
        ...(typeof raw.practical?.start_access?.note === "string" ? { startAccessNote: raw.practical.start_access.note } : {}),
        parkingStatus: raw.practical?.parking?.status ?? "unknown", ...(typeof raw.practical?.parking?.note === "string" ? { parkingNote: raw.practical.parking.note } : {}),
        trailMarkingStatus: raw.practical?.trail_marking?.status ?? "unknown", ...(typeof raw.practical?.trail_marking?.note === "string" ? { trailMarkingNote: raw.practical.trail_marking.note } : {}),
        difficultSectionsStatus: raw.practical?.difficult_sections?.status ?? "unknown", ...(typeof raw.practical?.difficult_sections?.note === "string" ? { difficultSectionsNote: raw.practical.difficult_sections.note } : {}),
        ...(typeof raw.practical?.footwear?.recommendation === "string" ? { footwearRecommendation: raw.practical.footwear.recommendation } : {}),
        mobileSignalStatus: raw.practical?.mobile_signal?.status ?? "unknown", ...(typeof raw.practical?.mobile_signal?.note === "string" ? { mobileSignalNote: raw.practical.mobile_signal.note } : {}),
        ...(typeof raw.practical?.weather?.note === "string" ? { weatherNote: raw.practical.weather.note } : {}),
        ...(typeof raw.practical?.last_verified_at === "string" ? { lastVerifiedAt: raw.practical.last_verified_at } : {}),
      },
      surface: raw.surface?.values ?? [], recommendedSeasons: raw.recommended_seasons ?? [], featured: raw.featured?.enabled === true, featuredOrder: raw.featured?.order ?? 1,
      summary: parsedNarrative.frontMatter.summary ?? "", sections, inPreview: previewRouteIds.includes(id), ...(track ? { track } : {}),
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "sr"));
  return { branch, state, tree, routes, places, previewRouteIds, previewPlaceIds, schemas: { common, route: routeSchema, routeNarrative }, rawRoutes };
}
