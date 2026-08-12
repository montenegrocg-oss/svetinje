import { authenticateRequest } from "./auth.ts";
import { AdminError, errorResponse } from "./errors.ts";
import { GitHubRepository } from "./github.ts";
import { createPlace, getPlace, listPlaces } from "./service.ts";
import type { AdminEnv } from "./types.ts";
import { dashboardPage, newPlacePage, placePage, placesPage } from "./ui.ts";

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
    const apiPlaceMatch = url.pathname.match(/^\/api\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (request.method === "GET" && apiPlaceMatch?.[1]) {
      return Response.json(await getPlace(repository, env, apiPlaceMatch[1]), { headers: JSON_HEADERS });
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
      return placesPage(session, await listPlaces(repository, env));
    }
    if (request.method === "GET" && url.pathname === "/places/new") {
      const snapshot = await listPlaces(repository, env);
      return newPlacePage(session, snapshot.supportedPlaceTypes, snapshot.state.headSha);
    }
    const placeMatch = url.pathname.match(/^\/places\/([a-z0-9]+(?:-[a-z0-9]+)*)$/);
    if (request.method === "GET" && placeMatch?.[1]) {
      const result = await getPlace(repository, env, placeMatch[1]);
      return placePage(session, result.place);
    }
    throw new AdminError("not_found", 404, "Route does not exist");
  } catch (error) {
    return errorResponse(error);
  }
}

export default { fetch: handleRequest } satisfies ExportedHandler<AdminEnv>;
