import { SaxesParser } from "saxes";

export const MAX_GPX_BYTES = 5 * 1024 * 1024;
export const MAX_GPX_POINTS = 100_000;
export const ROUTE_ENDPOINT_THRESHOLD_M = 150;
export const ELEVATION_NOISE_THRESHOLD_M = 3;

const GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1";
const EARTH_RADIUS_M = 6_371_008.8;

export interface GpxPoint {
  latitude: number;
  longitude: number;
  elevation?: number;
  timestamp?: string;
}

export interface ParsedGpx {
  version: string;
  creator: string;
  activityType?: string;
  trackCount: number;
  segments: GpxPoint[][];
}

export interface RouteMetrics {
  distance_m: number;
  ascent_m?: number;
  descent_m?: number;
  min_elevation_m?: number;
  max_elevation_m?: number;
  recorded_duration_minutes?: number;
}

export interface RouteGeoJson {
  type: "Feature";
  properties: { route_id: string };
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number] | [number, number, number]>;
  };
}

export class GpxValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GpxValidationError";
    this.code = code;
  }
}

const localName = (name: string) => name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (value === undefined || value === null) return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

export function haversineDistanceM(
  from: Pick<GpxPoint, "latitude" | "longitude">,
  to: Pick<GpxPoint, "latitude" | "longitude">,
): number {
  const radians = Math.PI / 180;
  const deltaLatitude = (to.latitude - from.latitude) * radians;
  const deltaLongitude = (to.longitude - from.longitude) * radians;
  const latitudeA = from.latitude * radians;
  const latitudeB = to.latitude * radians;
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/**
 * Streaming GPX 1.1 reader. Only route geometry, elevation and timestamps are
 * retained; Garmin extensions and every other metadata field are discarded.
 */
export function parseGpx(xml: string): ParsedGpx {
  if (new TextEncoder().encode(xml).byteLength > MAX_GPX_BYTES) {
    throw new GpxValidationError("file_too_large", "GPX датотека је већа од 5 MB.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new GpxValidationError("unsafe_xml", "GPX садржи недозвољену XML декларацију.");
  }

  let version = "";
  let creator = "";
  let activityType: string | undefined;
  let trackCount = 0;
  let rootSeen = false;
  let currentSegment: GpxPoint[] | undefined;
  let currentPoint: GpxPoint | undefined;
  let pointCount = 0;
  let capture: "type" | "ele" | "time" | undefined;
  let capturedText = "";
  const stack: string[] = [];
  const segments: GpxPoint[][] = [];
  const parser = new SaxesParser({ xmlns: true });

  parser.on("opentag", (tag) => {
    const local = tag.local || localName(tag.name);
    stack.push(local);
    if (!rootSeen) {
      if (local !== "gpx" || tag.uri !== GPX_NAMESPACE) {
        throw new GpxValidationError("invalid_gpx", "Корјени елемент мора бити GPX 1.1.");
      }
      rootSeen = true;
      version = String(tag.attributes.version?.value ?? "");
      creator = String(tag.attributes.creator?.value ?? "");
      return;
    }
    if (local === "trk") trackCount += 1;
    if (local === "trkseg") currentSegment = [];
    if (local === "trkpt") {
      if (!currentSegment) throw new GpxValidationError("invalid_track", "trkpt мора бити унутар trkseg.");
      const latitude = finiteNumber(tag.attributes.lat?.value);
      const longitude = finiteNumber(tag.attributes.lon?.value);
      if (latitude === undefined || longitude === undefined || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        throw new GpxValidationError("invalid_coordinate", "GPX садржи неважећу координату.");
      }
      currentPoint = { latitude, longitude };
    }
    const parent = stack.at(-2);
    if (local === "type" && parent === "trk") capture = "type";
    if (currentPoint && (local === "ele" || local === "time")) capture = local;
    if (capture) capturedText = "";
  });
  parser.on("text", (text) => {
    if (capture) capturedText += text;
  });
  parser.on("cdata", (text) => {
    if (capture) capturedText += text;
  });
  parser.on("closetag", (tag) => {
    const local = tag.local || localName(tag.name);
    if (capture === "type" && local === "type") activityType = capturedText.trim() || undefined;
    if (capture === "ele" && local === "ele" && currentPoint) {
      const elevation = finiteNumber(capturedText.trim());
      if (elevation === undefined) throw new GpxValidationError("invalid_elevation", "GPX садржи неважећу висину.");
      currentPoint.elevation = elevation;
    }
    if (capture === "time" && local === "time" && currentPoint) {
      const rawTimestamp = capturedText.trim();
      const timestamp = new Date(rawTimestamp);
      if (!rawTimestamp || Number.isNaN(timestamp.getTime())) {
        throw new GpxValidationError("invalid_timestamp", "GPX садржи неважеће вријеме.");
      }
      currentPoint.timestamp = timestamp.toISOString();
    }
    if (capture === local) {
      capture = undefined;
      capturedText = "";
    }
    if (local === "trkpt") {
      if (!currentPoint || !currentSegment) throw new GpxValidationError("invalid_track", "GPX тачка није потпуна.");
      currentSegment.push(currentPoint);
      currentPoint = undefined;
      pointCount += 1;
      if (pointCount > MAX_GPX_POINTS) {
        throw new GpxValidationError("too_many_points", "GPX има превише тачака.");
      }
    }
    if (local === "trkseg") {
      if (currentSegment?.length) segments.push(currentSegment);
      currentSegment = undefined;
    }
    stack.pop();
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof GpxValidationError) throw error;
    throw new GpxValidationError("invalid_xml", "GPX није важећи XML.");
  }
  if (!rootSeen || version !== "1.1") throw new GpxValidationError("invalid_gpx", "Подржан је само GPX 1.1.");
  if (trackCount < 1 || segments.length < 1) throw new GpxValidationError("missing_track", "GPX не садржи трасу.");
  if (pointCount < 2) throw new GpxValidationError("insufficient_points", "GPX траса мора имати најмање двије тачке.");
  return { version, creator, ...(activityType ? { activityType } : {}), trackCount, segments };
}

export function calculateElevationGainLoss(
  elevations: readonly number[],
  thresholdM = ELEVATION_NOISE_THRESHOLD_M,
): { ascentM: number; descentM: number } {
  if (elevations.length < 2) return { ascentM: 0, descentM: 0 };
  let accepted = elevations[0]!;
  let ascentM = 0;
  let descentM = 0;
  for (const elevation of elevations.slice(1)) {
    const delta = elevation - accepted;
    if (Math.abs(delta) < thresholdM) continue;
    if (delta > 0) ascentM += delta;
    else descentM += -delta;
    accepted = elevation;
  }
  return { ascentM, descentM };
}

export function calculateRouteMetrics(gpx: ParsedGpx): RouteMetrics {
  let distance = 0;
  let ascent = 0;
  let descent = 0;
  const elevations: number[] = [];
  const timestamps: number[] = [];
  for (const segment of gpx.segments) {
    for (let index = 1; index < segment.length; index += 1) {
      distance += haversineDistanceM(segment[index - 1]!, segment[index]!);
    }
    const segmentElevations = segment.flatMap((point) => point.elevation === undefined ? [] : [point.elevation]);
    const gainLoss = calculateElevationGainLoss(segmentElevations);
    ascent += gainLoss.ascentM;
    descent += gainLoss.descentM;
    elevations.push(...segmentElevations);
    timestamps.push(...segment.flatMap((point) => point.timestamp ? [Date.parse(point.timestamp)] : []));
  }
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  for (const elevation of elevations) {
    minElevation = Math.min(minElevation, elevation);
    maxElevation = Math.max(maxElevation, elevation);
  }
  let firstTimestamp = Number.POSITIVE_INFINITY;
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  for (const timestamp of timestamps) {
    firstTimestamp = Math.min(firstTimestamp, timestamp);
    lastTimestamp = Math.max(lastTimestamp, timestamp);
  }
  const recordedMinutes = timestamps.length >= 2 ? Math.max(0, (lastTimestamp - firstTimestamp) / 60_000) : undefined;
  return {
    distance_m: Math.round(distance),
    ...(elevations.length ? {
      ascent_m: Math.round(ascent),
      descent_m: Math.round(descent),
      min_elevation_m: Math.round(minElevation * 10) / 10,
      max_elevation_m: Math.round(maxElevation * 10) / 10,
    } : {}),
    ...(recordedMinutes !== undefined ? { recorded_duration_minutes: Math.round(recordedMinutes) } : {}),
  };
}

const rounded = (value: number, digits: number) => Number(value.toFixed(digits));

export function normalizeGpx(routeId: string, gpx: ParsedGpx): RouteGeoJson {
  const coordinates = gpx.segments.flatMap((segment) => segment.map((point) => point.elevation === undefined
    ? [rounded(point.longitude, 7), rounded(point.latitude, 7)] as [number, number]
    : [rounded(point.longitude, 7), rounded(point.latitude, 7), rounded(point.elevation, 1)] as [number, number, number]));
  return {
    type: "Feature",
    properties: { route_id: routeId },
    geometry: { type: "LineString", coordinates },
  };
}

export function validateRouteGeoJson(value: unknown, routeId?: string): value is RouteGeoJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const feature = value as Partial<RouteGeoJson>;
  if (feature.type !== "Feature" || feature.geometry?.type !== "LineString") return false;
  if (!feature.properties || typeof feature.properties.route_id !== "string") return false;
  if (routeId && feature.properties.route_id !== routeId) return false;
  const coordinates = feature.geometry.coordinates;
  return Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.length <= MAX_GPX_POINTS
    && coordinates.every((coordinate) => Array.isArray(coordinate)
      && (coordinate.length === 2 || coordinate.length === 3)
      && coordinate.every((item) => typeof item === "number" && Number.isFinite(item))
      && coordinate[0]! >= -180 && coordinate[0]! <= 180
      && coordinate[1]! >= -90 && coordinate[1]! <= 90);
}

export function endpointDistancesM(
  gpx: ParsedGpx,
  start: Pick<GpxPoint, "latitude" | "longitude">,
  end: Pick<GpxPoint, "latitude" | "longitude">,
): { start_m: number; end_m: number } {
  const first = gpx.segments[0]?.[0];
  const lastSegment = gpx.segments.at(-1);
  const last = lastSegment?.at(-1);
  if (!first || !last) throw new GpxValidationError("missing_track", "GPX не садржи трасу.");
  return {
    start_m: Math.round(haversineDistanceM(first, start) * 10) / 10,
    end_m: Math.round(haversineDistanceM(last, end) * 10) / 10,
  };
}

const xmlEscape = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

export function sanitizedGpxFromGeoJson(routeName: string, geoJson: RouteGeoJson): string {
  const points = geoJson.geometry.coordinates.map((coordinate) => {
    const elevation = coordinate.length === 3 ? `\n        <ele>${coordinate[2]}</ele>` : "";
    return `      <trkpt lat="${coordinate[1]}" lon="${coordinate[0]}">${elevation}\n      </trkpt>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx creator="Svetinje.me" version="1.1" xmlns="${GPX_NAMESPACE}">\n  <trk>\n    <name>${xmlEscape(routeName)}</name>\n    <type>hiking</type>\n    <trkseg>\n${points}\n    </trkseg>\n  </trk>\n</gpx>\n`;
}
