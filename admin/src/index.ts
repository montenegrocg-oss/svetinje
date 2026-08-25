import { authenticateRequest } from "./auth.ts";
import { AdminError, errorResponse, logInternalDiagnostic } from "./errors.ts";
import { GitHubRepository } from "./github.ts";
import { deletePlacePhoto, MAX_PHOTO_COUNT, MAX_UPLOAD_BYTES, updatePlacePhoto, uploadPlacePhotos } from "./media.ts";
import { createPlace, deletePlace, getEditablePlace, getPlace, listPlaces, updatePlace, updatePlaceNarrative, updatePlacePreview } from "./service.ts";
import type { AdminEnv } from "./types.ts";
import { dashboardPage, editPlacePage, newPlacePage, placePage, placesPage } from "./ui.ts";
import { createRoute, deleteRoute, getEditableRoute, listRoutes, removeRouteTrack, updateRoute, updateRoutePreview, uploadRouteGpx } from "./route-service.ts";
import { editRoutePage, newRoutePage, routesPage } from "./ui.ts";
import { MAX_GPX_BYTES } from "../../src/lib/routes/gpx.ts";

const JSON_HEADERS = { "cache-control": "no-store" };

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AdminError("invalid_form_data", 415, "Content-Type must be application/json");
  }
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required");
    return value as Record<string, unknown>;
  } catch {
    throw new AdminError("invalid_form_data", 400, "Request body must be a JSON object");
  }
}

function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AdminError("invalid_form_data", 403, "Cross-origin writes are not allowed");
  }
}

async function photoUpload(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    throw new AdminError("invalid_form_data", 415, "Photo upload must use multipart/form-data");
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    throw new AdminError("invalid_form_data", 413, "Photo upload request is too large");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new AdminError("invalid_form_data", 400, "Photo upload body is invalid");
  }
  const files = form.getAll("photos").filter((value): value is File => value instanceof File);
  if (files.length < 1 || files.length > MAX_PHOTO_COUNT) throw new AdminError("invalid_form_data", 400, `Upload must contain 1-${MAX_PHOTO_COUNT} photographs`);
  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BYTES) throw new AdminError("invalid_form_data", 413, "Photo upload request is too large");
  return {
    expectedHeadSha: form.get("expectedHeadSha"),
    photos: await Promise.all(files.map(async (file) => ({ name: file.name, mimeType: file.type.toLowerCase(), bytes: new Uint8Array(await file.arrayBuffer()) }))),
  };
}

function visibilityBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    expectedHeadSha: body.expectedHeadSha,
    enabled: body.published,
  };
}

async function routeGpxUpload(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new AdminError("invalid_form_data", 415, "GPX upload must use multipart/form-data");
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_GPX_BYTES + 64_000) throw new AdminError("invalid_form_data", 413, "GPX upload is too large");
  let form: FormData; try { form = await request.formData(); } catch { throw new AdminError("invalid_form_data", 400, "GPX upload body is invalid"); }
  const file = form.get("gpx"); if (!(file instanceof File) || file.size < 1 || file.size > MAX_GPX_BYTES || !file.name.toLowerCase().endsWith(".gpx")) throw new AdminError("invalid_form_data", 400, "Изаберите GPX датотеку до 5 MB.");
  return { expectedHeadSha: form.get("expectedHeadSha"), xml: await file.text() };
}

export async function handleRequest(request: Request, env: AdminEnv): Promise<Response> {
  try {
    const session = await authenticateRequest(request, env);
    const repository = new GitHubRepository({ env });
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/session") {
      return Response.json({ subject: session.subject, email: session.email, actor: session.actor }, { headers: JSON_HEADERS });
    }
    if (request.method === "GET" && url.pathname === "/api/places") {
      const snapshot = await listPlaces(repository, env);
      return Response.json({ places: snapshot.places, stats: snapshot.stats, branch: snapshot.branch, headSha: snapshot.state.headSha }, { headers: JSON_HEADERS });
    }
    const apiPhotoCollectionMatch = url.pathname.match(/^\/api\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)\/photos$/);
    if (request.method === "POST" && apiPhotoCollectionMatch?.[1]) {
      requireSameOrigin(request);
      const upload = await photoUpload(request);
      return Response.json(await uploadPlacePhotos(repository, env, session, apiPhotoCollectionMatch[1], upload.expectedHeadSha, upload.photos), { status: 201, headers: JSON_HEADERS });
    }
    const apiPhotoMatch = url.pathname.match(/^\/api\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)\/photos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (request.method === "PATCH" && apiPhotoMatch?.[1] && apiPhotoMatch[2]) {
      requireSameOrigin(request);
      return Response.json(await updatePlacePhoto(repository, env, session, apiPhotoMatch[1], apiPhotoMatch[2], await jsonBody(request)), { headers: JSON_HEADERS });
    }
    if (request.method === "DELETE" && apiPhotoMatch?.[1] && apiPhotoMatch[2]) {
      requireSameOrigin(request);
      return Response.json(await deletePlacePhoto(repository, env, session, apiPhotoMatch[1], apiPhotoMatch[2], await jsonBody(request)), { headers: JSON_HEADERS });
    }
    const apiPreviewMatch = url.pathname.match(/^\/api\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)\/preview$/);
    if (request.method === "PATCH" && apiPreviewMatch?.[1]) {
      requireSameOrigin(request);
      return Response.json(await updatePlacePreview(repository, env, session, apiPreviewMatch[1], await jsonBody(request)), { headers: JSON_HEADERS });
    }
    const apiNarrativeMatch = url.pathname.match(/^\/api\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)\/narratives\/([a-z]{2})$/);
    if (request.method === "PATCH" && apiNarrativeMatch?.[1] && apiNarrativeMatch[2]) {
      requireSameOrigin(request);
      return Response.json(await updatePlaceNarrative(repository, env, session, apiNarrativeMatch[1], apiNarrativeMatch[2], await jsonBody(request)), { headers: JSON_HEADERS });
    }
    const apiPlaceMatch = url.pathname.match(/^\/api\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (request.method === "GET" && apiPlaceMatch?.[1]) {
      const record = await getEditablePlace(repository, env, apiPlaceMatch[1]);
      return Response.json({ place: record.place, narratives: record.place.narratives, options: record.options, branch: record.branch, headSha: record.state.headSha }, { headers: JSON_HEADERS });
    }
    if (request.method === "PATCH" && apiPlaceMatch?.[1]) {
      requireSameOrigin(request);
      return Response.json(await updatePlace(repository, env, session, apiPlaceMatch[1], await jsonBody(request)), { headers: JSON_HEADERS });
    }
    const apiVisibilityMatch = url.pathname.match(/^\/api\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)\/visibility$/);
    if (request.method === "PATCH" && apiVisibilityMatch?.[1]) {
      requireSameOrigin(request);
      return Response.json(await updatePlacePreview(repository, env, session, apiVisibilityMatch[1], visibilityBody(await jsonBody(request))), { headers: JSON_HEADERS });
    }
    if (request.method === "GET" && url.pathname === "/api/routes") {
      const result = await listRoutes(repository, env); return Response.json({ routes: result.routes, branch: result.branch, headSha: result.state.headSha }, { headers: JSON_HEADERS });
    }
    if (request.method === "POST" && url.pathname === "/api/routes") { requireSameOrigin(request); return Response.json(await createRoute(repository, env, session, await jsonBody(request)), { status: 201, headers: JSON_HEADERS }); }
    const apiRouteTrack = url.pathname.match(/^\/api\/routes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/track$/);
    if (request.method === "PUT" && apiRouteTrack?.[1]) { requireSameOrigin(request); const upload = await routeGpxUpload(request); return Response.json(await uploadRouteGpx(repository, env, session, apiRouteTrack[1], upload.expectedHeadSha, upload.xml), { headers: JSON_HEADERS }); }
    if (request.method === "DELETE" && apiRouteTrack?.[1]) { requireSameOrigin(request); return Response.json(await removeRouteTrack(repository, env, session, apiRouteTrack[1], await jsonBody(request)), { headers: JSON_HEADERS }); }
    const apiRoutePreview = url.pathname.match(/^\/api\/routes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/preview$/);
    if (request.method === "PATCH" && apiRoutePreview?.[1]) { requireSameOrigin(request); return Response.json(await updateRoutePreview(repository, env, apiRoutePreview[1], await jsonBody(request)), { headers: JSON_HEADERS }); }
    const apiRouteVisibility = url.pathname.match(/^\/api\/routes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/visibility$/);
    if (request.method === "PATCH" && apiRouteVisibility?.[1]) { requireSameOrigin(request); return Response.json(await updateRoutePreview(repository, env, apiRouteVisibility[1], visibilityBody(await jsonBody(request))), { headers: JSON_HEADERS }); }
    const apiRoute = url.pathname.match(/^\/api\/routes\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (request.method === "GET" && apiRoute?.[1]) { const result = await getEditableRoute(repository, env, apiRoute[1]); return Response.json({ route: result.route, places: result.places, branch: result.branch, headSha: result.state.headSha }, { headers: JSON_HEADERS }); }
    if (request.method === "PATCH" && apiRoute?.[1]) { requireSameOrigin(request); return Response.json(await updateRoute(repository, env, session, apiRoute[1], await jsonBody(request)), { headers: JSON_HEADERS }); }
    if (request.method === "DELETE" && apiRoute?.[1]) { requireSameOrigin(request); return Response.json(await deleteRoute(repository, env, apiRoute[1], await jsonBody(request)), { headers: JSON_HEADERS }); }
    if (request.method === "DELETE" && apiPlaceMatch?.[1]) {
      requireSameOrigin(request);
      return Response.json(await deletePlace(repository, env, session, apiPlaceMatch[1], await jsonBody(request)), { headers: JSON_HEADERS });
    }
    if (request.method === "POST" && url.pathname === "/api/places") {
      requireSameOrigin(request);
      const result = await createPlace(repository, env, session, await jsonBody(request));
      return Response.json(result, { status: 201, headers: JSON_HEADERS });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return dashboardPage(session, await listPlaces(repository, env));
    }
    if (request.method === "GET" && url.pathname === "/places") {
      return placesPage(session, await listPlaces(repository, env), {
        ...(url.searchParams.get("deleted") ? { deletedId: url.searchParams.get("deleted")! } : {}),
        mediaCleanupIncomplete: url.searchParams.get("mediaCleanup") === "incomplete",
      });
    }
    if (request.method === "GET" && url.pathname === "/places/new") {
      const snapshot = await listPlaces(repository, env);
      return newPlacePage(session, snapshot.options, snapshot.state.headSha);
    }
    if (request.method === "GET" && url.pathname === "/routes") { return routesPage(session, await listRoutes(repository, env)); }
    if (request.method === "GET" && url.pathname === "/routes/new") { return newRoutePage(session, await listRoutes(repository, env)); }
    const editRouteMatch = url.pathname.match(/^\/routes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/edit$/);
    if (request.method === "GET" && editRouteMatch?.[1]) { const result = await getEditableRoute(repository, env, editRouteMatch[1]); return editRoutePage(session, result, result.route, env.PUBLIC_MAPTILER_KEY?.trim()); }
    const editPlaceMatch = url.pathname.match(/^\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)\/edit$/);
    if (request.method === "GET" && editPlaceMatch?.[1]) {
      const result = await getEditablePlace(repository, env, editPlaceMatch[1]);
      return editPlacePage(session, result, env.PUBLIC_MAPTILER_KEY?.trim());
    }
    const placeMatch = url.pathname.match(/^\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (request.method === "GET" && placeMatch?.[1]) {
      const result = await getPlace(repository, env, placeMatch[1]);
      return placePage(session, result.place);
    }
    if (request.method === "GET" && url.pathname.startsWith("/assets/") && env.ASSETS) return env.ASSETS.fetch(request);
    throw new AdminError("not_found", 404, "Route does not exist");
  } catch (error) {
    logInternalDiagnostic(error, request);
    return errorResponse(error);
  }
}

export default { fetch: handleRequest } satisfies ExportedHandler<AdminEnv>;
