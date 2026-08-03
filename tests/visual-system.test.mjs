import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

async function source(file) {
  return readFile(path.join(PROJECT_ROOT, file), "utf8");
}

test("the brand separates the project name from the domain", async () => {
  const header = await source("src/components/Header.astro");
  assert.match(header, /class="brand-name">Светиње<\/span>/);
  assert.match(header, /class="brand-domain">svetinje\.me<\/span>/);
});

test("mobile navigation uses a native disclosure and unavailable locales are not links", async () => {
  const [header, languages] = await Promise.all([
    source("src/components/Header.astro"),
    source("src/components/LanguageSwitcher.astro"),
  ]);
  assert.match(header, /<details class="mobile-navigation">/);
  assert.match(header, /<summary>/);
  assert.match(languages, /class="language-unavailable"/);
  assert.match(languages, /aria-disabled="true"/);
  assert.match(languages, /<small>ускоро<\/small>/);
});

test("the visual system includes responsive and reduced-motion protections", async () => {
  const css = await source("src/styles/global.css");
  assert.match(css, /@media \(min-width: 48rem\)/);
  assert.match(css, /@media \(min-width: 64rem\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.mobile-navigation/);
  assert.match(css, /\.hero-media-surface/);
});
