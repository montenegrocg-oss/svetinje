import { AdminError } from "./errors.ts";
import { stringify } from "yaml";
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
import { loadAdminRepository, loadEditablePlace, loadPlaceDeletionRecord } from "./repository-content.ts";
import { fingerprintCanonicalSchemas } from "./schema-fingerprint.ts";
import { updateCanonicalPlace, type UpdatePlaceBody } from "./place-editor.ts";
import { deleteCommittedR2Objects, isSafeR2ObjectKey } from "./media.ts";
import type { AdminEnv, AdminSession, GitRepository, RepositoryFile } from "./types.ts";
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

export interface DeletePlaceBody {
  expectedHeadSha?: unknown;
  confirmed?: unknown;
  confirmationId?: unknown;
}

const DELETABLE_STATUSES = new Set([
  "research",
  "draft",
  "fact-review",
  "ecclesiastical-review",
  "language-review",
  "needs-reverification",
  "disputed",
  "rejected",
]);

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

export async function deletePlace(
  repository: GitRepository,
  env: AdminEnv,
  session: AdminSession,
  id: string,
  body: DeletePlaceBody,
  now = new Date(),
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new AdminError("invalid_form_data", 400, "Place ID is invalid");
  }
  const expectedHeadSha = asString(body.expectedHeadSha);
  if (!expectedHeadSha || !/^[0-9a-f]{40}$/.test(expectedHeadSha)) {
    throw new AdminError("invalid_form_data", 400, "Expected branch HEAD is invalid");
  }
  if (body.confirmed !== true || body.confirmationId !== id) {
    throw new AdminError("invalid_form_data", 400, "Place deletion confirmation is invalid");
  }

  const branch = editorialBranch(env);
  const record = await loadPlaceDeletionRecord(repository, branch, id);
  if (expectedHeadSha !== record.state.headSha) {
    throw new AdminError("git_conflict", 409, "Editorial branch moved before deletion");
  }
  const editorialStatus = typeof record.rawPlace.editorial_status === "string"
    ? record.rawPlace.editorial_status
    : "";
  if (editorialStatus === "approved" || editorialStatus === "published") {
    throw new AdminError("protected_record", 409, "Approved or published places must be archived");
  }
  if (!DELETABLE_STATUSES.has(editorialStatus)) {
    throw new AdminError("invalid_form_data", 400, "Place editorial status cannot be deleted");
  }
  if (record.externalReferences.length > 0) {
    throw new AdminError("deletion_blocked", 409, "Place is referenced by other repository records", {
      dependencies: record.externalReferences,
    });
  }

  const updatedAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const fileMap = new Map<string, RepositoryFile>();
  for (const path of record.ownedPaths) fileMap.set(path, { path, delete: true });
  const r2ObjectKeys: string[] = [];
  for (const target of record.rawMedia.filter(({ record: media }) => (
    Array.isArray(media.related_place_ids) && media.related_place_ids.includes(id)
  ))) {
    const remainingPlaceIds = target.record.related_place_ids.filter((placeId: unknown) => placeId !== id);
    const objectKey = typeof target.record.object_key === "string" ? target.record.object_key.replaceAll("\\", "/") : "";
    const sharedObject = record.rawMedia.some(({ path, record: media }) => {
      if (path === target.path || typeof media.object_key !== "string" || media.object_key.replaceAll("\\", "/") !== objectKey) return false;
      const relatedPlaceIds = Array.isArray(media.related_place_ids) ? media.related_place_ids : [];
      return !relatedPlaceIds.includes(id) || relatedPlaceIds.some((placeId: unknown) => placeId !== id);
    });
    if (remainingPlaceIds.length > 0) {
      const media = structuredClone(target.record);
      media.related_place_ids = remainingPlaceIds;
      media.audit = { ...media.audit, updated_at: updatedAt, updated_by: session.actor };
      fileMap.set(target.path, { path: target.path, content: stringify(media, { lineWidth: 0 }) });
      continue;
    }

    fileMap.set(target.path, { path: target.path, delete: true });
    if (!sharedObject && target.record.storage_provider === "cloudflare-r2") {
      r2ObjectKeys.push(objectKey);
    }
    if (
      !sharedObject
      && target.record.storage_provider === "local-public"
      && objectKey.startsWith("public/images/")
      && !objectKey.includes("../")
      && record.tree.some((entry) => entry.type === "blob" && entry.path === objectKey)
    ) {
      fileMap.set(objectKey, { path: objectKey, delete: true });
    }
  }

  if (record.previewPlaceIds.includes(id)) {
    const previewPlaceIds = record.previewPlaceIds.filter((placeId) => placeId !== id);
    fileMap.set("validation/editorial-preview.json", {
      path: "validation/editorial-preview.json",
      content: serializeEditorialPreviewRegistry(previewPlaceIds),
    });
  }

  const result = await repository.commitFilesAtomic({
    branch,
    expectedHeadSha,
    baseTreeSha: record.state.treeSha,
    files: [...fileMap.values()],
    message: `Delete research place ${id}`,
  });

  const cleanup = await deleteCommittedR2Objects(env, r2ObjectKeys.filter(isSafeR2ObjectKey));
  const unsafeObjectCount = r2ObjectKeys.filter((objectKey) => !isSafeR2ObjectKey(objectKey)).length;
  if (unsafeObjectCount > 0) {
    console.warn(JSON.stringify({ event: "media.r2.delete_failed", object_count: unsafeObjectCount }));
  }
  const mediaCleanupIncomplete = cleanup.failedCount + unsafeObjectCount > 0;
  return {
    commitSha: result.commitSha,
    branch: result.branch,
    placeId: id,
    mediaCleanupIncomplete,
    ...(mediaCleanupIncomplete ? { warnings: ["media_cleanup_incomplete"] } : {}),
  };
}
