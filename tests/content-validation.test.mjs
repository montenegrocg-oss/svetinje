import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { validateRepository, validateRepositoryWithSummary } from "../scripts/content-validation.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const AUDIT = {
  created_at: "2026-01-01T00:00:00Z",
  created_by: "validation-editor",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: "validation-editor",
};

async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), "svetinje-validation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(PROJECT_ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  await cp(path.join(PROJECT_ROOT, "validation"), path.join(root, "validation"), { recursive: true });
  await writeFile(path.join(root, "validation", "editorial-preview-routes.json"), '{\n  "route_ids": []\n}\n', "utf8");
  await mkdir(path.join(root, "content"), { recursive: true });
  await writeFile(path.join(root, "content", "README.md"), "# Test content\n", "utf8");
  return root;
}

async function yamlFile(root, relative, data) {
  const file = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stringify(data), "utf8");
}

async function narrativeFile(root, placeId, locale, data, body = "Ово је неутрална провјера структуре и не описује стварно мјесто.\n") {
  const file = path.join(root, "content", "places", placeId, "narratives", `${locale}.md`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `---\n${stringify(data)}---\n${body}`, "utf8");
}

function place(id = "validation-subject") {
  return {
    schema_version: 1,
    id,
    editorial_status: "research",
    relationships: {},
    source_ids: [],
    approvals: [],
    audit: { ...AUDIT },
  };
}

function narrative(placeId = "validation-subject", locale = "sr") {
  return {
    schema_version: 1,
    place_id: placeId,
    locale,
    editorial_status: "draft",
    translation_status: locale === "sr" ? "source" : "draft",
    ...(locale === "sr" ? {} : { source_revision: "a".repeat(40) }),
    source_ids: [],
    approvals: [],
    audit: { ...AUDIT },
  };
}

function practical(id = "validation-note", placeId = "validation-subject") {
  return {
    schema_version: 1,
    id,
    place_id: placeId,
    editorial_status: "draft",
    kind: "road-access",
    value_type: "localized-text",
    value: {
      locales: [{ locale: "sr", text: "Неутрални тест.", translation_status: "source", approvals: [] }],
    },
    source_ids: [],
    verification_status: "requires-verification",
    freshness_status: "unknown",
    display_policy: "hide-when-stale",
    approvals: [],
    audit: { ...AUDIT },
  };
}

function has(errors, text) {
  return errors.some((error) => `${error.field} ${error.message}`.includes(text));
}

async function countFiles(directory, predicate) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
  let count = 0;
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await countFiles(full, predicate);
    else if (entry.isFile() && predicate(full)) count += 1;
  }
  return count;
}

test("the repository skeleton validates with no content records", async (t) => {
  const root = await project(t);
  assert.deepEqual(await validateRepository(root), []);
});

test("the repository summary reports actual validated record counts", async () => {
  const result = await validateRepositoryWithSummary(PROJECT_ROOT);
  const contentRoot = path.join(PROJECT_ROOT, "content");
  const actualCounts = {
    places: await countFiles(path.join(contentRoot, "places"), (file) => path.basename(file) === "place.yaml"),
    narratives: await countFiles(path.join(contentRoot, "places"), (file) => file.endsWith(".md") && path.basename(path.dirname(file)) === "narratives"),
    sources: await countFiles(path.join(contentRoot, "sources"), (file) => file.endsWith(".yaml")),
    practical: await countFiles(path.join(contentRoot, "practical"), (file) => file.endsWith(".yaml")),
    media: await countFiles(path.join(contentRoot, "media"), (file) => file.endsWith(".yaml")),
    news: await countFiles(path.join(contentRoot, "news"), (file) => file.endsWith(".md")),
    routes: await countFiles(path.join(contentRoot, "routes"), (file) => path.basename(file) === "route.yaml"),
    routeNarratives: await countFiles(path.join(contentRoot, "routes"), (file) => file.endsWith(".md") && path.basename(path.dirname(file)) === "narratives"),
    routeTracks: await countFiles(path.join(contentRoot, "routes"), (file) => path.basename(file) === "track.geojson"),
  };
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.counts, actualCounts);
  assert.equal(result.publicationLocked, true);
});

test("neutral draft structural records validate", async (t) => {
  const root = await project(t);
  const unsourcedPlace = place();
  const unsourcedNarrative = narrative();
  delete unsourcedPlace.source_ids;
  delete unsourcedNarrative.source_ids;
  await yamlFile(root, "content/places/validation-subject/place.yaml", unsourcedPlace);
  await narrativeFile(root, "validation-subject", "sr", unsourcedNarrative);
  assert.deepEqual(await validateRepository(root), []);
});

test("unified place narrative accepts document sources without anchored H2 sections", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", place());
  const canonical = narrative();
  await narrativeFile(root, "validation-subject", "sr", canonical, "## Слободан наслов\n\nЈединствени текст без секцијског сидра.\n");
  assert.deepEqual(await validateRepository(root), []);

  await narrativeFile(root, "validation-subject", "sr", {
    ...canonical,
    section_sources: { introduction: ["legacy-source"] },
  }, "Јединствени текст без старог H2 модела.\n");
  assert.ok(has(await validateRepository(root), "must NOT have additional properties"));
});

test("place browse areas are optional and must reference the shared catalogue", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", {
    ...place(),
    browse_area_id: "boka-kotorska",
  });
  assert.deepEqual(await validateRepository(root), []);

  await yamlFile(root, "content/places/validation-subject/place.yaml", {
    ...place(),
    browse_area_id: "unknown-area",
  });
  assert.ok(has(await validateRepository(root), "unknown browse area id unknown-area"));
});

test("duplicate technical entity ids are rejected across record types", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", place());
  await yamlFile(root, "content/practical/validation-subject/validation-subject.yaml", practical("validation-subject"));
  assert.ok(has(await validateRepository(root), "duplicate entity id validation-subject"));
});

test("duplicate active locale slugs are rejected", async (t) => {
  const root = await project(t);
  for (const id of ["validation-alpha", "validation-beta"]) {
    await yamlFile(root, `content/places/${id}/place.yaml`, place(id));
    await narrativeFile(root, id, "sr", { ...narrative(id), slug: "shared-validation-slug" });
  }
  assert.ok(has(await validateRepository(root), "duplicate active sr slug shared-validation-slug"));
});

test("unresolved cross references are rejected", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", {
    ...place(),
    source_ids: ["missing-validation-source"],
  });
  assert.ok(has(await validateRepository(root), "unknown source id missing-validation-source"));
});

test("locale must match the narrative filename", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", place());
  await narrativeFile(root, "validation-subject", "sr", narrative("validation-subject", "ru"), "Neutral validation prose.\n");
  assert.ok(has(await validateRepository(root), "locale must match filename sr.md"));
});

test("verification and chronological metadata are validated", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", {
    ...place(),
    place_type: { value: "other", verification: { status: "verified" } },
    audit: { ...AUDIT, updated_at: "2025-12-31T23:59:59Z" },
  });
  const errors = await validateRepository(root);
  assert.ok(has(errors, "must have required property 'source_ids'"));
  assert.ok(has(errors, "updated_at cannot precede created_at"));
});

test("the publication lock rejects every published state", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", place());
  await narrativeFile(root, "validation-subject", "sr", {
    ...narrative(),
    translation_status: "published",
  });
  assert.ok(has(await validateRepository(root), "public publication is locked"));
});

test("the public lock cannot be lifted while required roles are unassigned", async (t) => {
  const root = await project(t);
  const policyFile = path.join(root, "validation", "publication-policy.json");
  const policy = JSON.parse(await readFile(policyFile, "utf8"));
  policy.public_publication_locked = false;
  await writeFile(policyFile, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  const errors = await validateRepository(root);
  assert.ok(has(errors, "/role_assignments/factual role must be assigned"));
  assert.ok(has(errors, "/role_assignments/media-rights role must be assigned"));
});

test("a fully reviewed neutral published source validates when the lock is lifted", async (t) => {
  const root = await project(t);
  const policyFile = path.join(root, "validation", "publication-policy.json");
  const policy = JSON.parse(await readFile(policyFile, "utf8"));
  policy.public_publication_locked = false;
  for (const role of Object.keys(policy.role_assignments)) policy.role_assignments[role] = [`validation-${role}-reviewer`];
  await writeFile(policyFile, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
  const approval = (role) => ({
    role,
    reviewer_id: `validation-${role}-reviewer`,
    outcome: "approved",
    reviewed_at: "2026-01-02T00:00:00Z",
    reviewed_revision: "b".repeat(40),
    scope: "Neutral validation fixture only.",
  });
  await yamlFile(root, "content/sources/validation-reference.yaml", {
    schema_version: 1,
    id: "validation-reference",
    editorial_status: "published",
    source_type: "academic",
    title: "Neutral validation reference",
    publisher: "Validation harness",
    bibliographic_reference: "Structural test reference; no factual claims.",
    status: "active",
    approvals: [approval("factual"), approval("publishing")],
    audit: { ...AUDIT },
  });
  assert.deepEqual(await validateRepository(root), []);
});

test("parent-place cycles are rejected", async (t) => {
  const root = await project(t);
  const verification = { status: "requires-verification" };
  await yamlFile(root, "content/places/validation-alpha/place.yaml", {
    ...place("validation-alpha"),
    parent_place_id: { value: "validation-beta", verification },
  });
  await yamlFile(root, "content/places/validation-beta/place.yaml", {
    ...place("validation-beta"),
    parent_place_id: { value: "validation-alpha", verification },
  });
  assert.ok(has(await validateRepository(root), "parent-place cycle"));
});

test("stale practical data cannot be displayed as current", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", place());
  await yamlFile(root, "content/practical/validation-subject/validation-note.yaml", {
    ...practical(),
    freshness_status: "stale",
    display_policy: "show",
  });
  assert.ok(has(await validateRepository(root), "stale practical information must warn"));
});

test("approved media without rights metadata is rejected", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/media/validation-media.yaml", {
    schema_version: 1,
    id: "validation-media",
    editorial_status: "approved",
    media_type: "other",
    related_place_ids: [],
    localized_text: {},
    approvals: [],
    audit: { ...AUDIT },
  });
  const errors = await validateRepository(root);
  assert.ok(has(errors, "must have required property 'rights_basis'"));
  assert.ok(has(errors, "missing approved media-rights review"));
});

test("an admin-uploaded owner-approved original photograph validates for editorial preview", async (t) => {
  const root = await project(t);
  await yamlFile(root, "content/places/validation-subject/place.yaml", place());
  await yamlFile(root, "content/media/validation-owner-original.yaml", {
    schema_version: 1,
    id: "validation-owner-original",
    editorial_status: "approved",
    media_type: "image",
    storage_provider: "cloudflare-r2",
    object_key: "places/validation-subject/validation-owner-original.jpg",
    checksum_sha256: "a".repeat(64),
    mime_type: "image/jpeg",
    width: 1,
    height: 1,
    creator: "Project owner",
    copyright_owner: "Project owner",
    rights_basis: "project-original",
    credit_line: "Photo: Project owner",
    allowed_uses: ["web-display"],
    publication_safety: "public",
    related_place_ids: ["validation-subject"],
    localized_text: {
      sr: { alt_text: "Неутрална тестна фотографија.", translation_status: "source", approvals: [] },
    },
    approvals: [{
      role: "project-owner",
      reviewer_id: "montenegro-cg",
      outcome: "approved",
      reviewed_at: "2026-08-04T00:00:00Z",
      reviewed_revision: "a".repeat(40),
      scope: "Neutral editorial-preview fixture only.",
    }],
    audit: { ...AUDIT },
  });
  assert.deepEqual(await validateRepository(root), []);
});
