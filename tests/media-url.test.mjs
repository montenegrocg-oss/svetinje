import assert from "node:assert/strict";
import test from "node:test";
import { R2_MEDIA_ORIGIN, resolveMediaUrl } from "../src/lib/media-url.ts";

test("media URL resolver supports legacy local-public and Cloudflare R2 records", () => {
  assert.equal(
    resolveMediaUrl({ storageProvider: "local-public", objectKey: "public/images/places/example.jpg" }),
    "/images/places/example.jpg",
  );
  assert.equal(
    resolveMediaUrl(
      { storageProvider: "local-public", objectKey: "public/images/places/example.jpg" },
      { localPublicOrigin: "https://staging-svetinje.montenegro-cg.workers.dev/" },
    ),
    "https://staging-svetinje.montenegro-cg.workers.dev/images/places/example.jpg",
  );
  assert.equal(
    resolveMediaUrl({ storageProvider: "cloudflare-r2", objectKey: "places/example/photo-example-123.jpg" }),
    `${R2_MEDIA_ORIGIN}/places/example/photo-example-123.jpg`,
  );
});

test("media URL resolver rejects unknown providers and unsafe object keys", () => {
  assert.equal(resolveMediaUrl({ storageProvider: "cloudflare-r2", objectKey: "/places/example.jpg" }), undefined);
  assert.equal(resolveMediaUrl({ storageProvider: "cloudflare-r2", objectKey: "places/../secret.jpg" }), undefined);
  assert.equal(resolveMediaUrl({ storageProvider: "cloudflare-r2", objectKey: "public/images/example.jpg" }), undefined);
  assert.equal(resolveMediaUrl({ storageProvider: "unknown", objectKey: "places/example.jpg" }), undefined);
});
