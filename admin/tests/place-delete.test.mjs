import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse, stringify } from "yaml";
import { AdminError, errorResponse } from "../src/errors.ts";
import { handleRequest } from "../src/index.ts";
import { deletePlace, getEditablePlace, getPlace, listPlaces } from "../src/service.ts";

const HEAD = "a".repeat(40);
const COMMIT = "c".repeat(40);
const ID = "legacy-research-place";
const schemas = {
  "schemas/place.schema.json": await readFile(new URL("../../schemas/place.schema.json", import.meta.url), "utf8"),
  "schemas/narrative.schema.json": await readFile(new URL("../../schemas/narrative.schema.json", import.meta.url), "utf8"),
  "schemas/common.schema.json": await readFile(new URL("../../schemas/common.schema.json", import.meta.url), "utf8"),
  "schemas/media.schema.json": await readFile(new URL("../../schemas/media.schema.json", import.meta.url), "utf8"),
  "schemas/feast-registry.schema.json": await readFile(new URL("../../schemas/feast-registry.schema.json", import.meta.url), "utf8"),
  "content/feasts/registry.yaml": await readFile(new URL("../../content/feasts/registry.yaml", import.meta.url), "utf8"),
};
const env = { GITHUB_EDITORIAL_BRANCH: "feature/podmaine-pilot", GITHUB_OWNER: "montenegrocg-oss", GITHUB_REPO: "svetinje" };
const session = { subject: "user", email: "maxim@example.com", actor: "maxim", developmentBypass: false };
const body = { expectedHeadSha: HEAD, confirmed: true, confirmationId: ID };

const placeYaml = (status = "research", id = ID, extra = {}) => stringify({
  schema_version: 1,
  id,
  editorial_status: status,
  ...extra,
});
const mediaYaml = (id, relatedPlaceIds, objectKey, storageProvider = "cloudflare-r2") => stringify({
  schema_version: 1,
  id,
  editorial_status: "approved",
  storage_provider: storageProvider,
  object_key: objectKey,
  related_place_ids: relatedPlaceIds,
  audit: { created_at: "2026-08-15T00:00:00Z", created_by: "maxim", updated_at: "2026-08-15T00:00:00Z", updated_by: "maxim" },
});

class Repository {
  constructor(extraFiles = {}, options = {}) {
    this.files = new Map(Object.entries({
      ...schemas,
      "validation/editorial-preview.json": JSON.stringify({ place_ids: [ID, "other-place"] }),
      "content/README.md": "# Editorial content\n\nThis is documentation, not structured entity front matter.\n",
      [`content/places/${ID}/place.yaml`]: placeYaml(),
      ...extraFiles,
    }));
    this.head = HEAD;
    this.commits = [];
    this.events = options.events ?? [];
    this.failCommit = options.failCommit ?? false;
  }
  async readBranchState() { return { headSha: this.head, treeSha: "b".repeat(40) }; }
  async readTree() { return [...this.files.keys()].map((path) => ({ path, sha: path, type: "blob", mode: "100644" })); }
  async readBlob(sha) { return this.files.get(sha); }
  async readBlobs(shas) { return new Map(shas.map((sha) => [sha, this.files.get(sha)])); }
  async commitFilesAtomic(input) {
    this.events.push("git");
    if (this.failCommit) throw Object.assign(new Error("conflict"), { code: "git_conflict" });
    assert.equal(input.expectedHeadSha, this.head);
    this.commits.push(input);
    for (const file of input.files) {
      if (file.delete) this.files.delete(file.path);
      else this.files.set(file.path, file.content);
    }
    this.head = COMMIT;
    return { commitSha: COMMIT, branch: input.branch };
  }
}

test("place deletion cascades Git-owned records atomically and cleans exclusive R2 after commit", async () => {
  const events = [];
  const repository = new Repository({
    [`content/places/${ID}/narratives/sr.md`]: "legacy invalid narrative",
    [`content/places/${ID}/narratives/en.md`]: "legacy invalid translation",
    [`content/practical/${ID}/visitor.yaml`]: `place_id: ${ID}\n`,
    "content/sources/source-kept.yaml": "id: source-kept\n",
    "content/media/exclusive.yaml": mediaYaml("exclusive", [ID], `places/${ID}/exclusive.webp`),
    "content/media/shared.yaml": mediaYaml("shared", [ID, "other-place"], "places/shared/shared.webp"),
  }, { events });
  const deletedObjects = [];
  const result = await deletePlace(repository, {
    ...env,
    MEDIA_BUCKET: { async delete(key) { events.push("r2"); deletedObjects.push(key); } },
  }, session, ID, body, new Date("2026-08-15T12:00:00Z"));

  assert.equal(repository.commits.length, 1);
  assert.equal(repository.commits[0].message, `Delete research place ${ID}`);
  assert.deepEqual(events, ["git", "r2"]);
  assert.deepEqual(deletedObjects, [`places/${ID}/exclusive.webp`]);
  assert.equal(repository.files.has(`content/places/${ID}/place.yaml`), false);
  assert.equal(repository.files.has(`content/places/${ID}/narratives/sr.md`), false);
  assert.equal(repository.files.has(`content/places/${ID}/narratives/en.md`), false);
  assert.equal(repository.files.has(`content/practical/${ID}/visitor.yaml`), false);
  assert.equal(repository.files.has("content/media/exclusive.yaml"), false);
  assert.equal(repository.files.has("content/sources/source-kept.yaml"), true);
  assert.deepEqual(JSON.parse(repository.files.get("validation/editorial-preview.json")).place_ids, ["other-place"]);
  const shared = parse(repository.files.get("content/media/shared.yaml"));
  assert.deepEqual(shared.related_place_ids, ["other-place"]);
  assert.equal(shared.audit.updated_by, "maxim");
  assert.equal(result.mediaCleanupIncomplete, false);
  await assert.rejects(() => getPlace(repository, env, ID), (error) => error.code === "not_found");
  await assert.rejects(() => getEditablePlace(repository, env, ID), (error) => error.code === "not_found");
  const snapshot = await listPlaces(repository, env);
  assert.equal(snapshot.stats.total, 0);
  assert.equal(snapshot.stats.preview, 0);
});

test("shared R2 objects and shared media records are retained", async () => {
  const repository = new Repository({
    "content/media/shared.yaml": mediaYaml("shared", [ID, "other-place"], "places/shared/shared.webp"),
  });
  let deleteCalls = 0;
  await deletePlace(repository, { ...env, MEDIA_BUCKET: { async delete() { deleteCalls += 1; } } }, session, ID, body);
  assert.equal(deleteCalls, 0);
  assert.deepEqual(parse(repository.files.get("content/media/shared.yaml")).related_place_ids, ["other-place"]);
});

test("Git failure prevents all R2 deletion", async () => {
  const repository = new Repository({
    "content/media/exclusive.yaml": mediaYaml("exclusive", [ID], `places/${ID}/exclusive.webp`),
  }, { failCommit: true });
  let deleteCalls = 0;
  await assert.rejects(() => deletePlace(repository, { ...env, MEDIA_BUCKET: { async delete() { deleteCalls += 1; } } }, session, ID, body));
  assert.equal(deleteCalls, 0);
  assert.equal(repository.files.has(`content/places/${ID}/place.yaml`), true);
});

test("post-commit R2 failure is a safe non-rollback warning", async () => {
  const repository = new Repository({
    "content/media/exclusive.yaml": mediaYaml("exclusive", [ID], `places/${ID}/exclusive.webp`),
  });
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const result = await deletePlace(repository, { ...env, MEDIA_BUCKET: { async delete() { throw new Error("bucket failure"); } } }, session, ID, body);
    assert.equal(result.mediaCleanupIncomplete, true);
    assert.deepEqual(result.warnings, ["media_cleanup_incomplete"]);
    assert.equal(repository.files.has(`content/places/${ID}/place.yaml`), false);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].includes("exclusive.webp"), false);
  } finally {
    console.warn = originalWarn;
  }
});

test("unsafe R2 object keys are never sent to R2", async () => {
  const repository = new Repository({
    "content/media/exclusive.yaml": mediaYaml("exclusive", [ID], "../unsafe.webp"),
  });
  let deleteCalls = 0;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const result = await deletePlace(repository, { ...env, MEDIA_BUCKET: { async delete() { deleteCalls += 1; } } }, session, ID, body);
    assert.equal(deleteCalls, 0);
    assert.equal(result.mediaCleanupIncomplete, true);
  } finally {
    console.warn = originalWarn;
  }
});

test("other place and news references block deletion with safe paths", async () => {
  for (const [path, content] of [
    ["content/places/other-place/place.yaml", placeYaml("research", "other-place", { relationships: { related_place_ids: [ID] } })],
    ["content/news/dependency.md", `---\nrelated_place_id: ${ID}\n---\nUnrelated body`],
  ]) {
    const repository = new Repository({ [path]: content });
    await assert.rejects(() => deletePlace(repository, env, session, ID, body), (error) => {
      assert.equal(error.code, "deletion_blocked");
      assert.equal(error.status, 409);
      assert.deepEqual(error.fields.dependencies, [path]);
      return true;
    });
    assert.equal(repository.commits.length, 0);
  }
});

test("confirmation, concurrency, status and existence safeguards fail closed", async (t) => {
  await t.test("confirmed true is required", async () => {
    await assert.rejects(() => deletePlace(new Repository(), env, session, ID, { ...body, confirmed: false }), (error) => error.code === "invalid_form_data");
  });
  await t.test("exact confirmation is required", async () => {
    await assert.rejects(() => deletePlace(new Repository(), env, session, ID, { ...body, confirmationId: ` ${ID}` }), (error) => error.code === "invalid_form_data");
  });
  await t.test("valid forty-character HEAD is required", async () => {
    await assert.rejects(() => deletePlace(new Repository(), env, session, ID, { ...body, expectedHeadSha: "bad" }), (error) => error.code === "invalid_form_data");
  });
  await t.test("current HEAD must match", async () => {
    await assert.rejects(() => deletePlace(new Repository(), env, session, ID, { ...body, expectedHeadSha: "d".repeat(40) }), (error) => error.code === "git_conflict");
  });
  await t.test("approved and published are protected", async () => {
    for (const status of ["approved", "published"]) {
      const repository = new Repository({ [`content/places/${ID}/place.yaml`]: placeYaml(status) });
      await assert.rejects(() => deletePlace(repository, env, session, ID, body), (error) => error.code === "protected_record" && error.status === 409);
    }
  });
  await t.test("unknown and archived statuses are not deletable", async () => {
    for (const status of ["unknown-status", "archived"]) {
      const repository = new Repository({ [`content/places/${ID}/place.yaml`]: placeYaml(status) });
      await assert.rejects(() => deletePlace(repository, env, session, ID, body), (error) => error.code === "invalid_form_data");
    }
  });
  await t.test("missing place returns 404", async () => {
    const repository = new Repository();
    repository.files.delete(`content/places/${ID}/place.yaml`);
    await assert.rejects(() => deletePlace(repository, env, session, ID, body), (error) => error.code === "not_found");
  });
});

test("all explicitly allowed non-public statuses remain deletable", async () => {
  const statuses = ["research", "draft", "fact-review", "ecclesiastical-review", "language-review", "needs-reverification", "disputed", "rejected"];
  for (const status of statuses) {
    const repository = new Repository({ [`content/places/${ID}/place.yaml`]: placeYaml(status) });
    const result = await deletePlace(repository, env, session, ID, body);
    assert.equal(result.commitSha, COMMIT);
  }
});

test("public errors preserve the exact protected and dependency messages", async () => {
  for (const [code, expected] of [
    ["protected_record", "Одобрени или објављени објекти не могу се трајно брисати. За њих је потребан поступак архивирања."],
    ["deletion_blocked", "Објекат се не може обрисати јер га користе други записи."],
  ]) {
    const response = errorResponse(new AdminError(code, 409, code));
    const payload = await response.json();
    assert.equal(payload.error.message, expected);
  }
});

test("DELETE route is protected by authentication, same-origin checks, and safe IDs", async () => {
  const unauthorized = await handleRequest(new Request(`https://admin.example/api/places/${ID}`, {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }), {});
  assert.equal(unauthorized.status, 401);

  const crossOrigin = await handleRequest(new Request(`http://localhost/api/places/${ID}`, {
    method: "DELETE", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: JSON.stringify(body),
  }), { ENVIRONMENT: "development", DEV_AUTH_BYPASS: "true" });
  assert.equal(crossOrigin.status, 403);

  const unsafeId = await handleRequest(new Request("http://localhost/api/places/UPPER_ID", {
    method: "DELETE", headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify(body),
  }), { ENVIRONMENT: "development", DEV_AUTH_BYPASS: "true" });
  assert.equal(unsafeId.status, 404);
});

test("edit UI uses a separate accessible danger dialog and exact-confirmation client flow", async () => {
  const ui = await readFile(new URL("../src/ui.ts", import.meta.url), "utf8");
  const client = await readFile(new URL("../client/editor.ts", import.meta.url), "utf8");
  assert.match(ui, /Опасна зона/);
  assert.match(ui, /Трајно обрисати објекат\?/);
  assert.match(ui, /За потврду унесите ID објекта:/);
  assert.match(ui, /data-delete-place-submit disabled/);
  assert.match(ui, /class="button danger"/);
  assert.equal(ui.includes("confirm("), false);
  assert.match(client, /deleteConfirmation\.value !== placeId/);
  assert.match(client, /method: "DELETE"/);
  assert.match(client, /confirmationId: placeId/);
  assert.match(client, /location\.assign\(`\/places\?\$\{query\.toString\(\)\}`\)/);
  assert.match(client, /data-delete-place-open/);
});

test("places success notice escapes the deleted ID and never interpolates raw HTML", async () => {
  const ui = await readFile(new URL("../src/ui.ts", import.meta.url), "utf8");
  assert.match(ui, /Објекат је обрисан\./);
  assert.match(ui, /escapeHtml\(deletedId\)/);
  assert.match(ui, /mediaCleanupIncomplete/);
});
