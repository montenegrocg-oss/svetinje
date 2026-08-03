import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

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

test("the homepage hero reserves responsive image space and provides Serbian alt text", async () => {
  const [homepage, css] = await Promise.all([
    source("src/pages/index.astro"),
    source("src/styles/global.css"),
  ]);
  assert.match(homepage, /src="\/images\/home\/hero\.webp"/);
  assert.match(homepage, /srcset="\/images\/home\/hero\.webp 2400w"/);
  assert.match(homepage, /sizes="\(min-width: 64rem\) 40vw/);
  assert.match(homepage, /width="2400"/);
  assert.match(homepage, /height="1425"/);
  assert.match(homepage, /alt="Поглед из ваздуха на православни храм/);
  assert.match(homepage, /fetchpriority="high"/);
  assert.match(css, /aspect-ratio: 4 \/ 5/);
  assert.match(css, /object-position: 50% 50%/);
});

test("the homepage hero derivative matches its media record and size budget", async () => {
  const [asset, metadataText] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "public", "images", "home", "hero.webp")),
    source("content/media/home-hero.yaml"),
  ]);
  const metadata = parse(metadataText);
  const checksum = createHash("sha256").update(asset).digest("hex");

  assert.equal(metadata.object_key, "public/images/home/hero.webp");
  assert.equal(metadata.mime_type, "image/webp");
  assert.equal(metadata.width, 2400);
  assert.equal(metadata.height, 1425);
  assert.equal(metadata.checksum_sha256, checksum);
  assert.ok(asset.length < 700_000, `hero.webp is ${asset.length} bytes`);
});
