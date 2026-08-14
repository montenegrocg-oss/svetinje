import { AdminError } from "./errors.ts";
import { editorialBranch } from "./github.ts";
import {
  editorialPreviewEligibilityErrors,
  serializeEditorialPreviewRegistry,
} from "../../src/lib/content/editorial-preview-eligibility.ts";
import {
  CANONICAL_SCHEMA_FINGERPRINT,
  validateMedia,
  validateNarrative,
  validatePlace,
} from "./generated/canonical-validators.js";
import { loadAdminRepository, loadEditablePlace } from "./repository-content.ts";
import { fingerprintCanonicalSchemas } from "./schema-fingerprint.ts";
import { updateCanonicalPlace, type UpdatePlaceBody } from "./place-editor.ts";
import type { AdminEnv, AdminSession, GitRepository } from "./types.ts";
import { serializeResearchPlaceScaffold } from "../../scripts/lib/place-scaffold.mjs";

interface CreatePlaceBody {
  preferredName?: unknown;
  id?: unknown;
  slug?: unknown;
  placeType?: unknown;
  expectedHeadSha?: unknown;
}

export interface UpdatePlacePreviewBody {
  expectedHeadSha?: unknown;
  enabled?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

export async function listPlaces(repository: GitRepository, env: AdminEnv) {
  return loadAdminRepository(repository, editorialBranch(env));
}

export async function getPlace(repository: GitRepository, env: AdminEnv, id: string) {
  const snapshot = await listPlaces(repository, env);
  const place = snapshot.places.find((candidate) => candidate.id === id);
  if (!place) throw new AdminError("not_found", 404, "Place does not exist");
  return { place, branch: snapshot.branch, headSha: snapshot.state.headSha };
}

export async function getEditablePlace(repository: GitRepository, env: AdminEnv, id: string) {
  return loadEditablePlace(repository, editorialBranch(env), id);
}

export async function createPlace(
  repository: GitRepository,
  env: AdminEnv,
  session: AdminSession,
  body: CreatePlaceBody,
  now = new Date(),
) {
  const branch = editorialBranch(env);
  const snapshot = await loadAdminRepository(repository, branch);
  const id = asString(body.id);
  const preferredName = asString(body.preferredName);
  const slug = asString(body.slug);
  const placeType = asString(body.placeType);
  const expectedHeadSha = asString(body.expectedHeadSha);
  if (!id || !preferredName || !slug || !placeType || !expectedHeadSha) {
    throw new AdminError("invalid_form_data", 400, "Required fields are missing");
  }
  if (!/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
    throw new AdminError("invalid_form_data", 400, "Expected branch HEAD is invalid");
  }
  if (expectedHeadSha !== snapshot.state.headSha) {
    throw new AdminError("git_conflict", 409, "Editorial branch moved before save validation");
  }
  if (snapshot.places.some((place) => place.id === id)) {
    throw new AdminError("duplicate_id", 409, "Place ID already exists");
  }

  let scaffold;
  try {
    scaffold = serializeResearchPlaceScaffold({
      id,
      placeType,
      name: preferredName,
      slug,
      supportedPlaceTypes: snapshot.supportedPlaceTypes,
      actor: session.actor,
      now,
      requireName: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid scaffold input";
    if (message.startsWith("Unsupported place type")) {
      throw new AdminError("unsupported_place_type", 400, message);
    }
    throw new AdminError("invalid_form_data", 400, message);
  }

  const result = await repository.commitFilesAtomic({
    branch,
    expectedHeadSha,
    baseTreeSha: snapshot.state.treeSha,
    files: scaffold.files,
    message: `Add research place ${scaffold.id}`,
  });
  return {
    commitSha: result.commitSha,
    branch: result.branch,
    place: {
      id: scaffold.id,
      preferredName: scaffold.preferredName,
      slug: scaffold.slug,
      placeType: scaffold.placeType,
      editorialStatus: "research",
      inPreview: false,
    },
  };
}

export async function updatePlace(
  repository: GitRepository,
  env: AdminEnv,
  session: AdminSession,
  id: string,
  body: UpdatePlaceBody,
  now = new Date(),
) {
  const branch = editorialBranch(env);
  const record = await loadEditablePlace(repository, branch, id);
  const expectedHeadSha = asString(body.expectedHeadSha);
  if (!expectedHeadSha || !/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
    throw new AdminError("invalid_form_data", 400, "Expected branch HEAD is invalid", { expectedHeadSha: "HEAD ревизија није важећа." });
  }
  if (expectedHeadSha !== record.state.headSha) throw new AdminError("git_conflict", 409, "Editorial branch moved before save validation");
  const updated = await updateCanonicalPlace(record, body, session.actor, now);
  if (updated.unchanged) {
    return { commitSha: expectedHeadSha, branch, placeId: id, unchanged: true };
  }
  const result = await repository.commitFilesAtomic({
    branch,
    expectedHeadSha,
    baseTreeSha: record.state.treeSha,
    files: [
      { path: `content/places/${id}/place.yaml`, content: updated.placeYaml },
      { path: `content/places/${id}/narratives/sr.md`, content: updated.narrativeMarkdown },
    ],
    message: `Update research place ${id}`,
  });
  return { commitSha: result.commitSha, branch: result.branch, placeId: id, unchanged: false };
}

export async function updatePlacePreview(
  repository: GitRepository,
  env: AdminEnv,
  _session: AdminSession,
  id: string,
  body: UpdatePlacePreviewBody,
) {
  const branch = editorialBranch(env);
  const record = await loadEditablePlace(repository, branch, id);
  const expectedHeadSha = asString(body.expectedHeadSha);
  if (!expectedHeadSha || !/^[0-9a-f]{40}$/.test(expectedHeadSha) || typeof body.enabled !== "boolean") {
    throw new AdminError("invalid_form_data", 400, "Preview update is invalid", {
      ...(!expectedHeadSha || !/^[0-9a-f]{40}$/.test(expectedHeadSha) ? { expectedHeadSha: "HEAD ревизија није важећа." } : {}),
      ...(typeof body.enabled !== "boolean" ? { enabled: "Статус радног приказа није важећи." } : {}),
    });
  }
  if (expectedHeadSha !== record.state.headSha) throw new AdminError("git_conflict", 409, "Editorial branch moved before preview update");

  const currentlyEnabled = record.previewPlaceIds.includes(id);
  if (currentlyEnabled === body.enabled) {
    return { commitSha: expectedHeadSha, branch, placeId: id, inPreview: currentlyEnabled, unchanged: true };
  }

  if (body.enabled) {
    const loadedSchemaFingerprint = await fingerprintCanonicalSchemas(record.schemas);
    if (loadedSchemaFingerprint !== CANONICAL_SCHEMA_FINGERPRINT) throw new AdminError("internal_error", 500, "Canonical schema fingerprint mismatch");
    const errors = editorialPreviewEligibilityErrors({
      id,
      place: record.rawPlace,
      narrative: record.rawNarrative,
      narrativeBody: record.narrativeBody,
      mediaRecords: record.rawMedia.map(({ record: media }) => media),
      knownSourceIds: record.knownSourceIds,
      repositoryPaths: record.repositoryPaths,
      validateMediaRecord: (media) => Boolean(validateMedia(media)),
    });
    if (!validatePlace(record.rawPlace)) errors.place = "Објекат није у складу са канонском шемом.";
    if (!validateNarrative(record.rawNarrative)) errors.narrative = "Српски текст није у складу са канонском шемом.";
    if (Object.keys(errors).length > 0) throw new AdminError("invalid_form_data", 400, "Place is not eligible for editorial preview", errors);
  }

  const previewPlaceIds = body.enabled
    ? [...record.previewPlaceIds, id]
    : record.previewPlaceIds.filter((placeId) => placeId !== id);
  const result = await repository.commitFilesAtomic({
    branch,
    expectedHeadSha,
    baseTreeSha: record.state.treeSha,
    files: [{ path: "validation/editorial-preview.json", content: serializeEditorialPreviewRegistry(previewPlaceIds) }],
    message: `${body.enabled ? "Add" : "Remove"} ${id} ${body.enabled ? "to" : "from"} editorial preview`,
  });
  return { commitSha: result.commitSha, branch: result.branch, placeId: id, inPreview: body.enabled, unchanged: false };
}
