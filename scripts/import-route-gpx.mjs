import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ROUTE_ENDPOINT_THRESHOLD_M,
  calculateRouteMetrics,
  endpointDistancesM,
  normalizeGpx,
  parseGpx,
} from "../src/lib/routes/gpx.ts";

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const required = (flag) => {
  const value = valueAfter(flag);
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
};

const numberAfter = (flag) => {
  const value = Number(required(flag));
  if (!Number.isFinite(value)) throw new Error(`Invalid ${flag}`);
  return value;
};

const source = resolve(required("--gpx"));
const output = resolve(required("--output"));
const fixtureOutput = valueAfter("--fixture-output") ? resolve(valueAfter("--fixture-output")) : undefined;
const routeId = required("--route-id");
const start = { latitude: numberAfter("--start-lat"), longitude: numberAfter("--start-lon") };
const end = { latitude: numberAfter("--end-lat"), longitude: numberAfter("--end-lon") };

const parsed = parseGpx(await readFile(source, "utf8"));
const endpointDistances = endpointDistancesM(parsed, start, end);
if (endpointDistances.start_m > ROUTE_ENDPOINT_THRESHOLD_M || endpointDistances.end_m > ROUTE_ENDPOINT_THRESHOLD_M) {
  throw new Error("GPX endpoints exceed the route endpoint threshold");
}
const geoJson = normalizeGpx(routeId, parsed);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(geoJson, null, 2)}\n`, "utf8");
if (fixtureOutput) {
  const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const segments = parsed.segments.map((segment) => `    <trkseg>\n${segment.map((point) => {
    const elevation = point.elevation === undefined ? "" : `<ele>${point.elevation}</ele>`;
    const time = point.timestamp ? `<time>${escapeXml(point.timestamp)}</time>` : "";
    return `      <trkpt lat="${point.latitude}" lon="${point.longitude}">${elevation}${time}</trkpt>`;
  }).join("\n")}\n    </trkseg>`).join("\n");
  const fixture = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Garmin Connect" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk><type>hiking</type>\n${segments}\n  </trk>\n</gpx>\n`;
  await mkdir(dirname(fixtureOutput), { recursive: true });
  await writeFile(fixtureOutput, fixture, "utf8");
}

process.stdout.write(`${JSON.stringify({
  creator: parsed.creator,
  activityType: parsed.activityType,
  trackCount: parsed.trackCount,
  segmentCount: parsed.segments.length,
  pointCount: geoJson.geometry.coordinates.length,
  metrics: calculateRouteMetrics(parsed),
  endpointDistances,
}, null, 2)}\n`);
