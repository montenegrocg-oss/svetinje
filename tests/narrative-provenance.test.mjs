import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import {
  collectPlaceNarrativeSourceIds,
  migratePlaceNarrativeProvenance,
} from "../scripts/lib/place-narrative-provenance.mjs";

function frontMatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown);
  assert.ok(match);
  return parse(match[1]);
}

test("legacy place provenance migrates to one lossless document-level source list", () => {
  const body = "Јединствени текст без структурисаних H2 сидра.\n\nДруги пасус.\n";
  const legacy = `---
schema_version: 1
place_id: validation-place
source_ids:
  - source-a
section_sources:
  introduction:
    - source-b
    - source-a
  history:
    - source-c
approvals: []
---
${body}`;
  const before = collectPlaceNarrativeSourceIds(frontMatter(legacy));
  const result = migratePlaceNarrativeProvenance(legacy);
  const migrated = frontMatter(result.markdown);

  assert.equal(result.changed, true);
  assert.deepEqual(before, ["source-a", "source-b", "source-c"]);
  assert.deepEqual(migrated.source_ids, before);
  assert.equal(migrated.section_sources, undefined);
  assert.equal(result.body, body);
  assert.equal(migratePlaceNarrativeProvenance(result.markdown).changed, false);
});

test("canonical place schema omits legacy provenance while route schema retains it", async () => {
  const [placeSchema, routeSchema, validatorSource] = await Promise.all([
    readFile(new URL("../schemas/narrative.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../schemas/route-narrative.schema.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../scripts/content-validation.mjs", import.meta.url), "utf8"),
  ]);
  assert.equal(placeSchema.properties.section_sources, undefined);
  assert.equal(placeSchema.$defs.sectionSources, undefined);
  assert.ok(routeSchema.properties.section_sources);
  assert.ok(routeSchema.$defs.sectionSources);
  assert.match(validatorSource, /if \(record\.kind === "routeNarrative"\)[\s\S]*data\.section_sources/);
});
