import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GpxValidationError,
  calculateElevationGainLoss,
  calculateRouteMetrics,
  endpointDistancesM,
  normalizeGpx,
  parseGpx,
  sanitizedGpxFromGeoJson,
} from "../src/lib/routes/gpx.ts";

const fixture = new URL("./fixtures/manastir-sergija-rumija.gpx", import.meta.url);
const readFixture = () => readFile(fixture, "utf8");

test("pilot Garmin route fixture is parsed and minimized deterministically", async () => {
  const parsed = parseGpx(await readFixture());
  assert.equal(parsed.version, "1.1");
  assert.equal(parsed.creator, "Garmin Connect");
  assert.equal(parsed.activityType, "hiking");
  assert.equal(parsed.trackCount, 1);
  assert.equal(parsed.segments.length, 1);
  assert.equal(parsed.segments.flat().length, 1986);
  assert.deepEqual(parsed.segments[0][0], {
    latitude: 42.09421142935753,
    longitude: 19.181685000658035,
    elevation: 966.7999877929688,
    timestamp: "2026-07-31T06:07:25.000Z",
  });
  assert.equal(parsed.segments.at(-1).at(-1).latitude, 42.1030215639621);
  assert.equal(parsed.segments.at(-1).at(-1).longitude, 19.188766116276383);
  const metrics = calculateRouteMetrics(parsed);
  assert.deepEqual(metrics, {
    distance_m: 2693,
    ascent_m: 614,
    descent_m: 0,
    min_elevation_m: 966.8,
    max_elevation_m: 1581.4,
    recorded_duration_minutes: 140,
  });
  assert.deepEqual(endpointDistancesM(parsed,
    { latitude: 42.09412, longitude: 19.181891 },
    { latitude: 42.103217, longitude: 19.188486 }),
  { start_m: 19.8, end_m: 31.7 });
  const geoJson = normalizeGpx("manastir-sergija-rumija", parsed);
  const serialized = JSON.stringify(geoJson);
  for (const privateField of ["heartrate", "cadence", "calories", "extensions", "garmin", "device"]) {
    assert.doesNotMatch(serialized, new RegExp(privateField, "i"));
  }
  const download = sanitizedGpxFromGeoJson("Тест рута", geoJson);
  assert.match(download, /<name>Тест рута<\/name>/);
  assert.doesNotMatch(download, /<time>|<extensions>|heartrate|cadence/i);
});

test("elevation deadband ignores small noise and preserves meaningful climb", () => {
  assert.deepEqual(calculateElevationGainLoss([100, 101, 99, 104, 103, 110, 106]), { ascentM: 10, descentM: 4 });
});

test("GPX parser supports segments and optional elevation or timestamps", () => {
  const xml = (segments) => `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk>${segments}</trk></gpx>`;
  const parsed = parseGpx(xml("<trkseg><trkpt lat=\"42\" lon=\"19\"/><trkpt lat=\"42.1\" lon=\"19.1\"/></trkseg><trkseg><trkpt lat=\"42.2\" lon=\"19.2\"/></trkseg>"));
  assert.equal(parsed.segments.length, 2);
  assert.equal(calculateRouteMetrics(parsed).recorded_duration_minutes, undefined);
  assert.equal(calculateRouteMetrics(parsed).min_elevation_m, undefined);
});

test("GPX parser fails closed on malformed coordinates and insufficient tracks", () => {
  const wrap = (body) => `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>${body}</trkseg></trk></gpx>`;
  assert.throws(() => parseGpx("<gpx>"), GpxValidationError);
  assert.throws(() => parseGpx(wrap("<trkpt lat=\"x\" lon=\"19\"/><trkpt lat=\"42\" lon=\"19\"/>")), /неважећу координату/);
  assert.throws(() => parseGpx(wrap("<trkpt lat=\"42\" lon=\"19\"/>")), /најмање двије/);
  assert.throws(() => parseGpx(wrap("<trkpt lat=\"42\" lon=\"19\"><ele>x<\/ele><\/trkpt><trkpt lat=\"42.1\" lon=\"19.1\"/>")), /неважећу висину/);
});

test("pilot route public composition remains loader-driven and key-safe", async () => {
  const [home, map, routePage, header] = await Promise.all([
    readFile(new URL("../src/pages/index.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/components/routes/RouteMap.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/rute/[slug]/index.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Header.astro", import.meta.url), "utf8"),
  ]);
  assert.match(home, /loadVisibleRoutes/);
  assert.match(home, /<MapExplorer places=\{places\} routes=\{routes\}/);
  assert.match(header, /href: "\/rute\/", label: "Руте"/);
  assert.match(map, /fetch\(data\.trackUrl/);
  assert.doesNotMatch(routePage, /1986|2693|614/);
  assert.doesNotMatch(map, /[?&]key=[A-Za-z0-9_-]{16,}/);
});
