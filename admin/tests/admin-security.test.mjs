import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { parse } from "yaml";
import { authenticateRequest } from "../src/auth.ts";
import { AdminError, errorResponse } from "../src/errors.ts";
import { editorialBranch, GitHubRepository } from "../src/github.ts";
import { createPlace } from "../src/service.ts";
import { handleRequest } from "../src/index.ts";

const PLACE_SCHEMA = JSON.stringify({ $defs: { placeType: { enum: ["monastery", "church"] }, coordinateAccuracy: { enum: ["complex-centroid"] } } });
const NARRATIVE_SCHEMA = JSON.stringify({ $defs: { sectionKey: { enum: ["introduction", "history"] } } });
const COMMON_SCHEMA = JSON.stringify({ $defs: { publicationSafety: { enum: ["public", "review-required"] }, verificationStatus: { enum: ["verified", "requires-verification"] } } });
const PREVIEW = JSON.stringify({ place_ids: ["existing-place"] });
const EXISTING = `schema_version: 1\nid: existing-place\neditorial_status: research\nrelationships: {}\nsource_ids: []\napprovals: []\naudit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }\n`;
const NARRATIVE = `---\nschema_version: 1\nplace_id: existing-place\nlocale: sr\neditorial_status: research\ntranslation_status: source\nslug: existing-place\npreferred_name: Постојећи објекат\nsource_ids: []\napprovals: []\naudit: { created_at: 2026-08-01T00:00:00Z, created_by: maxim, updated_at: 2026-08-01T00:00:00Z, updated_by: maxim }\n---\n`;

class FakeRepository {
  committed;
  constructor() {
    this.blobs = { schema: PLACE_SCHEMA, narrativeSchema: NARRATIVE_SCHEMA, commonSchema: COMMON_SCHEMA, preview: PREVIEW, place: EXISTING, narrative: NARRATIVE };
  }
  async readBranchState() { return { headSha: "a".repeat(40), treeSha: "b".repeat(40) }; }
  async readTree() {
    return [
      { path: "schemas/place.schema.json", mode: "100644", type: "blob", sha: "schema" },
      { path: "schemas/narrative.schema.json", mode: "100644", type: "blob", sha: "narrativeSchema" },
      { path: "schemas/common.schema.json", mode: "100644", type: "blob", sha: "commonSchema" },
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
const ACCESS_ISSUER = "https://access-test.cloudflareaccess.com";
const ACCESS_AUDIENCE = "admin-application-audience";
const validBody = {
  preferredName: "Пробни објекат",
  id: "probni-objekat",
  slug: "probni-objekat",
  placeType: "monastery",
  expectedHeadSha: "a".repeat(40),
};

async function createAccessKeyPair(kid = "access-test-key") {
  const keyPair = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(keyPair.publicKey);
  Object.assign(jwk, { alg: "RS256", kid, use: "sig" });
  return { ...keyPair, jwk, kid };
}

async function signAccessJwt({ privateKey, kid, issuer = ACCESS_ISSUER, audience = ACCESS_AUDIENCE, email, subject }) {
  const claims = email === undefined ? {} : { email };
  let token = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m");
  if (subject !== undefined) token = token.setSubject(subject);
  return token.sign(privateKey);
}

function accessRequest(assertion) {
  return new Request("https://admin.example.test", {
    headers: { "Cf-Access-Jwt-Assertion": assertion },
  });
}

const accessEnv = {
  ENVIRONMENT: "production",
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: ACCESS_ISSUER,
  CLOUDFLARE_ACCESS_AUD: ACCESS_AUDIENCE,
};

async function withAccessJwks(jwk, operation) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ keys: [jwk] });
  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function createGitHubAppKeyPair(type) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ type, format: "pem" }).toString(),
    publicKey,
  };
}

async function verifyGitHubAppKey(privateKeySecret, publicKey) {
  const expectedNow = Math.floor(Date.parse("2026-08-13T09:00:00Z") / 1000);
  let appJwt;
  const repository = new GitHubRepository({
    env: {
      ...env,
      GITHUB_APP_ID: "123",
      GITHUB_APP_INSTALLATION_ID: "456",
      GITHUB_APP_PRIVATE_KEY: privateKeySecret,
    },
    fetchImpl: async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === "/app/installations/456/access_tokens") {
        const authorization = new Headers(init.headers).get("authorization");
        assert.match(authorization ?? "", /^Bearer /);
        appJwt = authorization.slice("Bearer ".length);
        return Response.json({ token: "installation-token" }, { status: 201 });
      }
      if (pathname.endsWith("/git/ref/heads/editorial%2Fwork")) {
        return Response.json({ object: { sha: "a".repeat(40) } });
      }
      if (pathname.endsWith(`/git/commits/${"a".repeat(40)}`)) {
        return Response.json({ tree: { sha: "b".repeat(40) } });
      }
      throw new Error(`Unexpected request ${pathname}`);
    },
    now: () => Date.parse("2026-08-13T09:00:00Z"),
  });

  await repository.readBranchState("editorial/work");
  assert.equal(typeof appJwt, "string");
  const { payload, protectedHeader } = await jwtVerify(appJwt, publicKey, {
    algorithms: ["RS256"],
    issuer: "123",
    currentDate: new Date("2026-08-13T09:00:00Z"),
  });
  assert.equal(protectedHeader.alg, "RS256");
  assert.equal(payload.iat, expectedNow - 30);
  assert.equal(payload.exp, expectedNow + 540);
  return appJwt;
}

async function captureFailure(operation) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  assert.fail("Expected operation to fail");
}

async function assertSafeGitHubAuthenticationFailure(error, expectedFields) {
  assert.equal(error?.code, "github_authentication_failure");
  const response = errorResponse(error);
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error.code, "github_authentication_failure");
  assert.equal(body.error.message, "GitHub App аутентификација није успјела.");
  assert.deepEqual(body.error.fields, expectedFields);
}

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

test("valid Access JWT with email and subject creates a human admin session", async () => {
  const { privateKey, jwk, kid } = await createAccessKeyPair();
  const assertion = await signAccessJwt({
    privateKey,
    kid,
    email: "maxim@example.test",
    subject: "access-user-id",
  });
  const authenticated = await withAccessJwks(jwk, () => authenticateRequest(accessRequest(assertion), accessEnv));
  assert.equal(authenticated.subject, "access-user-id");
  assert.equal(authenticated.email, "maxim@example.test");
  assert.equal(authenticated.actor, "maxim");
  assert.equal(authenticated.developmentBypass, false);
});

test("valid Access JWT with email falls back to email when subject is absent or empty", async () => {
  const { privateKey, jwk, kid } = await createAccessKeyPair();
  await withAccessJwks(jwk, async () => {
    for (const subject of [undefined, ""]) {
      const assertion = await signAccessJwt({ privateKey, kid, email: "maxim@example.test", subject });
      const authenticated = await authenticateRequest(accessRequest(assertion), accessEnv);
      assert.equal(authenticated.subject, "maxim@example.test");
      assert.equal(authenticated.email, "maxim@example.test");
    }
  });
});

test("Access JWT without a non-empty email cannot create a human admin session", async () => {
  const { privateKey, jwk, kid } = await createAccessKeyPair();
  await withAccessJwks(jwk, async () => {
    for (const email of [undefined, ""]) {
      const assertion = await signAccessJwt({ privateKey, kid, email, subject: "" });
      await assert.rejects(
        () => authenticateRequest(accessRequest(assertion), accessEnv),
        (error) => error.code === "unauthenticated",
      );
    }
  });
});

test("Access JWT issuer, audience, and signature validation remain fail closed", async () => {
  const { privateKey, jwk, kid } = await createAccessKeyPair();
  const { privateKey: unrelatedPrivateKey } = await createAccessKeyPair("unrelated-key");
  const assertions = [
    await signAccessJwt({ privateKey, kid, email: "maxim@example.test", subject: "user", issuer: "https://wrong.cloudflareaccess.com" }),
    await signAccessJwt({ privateKey, kid, email: "maxim@example.test", subject: "user", audience: "wrong-audience" }),
    await signAccessJwt({ privateKey: unrelatedPrivateKey, kid, email: "maxim@example.test", subject: "user" }),
  ];
  await withAccessJwks(jwk, async () => {
    for (const assertion of assertions) {
      await assert.rejects(
        () => authenticateRequest(accessRequest(assertion), accessEnv),
        (error) => error.code === "unauthenticated",
      );
    }
  });
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

test("incomplete GitHub App configuration reports only missing variable names", async () => {
  const repository = new GitHubRepository({
    env,
    fetchImpl: async () => assert.fail("Configuration failure must happen before fetch"),
  });
  const error = await captureFailure(() => repository.readBranchState("editorial/work"));
  await assertSafeGitHubAuthenticationFailure(error, {
    stage: "configuration_incomplete",
    missing: ["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY"],
  });
});

test("GitHub-style PKCS#1 private key signs the App JWT", async () => {
  const { privateKeyPem, publicKey } = createGitHubAppKeyPair("pkcs1");
  await verifyGitHubAppKey(privateKeyPem, publicKey);
});

test("PKCS#8 private key continues to sign the App JWT", async () => {
  const { privateKeyPem, publicKey } = createGitHubAppKeyPair("pkcs8");
  await verifyGitHubAppKey(privateKeyPem, publicKey);
});

test("GitHub App private key secret normalizes literal newline sequences", async () => {
  const { privateKeyPem, publicKey } = createGitHubAppKeyPair("pkcs1");
  await verifyGitHubAppKey(privateKeyPem.replaceAll("\n", "\\n"), publicKey);
});

test("unsupported GitHub App PEM headers fail closed before any request", async () => {
  let fetchCalls = 0;
  const repository = new GitHubRepository({
    env: {
      ...env,
      GITHUB_APP_ID: "123",
      GITHUB_APP_INSTALLATION_ID: "456",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN EC PRIVATE KEY-----\nunsupported\n-----END EC PRIVATE KEY-----",
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      return Response.json({});
    },
  });

  const error = await captureFailure(() => repository.readBranchState("editorial/work"));
  await assertSafeGitHubAuthenticationFailure(error, { stage: "private_key_import_failed" });
  assert.equal(fetchCalls, 0);
});

test("GitHub App JWT signing failures have a distinct safe stage", async () => {
  const { privateKeyPem } = createGitHubAppKeyPair("pkcs8");
  const repository = new GitHubRepository({
    env: {
      ...env,
      GITHUB_APP_ID: "123",
      GITHUB_APP_INSTALLATION_ID: "456",
      GITHUB_APP_PRIVATE_KEY: privateKeyPem,
    },
    fetchImpl: async () => assert.fail("Signing failure must happen before fetch"),
    now: () => Number.NaN,
  });
  const error = await captureFailure(() => repository.readBranchState("editorial/work"));
  await assertSafeGitHubAuthenticationFailure(error, { stage: "app_jwt_sign_failed" });
});

test("GitHub installation token failures retain safe internal diagnostics", async () => {
  const { privateKeyPem } = createGitHubAppKeyPair("pkcs8");
  for (const [tokenResponse, expectedFields] of [
    [new Response(null, { status: 401 }), { stage: "installation_token_http_failure", status: 401 }],
    [Response.json({ token: "" }, { status: 201 }), { stage: "installation_token_response_invalid", status: 201 }],
  ]) {
    const repository = new GitHubRepository({
      env: {
        ...env,
        GITHUB_APP_ID: "123",
        GITHUB_APP_INSTALLATION_ID: "456",
        GITHUB_APP_PRIVATE_KEY: privateKeyPem,
      },
      fetchImpl: async () => tokenResponse.clone(),
    });
    const error = await captureFailure(() => repository.readBranchState("editorial/work"));
    await assertSafeGitHubAuthenticationFailure(error, expectedFields);
  }

  const networkRepository = new GitHubRepository({
    env: {
      ...env,
      GITHUB_APP_ID: "123",
      GITHUB_APP_INSTALLATION_ID: "456",
      GITHUB_APP_PRIVATE_KEY: privateKeyPem,
    },
    fetchImpl: async () => { throw new Error("network unavailable"); },
  });
  const networkError = await captureFailure(() => networkRepository.readBranchState("editorial/work"));
  await assertSafeGitHubAuthenticationFailure(networkError, { stage: "installation_token_http_failure" });
});

test("GitHub authentication failures do not log or publicly disclose keys, JWTs, or tokens", async () => {
  const { privateKeyPem } = createGitHubAppKeyPair("pkcs1");
  const installationToken = "installation-token-secret-value";
  let appJwt = "";
  const logged = [];
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...values) => logged.push(values);
  console.warn = (...values) => logged.push(values);
  console.error = (...values) => logged.push(values);

  let failure;
  try {
    const repository = new GitHubRepository({
      env: {
        ...env,
        GITHUB_APP_ID: "123",
        GITHUB_APP_INSTALLATION_ID: "456",
        GITHUB_APP_PRIVATE_KEY: privateKeyPem,
      },
      fetchImpl: async (url, init = {}) => {
        const pathname = new URL(url).pathname;
        if (pathname === "/app/installations/456/access_tokens") {
          appJwt = new Headers(init.headers).get("authorization")?.slice("Bearer ".length) ?? "";
          return Response.json({ token: installationToken }, { status: 201 });
        }
        return Response.json({}, { status: 401 });
      },
    });
    await repository.readBranchState("editorial/work");
  } catch (error) {
    failure = error;
  } finally {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  }

  assert.equal(failure?.code, "github_authentication_failure");
  await assertSafeGitHubAuthenticationFailure(failure, {
    stage: "repository_request_rejected",
    status: 401,
    operation: "branch_ref",
  });
  assert.equal(logged.length, 0);
  assert.notEqual(appJwt, "");
  const serialized = await errorResponse(failure).text();
  assert.doesNotMatch(serialized, new RegExp(privateKeyPem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(serialized, new RegExp(appJwt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(serialized, new RegExp(installationToken));
  assert.match(serialized, /github_authentication_failure/);
});

test("GitHub authentication error serialization allows only approved diagnostic fields", async () => {
  const secret = "installation-token-secret-value";
  const response = errorResponse(new AdminError("github_authentication_failure", 502, secret, {
    stage: "repository_request_rejected",
    status: 403,
    operation: "branch_ref",
    privateKey: secret,
    token: secret,
    response: secret,
  }));
  const serialized = await response.text();
  assert.doesNotMatch(serialized, new RegExp(secret));
  const body = JSON.parse(serialized);
  assert.deepEqual(body.error.fields, {
    stage: "repository_request_rejected",
    status: 403,
    operation: "branch_ref",
  });
  assert.equal(body.error.message, "GitHub App аутентификација није успјела.");
});

test("default GitHub transport binds receiver-sensitive fetch to globalThis", async () => {
  const { privateKeyPem } = createGitHubAppKeyPair("pkcs8");
  const originalFetch = globalThis.fetch;
  const receivers = [];
  globalThis.fetch = async function receiverSensitiveFetch(url) {
    receivers.push(this);
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    const pathname = new URL(url).pathname;
    if (pathname === "/app/installations/456/access_tokens") {
      return Response.json({ token: "installation-token" }, { status: 201 });
    }
    if (pathname.endsWith("/git/ref/heads/editorial%2Fwork")) {
      return Response.json({ object: { sha: "a".repeat(40) } });
    }
    if (pathname.endsWith(`/git/commits/${"a".repeat(40)}`)) {
      return Response.json({ tree: { sha: "b".repeat(40) } });
    }
    throw new Error(`Unexpected request ${pathname}`);
  };

  try {
    const repository = new GitHubRepository({
      env: {
        ...env,
        GITHUB_APP_ID: "123",
        GITHUB_APP_INSTALLATION_ID: "456",
        GITHUB_APP_PRIVATE_KEY: privateKeyPem,
      },
    });
    assert.deepEqual(await repository.readBranchState("editorial/work"), {
      headSha: "a".repeat(40),
      treeSha: "b".repeat(40),
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(receivers.length, 3);
  assert.equal(receivers.every((receiver) => receiver === globalThis), true);
});

test("GitHub transport batches repository blobs through one GraphQL request", async () => {
  const { privateKeyPem } = createGitHubAppKeyPair("pkcs8");
  const shas = ["a".repeat(40), "b".repeat(40)];
  const calls = [];
  const repository = new GitHubRepository({
    env: {
      ...env,
      GITHUB_APP_ID: "123",
      GITHUB_APP_INSTALLATION_ID: "456",
      GITHUB_APP_PRIVATE_KEY: privateKeyPem,
    },
    fetchImpl: async (url, init = {}) => {
      const parsedUrl = new URL(url);
      calls.push(parsedUrl.pathname);
      if (parsedUrl.pathname === "/app/installations/456/access_tokens") {
        return Response.json({ token: "installation-token" }, { status: 201 });
      }
      if (parsedUrl.pathname === "/graphql") {
        const request = JSON.parse(init.body);
        assert.equal(request.variables.owner, "montenegrocg-oss");
        assert.equal(request.variables.repo, "svetinje");
        assert.match(request.query, new RegExp(shas[0]));
        assert.match(request.query, new RegExp(shas[1]));
        return Response.json({
          data: {
            repository: {
              blob0: { isBinary: false, text: "first" },
              blob1: { isBinary: false, text: "second" },
            },
          },
        });
      }
      assert.fail(`Unexpected request ${parsedUrl.pathname}`);
    },
  });

  const blobs = await repository.readBlobs(shas);
  assert.deepEqual([...blobs.entries()], [[shas[0], "first"], [shas[1], "second"]]);
  assert.deepEqual(calls, ["/app/installations/456/access_tokens", "/graphql"]);
});

test("internal GitHub diagnostics expose only approved stage, status, and read operation", async () => {
  const secret = "private-response-material";
  const response = errorResponse(new AdminError("internal_error", 502, secret, {
    stage: "repository_request_failed",
    status: 503,
    operation: "blob",
    response: secret,
    token: secret,
  }));
  const serialized = await response.text();
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.deepEqual(JSON.parse(serialized).error.fields, {
    stage: "repository_request_failed",
    status: 503,
    operation: "blob",
  });
});

test("post-load internal diagnostics expose only fixed stage names", async () => {
  for (const stage of [
    "catalog_tree_processing_failed",
    "catalog_blob_decode_failed",
    "catalog_yaml_parse_failed",
    "schema_compile_failed",
    "dashboard_render_failed",
  ]) {
    const response = errorResponse(new AdminError("internal_error", 502, "unsafe detail", {
      stage,
      operation: "create_commit",
      privateKey: "unsafe detail",
    }));
    assert.deepEqual((await response.json()).error.fields, { stage });
  }
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
