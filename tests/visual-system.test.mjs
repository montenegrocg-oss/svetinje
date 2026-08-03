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

test("the original brand separates the project name from the domain", async () => {
  const [header, mark] = await Promise.all([
    source("src/components/Header.astro"),
    source("src/components/BrandMark.astro"),
  ]);
  assert.match(header, /class="brand-name">Светиње<\/span>/);
  assert.match(header, /class="brand-domain">svetinje\.me<\/span>/);
  assert.match(header, /<BrandMark \/>/);
  assert.match(mark, /class="brand-symbol"/);
});

test("desktop and mobile navigation expose the required Serbian guide sections", async () => {
  const header = await source("src/components/Header.astro");
  for (const label of ["Почетна", "Карта", "Манастири", "Цркве", "Руте", "О пројекту"]) {
    assert.match(header, new RegExp(label));
  }
  assert.match(header, /<details class="mobile-navigation">/);
  assert.match(header, /aria-label="Отвори главни мени"/);
  assert.match(header, /Омиљене светиње — 0/);
  assert.match(header, /aria-label="Претрага светиња"/);
});

test("unavailable locales remain visibly unavailable rather than becoming links", async () => {
  const languages = await source("src/components/LanguageSwitcher.astro");
  assert.match(languages, /class="language-unavailable"/);
  assert.match(languages, /aria-disabled="true"/);
  assert.match(languages, /<small>ускоро<\/small>/);
});

test("the homepage is composed from reusable map-explorer components", async () => {
  const homepage = await source("src/pages/index.astro");
  assert.match(homepage, /import MapExplorer/);
  assert.match(homepage, /<MapExplorer \/>/);
  assert.match(homepage, /<HomepagePreviews \/>/);

  const explorer = await source("src/components/MapExplorer.astro");
  assert.match(explorer, /<MapCanvas places=\{places\} \/>/);
  assert.match(explorer, /<MapControls \/>/);
  assert.match(explorer, /<ExplorerSidebar places=\{places\} \/>/);
  assert.match(explorer, /data-testid="map-explorer"/);
});

test("map controls, search, and filters expose accessible states and honest feedback", async () => {
  const [controls, sidebar, filters, explorer] = await Promise.all([
    source("src/components/MapControls.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/MapExplorer.astro"),
  ]);
  assert.match(sidebar, /<label class="sr-only" for="holy-place-search">/);
  assert.match(sidebar, /placeholder="Претражите светиње…"/);
  assert.match(filters, /type="button"/);
  assert.match(filters, /aria-pressed=/);
  assert.match(controls, /Функција планирања руте је у припреми/);
  assert.match(controls, /role="status"/);
  assert.match(controls, /data-map-zoom-in/);
  assert.match(controls, /data-map-zoom-out/);
  assert.match(controls, /data-map-reset/);
  assert.match(controls, /aria-label="Прикажи поново Црну Гору"/);
  assert.match(explorer, /querySelectorAll<HTMLElement>\("\[data-filter-group\]"\)/);
});

test("the required Serbian interface labels are present", async () => {
  const files = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/HomepagePreviews.astro"),
  ]);
  const content = files.join("\n");
  for (const label of [
    "Православна Црна Гора",
    "Манастири",
    "Цркве",
    "Света мјеста",
    "Поклоничке руте",
    "Изгради руту",
    "Слојеви",
    "Како користити карту?",
    "Популарне руте",
    "Препоручене светиње",
    "Прикажи све",
  ]) {
    assert.match(content, new RegExp(label.replace(/[?]/g, "\\?")));
  }
  assert.doesNotMatch(content, /маршрут/iu);
});

test("the visual system includes required breakpoints, touch targets, and reduced-motion protection", async () => {
  const css = await source("src/styles/global.css");
  assert.match(css, /@media \(min-width: 48rem\)/);
  assert.match(css, /@media \(min-width: 68rem\)/);
  assert.match(css, /@media \(min-width: 90rem\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height: 2\.75rem/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /\.place-previews/);
});

test("the authorized homepage photograph keeps reserved responsive dimensions", async () => {
  const homepage = await source("src/pages/index.astro");
  assert.match(homepage, /src="\/images\/home\/hero\.webp"/);
  assert.match(homepage, /srcset="\/images\/home\/hero\.webp 2400w"/);
  assert.match(homepage, /width="2400"/);
  assert.match(homepage, /height="1425"/);
  assert.match(homepage, /alt="Поглед из ваздуха на православни храм/);
  assert.match(homepage, /loading="lazy"/);
});

test("the homepage photograph matches its media record and size budget", async () => {
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
