import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  equivalentPageFor,
  localizedSeoMetadata,
  placeDetailRoot,
  routeConfig,
} from "../src/i18n/config.ts";
import {
  loadLocalizedNarrative,
} from "../src/lib/content/localized-narrative.ts";
import commonSchema from "../schemas/common.schema.json" with { type: "json" };
import narrativeSchema from "../schemas/narrative.schema.json" with { type: "json" };

const SHA = "a".repeat(40);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(commonSchema);
const validateNarrative = ajv.compile(narrativeSchema);
const audit = "audit: { created_at: 2026-08-20T12:00:00Z, created_by: test-editor, updated_at: 2026-08-20T12:00:00Z, updated_by: test-editor }";
const syntheticNarrative = (locale, overrides = "", body = "Synthetic body.\n") => `---
schema_version: 1
place_id: synthetic-place
locale: ${locale}
editorial_status: research
translation_status: ${locale === "sr" ? "source" : "draft"}
slug: synthetic-${locale}
preferred_name: Synthetic ${locale}
${locale === "sr" ? "" : `source_revision: ${SHA}\n`}${overrides}approvals: []
${audit}
---

${body}`;

test("localized narrative loader accepts source and optional translations without mutable fixtures", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svetinje-locales-"));
  const narratives = path.join(root, "content", "places", "synthetic-place", "narratives");
  await mkdir(narratives, { recursive: true });
  await writeFile(path.join(narratives, "sr.md"), syntheticNarrative("sr"), "utf8");
  await writeFile(path.join(narratives, "ru.md"), syntheticNarrative("ru"), "utf8");
  await writeFile(path.join(narratives, "en.md"), syntheticNarrative("en"), "utf8");

  const sr = await loadLocalizedNarrative(root, "synthetic-place", "sr");
  const ru = await loadLocalizedNarrative(root, "synthetic-place", "ru");
  const en = await loadLocalizedNarrative(root, "synthetic-place", "en");
  assert.equal(sr.translationStatus, "source");
  assert.equal(ru.locale, "ru");
  assert.equal(ru.sourceRevision, SHA);
  assert.equal(en.locale, "en");
  assert.equal(en.body.trim(), "Synthetic body.");
  assert.equal(validateNarrative(sr.raw), true);
  assert.equal(validateNarrative(ru.raw), true);
  assert.equal(validateNarrative(en.raw), true);

  const missingRoot = await mkdtemp(path.join(os.tmpdir(), "svetinje-missing-locales-"));
  await mkdir(path.join(missingRoot, "content", "places", "synthetic-place", "narratives"), { recursive: true });
  await writeFile(path.join(missingRoot, "content", "places", "synthetic-place", "narratives", "sr.md"), syntheticNarrative("sr"), "utf8");
  assert.equal(await loadLocalizedNarrative(missingRoot, "synthetic-place", "ru"), undefined);
  assert.equal(await loadLocalizedNarrative(missingRoot, "synthetic-place", "en"), undefined);
});

test("translation schema requires source_revision and loader rejects locale mismatch", async () => {
  assert.equal(validateNarrative({
    schema_version: 1,
    place_id: "synthetic-place",
    locale: "ru",
    editorial_status: "research",
    translation_status: "draft",
    approvals: [],
    audit: { created_at: "2026-08-20T12:00:00Z", created_by: "test-editor", updated_at: "2026-08-20T12:00:00Z", updated_by: "test-editor" },
  }), false);
  assert.ok(validateNarrative.errors.some((error) => error.keyword === "required" && error.params.missingProperty === "source_revision"));
  const root = await mkdtemp(path.join(os.tmpdir(), "svetinje-mismatched-locale-"));
  const narratives = path.join(root, "content", "places", "synthetic-place", "narratives");
  await mkdir(narratives, { recursive: true });
  await writeFile(path.join(narratives, "en.md"), syntheticNarrative("ru"), "utf8");
  await assert.rejects(() => loadLocalizedNarrative(root, "synthetic-place", "en"), /identity does not match/i);
});

test("future route registry resolves equivalent pages without enabling locale routes", async () => {
  assert.deepEqual(routeConfig.maleMonasteries, { sr: "/manastiri/muski/", ru: "/ru/monastyri/muzhskie/", en: "/en/monasteries/men/" });
  assert.deepEqual(routeConfig.femaleMonasteries, { sr: "/manastiri/zenski/", ru: "/ru/monastyri/zhenskie/", en: "/en/monasteries/women/" });
  assert.equal(placeDetailRoot.ru, "/ru/svyatyni/");
  assert.equal(equivalentPageFor("ru", { kind: "static", route: "calendar", availableLocales: ["sr"] }), undefined);
  assert.equal(equivalentPageFor("en", { kind: "place", slugs: { en: "synthetic-place" }, availableLocales: ["sr", "en"] }), "/en/holy-places/synthetic-place/");
  assert.equal(equivalentPageFor("ru", { kind: "place", slugs: {}, availableLocales: ["sr", "ru"] }), undefined);

  const seo = localizedSeoMetadata("https://svetinje.me", { locale: "en", path: "/en/about/", title: "About", description: "Description" }, [
    { locale: "sr", path: "/o-projektu/", title: "О пројекту", description: "Опис" },
    { locale: "en", path: "/en/about/", title: "About", description: "Description" },
  ]);
  assert.equal(seo.htmlLang, "en");
  assert.equal(seo.alternates.some(({ hreflang }) => hreflang === "ru"), false);
  assert.equal(seo.xDefault, "https://svetinje.me/o-projektu/");

  const pageFiles = await import("node:fs/promises").then(({ readdir }) => readdir(new URL("../src/pages/", import.meta.url), { recursive: true }));
  assert.equal(pageFiles.some((file) => /^(ru|en)[\\/]/.test(file)), false);
});
