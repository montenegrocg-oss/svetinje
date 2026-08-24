import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { validateRoute } from "../admin/src/generated/canonical-validators.js";
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

test("public route cards label summary metrics without hiding compact labels", async () => {
  const [card, css] = await Promise.all([
    readFile(new URL("../src/components/routes/RouteCard.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/global.css", import.meta.url), "utf8"),
  ]);

  for (const label of ["Растојање", "Вријеме", "Успон", "Захтјевност"]) {
    assert.match(card, new RegExp(`<dt>${label}<\\/dt>`));
  }
  assert.match(card, /toLocaleString\("sr-ME", \{ maximumFractionDigits: 1 \}\)\} km/);
  assert.match(card, /<dd>\{formatDuration\(duration\)\}<\/dd>/);
  assert.match(card, /<dd>\+\{route\.metrics\.ascent_m\} m<\/dd>/);
  assert.match(card, /<dd>\{difficulty\}<\/dd>/);
  assert.doesNotMatch(css, /\.route-card--compact \.route-card__metrics dt\s*\{[^}]*display:\s*none/);
});

test("pilot route public composition remains loader-driven and key-safe", async () => {
  const [home, map, routePage, header, css] = await Promise.all([
    readFile(new URL("../src/components/HomePage.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/components/routes/RouteMap.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/rute/[slug]/index.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/components/Header.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/global.css", import.meta.url), "utf8"),
  ]);
  assert.match(home, /loadVisibleRoutes/);
  assert.match(home, /<MapExplorer places=\{places\} routes=\{routes\}/);
  assert.match(header, /href: routeFor\(locale, "routes"\), label: copy\.nav\.routes/);
  assert.match(map, /fetch\(data\.trackUrl/);
  assert.match(map, /new ResizeObserver/);
  assert.match(map, /map\.resize\(\)/);
  assert.match(map, /canvas\.clientWidth <= 0 \|\| canvas\.clientHeight <= 0/);
  assert.equal((map.match(/new maplibregl\.AttributionControl/g) ?? []).length, 1);
  assert.doesNotMatch(map, /customAttribution/);
  assert.match(map, /styleimagemissing/);
  assert.match(map, /setTerrain\(null\)/);
  assert.match(map, /addSource\("route-track"/);
  assert.match(map, /new maplibregl\.Marker\(\{ element, anchor: "bottom" \}\)/);
  assert.match(map, /padding: \{ top: 72, right: 56, bottom: 64, left: 56 \}/);
  assert.match(css, /\.route-map > \.route-map__canvas[^\{]*\{[^}]*position: absolute;[^}]*height: 100%;/s);
  assert.match(css, /\.route-overview[^\{]*\{[^}]*grid-template-areas:[^}]*"identity map"[^}]*"about map"/s);
  assert.match(css, /\.route-map \{[^}]*min-height: 38rem;/s);
  assert.match(routePage, /Назад на све руте/);
  assert.match(routePage, /class="route-overview__metrics"/);
  assert.match(routePage, /Детаљи руте/);
  assert.match(routePage, /Практичне информације/);
  assert.match(routePage, /Пронађите више инспирације за ваша путовања/);
  assert.match(routePage, /href="\/rute\/"[^>]*>Прегледај све руте/);
  assert.match(routePage, /route\.highlights\.length > 0/);
  assert.match(map, /class="route-map__stats"/);
  assert.match(routePage, /Једносмјерна рута/);
  assert.match(routePage, /повратак није урачунат/);
  assert.match(routePage, /Процијењено вријеме односи се на кретање у једном смјеру/);
  assert.doesNotMatch(routePage, /<dt>Спуст<\/dt>|route\.metrics\.descent_m/);
  const practicalMarkup = routePage.slice(routePage.indexOf('<section class="route-practical"'), routePage.indexOf('remainingNarrativeSections.map'));
  for (const duplicate of ["Дужина", "Вријеме", "Успон", "Најнижа тачка", "Највиша тачка", "Тежина"]) assert.doesNotMatch(practicalMarkup, new RegExp(`>${duplicate}<`));
  for (const planningLabel of ["Паркинг", "Означеност", "Захтјевни дјелови", "Вода", "Мобилни сигнал"]) assert.match(routePage, new RegExp(`label: "${planningLabel}"`));
  assert.match(routePage, /row\.note &&/);
  assert.doesNotMatch(routePage, /1986|2693|614/);
  assert.doesNotMatch(map, /[?&]key=[A-Za-z0-9_-]{16,}/);
});

test("route detail uses one scoped responsive typography and metric system", async () => {
  const [routePage, map, profile, css] = await Promise.all([
    readFile(new URL("../src/pages/rute/[slug]/index.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/components/routes/RouteMap.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/components/routes/ElevationProfile.astro", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/global.css", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.route-detail-page\s*\{[^}]*--route-font-display:\s*clamp\([^;]+;[^}]*--route-font-h2:\s*clamp\([^;]+;[^}]*--route-font-h3:\s*clamp\([^;]+;[^}]*--route-font-body:\s*clamp\(/s);
  assert.match(css, /\.route-overview h1\s*\{[^}]*font-size:\s*var\(--route-font-display\)/s);
  assert.match(css, /\.route-section-title\s*\{[^}]*font-size:\s*var\(--route-font-h2\)[^}]*text-transform:\s*none/s);
  assert.match(css, /\.route-places \.editorial-place-card h2\s*\{[^}]*font-size:\s*var\(--route-font-h3\)[^}]*text-transform:\s*none/s);
  assert.match(css, /\.route-overview__metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.match(css, /\.route-overview__metrics div\s*\{[^}]*display:\s*grid;[^}]*min-height:[^;}]+;[^}]*align-content:\s*center/s);
  assert.match(css, /@media \(max-width: 47\.99rem\)[\s\S]*?\.route-overview__metrics\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(routePage, /class="route-section-title" id="route-details-title"/);
  assert.match(routePage, /class="route-section-title" id="route-practical-title"/);
  assert.match(profile, /class="route-section-title" id="route-profile-title"/);
  for (const source of [routePage, map, profile]) {
    assert.match(source, /class="route-stat__label"/);
    assert.match(source, /class="route-stat__value"/);
  }
});

test("route practical schema is optional and validates supported planning enums", async () => {
  const routeYaml = parse(await readFile(new URL("../content/routes/manastir-sergija-rumija/route.yaml", import.meta.url), "utf8"));
  assert.equal(validateRoute(routeYaml), true, JSON.stringify(validateRoute.errors));
  const withoutPractical = structuredClone(routeYaml);
  delete withoutPractical.practical;
  assert.equal(validateRoute(withoutPractical), true, JSON.stringify(validateRoute.errors));
  const withPractical = structuredClone(withoutPractical);
  withPractical.practical = {
    start_access: { note: "Провјерити приступ." }, parking: { status: "limited" }, trail_marking: { status: "partially-marked" },
    difficult_sections: { status: "present" }, footwear: { recommendation: "Планинарске ципеле." }, mobile_signal: { status: "variable" },
    weather: { note: "Провјерити вјетар." }, last_verified_at: "2026-08-15",
  };
  assert.equal(validateRoute(withPractical), true, JSON.stringify(validateRoute.errors));
  withPractical.practical.parking.status = "sometimes";
  assert.equal(validateRoute(withPractical), false);
});

test("route highlights are optional, canonical, and rendered only when present", async () => {
  const routeYaml = parse(await readFile(new URL("../content/routes/manastir-sergija-rumija/route.yaml", import.meta.url), "utf8"));
  assert.equal(validateRoute(routeYaml), true, JSON.stringify(validateRoute.errors));
  const withoutHighlights = structuredClone(routeYaml);
  delete withoutHighlights.highlights;
  assert.equal(validateRoute(withoutHighlights), true, JSON.stringify(validateRoute.errors));
  const withHighlight = structuredClone(withoutHighlights);
  withHighlight.highlights = [{
    id: "verified-stop",
    title: "Провјерена тачка",
    description: "Канонски опис провјерене тачке.",
    distance_from_start_km: 1.2,
    related_place_id: "crkva-svete-trojice-na-rumiji",
  }];
  assert.equal(validateRoute(withHighlight), true, JSON.stringify(validateRoute.errors));
  withHighlight.highlights[0].distance_from_start_km = -1;
  assert.equal(validateRoute(withHighlight), false);
});
