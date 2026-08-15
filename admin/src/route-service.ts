import { stringify } from "yaml";
import { editorialBranch } from "./github.ts";
import { AdminError } from "./errors.ts";
import { loadRouteRepository, type AdminRoute } from "./route-repository.ts";
import { serializeNarrative } from "./repository-content.ts";
import { ROUTE_SCHEMA_FINGERPRINT, validateRoute, validateRouteNarrative } from "./generated/canonical-validators.js";
import { fingerprintRouteSchemas } from "./schema-fingerprint.ts";
import type { AdminEnv, AdminSession, GitRepository, RepositoryFile } from "./types.ts";
import { ROUTE_ENDPOINT_THRESHOLD_M, calculateRouteMetrics, endpointDistancesM, normalizeGpx, parseGpx } from "../../src/lib/routes/gpx.ts";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA = /^[0-9a-f]{40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROUTE_SECTIONS = new Set(["about-route", "route-course", "water-rest", "safety", "equipment", "notes"]);
const asString = (value: unknown) => typeof value === "string" ? value.trim() : undefined;
const assertHead = (value: unknown, actual: string): string => {
  const expected = asString(value);
  if (!expected || !SHA.test(expected)) throw new AdminError("invalid_form_data", 400, "HEAD ревизија није важећа.");
  if (expected !== actual) throw new AdminError("git_conflict", 409, "Уређивачка грана је промијењена.");
  return expected;
};
const jsonRegistry = (ids: string[]) => `${JSON.stringify({ route_ids: ids }, null, 2)}\n`;
const yaml = (value: Record<string, unknown>) => stringify(value, { lineWidth: 0 }).replace(/\n*$/, "\n");
const errorsFor = (validator: { errors?: null | Array<{ instancePath?: string; message?: string }> }) => Object.fromEntries((validator.errors ?? []).map((error, index) => [error.instancePath || `schema-${index}`, error.message ?? "Неважећа вриједност."]));
const safeText = (value: string) => !/<\/?(?:script|iframe|object|embed|form|input|button|style|link|meta)\b/i.test(value) && !/\son[a-z]+\s*=/i.test(value) && !/(?:javascript|data|vbscript):/i.test(value);
const serializeSections = (sections: Array<{ id: string; title: string; paragraphs: string[] }>) => sections.map((section) => `## ${section.title} {#${section.id}}\n\n${section.paragraphs.join("\n\n")}`.trimEnd()).join("\n\n") + (sections.length ? "\n" : "");

async function snapshot(repository: GitRepository, env: AdminEnv) { return loadRouteRepository(repository, editorialBranch(env)); }
export async function listRoutes(repository: GitRepository, env: AdminEnv) { return snapshot(repository, env); }
export async function getEditableRoute(repository: GitRepository, env: AdminEnv, id: string) {
  const data = await snapshot(repository, env); const route = data.routes.find((candidate) => candidate.id === id); const raw = data.rawRoutes.get(id);
  if (!route || !raw) throw new AdminError("not_found", 404, "Рута не постоји.");
  return { ...data, route, raw };
}

export async function createRoute(repository: GitRepository, env: AdminEnv, session: AdminSession, body: Record<string, unknown>, now = new Date()) {
  const data = await snapshot(repository, env); const expectedHeadSha = assertHead(body.expectedHeadSha, data.state.headSha);
  const id = asString(body.id); const slug = asString(body.slug); const preferredName = asString(body.preferredName);
  const shortName = asString(body.shortName) || preferredName; const startPlaceId = asString(body.startPlaceId); const endPlaceId = asString(body.endPlaceId);
  if (!id || !ID.test(id) || !slug || !ID.test(slug) || !preferredName || !startPlaceId || !endPlaceId || startPlaceId === endPlaceId) throw new AdminError("invalid_form_data", 400, "Основни подаци руте нису важећи.");
  if (data.routes.some((route) => route.id === id)) throw new AdminError("duplicate_id", 409, "ID руте већ постоји.");
  if (![startPlaceId, endPlaceId].every((placeId) => data.places.some((place) => place.id === placeId))) throw new AdminError("invalid_form_data", 400, "Повезана светиња не постоји.");
  const timestamp = now.toISOString();
  const route = { schema_version: 1, id, editorial_status: "research", route_type: "hiking", direction: "one-way",
    relationships: { start_place_id: startPlaceId, end_place_id: endPlaceId, waypoint_place_ids: [] }, track: { status: "missing" }, metrics: {}, difficulty: { value: "moderate" },
    water: { status: "unknown", note: "Подаци о води на рути још нису провјерени." }, surface: { values: [] }, recommended_seasons: [], featured: { enabled: false, order: 1 }, approvals: [],
    audit: { created_at: timestamp, created_by: session.actor, updated_at: timestamp, updated_by: session.actor } };
  const narrative = { schema_version: 1, route_id: id, locale: "sr", editorial_status: "research", translation_status: "source", slug, preferred_name: preferredName, short_name: shortName, summary: asString(body.summary) || `Пјешачка рута од ${preferredName}.`, approvals: [], audit: { created_at: timestamp, created_by: session.actor, updated_at: timestamp, updated_by: session.actor } };
  if (!validateRoute(route) || !validateRouteNarrative(narrative)) throw new AdminError("invalid_form_data", 400, "Рута није у складу са канонском шемом.", { ...errorsFor(validateRoute), ...errorsFor(validateRouteNarrative) });
  const result = await repository.commitFilesAtomic({ branch: data.branch, expectedHeadSha, baseTreeSha: data.state.treeSha, message: `Add research route ${id}`, files: [
    { path: `content/routes/${id}/route.yaml`, content: yaml(route) }, { path: `content/routes/${id}/narratives/sr.md`, content: serializeNarrative(narrative, "") },
  ] });
  return { commitSha: result.commitSha, branch: result.branch, routeId: id };
}

export async function updateRoute(repository: GitRepository, env: AdminEnv, session: AdminSession, id: string, body: Record<string, unknown>, now = new Date()) {
  const data = await getEditableRoute(repository, env, id); const expectedHeadSha = assertHead(body.expectedHeadSha, data.state.headSha);
  const placeIds = new Set(data.places.map((place) => place.id)); const startPlaceId = asString(body.startPlaceId); const endPlaceId = asString(body.endPlaceId);
  const preferredName = asString(body.preferredName); const slug = asString(body.slug); const summary = asString(body.summary);
  if (!startPlaceId || !endPlaceId || startPlaceId === endPlaceId || !placeIds.has(startPlaceId) || !placeIds.has(endPlaceId) || !preferredName || !slug || !ID.test(slug) || !summary) throw new AdminError("invalid_form_data", 400, "Подаци руте нису важећи.");
  const sections = Array.isArray(body.sections) ? body.sections.map((entry) => {
    const section = entry as Record<string, unknown>; const sectionId = asString(section.id); const title = asString(section.title); const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs.map(asString).filter((value): value is string => Boolean(value)) : [];
    if (!sectionId || !ROUTE_SECTIONS.has(sectionId) || !title || !safeText(`${title}\n${paragraphs.join("\n")}`)) throw new AdminError("invalid_form_data", 400, "Српски текст руте није важећи.");
    return { id: sectionId, title, paragraphs };
  }) : [];
  if (new Set(sections.map((section) => section.id)).size !== sections.length) throw new AdminError("invalid_form_data", 400, "Одјељци се не смију понављати.");
  const route = structuredClone(data.raw.route); const narrative = structuredClone(data.raw.narrative);
  route.direction = asString(body.direction) ?? route.direction; route.relationships.start_place_id = startPlaceId; route.relationships.end_place_id = endPlaceId;
  route.difficulty.value = asString(body.difficulty) ?? route.difficulty.value; route.water.status = asString(body.waterStatus) ?? route.water.status;
  const waterNote = asString(body.waterNote); if (waterNote) route.water.note = waterNote; else delete route.water.note;
  const startAccessNote = asString(body.startAccessNote); const parkingStatus = asString(body.parkingStatus) ?? "unknown"; const parkingNote = asString(body.parkingNote);
  const trailMarkingStatus = asString(body.trailMarkingStatus) ?? "unknown"; const trailMarkingNote = asString(body.trailMarkingNote);
  const difficultSectionsStatus = asString(body.difficultSectionsStatus) ?? "unknown"; const difficultSectionsNote = asString(body.difficultSectionsNote);
  const footwearRecommendation = asString(body.footwearRecommendation); const mobileSignalStatus = asString(body.mobileSignalStatus) ?? "unknown";
  const mobileSignalNote = asString(body.mobileSignalNote); const weatherNote = asString(body.weatherNote); const lastVerifiedAt = asString(body.lastVerifiedAt);
  const practicalText = [startAccessNote, parkingNote, trailMarkingNote, difficultSectionsNote, footwearRecommendation, mobileSignalNote, weatherNote].filter((value): value is string => Boolean(value));
  if (practicalText.some((value) => !safeText(value)) || (lastVerifiedAt && !DATE.test(lastVerifiedAt))) throw new AdminError("invalid_form_data", 400, "Практични подаци руте нису важећи.");
  const practical: Record<string, unknown> = {};
  if (startAccessNote) practical.start_access = { note: startAccessNote };
  if (parkingStatus !== "unknown" || parkingNote) practical.parking = { status: parkingStatus, ...(parkingNote ? { note: parkingNote } : {}) };
  if (trailMarkingStatus !== "unknown" || trailMarkingNote) practical.trail_marking = { status: trailMarkingStatus, ...(trailMarkingNote ? { note: trailMarkingNote } : {}) };
  if (difficultSectionsStatus !== "unknown" || difficultSectionsNote) practical.difficult_sections = { status: difficultSectionsStatus, ...(difficultSectionsNote ? { note: difficultSectionsNote } : {}) };
  if (footwearRecommendation) practical.footwear = { recommendation: footwearRecommendation };
  if (mobileSignalStatus !== "unknown" || mobileSignalNote) practical.mobile_signal = { status: mobileSignalStatus, ...(mobileSignalNote ? { note: mobileSignalNote } : {}) };
  if (weatherNote) practical.weather = { note: weatherNote };
  if (lastVerifiedAt) practical.last_verified_at = lastVerifiedAt;
  if (Object.keys(practical).length) route.practical = practical; else delete route.practical;
  const estimated = Number(body.estimatedDurationMinutes); if (Number.isInteger(estimated) && estimated > 0) route.metrics.estimated_duration_minutes = estimated; else delete route.metrics.estimated_duration_minutes;
  route.surface.values = Array.isArray(body.surface) ? body.surface.filter((value): value is string => typeof value === "string") : [];
  route.recommended_seasons = Array.isArray(body.recommendedSeasons) ? body.recommendedSeasons.filter((value): value is string => typeof value === "string") : [];
  route.featured.enabled = body.featured === true; route.featured.order = Number.isInteger(Number(body.featuredOrder)) && Number(body.featuredOrder) > 0 ? Number(body.featuredOrder) : 1;
  narrative.slug = slug; narrative.preferred_name = preferredName; narrative.short_name = asString(body.shortName) || preferredName; narrative.summary = summary;
  const bodyMarkdown = serializeSections(sections);
  const unchanged = JSON.stringify(route) === JSON.stringify(data.raw.route) && JSON.stringify(narrative) === JSON.stringify(data.raw.narrative) && bodyMarkdown === data.raw.body;
  if (unchanged) return { commitSha: expectedHeadSha, branch: data.branch, routeId: id, unchanged: true };
  const timestamp = now.toISOString(); route.audit.updated_at = timestamp; route.audit.updated_by = session.actor; narrative.audit.updated_at = timestamp; narrative.audit.updated_by = session.actor;
  if (!validateRoute(route) || !validateRouteNarrative(narrative)) throw new AdminError("invalid_form_data", 400, "Рута није у складу са канонском шемом.", { ...errorsFor(validateRoute), ...errorsFor(validateRouteNarrative) });
  const result = await repository.commitFilesAtomic({ branch: data.branch, expectedHeadSha, baseTreeSha: data.state.treeSha, message: `Update research route ${id}`, files: [
    { path: `content/routes/${id}/route.yaml`, content: yaml(route) }, { path: `content/routes/${id}/narratives/sr.md`, content: serializeNarrative(narrative, bodyMarkdown) },
  ] });
  return { commitSha: result.commitSha, branch: result.branch, routeId: id, unchanged: false };
}

export async function uploadRouteGpx(repository: GitRepository, env: AdminEnv, session: AdminSession, id: string, expectedValue: unknown, xml: string, now = new Date()) {
  const data = await getEditableRoute(repository, env, id); const expectedHeadSha = assertHead(expectedValue, data.state.headSha);
  const parsed = parseGpx(xml); if (parsed.activityType && parsed.activityType.toLowerCase() !== "hiking") throw new AdminError("invalid_form_data", 400, "GPX није означен као пјешачка активност.");
  const start = data.places.find((place) => place.id === data.route.startPlaceId); const end = data.places.find((place) => place.id === data.route.endPlaceId);
  if (start?.latitude === undefined || start.longitude === undefined || end?.latitude === undefined || end.longitude === undefined) throw new AdminError("invalid_form_data", 400, "Полазна и крајња светиња морају имати координате.");
  const endpoints = endpointDistancesM(parsed,
    { latitude: start.latitude, longitude: start.longitude },
    { latitude: end.latitude, longitude: end.longitude });
  if (endpoints.start_m > ROUTE_ENDPOINT_THRESHOLD_M || endpoints.end_m > ROUTE_ENDPOINT_THRESHOLD_M) throw new AdminError("invalid_form_data", 400, "Почетак или крај GPX трасе је удаљен више од 150 m од повезане светиње.");
  const track = normalizeGpx(id, parsed); const metrics = calculateRouteMetrics(parsed); const route = structuredClone(data.raw.route);
  const nextTrack = { status: "ready", object_key: `content/routes/${id}/track.geojson`, point_count: track.geometry.coordinates.length, endpoint_validation: { start_distance_m: endpoints.start_m, end_distance_m: endpoints.end_m, threshold_m: ROUTE_ENDPOINT_THRESHOLD_M } };
  const comparable = { track: nextTrack, metrics };
  if (data.raw.track && JSON.stringify(data.raw.track) === JSON.stringify(track) && JSON.stringify({ track: route.track, metrics: route.metrics }) === JSON.stringify(comparable)) return { commitSha: expectedHeadSha, branch: data.branch, routeId: id, unchanged: true, metrics };
  route.track = nextTrack; route.metrics = { ...metrics, ...(route.metrics.estimated_duration_minutes ? { estimated_duration_minutes: route.metrics.estimated_duration_minutes } : {}) };
  route.audit.updated_at = now.toISOString(); route.audit.updated_by = session.actor;
  if (!validateRoute(route)) throw new AdminError("invalid_form_data", 400, "GPX подаци нису у складу са канонском шемом.", errorsFor(validateRoute));
  const result = await repository.commitFilesAtomic({ branch: data.branch, expectedHeadSha, baseTreeSha: data.state.treeSha, message: `Update GPX track for ${id}`, files: [
    { path: `content/routes/${id}/route.yaml`, content: yaml(route) }, { path: `content/routes/${id}/track.geojson`, content: `${JSON.stringify(track, null, 2)}\n` },
  ] });
  return { commitSha: result.commitSha, branch: result.branch, routeId: id, unchanged: false, metrics };
}

export async function removeRouteTrack(repository: GitRepository, env: AdminEnv, session: AdminSession, id: string, body: Record<string, unknown>, now = new Date()) {
  const data = await getEditableRoute(repository, env, id); const expectedHeadSha = assertHead(body.expectedHeadSha, data.state.headSha);
  if (!data.raw.track) return { commitSha: expectedHeadSha, branch: data.branch, routeId: id, unchanged: true };
  const route = structuredClone(data.raw.route); route.track = { status: "missing" }; route.metrics = route.metrics.estimated_duration_minutes ? { estimated_duration_minutes: route.metrics.estimated_duration_minutes } : {};
  route.audit.updated_at = now.toISOString(); route.audit.updated_by = session.actor;
  const files: RepositoryFile[] = [{ path: `content/routes/${id}/route.yaml`, content: yaml(route) }, { path: `content/routes/${id}/track.geojson`, delete: true }];
  const result = await repository.commitFilesAtomic({ branch: data.branch, expectedHeadSha, baseTreeSha: data.state.treeSha, message: `Remove GPX track from ${id}`, files });
  return { commitSha: result.commitSha, branch: result.branch, routeId: id, unchanged: false };
}

export async function updateRoutePreview(repository: GitRepository, env: AdminEnv, id: string, body: Record<string, unknown>) {
  const data = await getEditableRoute(repository, env, id); const expectedHeadSha = assertHead(body.expectedHeadSha, data.state.headSha); if (typeof body.enabled !== "boolean") throw new AdminError("invalid_form_data", 400, "Статус радног приказа није важећи.");
  const current = data.previewRouteIds.includes(id); if (current === body.enabled) return { commitSha: expectedHeadSha, branch: data.branch, routeId: id, inPreview: current, unchanged: true };
  if (body.enabled) {
    if (await fingerprintRouteSchemas(data.schemas) !== ROUTE_SCHEMA_FINGERPRINT) throw new AdminError("internal_error", 500, "Canonical route schema fingerprint mismatch; redeploy Worker");
    if (!validateRoute(data.raw.route) || !validateRouteNarrative(data.raw.narrative) || !data.raw.track || !data.previewPlaceIds.includes(data.route.startPlaceId) || !data.previewPlaceIds.includes(data.route.endPlaceId)) throw new AdminError("invalid_form_data", 400, "Рута није спремна за радни приказ.");
  }
  const ids = body.enabled ? [...data.previewRouteIds, id] : data.previewRouteIds.filter((routeId) => routeId !== id);
  const result = await repository.commitFilesAtomic({ branch: data.branch, expectedHeadSha, baseTreeSha: data.state.treeSha, message: `${body.enabled ? "Add" : "Remove"} ${id} ${body.enabled ? "to" : "from"} route preview`, files: [{ path: "validation/editorial-preview-routes.json", content: jsonRegistry(ids) }] });
  return { commitSha: result.commitSha, branch: result.branch, routeId: id, inPreview: body.enabled, unchanged: false };
}

export async function deleteRoute(repository: GitRepository, env: AdminEnv, id: string, body: Record<string, unknown>) {
  const data = await getEditableRoute(repository, env, id); const expectedHeadSha = assertHead(body.expectedHeadSha, data.state.headSha);
  if (body.confirmed !== true || asString(body.confirmationId) !== id) throw new AdminError("invalid_form_data", 400, "Унесите тачан ID руте.");
  const files: RepositoryFile[] = [
    { path: `content/routes/${id}/route.yaml`, delete: true }, { path: `content/routes/${id}/narratives/sr.md`, delete: true },
    ...(data.raw.track ? [{ path: `content/routes/${id}/track.geojson`, delete: true } as RepositoryFile] : []),
    { path: "validation/editorial-preview-routes.json", content: jsonRegistry(data.previewRouteIds.filter((routeId) => routeId !== id)) },
  ];
  const result = await repository.commitFilesAtomic({ branch: data.branch, expectedHeadSha, baseTreeSha: data.state.treeSha, message: `Delete research route ${id}`, files });
  return { commitSha: result.commitSha, branch: result.branch, routeId: id };
}

export type { AdminRoute };
