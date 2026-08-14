export const R2_MEDIA_ORIGIN = "https://media.svetinje.me";

interface MediaStorageReference {
  storageProvider?: unknown;
  objectKey?: unknown;
}

interface MediaUrlOptions {
  localPublicOrigin?: string;
}

function normalizedObjectKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized.includes("/..")) return undefined;
  return normalized;
}

function encodedPath(value: string): string {
  return value.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function resolveMediaUrl(
  media: MediaStorageReference,
  options: MediaUrlOptions = {},
): string | undefined {
  const objectKey = normalizedObjectKey(media.objectKey);
  if (!objectKey) return undefined;

  if (media.storageProvider === "cloudflare-r2") {
    if (!objectKey.startsWith("places/")) return undefined;
    return `${R2_MEDIA_ORIGIN}/${encodedPath(objectKey)}`;
  }

  if (media.storageProvider === "local-public") {
    if (!objectKey.startsWith("public/images/")) return undefined;
    const path = `/${encodedPath(objectKey.slice("public/".length))}`;
    const origin = options.localPublicOrigin?.replace(/\/$/, "");
    return origin ? `${origin}${path}` : path;
  }

  return undefined;
}
