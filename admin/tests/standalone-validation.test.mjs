import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PATCH validation imports standalone validators without runtime Ajv compilation", async () => {
  const editorSource = await readFile(new URL("../src/place-editor.ts", import.meta.url), "utf8");
  const generatedSource = await readFile(new URL("../src/generated/canonical-validators.js", import.meta.url), "utf8");

  assert.match(editorSource, /canonical-validators\.js/);
  assert.doesNotMatch(editorSource, /Ajv2020|addFormats|\.compile\s*\(/);
  assert.doesNotMatch(generatedSource, /\brequire\s*\(|\beval\s*\(|\bnew\s+Function\s*\(/);
  assert.match(generatedSource, /CANONICAL_SCHEMA_FINGERPRINT/);
});
