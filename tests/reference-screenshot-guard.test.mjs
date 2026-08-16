import assert from "node:assert/strict";
import test from "node:test";

import { containsUnsupportedReferenceScreenshotContent } from "../scripts/lib/reference-screenshot-guard.mjs";

test("allows a legitimate canonical monastery name in editorial-preview HTML", () => {
  const html = "<article><h1>Манастир Дуљево</h1><p>Канонски садржај светиње.</p></article>";

  assert.equal(containsUnsupportedReferenceScreenshotContent(html), false);
});

test("rejects synthetic reference-screenshot content", () => {
  const syntheticHtml = "<aside><span>Дјелимично активан</span></aside>";
  const legacyFingerprintHtml = "<aside>180 m · 08:00 · 16:00 · 18:00 · Црква Св. Тројице</aside>";

  assert.equal(containsUnsupportedReferenceScreenshotContent(syntheticHtml), true);
  assert.equal(containsUnsupportedReferenceScreenshotContent(legacyFingerprintHtml), true);
});

test("allows isolated generic legacy values", () => {
  for (const html of ["<p>180 m</p>", "<time>08:00</time>", "<h1>Црква Св. Тројице</h1>"]) {
    assert.equal(containsUnsupportedReferenceScreenshotContent(html), false);
  }
});
