import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { createPlaceScaffold } from "../scripts/new-place.mjs";
import { validateRepository } from "../scripts/content-validation.mjs";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const FIXED_DATE = new Date("2026-08-04T12:34:56.000Z");
const CLI = path.join(PROJECT_ROOT, "scripts", "new-place.mjs");

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "svetinje-new-place-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(PROJECT_ROOT, "schemas"), path.join(root, "schemas"), { recursive: true });
  await cp(path.join(PROJECT_ROOT, "validation"), path.join(root, "validation"), { recursive: true });
  await writeFile(path.join(root, "validation", "editorial-preview-routes.json"), '{\n  "route_ids": []\n}\n', "utf8");
  await mkdir(path.join(root, "content", "places"), { recursive: true });
  await writeFile(path.join(root, "content", "README.md"), "# Test content\n", "utf8");
  return root;
}

function frontMatter(markdown) {
  const closing = markdown.indexOf("\n---\n", 4);
  assert.ok(closing > 0);
  return parse(markdown.slice(4, closing));
}

async function doesNotExist(file) {
  await assert.rejects(() => stat(file), (error) => error?.code === "ENOENT");
}

function runCli(root, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("valid ID and schema-derived type create a schema-valid research scaffold", async (t) => {
  const root = await fixture(t);
  const allowlist = path.join(root, "validation", "editorial-preview.json");
  const allowlistBefore = await readFile(allowlist, "utf8");

  await createPlaceScaffold({ root, id: "test-place", placeType: "monastery", now: FIXED_DATE });

  const place = parse(await readFile(path.join(root, "content", "places", "test-place", "place.yaml"), "utf8"));
  const narrative = frontMatter(await readFile(path.join(root, "content", "places", "test-place", "narratives", "sr.md"), "utf8"));
  assert.equal(place.id, "test-place");
  assert.equal(place.place_type.value, "monastery");
  assert.equal(place.editorial_status, "research");
  assert.equal(narrative.slug, "test-place");
  assert.equal(narrative.preferred_name, undefined);
  assert.match(place.audit.created_at, /Z$/);
  assert.match(narrative.audit.updated_at, /Z$/);
  assert.equal(Date.parse(place.audit.created_at), FIXED_DATE.valueOf());
  assert.deepEqual(await validateRepository(root), []);
  assert.equal(await readFile(allowlist, "utf8"), allowlistBefore);
  await doesNotExist(path.join(root, "content", "sources"));
  await doesNotExist(path.join(root, "content", "media"));
});

test("optional preferred name and slug are preserved without an invented summary", async (t) => {
  const root = await fixture(t);
  await createPlaceScaffold({
    root,
    id: "second-place",
    placeType: "church",
    name: "Пробни назив",
    slug: "odobreni-slug",
    now: FIXED_DATE,
  });
  const narrative = frontMatter(await readFile(path.join(root, "content", "places", "second-place", "narratives", "sr.md"), "utf8"));
  assert.equal(narrative.preferred_name, "Пробни назив");
  assert.equal(narrative.slug, "odobreni-slug");
  assert.equal(narrative.summary, undefined);
  assert.deepEqual(await validateRepository(root), []);
});

test("invalid IDs, slugs, and schema-unsupported types are rejected", async (t) => {
  const root = await fixture(t);
  for (const id of ["", "Uppercase", "two words", "../escape", "nested/place", "nested\\place", "punctuation!"]) {
    await assert.rejects(() => createPlaceScaffold({ root, id, placeType: "monastery", now: FIXED_DATE }), /Place ID must be lowercase ASCII kebab-case/);
  }
  await assert.rejects(() => createPlaceScaffold({ root, id: "safe-id", placeType: "mosque", now: FIXED_DATE }), /Unsupported place type/);
  await assert.rejects(() => createPlaceScaffold({ root, id: "safe-id", placeType: "monastery", slug: "../escape", now: FIXED_DATE }), /Slug must be lowercase ASCII kebab-case/);
  await doesNotExist(path.join(root, "content", "places", "safe-id"));
});

test("an existing destination is rejected without changing its files", async (t) => {
  const root = await fixture(t);
  const target = path.join(root, "content", "places", "existing-place");
  await mkdir(target);
  const sentinel = path.join(target, "keep.txt");
  await writeFile(sentinel, "keep me\n", "utf8");
  await assert.rejects(() => createPlaceScaffold({ root, id: "existing-place", placeType: "other", now: FIXED_DATE }), /already exists/);
  assert.equal(await readFile(sentinel, "utf8"), "keep me\n");
  await doesNotExist(path.join(target, "place.yaml"));
});

test("the CLI reports missing and unsafe arguments with a non-zero exit code", async (t) => {
  const root = await fixture(t);
  for (const [args, message] of [
    [[], "Missing place ID"],
    [["safe-id"], "Missing place type"],
    [["../escape", "monastery"], "Place ID must be lowercase ASCII kebab-case"],
    [["safe-id", "unsupported"], "Unsupported place type"],
  ]) {
    const result = await runCli(root, args);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, new RegExp(message));
  }
});

test("the two-argument CLI creates the documented scaffold", async (t) => {
  const root = await fixture(t);
  const result = await runCli(root, ["generated-place", "monastery"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /content\/places\/generated-place/);
  await stat(path.join(root, "content", "places", "generated-place", "place.yaml"));
  await stat(path.join(root, "content", "places", "generated-place", "narratives", "sr.md"));
  assert.deepEqual(await validateRepository(root), []);
});
