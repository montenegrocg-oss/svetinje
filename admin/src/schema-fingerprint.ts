export interface CanonicalSchemas {
  common: Record<string, unknown>;
  place: Record<string, unknown>;
  narrative: Record<string, unknown>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export async function fingerprintCanonicalSchemas(schemas: CanonicalSchemas): Promise<string> {
  const canonicalJson = JSON.stringify(canonicalize({
    common: schemas.common,
    narrative: schemas.narrative,
    place: schemas.place,
  }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
