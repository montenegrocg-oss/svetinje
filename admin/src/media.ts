import { stringify } from "yaml";
import { CANONICAL_SCHEMA_FINGERPRINT, validateMedia, validatePlace } from "./generated/canonical-validators.js";
import { AdminError, internalFailure } from "./errors.ts";
import { editorialBranch } from "./github.ts";
import { loadEditablePlace } from "./repository-content.ts";
import { fingerprintCanonicalSchemas } from "./schema-fingerprint.ts";
import type { AdminEnv, AdminSession, GitRepository, RepositoryFile } from "./types.ts";

export const MAX_PHOTO_COUNT = 10;
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface UploadedPhoto {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

interface PhotoMutationBody {
  expectedHeadSha?: unknown;
  primary?: unknown;
  altText?: unknown;
  confirmed?: unknown;
}

const asString = (value: unknown) => typeof value === "string" ? value.trim() : undefined;
const timestamp = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

function requireExpectedHead(value: unknown, actual: string): string {
  const expected = asString(value);
  if (!expected || !/^[0-9a-f]{40}$/.test(expected)) {
    throw new AdminError("invalid_form_data", 400, "Expected branch HEAD is invalid");
  }
  if (expected !== actual) throw new AdminError("git_conflict", 409, "Editorial branch moved before media update");
  return expected;
}

function extensionFor(mimeType: string): "jpg" | "png" | "webp" | undefined {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return undefined;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function imageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | undefined {
  const data = view(bytes);
  if (mimeType === "image/png") {
    if (bytes.length < 24 || bytes[0] !== 0x89 || new TextDecoder().decode(bytes.slice(1, 4)) !== "PNG") return undefined;
    return { width: data.getUint32(16), height: data.getUint32(20) };
  }
  if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      if (marker === 0xd9 || marker === 0xda) break;
      const length = data.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) return undefined;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: data.getUint16(offset + 5), width: data.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return undefined;
  }
  if (mimeType === "image/webp") {
    if (bytes.length < 30 || new TextDecoder().decode(bytes.slice(0, 4)) !== "RIFF" || new TextDecoder().decode(bytes.slice(8, 12)) !== "WEBP") return undefined;
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === "VP8X") {
      const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
      return { width, height };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
      const height = 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10);
      return { width, height };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      return { width: data.getUint16(26, true) & 0x3fff, height: data.getUint16(28, true) & 0x3fff };
    }
  }
  return undefined;
}

async function checksum(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mediaBucket(env: AdminEnv): R2Bucket {
  if (!env.MEDIA_BUCKET) throw internalFailure("media_bucket_binding_missing");
  return env.MEDIA_BUCKET;
}

function isSafeR2ObjectKey(value: string): boolean {
  return value.startsWith("places/") && !value.startsWith("/") && !value.includes("../") && !value.includes("/..");
}

async function rollbackR2Objects(bucket: R2Bucket, objectKeys: string[], event: string): Promise<void> {
  if (!objectKeys.length) return;
  try {
    await bucket.delete(objectKeys);
  } catch {
    console.warn(JSON.stringify({ event, object_count: objectKeys.length }));
  }
}

function orderedMediaIds(record: Awaited<ReturnType<typeof loadEditablePlace>>): string[] {
  const canonical = Array.isArray(record.rawPlace.relationships?.media_ids)
    ? record.rawPlace.relationships.media_ids.filter((id: unknown): id is string => typeof id === "string")
    : [];
  const related = record.rawMedia
    .filter(({ record: media }) => Array.isArray(media.related_place_ids) && media.related_place_ids.includes(record.place.id))
    .map(({ record: media }) => String(media.id));
  return [...new Set([...canonical, ...related])];
}

async function assertCanonical(record: Awaited<ReturnType<typeof loadEditablePlace>>, place: Record<string, any>, media: Record<string, any>[] = []): Promise<void> {
  if (await fingerprintCanonicalSchemas(record.schemas) !== CANONICAL_SCHEMA_FINGERPRINT) {
    throw internalFailure("canonical_schema_fingerprint_mismatch");
  }
  const fields: Record<string, string> = {};
  if (!validatePlace(place)) for (const error of validatePlace.errors ?? []) fields[`place${error.instancePath || "/"}`] = error.message ?? "Није важеће.";
  for (const item of media) {
    const id = String(item.id ?? "unknown");
    if (!validateMedia(item)) for (const error of validateMedia.errors ?? []) fields[`media.${id}${error.instancePath || "/"}`] = error.message ?? "Није важеће.";
  }
  if (Object.keys(fields).length) throw new AdminError("invalid_form_data", 400, "Canonical media validation failed", fields);
}

export async function uploadPlacePhotos(
  repository: GitRepository,
  env: AdminEnv,
  session: AdminSession,
  placeId: string,
  expectedHeadSha: unknown,
  photos: UploadedPhoto[],
  now = new Date(),
  idFactory = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12),
) {
  const branch = editorialBranch(env);
  const record = await loadEditablePlace(repository, branch, placeId);
  const expected = requireExpectedHead(expectedHeadSha, record.state.headSha);
  if (photos.length < 1 || photos.length > MAX_PHOTO_COUNT) throw new AdminError("invalid_form_data", 400, `Upload must contain 1-${MAX_PHOTO_COUNT} photographs`);
  if (photos.reduce((total, photo) => total + photo.bytes.byteLength, 0) > MAX_UPLOAD_BYTES) {
    throw new AdminError("invalid_form_data", 413, "Photograph batch exceeds the 50 MB server limit");
  }

  const createdAt = timestamp(now);
  const records: Record<string, any>[] = [];
  const files: RepositoryFile[] = [];
  const uploads: Array<{ objectKey: string; mediaId: string; mimeType: string; checksum: string; bytes: Uint8Array }> = [];
  const usedIds = new Set(record.rawMedia.map(({ record: media }) => String(media.id)));
  for (const photo of photos) {
    if (photo.bytes.byteLength < 1 || photo.bytes.byteLength > MAX_PHOTO_BYTES) throw new AdminError("invalid_form_data", 413, "Photograph exceeds the 20 MB server limit");
    const extension = extensionFor(photo.mimeType);
    const dimensions = extension ? imageDimensions(photo.bytes, photo.mimeType) : undefined;
    if (!extension || !dimensions || dimensions.width < 1 || dimensions.height < 1) throw new AdminError("invalid_form_data", 415, "Only valid JPEG, PNG, and WebP images are accepted");
    let mediaId = "";
    do {
      const suffix = idFactory();
      mediaId = `photo-${placeId.slice(0, Math.max(2, 86 - suffix.length))}-${suffix}`;
    } while (usedIds.has(mediaId));
    usedIds.add(mediaId);
    const objectKey = `places/${placeId}/${mediaId}.${extension}`;
    if (!isSafeR2ObjectKey(objectKey)) throw internalFailure("media_object_key_invalid");
    const sha256 = await checksum(photo.bytes);
    const media = {
      schema_version: 1,
      id: mediaId,
      editorial_status: "approved",
      media_type: "image",
      storage_provider: "cloudflare-r2",
      object_key: objectKey,
      checksum_sha256: sha256,
      mime_type: photo.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      creator: session.actor,
      copyright_owner: session.actor,
      rights_basis: "project-original",
      credit_line: `Фото: ${session.actor}`,
      allowed_uses: ["web-display", "responsive-derivative", "editorial-crop", "social-preview", "archival"],
      publication_safety: "public",
      related_place_ids: [placeId],
      localized_text: { sr: { alt_text: record.place.preferredName, translation_status: "source", approvals: [] } },
      approvals: [{ role: "project-owner", reviewer_id: session.actor, outcome: "approved", reviewed_at: createdAt, reviewed_revision: expected, scope: "Ауторска фотографија отпремљена кроз приватну администрацију." }],
      audit: { created_at: createdAt, created_by: session.actor, updated_at: createdAt, updated_by: session.actor },
    };
    records.push(media);
    uploads.push({ objectKey, mediaId, mimeType: photo.mimeType, checksum: sha256, bytes: photo.bytes });
    files.push({ path: `content/media/${mediaId}.yaml`, content: stringify(media, { lineWidth: 0 }) });
  }

  const place = structuredClone(record.rawPlace);
  place.relationships ??= {};
  place.relationships.media_ids = [...orderedMediaIds(record), ...records.map(({ id }) => id)];
  place.audit = { ...place.audit, updated_at: createdAt, updated_by: session.actor };
  await assertCanonical(record, place, records);
  files.push({ path: `content/places/${placeId}/place.yaml`, content: stringify(place, { lineWidth: 0 }) });
  const bucket = mediaBucket(env);
  const createdObjectKeys: string[] = [];
  try {
    for (const upload of uploads) {
      const stored = await bucket.put(upload.objectKey, upload.bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: {
          contentType: upload.mimeType,
          cacheControl: "public, max-age=31536000, immutable",
        },
        customMetadata: {
          "media-id": upload.mediaId,
          "place-id": placeId,
          sha256: upload.checksum,
        },
      });
      if (!stored) throw internalFailure("media_object_already_exists");
      createdObjectKeys.push(upload.objectKey);
    }
  } catch (error) {
    await rollbackR2Objects(bucket, createdObjectKeys, "media.r2.upload_rollback_failed");
    throw error;
  }
  try {
    const result = await repository.commitFilesAtomic({ branch, expectedHeadSha: expected, baseTreeSha: record.state.treeSha, files, message: `Add photographs for ${placeId}` });
    return { commitSha: result.commitSha, branch: result.branch, placeId, mediaIds: records.map(({ id }) => id), unchanged: false };
  } catch (error) {
    await rollbackR2Objects(bucket, createdObjectKeys, "media.r2.git_rollback_failed");
    throw error;
  }
}

export async function updatePlacePhoto(
  repository: GitRepository,
  env: AdminEnv,
  session: AdminSession,
  placeId: string,
  mediaId: string,
  body: PhotoMutationBody,
  now = new Date(),
) {
  const branch = editorialBranch(env);
  const record = await loadEditablePlace(repository, branch, placeId);
  const expected = requireExpectedHead(body.expectedHeadSha, record.state.headSha);
  const target = record.rawMedia.find(({ record: media }) => media.id === mediaId && Array.isArray(media.related_place_ids) && media.related_place_ids.includes(placeId));
  if (!target) throw new AdminError("not_found", 404, "Photograph does not exist");
  const order = orderedMediaIds(record);
  const nextOrder = body.primary === true ? [mediaId, ...order.filter((id) => id !== mediaId)] : order;
  const media = structuredClone(target.record);
  const altText = asString(body.altText);
  if (body.altText !== undefined) {
    if (!altText) throw new AdminError("invalid_form_data", 400, "Alternative text cannot be empty");
    media.localized_text ??= {};
    media.localized_text.sr ??= { translation_status: "source", approvals: [] };
    media.localized_text.sr.alt_text = altText;
  }
  const unchanged = JSON.stringify(nextOrder) === JSON.stringify(order) && JSON.stringify(media) === JSON.stringify(target.record);
  if (unchanged) return { commitSha: expected, branch, placeId, mediaId, unchanged: true };
  const updatedAt = timestamp(now);
  const place = structuredClone(record.rawPlace);
  place.relationships ??= {};
  place.relationships.media_ids = nextOrder;
  place.audit = { ...place.audit, updated_at: updatedAt, updated_by: session.actor };
  media.audit = { ...media.audit, updated_at: updatedAt, updated_by: session.actor };
  await assertCanonical(record, place, [media]);
  const result = await repository.commitFilesAtomic({
    branch,
    expectedHeadSha: expected,
    baseTreeSha: record.state.treeSha,
    files: [
      { path: `content/places/${placeId}/place.yaml`, content: stringify(place, { lineWidth: 0 }) },
      { path: target.path, content: stringify(media, { lineWidth: 0 }) },
    ],
    message: `Update photograph ${mediaId}`,
  });
  return { commitSha: result.commitSha, branch: result.branch, placeId, mediaId, unchanged: false };
}

export async function deletePlacePhoto(
  repository: GitRepository,
  env: AdminEnv,
  session: AdminSession,
  placeId: string,
  mediaId: string,
  body: PhotoMutationBody,
  now = new Date(),
) {
  if (body.confirmed !== true) throw new AdminError("invalid_form_data", 400, "Photograph deletion must be confirmed");
  const branch = editorialBranch(env);
  const record = await loadEditablePlace(repository, branch, placeId);
  const expected = requireExpectedHead(body.expectedHeadSha, record.state.headSha);
  const target = record.rawMedia.find(({ record: media }) => media.id === mediaId && Array.isArray(media.related_place_ids) && media.related_place_ids.includes(placeId));
  if (!target) throw new AdminError("not_found", 404, "Photograph does not exist");
  const updatedAt = timestamp(now);
  const place = structuredClone(record.rawPlace);
  place.relationships ??= {};
  place.relationships.media_ids = orderedMediaIds(record).filter((id) => id !== mediaId);
  place.audit = { ...place.audit, updated_at: updatedAt, updated_by: session.actor };
  const remainingPlaceIds = target.record.related_place_ids.filter((id: unknown) => id !== placeId);
  const objectKey = String(target.record.object_key ?? "");
  const sharedObject = record.rawMedia.some(({ path, record: media }) => path !== target.path && media.object_key === objectKey);
  const usesR2 = target.record.storage_provider === "cloudflare-r2";
  const shouldDeleteR2 = usesR2 && remainingPlaceIds.length === 0 && !sharedObject;
  const bucket = shouldDeleteR2 ? mediaBucket(env) : undefined;
  if (usesR2 && !isSafeR2ObjectKey(objectKey)) throw internalFailure("media_object_key_invalid");
  const files: RepositoryFile[] = [{ path: `content/places/${placeId}/place.yaml`, content: stringify(place, { lineWidth: 0 }) }];
  if (remainingPlaceIds.length) {
    const media = structuredClone(target.record);
    media.related_place_ids = remainingPlaceIds;
    media.audit = { ...media.audit, updated_at: updatedAt, updated_by: session.actor };
    await assertCanonical(record, place, [media]);
    files.push({ path: target.path, content: stringify(media, { lineWidth: 0 }) });
  } else {
    await assertCanonical(record, place);
    files.push({ path: target.path, delete: true });
    if (target.record.storage_provider === "local-public" && !sharedObject && objectKey.startsWith("public/images/") && !objectKey.includes("../")) files.push({ path: objectKey, delete: true });
  }
  const result = await repository.commitFilesAtomic({ branch, expectedHeadSha: expected, baseTreeSha: record.state.treeSha, files, message: `Remove photograph ${mediaId}` });
  if (bucket) {
    try {
      await bucket.delete(objectKey);
    } catch {
      console.warn(JSON.stringify({ event: "media.r2.delete_failed", object_count: 1 }));
    }
  }
  return { commitSha: result.commitSha, branch: result.branch, placeId, mediaId, unchanged: false };
}
