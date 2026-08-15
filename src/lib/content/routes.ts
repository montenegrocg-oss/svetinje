import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import { isEditorialPreviewBuild, loadVisiblePlaces, type NarrativeSection, type VisiblePlace } from "./publication.ts";
import { validateRouteGeoJson, type RouteGeoJson } from "../routes/gpx.ts";

interface RouteRecord {
  id: string;
  editorial_status: string;
  route_type: "hiking";
  direction: "one-way" | "out-and-back" | "circular";
  relationships: { start_place_id: string; end_place_id: string; waypoint_place_ids: string[] };
  track: { status: "missing" | "ready"; object_key?: string; point_count?: number; endpoint_validation?: { start_distance_m: number; end_distance_m: number; threshold_m: number } };
  metrics: { distance_m?: number; ascent_m?: number; descent_m?: number; min_elevation_m?: number; max_elevation_m?: number; recorded_duration_minutes?: number; estimated_duration_minutes?: number };
  difficulty: { value: "easy" | "moderate" | "demanding" };
  water: { status: "unknown" | "none" | "available" | "requires-verification"; note?: string };
  practical?: RoutePractical;
  surface: { values: string[] };
  recommended_seasons: string[];
  featured: { enabled: boolean; order: number };
  approvals: Array<{ role: string; reviewer_id: string; outcome: string }>;
}

export interface RoutePractical {
  start_access?: { note: string };
  parking?: { status: "unknown" | "available" | "limited" | "none"; note?: string };
  trail_marking?: { status: "unknown" | "marked" | "partially-marked" | "unmarked"; note?: string };
  difficult_sections?: { status: "unknown" | "none" | "present"; note?: string };
  footwear?: { recommendation: string };
  mobile_signal?: { status: "unknown" | "good" | "variable" | "poor" | "none"; note?: string };
  weather?: { note: string };
  last_verified_at?: string;
}

interface RouteNarrative {
  route_id: string;
  locale: string;
  editorial_status: string;
  translation_status: string;
  slug?: string;
  preferred_name?: string;
  short_name?: string;
  summary?: string;
  approvals: Array<{ role: string; reviewer_id: string; outcome: string }>;
  body: string;
}

export interface RouteProfilePoint { distanceM: number; elevationM: number }

export interface VisibleRoute {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  summary: string;
  routeType: "hiking";
  direction: RouteRecord["direction"];
  startPlace: VisiblePlace;
  endPlace: VisiblePlace;
  waypointPlaces: VisiblePlace[];
  metrics: RouteRecord["metrics"];
  difficulty: RouteRecord["difficulty"]["value"];
  water: RouteRecord["water"];
  practical?: RoutePractical;
  surface: string[];
  recommendedSeasons: string[];
  featured: RouteRecord["featured"];
  pointCount: number;
  track: RouteGeoJson;
  trackUrl: string;
  gpxUrl: string;
  profile: RouteProfilePoint[];
  narrativeSections: NarrativeSection[];
  preview: boolean;
}

const objectFromYaml = (text: string, file: string): Record<string, unknown> => {
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  if (document.errors.length) throw new Error(`Cannot parse ${file}`);
  const value = document.toJS({ maxAliasCount: 0 });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${file} must be a mapping`);
  return value as Record<string, unknown>;
};

const readNarrative = async (file: string): Promise<RouteNarrative> => {
  const text = await readFile(file, "utf8");
  const closing = text.indexOf("\n---\n", 4);
  if (!text.startsWith("---\n") || closing < 0) throw new Error(`${file} has invalid front matter`);
  return { ...(objectFromYaml(`${text.slice(4, closing)}\n`, file) as unknown as Omit<RouteNarrative, "body">), body: text.slice(closing + 5) };
};

const narrativeSections = (body: string): NarrativeSection[] => {
  const sections: NarrativeSection[] = [];
  let current: NarrativeSection | undefined;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join(" ").trim();
    lines = [];
    if (current && text) current.paragraphs.push({ text, sourceIds: [] });
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s+\{#([a-z0-9-]+)\}\s*$/);
    if (heading) {
      flush();
      current = { title: heading[1]!, id: heading[2]!, paragraphs: [] };
      sections.push(current);
    } else if (current && line.trim()) lines.push(line.trim());
    else if (!line.trim()) flush();
  }
  flush();
  return sections.filter((section) => section.paragraphs.length > 0);
};

const profileForTrack = (track: RouteGeoJson, maxPoints = 180): RouteProfilePoint[] => {
  const coordinates = track.geometry.coordinates;
  const sampled: RouteProfilePoint[] = [];
  let distanceM = 0;
  const cumulative = coordinates.map((coordinate, index) => {
    if (index > 0) {
      const previous = coordinates[index - 1]!;
      const radians = Math.PI / 180;
      const dLat = (coordinate[1] - previous[1]) * radians;
      const dLon = (coordinate[0] - previous[0]) * radians;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(previous[1] * radians) * Math.cos(coordinate[1] * radians) * Math.sin(dLon / 2) ** 2;
      distanceM += 2 * 6_371_008.8 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return { distanceM, elevationM: coordinate[2] };
  }).filter((point): point is RouteProfilePoint => typeof point.elevationM === "number");
  if (cumulative.length <= maxPoints) return cumulative;
  for (let index = 0; index < maxPoints; index += 1) sampled.push(cumulative[Math.round(index * (cumulative.length - 1) / (maxPoints - 1))]!);
  return sampled;
};

const routeDirectories = async (root: string): Promise<string[]> => {
  try {
    return (await readdir(path.join(root, "content", "routes"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch { return []; }
};

export async function loadVisibleRoutes(root = process.cwd(), options: { editorialPreview?: boolean } = {}): Promise<VisibleRoute[]> {
  const preview = options.editorialPreview ?? isEditorialPreviewBuild();
  const places = await loadVisiblePlaces(root, { editorialPreview: preview });
  const placeById = new Map(places.map((place) => [place.id, place]));
  const policy = JSON.parse(await readFile(path.join(root, "validation", "publication-policy.json"), "utf8")) as { public_publication_locked: boolean };
  if (!preview && policy.public_publication_locked) return [];
  const allowlist = preview
    ? (JSON.parse(await readFile(path.join(root, "validation", "editorial-preview-routes.json"), "utf8")) as { route_ids: string[] }).route_ids
    : undefined;
  const allowed = allowlist ? new Set(allowlist) : undefined;
  if (allowed && allowed.size !== allowlist!.length) throw new Error("Editorial route preview validation failed: route_ids must not contain duplicates");

  const visible: VisibleRoute[] = [];
  for (const id of await routeDirectories(root)) {
    if (allowed && !allowed.has(id)) continue;
    const directory = path.join(root, "content", "routes", id);
    const [record, narrative, rawTrack] = await Promise.all([
      readFile(path.join(directory, "route.yaml"), "utf8").then((text) => objectFromYaml(text, `${id}/route.yaml`) as unknown as RouteRecord),
      readNarrative(path.join(directory, "narratives", "sr.md")),
      readFile(path.join(directory, "track.geojson"), "utf8").then(JSON.parse),
    ]);
    const track = rawTrack as unknown;
    const startPlace = placeById.get(record.relationships.start_place_id);
    const endPlace = placeById.get(record.relationships.end_place_id);
    const waypointPlaces = record.relationships.waypoint_place_ids.map((placeId) => placeById.get(placeId));
    const statusAllowed = preview
      ? record.editorial_status === "research" && narrative.editorial_status === "research"
      : record.editorial_status === "published" && narrative.editorial_status === "published";
    if (!statusAllowed || !startPlace || !endPlace || waypointPlaces.some((place) => !place)) continue;
    if (record.track.status !== "ready" || !validateRouteGeoJson(track, id) || track.geometry.coordinates.length !== record.track.point_count) continue;
    const endpoint = record.track.endpoint_validation;
    if (!endpoint || endpoint.start_distance_m > endpoint.threshold_m || endpoint.end_distance_m > endpoint.threshold_m || !record.metrics.distance_m || !record.difficulty.value || !record.water.status) continue;
    if (!narrative.slug || !narrative.preferred_name || !narrative.summary) continue;
    visible.push({
      id, slug: narrative.slug, name: narrative.preferred_name,
      shortName: narrative.short_name ?? narrative.preferred_name,
      summary: narrative.summary, routeType: record.route_type, direction: record.direction,
      startPlace, endPlace, waypointPlaces: waypointPlaces as VisiblePlace[], metrics: record.metrics,
      difficulty: record.difficulty.value, water: record.water, ...(record.practical ? { practical: record.practical } : {}), surface: record.surface.values,
      recommendedSeasons: record.recommended_seasons, featured: record.featured,
      pointCount: record.track.point_count!, track,
      trackUrl: `/rute/${narrative.slug}/track.geojson`, gpxUrl: `/rute/${narrative.slug}/track.gpx`,
      profile: profileForTrack(track), narrativeSections: narrativeSections(narrative.body), preview,
    });
  }
  if (allowed) {
    const loaded = new Set(visible.map((route) => route.id));
    for (const id of allowed) if (!loaded.has(id)) throw new Error(`Editorial route preview validation failed: ${id} is not eligible`);
  }
  return visible.sort((left, right) => left.featured.order - right.featured.order || left.name.localeCompare(right.name, "sr"));
}

export const routesForPlace = (routes: VisibleRoute[], placeId: string) => routes.filter((route) =>
  route.startPlace.id === placeId || route.endPlace.id === placeId || route.waypointPlaces.some((place) => place.id === placeId));
