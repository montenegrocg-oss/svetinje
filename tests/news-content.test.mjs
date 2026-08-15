import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
import { validateRepository } from "../scripts/content-validation.mjs";
import { NEWS_TYPE_LABELS } from "../src/lib/news-types.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const AUDIT = {
  created_at: "2026-01-01T00:00:00Z",
  created_by: "validation-editor",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: "validation-editor",
};

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "svetinje-news-validation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(PROJECT_ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  await cp(path.join(PROJECT_ROOT, "validation"), path.join(root, "validation"), { recursive: true });
  await writeFile(path.join(root, "validation", "editorial-preview-routes.json"), '{\n  "route_ids": []\n}\n', "utf8");
  await mkdir(path.join(root, "content", "news"), { recursive: true });
  await writeFile(path.join(root, "content", "README.md"), "# Test content\n", "utf8");
  return root;
}

async function addPlace(root, id = "validation-place") {
  const directory = path.join(root, "content", "places", id);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "place.yaml"), stringify({
    schema_version: 1,
    id,
    editorial_status: "research",
    relationships: {},
    source_ids: [],
    approvals: [],
    audit: AUDIT,
  }), "utf8");
}

function news(overrides = {}) {
  return {
    schema_version: 1,
    id: "validation-news",
    locale: "sr",
    editorial_status: "research",
    published_at: "2026-01-01T00:00:00Z",
    type: "site-update",
    title: "Неутрална вијест",
    summary: "Неутрални структурни тест.",
    target_url: "/#mapa",
    approvals: [],
    audit: AUDIT,
    ...overrides,
  };
}

async function addNews(root, record, body = "") {
  const file = path.join(root, "content", "news", `${record.id}.md`);
  await writeFile(file, `---\n${stringify(record)}---\n${body}`, "utf8");
}

const has = (errors, value) => errors.some((error) => `${error.field} ${error.message}`.includes(value));

test("all supported news navigation models validate", async (t) => {
  const root = await fixture(t);
  await addPlace(root);
  const records = [
    news({ id: "place-added-record", type: "place-added", target_url: undefined, related_place_id: "validation-place" }),
    news({ id: "place-updated-record", type: "place-updated", target_url: undefined, related_place_id: "validation-place" }),
    news({ id: "site-update-record", type: "site-update" }),
    news({ id: "announcement-record", type: "announcement", target_url: undefined, slug: "announcement-record" }),
    news({ id: "general-news-record", type: "news", target_url: undefined, slug: "general-news-record" }),
  ];
  for (const record of records) await addNews(root, record, record.slug ? "Самостални неутрални текст.\n" : "");
  assert.deepEqual(await validateRepository(root), []);
});

test("news schema rejects unsupported types and invalid IDs", async (t) => {
  const root = await fixture(t);
  await addNews(root, news({ id: "Invalid_ID", type: "unsupported" }));
  const errors = await validateRepository(root);
  assert.ok(has(errors, "must match pattern"));
  assert.ok(has(errors, "must be equal to one of the allowed values"));
});

test("news navigation rejects unsafe, missing, multiple, and empty-detail modes", async (t) => {
  const root = await fixture(t);
  const cases = [
    news({ id: "unsafe-target", target_url: "//example.test/path" }),
    news({ id: "missing-mode", target_url: undefined }),
    news({ id: "multiple-modes", related_place_id: "missing-place" }),
    news({ id: "empty-detail", target_url: undefined, slug: "empty-detail" }),
  ];
  for (const record of cases) await addNews(root, record);
  const errors = await validateRepository(root);
  assert.ok(has(errors, "target_url must be a safe same-site absolute path"));
  assert.ok(has(errors, "exactly one navigation strategy is required"));
  assert.ok(has(errors, "slug navigation requires a non-empty Markdown body"));
});

test("related-place news requires an existing place record", async (t) => {
  const root = await fixture(t);
  await addNews(root, news({ id: "missing-place-news", target_url: undefined, related_place_id: "missing-place" }));
  assert.ok(has(await validateRepository(root), "unknown related place id missing-place"));
});

test("Serbian news labels are shared and exact", () => {
  assert.deepEqual(NEWS_TYPE_LABELS, {
    "place-added": "НОВИ ОБЈЕКАТ",
    "place-updated": "АЖУРИРАНО",
    "site-update": "САЈТ",
    announcement: "ОБАВЈЕШТЕЊЕ",
    news: "НОВОСТ",
  });
});
