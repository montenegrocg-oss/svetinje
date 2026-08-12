import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { parse } from "yaml";
import { authenticateRequest } from "../src/auth.ts";
import { AdminError, errorResponse } from "../src/errors.ts";
import { editorialBranch, GitHubRepository } from "../src/github.ts";
import { createPlace } from "../src/service.ts";
import { handleRequest } from "../src/index.ts";

const PLACE_SCHEMA = JSON.stringify({ $defs: { placeType: { enum: ["monastery", "church"] } } });
const PREVIEW = JSON.stringify({ place_ids: ["existing-place"] });
const EXISTING = `schema_version: 1\nid: existing-place\neditorial_status: research\nrelationships: {}\nsource_ids: []\napprovals: []\naudit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }\n`;
const NARRATIVE = `---\nschema_version: 1\nplace_id: existing-place\nlocale: sr\neditorial_status: research\ntranslation_status: source\nslug: existing-place\npreferred_name: Постојећи објекат\nsource_ids: []\napprovals: []\naudit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }\n---\n`;

class FakeRepository {
  committed;
  constructor() {
    this.blobs = { schema: PLACE_SCHEMA, preview: PREVIEW, place: EXISTING, narrative: NARRATIVE };
  }
  async readBranchState() { return { headSha: "a".repeat(40), treeSha: "b".repeat(40) }; }
  async readTree() {
    return [
      { path: "schemas/place.schema.json", mode: "100644", type: "blob", sha: "schema" },
      { path: "validation/editorial-preview.json", mode: "100644", type: "blob", sha: "preview" },
      { path: "content/places/existing-place/place.yaml", mode: "100644", type: "blob", sha: "place" },
      { path: "content/places/existing-place/narratives/sr.md", mode: "100644", type: "blob", sha: "narrative" },
    ];
  }
  async readBlob(sha) { return this.blobs[sha]; }
  async commitFilesAtomic(input) { this.committed = input; return { commitSha: "c".repeat(40), branch: input.branch }; }
}

const env = { GITHUB_EDITORIAL_BRANCH: "editorial/work", GITHUB_OWNER: "montenegrocg-oss", GITHUB_REPO: "svetinje" };
const session = { subject: "user", email: "maxim@example.com", actor: "maxim", developmentBypass: false };
const validBody = {
  preferredName: "Пробни објекат",
  id: "probni-objekat",
  slug: "probni-objekat",
  placeType: "monastery",
  expectedHeadSha: "a".repeat(40),
};

test("writes fail closed without a non-main editorial branch", () => {
  for (const branch of [undefined, "", "main"]) {
    assert.throws(() => editorialBranch({ GITHUB_EDITORIAL_BRANCH: branch }), (error) => error.code === "invalid_editorial_branch");
  }
  assert.equal(editorialBranch(env), "editorial/work");
});

test("invalid IDs, slugs, unsupported types, and duplicate IDs are rejected", async () => {
  for (const body of [
    { ...validBody, id: "../escape" },
    { ...validBody, slug: "nested/slug" },
  ]) {
    await assert.rejects(() => createPlace(new FakeRepository(), env, session, body), (error) => error.code === "invalid_form_data");
  }
  await assert.rejects(
    () => createPlace(new FakeRepository(), env, session, { ...validBody, placeType: "unsupported" }),
    (error) => error.code === "unsupported_place_type",
  );
  await assert.rejects(
    () => createPlace(new FakeRepository(), env, session, { ...validBody, id: "existing-place" }),
    (error) => error.code === "duplicate_id",
  );
  await assert.rejects(
    () => createPlace(new FakeRepository(), env, session, { ...validBody, expectedHeadSha: "invalid" }),
    (error) => error.code === "invalid_form_data",
  );
  await assert.rejects(
    () => createPlace(new FakeRepository(), env, session, { ...validBody, expectedHeadSha: "f".repeat(40) }),
    (error) => error.code === "git_conflict",
  );
});

test("save creates one atomic two-file research scaffold and never touches preview allowlist", async () => {
  const repository = new FakeRepository();
  const result = await createPlace(repository, env, session, validBody, new Date("2026-08-13T09:00:00Z"));
  assert.equal(result.place.editorialStatus, "research");
  assert.equal(result.place.inPreview, false);
  assert.equal(result.commitSha, "c".repeat(40));
  assert.equal(repository.committed.files.length, 2);
  assert.deepEqual(repository.committed.files.map(({ path }) => path), [
    "content/places/probni-objekat/place.yaml",
    "content/places/probni-objekat/narratives/sr.md",
  ]);
  assert.equal(repository.committed.files.some(({ path }) => path === "validation/editorial-preview.json"), false);
  const place = parse(repository.committed.files[0].content);
  assert.equal(place.editorial_status, "research");
  assert.equal(place.place_type.verification.status, "requires-verification");
  assert.deepEqual(place.source_ids, []);
  assert.deepEqual(place.approvals, []);
  assert.equal(place.location, undefined);
});

test("development auth bypass cannot activate in production", async () => {
  await assert.rejects(
    () => authenticateRequest(new Request("https://admin.example.test"), { ENVIRONMENT: "production", DEV_AUTH_BYPASS: "true" }),
    (error) => error.code === "unauthenticated",
  );
  const local = await authenticateRequest(new Request("http://localhost"), { ENVIRONMENT: "development", DEV_AUTH_BYPASS: "true", DEV_AUTH_EMAIL: "maxim@example.com" });
  assert.equal(local.developmentBypass, true);
  assert.equal(local.actor, "maxim");
});

test("write endpoint rejects cross-origin JSON before any GitHub operation", async () => {
  const response = await handleRequest(new Request("https://admin.example.test/api/places", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify(validBody),
  }), { ENVIRONMENT: "development", DEV_AUTH_BYPASS: "true", GITHUB_EDITORIAL_BRANCH: "editorial/work" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "invalid_form_data");
});

test("serialized API errors never disclose secrets or raw internal messages", async () => {
  const secret = "PRIVATE-KEY-MATERIAL";
  const response = errorResponse(new AdminError("github_authentication_failure", 502, `GitHub rejected ${secret}`));
  const serialized = await response.text();
  assert.equal(response.status, 502);
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.doesNotMatch(serialized, /GitHub rejected/);
  assert.match(serialized, /github_authentication_failure/);
});

test("GitHub transport creates one tree and commit, checks HEAD twice, and updates ref without force", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const calls = [];
  let refReads = 0;
  const fakeFetch = async (url, init = {}) => {
    const parsedUrl = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ pathname: parsedUrl.pathname, method: init.method ?? "GET", body, authorization: new Headers(init.headers).get("authorization") });
    if (parsedUrl.pathname.includes("/app/installations/")) return Response.json({ token: "installation-token" }, { status: 201 });
    if (parsedUrl.pathname.endsWith("/git/ref/heads/editorial%2Fwork")) {
      refReads += 1;
      return Response.json({ object: { sha: "a".repeat(40) } });
    }
    if (parsedUrl.pathname.endsWith(`/git/commits/${"a".repeat(40)}`)) return Response.json({ tree: { sha: "b".repeat(40) } });
    if (parsedUrl.pathname.endsWith("/git/trees")) return Response.json({ sha: "c".repeat(40) }, { status: 201 });
    if (parsedUrl.pathname.endsWith("/git/commits")) return Response.json({ sha: "d".repeat(40) }, { status: 201 });
    if (parsedUrl.pathname.endsWith("/git/refs/heads/editorial%2Fwork")) return Response.json({ object: { sha: "d".repeat(40) } });
    throw new Error(`Unexpected request ${parsedUrl.pathname}`);
  };
  const repository = new GitHubRepository({
    env: {
      ...env,
      GITHUB_APP_ID: "123",
      GITHUB_APP_INSTALLATION_ID: "456",
      GITHUB_APP_PRIVATE_KEY: privateKeyPem,
    },
    fetchImpl: fakeFetch,
    now: () => Date.parse("2026-08-13T09:00:00Z"),
  });
  const result = await repository.commitFilesAtomic({
    branch: "editorial/work",
    expectedHeadSha: "a".repeat(40),
    baseTreeSha: "b".repeat(40),
    files: [{ path: "content/places/test/place.yaml", content: "id: test\n" }, { path: "content/places/test/narratives/sr.md", content: "---\n" }],
    message: "Add research place test",
  });
  assert.equal(result.commitSha, "d".repeat(40));
  assert.equal(refReads, 2);
  assert.equal(calls.filter((call) => call.pathname.includes("/app/installations/")).length, 1);
  const refUpdate = calls.find((call) => call.method === "PATCH");
  assert.deepEqual(refUpdate.body, { sha: "d".repeat(40), force: false });
  const treeCreate = calls.find((call) => call.method === "POST" && call.pathname.endsWith("/git/trees"));
  assert.equal(treeCreate.body.tree.length, 2);
  assert.equal(calls.some((call) => call.authorization === "Bearer installation-token"), true);
  assert.equal(calls.some((call) => JSON.stringify(call).includes(privateKeyPem)), false);
});
