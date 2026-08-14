import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { deletePlacePhoto, imageDimensions, MAX_PHOTO_BYTES, updatePlacePhoto, uploadPlacePhotos } from "../src/media.ts";
import { loadEditablePlace } from "../src/repository-content.ts";

const schemas = {
  place: await readFile(new URL("../../schemas/place.schema.json", import.meta.url), "utf8"),
  narrative: await readFile(new URL("../../schemas/narrative.schema.json", import.meta.url), "utf8"),
  common: await readFile(new URL("../../schemas/common.schema.json", import.meta.url), "utf8"),
  media: await readFile(new URL("../../schemas/media.schema.json", import.meta.url), "utf8"),
};
const env = { GITHUB_EDITORIAL_BRANCH: "feature/media-test" };
const session = { subject: "user", email: "maxim@example.test", actor: "maxim", developmentBypass: false };

function png(width = 2, height = 3) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const data = new DataView(bytes.buffer);
  data.setUint32(16, width); data.setUint32(20, height);
  return bytes;
}

function jpeg(width = 4, height = 5) {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);
}

function webp(width = 6, height = 7) {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode("VP8X"), 12);
  const w = width - 1; const h = height - 1;
  bytes.set([w & 255, (w >> 8) & 255, (w >> 16) & 255], 24);
  bytes.set([h & 255, (h >> 8) & 255, (h >> 16) & 255], 27);
  return bytes;
}

class MediaRepository {
  constructor() {
    this.head = "a".repeat(40);
    this.treeSha = "b".repeat(40);
    this.counter = 12;
    this.blobCounter = 0;
    this.entries = new Map();
    this.commits = [];
    this.addText("schemas/place.schema.json", schemas.place);
    this.addText("schemas/narrative.schema.json", schemas.narrative);
    this.addText("schemas/common.schema.json", schemas.common);
    this.addText("schemas/media.schema.json", schemas.media);
    this.addText("validation/editorial-preview.json", JSON.stringify({ place_ids: ["test-place"] }));
    this.addText("content/places/test-place/place.yaml", [
      "schema_version: 1", "id: test-place", "editorial_status: research", "place_type:", "  value: monastery", "  verification: { status: requires-verification }", "relationships: {}", "approvals: []", "audit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }", "",
    ].join("\n"));
    this.addText("content/places/test-place/narratives/sr.md", [
      "---", "schema_version: 1", "place_id: test-place", "locale: sr", "editorial_status: research", "translation_status: source", "slug: test-place", "preferred_name: Тест светиња", "summary: Тестни сажетак", "approvals: []", "audit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }", "---", "", "## Увод {#introduction}", "", "Тестни текст.", "",
    ].join("\n"));
  }
  addText(path, content) {
    this.blobCounter += 1;
    this.entries.set(path, { path, mode: "100644", type: "blob", sha: `${this.blobCounter}`.padStart(39, "0") + "t", content });
  }
  async readBranchState() { return { headSha: this.head, treeSha: this.treeSha }; }
  async readTree() { return [...this.entries.values()].map(({ content, ...entry }) => entry); }
  async readBlob(sha) { return [...this.entries.values()].find((entry) => entry.sha === sha)?.content; }
  async readBlobs(shas) { return new Map(shas.map((sha) => [sha, [...this.entries.values()].find((entry) => entry.sha === sha)?.content])); }
  async commitFilesAtomic(input) {
    assert.equal(input.expectedHeadSha, this.head);
    this.commits.push(input);
    for (const file of input.files) {
      if ("delete" in file) this.entries.delete(file.path);
      else if ("content" in file) this.addText(file.path, file.content);
      else {
        this.blobCounter += 1;
        this.entries.set(file.path, { path: file.path, mode: "100644", type: "blob", sha: `${this.blobCounter}`.padStart(39, "0") + "b", base64: file.base64 });
      }
    }
    this.head = this.counter.toString(16).padStart(40, "0");
    this.counter += 1;
    return { commitSha: this.head, branch: input.branch };
  }
}

test("JPEG, PNG, and WebP dimensions are read from validated image signatures", () => {
  assert.deepEqual(imageDimensions(jpeg(), "image/jpeg"), { width: 4, height: 5 });
  assert.deepEqual(imageDimensions(png(), "image/png"), { width: 2, height: 3 });
  assert.deepEqual(imageDimensions(webp(), "image/webp"), { width: 6, height: 7 });
  assert.equal(imageDimensions(png(), "image/jpeg"), undefined);
});

test("multi-photo upload writes binary blobs, schema-valid YAML, and one canonical commit", async () => {
  const repository = new MediaRepository();
  const ids = ["first0000001", "second000002"];
  const result = await uploadPlacePhotos(repository, env, session, "test-place", repository.head, [
    { name: "first.jpg", mimeType: "image/jpeg", bytes: jpeg() },
    { name: "second.webp", mimeType: "image/webp", bytes: webp() },
  ], new Date("2026-08-14T09:00:00Z"), () => ids.shift());
  assert.equal(result.mediaIds.length, 2);
  assert.equal(repository.commits.length, 1);
  const commit = repository.commits[0];
  assert.equal(commit.files.filter((file) => "base64" in file).length, 2);
  assert.equal(commit.files.filter((file) => file.path.startsWith("content/media/")).length, 2);
  for (const file of commit.files.filter((item) => item.path.startsWith("content/media/"))) {
    const media = parse(file.content);
    assert.equal(media.rights_basis, "project-original");
    assert.equal(media.related_place_ids[0], "test-place");
    assert.equal(media.localized_text.sr.alt_text, "Тест светиња");
  }
  const place = parse(commit.files.find((file) => file.path.endsWith("/place.yaml")).content);
  assert.deepEqual(place.relationships.media_ids, result.mediaIds);
});

test("invalid MIME, oversized images, and stale HEAD fail closed before a commit", async () => {
  for (const [photo, expectedCode] of [
    [{ name: "bad.gif", mimeType: "image/gif", bytes: png() }, "invalid_form_data"],
    [{ name: "large.jpg", mimeType: "image/jpeg", bytes: new Uint8Array(MAX_PHOTO_BYTES + 1) }, "invalid_form_data"],
  ]) {
    const repository = new MediaRepository();
    await assert.rejects(() => uploadPlacePhotos(repository, env, session, "test-place", repository.head, [photo]), (error) => error.code === expectedCode);
    assert.equal(repository.commits.length, 0);
  }
  const repository = new MediaRepository();
  await assert.rejects(() => uploadPlacePhotos(repository, env, session, "test-place", "f".repeat(40), [{ name: "ok.jpg", mimeType: "image/jpeg", bytes: jpeg() }]), (error) => error.code === "git_conflict");
});

test("primary selection, no-op selection, and confirmed deletion each preserve atomic HEAD protection", async () => {
  const repository = new MediaRepository();
  const ids = ["first0000001", "second000002"];
  const uploaded = await uploadPlacePhotos(repository, env, session, "test-place", repository.head, [
    { name: "first.jpg", mimeType: "image/jpeg", bytes: jpeg() },
    { name: "second.png", mimeType: "image/png", bytes: png() },
  ], new Date("2026-08-14T09:00:00Z"), () => ids.shift());
  const second = uploaded.mediaIds[1];
  assert.deepEqual(
    [...repository.entries.entries()].filter(([path]) => path.startsWith("content/media/")).map(([, entry]) => parse(entry.content).id),
    uploaded.mediaIds,
  );
  const loaded = await loadEditablePlace(repository, env.GITHUB_EDITORIAL_BRANCH, "test-place");
  assert.deepEqual(loaded.rawMedia.map(({ record }) => ({ id: record.id, related: record.related_place_ids })), uploaded.mediaIds.map((id) => ({ id, related: ["test-place"] })));
  const selected = await updatePlacePhoto(repository, env, session, "test-place", second, { expectedHeadSha: repository.head, primary: true }, new Date("2026-08-14T09:01:00Z"));
  assert.equal(selected.unchanged, false);
  assert.equal(parse(repository.entries.get("content/places/test-place/place.yaml").content).relationships.media_ids[0], second);
  const commitCount = repository.commits.length;
  const noop = await updatePlacePhoto(repository, env, session, "test-place", second, { expectedHeadSha: repository.head, primary: true });
  assert.equal(noop.unchanged, true);
  assert.equal(repository.commits.length, commitCount);
  await assert.rejects(() => deletePlacePhoto(repository, env, session, "test-place", uploaded.mediaIds[0], { expectedHeadSha: repository.head }), (error) => error.code === "invalid_form_data");
  await deletePlacePhoto(repository, env, session, "test-place", uploaded.mediaIds[0], { expectedHeadSha: repository.head, confirmed: true }, new Date("2026-08-14T09:02:00Z"));
  assert.equal(repository.entries.has(`content/media/${uploaded.mediaIds[0]}.yaml`), false);
  assert.equal([...repository.entries.keys()].some((path) => path.includes(`${uploaded.mediaIds[0]}.jpg`)), false);
});
