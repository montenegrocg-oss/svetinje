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

async function pngInfo(file) {
  const asset = await readFile(path.join(PROJECT_ROOT, file));
  assert.equal(asset.subarray(1, 4).toString("ascii"), "PNG");
  return {
    asset,
    width: asset.readUInt32BE(16),
    height: asset.readUInt32BE(20),
    colorType: asset[25],
  };
}

test("the approved transparent logo replaces the generated header lockup", async () => {
  const [header, styles, logo] = await Promise.all([
    source("src/components/Header.astro"),
    source("src/styles/global.css"),
    pngInfo("public/images/brand/logo-svetinje.png"),
  ]);

  assert.match(header, /href="\/" aria-label="Светиње — почетна страница"/);
  assert.match(header, /src="\/images\/brand\/logo-svetinje\.png"/);
  assert.match(header, /width="1000"/);
  assert.match(header, /height="321"/);
  assert.match(header, /alt="Светиње"/);
  assert.match(header, /loading="eager"/);
  assert.match(header, /fetchpriority="high"/);
  assert.doesNotMatch(header, /BrandMark|brand-mark|brand-lockup|brand-name|brand-domain/);
  assert.match(styles, /\.brand-image\s*\{[\s\S]*?object-fit: contain;/);
  assert.equal(logo.width, 1000);
  assert.equal(logo.height, 321);
  assert.equal(logo.colorType, 6, "logo PNG must preserve RGBA transparency");
  assert.ok(logo.asset.length < 600_000, `logo is ${logo.asset.length} bytes`);
});

test("approved map pins are optimized RGBA assets", async () => {
  const [monastery, church] = await Promise.all([
    pngInfo("public/images/map/pin-monastery.png"),
    pngInfo("public/images/map/pin-church.png"),
  ]);

  assert.deepEqual([monastery.width, monastery.height], [362, 512]);
  assert.deepEqual([church.width, church.height], [342, 512]);
  assert.equal(monastery.colorType, 6);
  assert.equal(church.colorType, 6);
  assert.ok(monastery.asset.length < 300_000, `pin-monastery.png is ${monastery.asset.length} bytes`);
  assert.ok(church.asset.length < 300_000, `pin-church.png is ${church.asset.length} bytes`);
});

test("desktop and mobile navigation expose the required Serbian guide sections", async () => {
  const header = await source("src/components/Header.astro");
  const navigation = header.match(/const navigation = \[[\s\S]*?\n\];/)?.[0] ?? "";
  const expectedItems = [
    ["/manastiri/", "Манастири"],
    ["/crkve/", "Цркве"],
    ["/sveta-mjesta/", "Света мјеста"],
    ["/#mapa", "Мапа"],
    ["/#rute", "Руте"],
    ["/o-projektu/", "О пројекту"],
  ];
  let previousIndex = -1;
  for (const [href, label] of expectedItems) {
    const index = navigation.indexOf(`{ href: "${href}", label: "${label}" }`);
    assert.ok(index > previousIndex, `${label} must follow the required navigation order`);
    previousIndex = index;
  }
  assert.doesNotMatch(navigation, /Почетна|href: "\/"/);
  assert.equal((header.match(/navigation\.map/g) ?? []).length, 2);
  assert.match(header, /<details class="mobile-navigation">/);
  assert.match(header, /aria-label="Отвори главни мени"/);
  assert.match(header, /Омиљене светиње — 0/);
  assert.match(header, /aria-label="Претрага светиња"/);
  assert.match(header, /\{ href: "\/manastiri\/", label: "Манастири" \}/);
  assert.match(header, /\{ href: "\/crkve\/", label: "Цркве" \}/);
  assert.match(header, /\{ href: "\/sveta-mjesta\/", label: "Света мјеста" \}/);
  assert.doesNotMatch(header, /\{ href: "\/svetinje\/", label: "Манастири" \}/);
  assert.doesNotMatch(header, /\{ href: "\/svetinje\/", label: "Цркве" \}/);
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
  assert.match(homepage, /import PopularRoutes/);
  assert.match(homepage, /<MapExplorer \/>/);
  assert.match(homepage, /<PopularRoutes \/>/);
  assert.doesNotMatch(homepage, /HomepagePreviews/);

  const [explorer, recommended, routes] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/RecommendedPlaces.astro"),
    source("src/components/PopularRoutes.astro"),
  ]);
  assert.match(explorer, /<MapCanvas places=\{places\} \/>/);
  assert.match(explorer, /<MapControls \/>/);
  assert.match(explorer, /<ExplorerSidebar places=\{places\} \/>/);
  assert.match(explorer, /<RecommendedPlaces places=\{places\} \/>/);
  assert.match(explorer, /data-testid="map-explorer"/);
  assert.match(recommended, /Препоручене светиње/);
  assert.match(recommended, /data-testid="recommended-places"/);
  assert.match(recommended, /RECOMMENDED_PLACE_IDS = \["saborni-hram-podgorica", "dajbabe"\]/);
  assert.match(recommended, /places\.find\(\(candidate\) => candidate\.id === id\)/);
  assert.match(recommended, /href=\{`\/svetinje\/\$\{place\.slug\}\/`\}/);
  assert.match(recommended, /data-testid="recommended-place-card"/);
  assert.match(recommended, /data-testid="recommended-placeholder"/);
  assert.match(recommended, /length: placeholderCount/);
  assert.match(recommended, /Радни приказ/);
  assert.match(recommended, /Отвори страницу/);
  assert.match(recommended, /place\.previewImageSrc/);
  assert.match(recommended, /class="place-preview__record-image"/);
  assert.match(recommended, /alt=\{place\.previewImageAlt \?\? place\.name\}/);
  assert.match(recommended, /place\.previewImageSrc/);
  assert.match(recommended, /class="place-preview__record-image"/);
  assert.match(recommended, /alt=\{place\.previewImageAlt \?\? place\.name\}/);
  assert.doesNotMatch(recommended, /podmaine|hero\.webp|https?:\/\//i);
  assert.doesNotMatch(recommended, /saborni-hram-bar|Саборни храм Светог Јована Владимира/);
  assert.match(routes, /Популарне руте/);
  assert.match(routes, /class="popular-routes"/);
});

test("catalogue pages share the established category mapping instead of duplicating it", async () => {
  const [catalogue, monasteries, churches, holyPlaces, general, filters] = await Promise.all([
    source("src/components/CategoryCatalogue.astro"),
    source("src/pages/manastiri/index.astro"),
    source("src/pages/crkve/index.astro"),
    source("src/pages/sveta-mjesta/index.astro"),
    source("src/pages/svetinje/index.astro"),
    source("src/lib/place-filters.ts"),
  ]);

  assert.match(catalogue, /categoryForPlaceType\(place\.placeType\) === category/);
  assert.match(catalogue, /loadVisiblePlaces/);
  assert.match(catalogue, /<PlaceCard place=\{place\} variant="catalogue" \/>/);
  assert.match(monasteries, /category="monasteries"/);
  assert.match(churches, /category="churches"/);
  assert.match(holyPlaces, /category="holy-places"/);
  assert.match(holyPlaces, /canonicalPath="\/sveta-mjesta\/"/);
  assert.match(holyPlaces, /Још нема светих мјеста спремних за јавно објављивање/);
  assert.doesNotMatch(general, /category=/);
  assert.match(filters, /skete: "monasteries"/);
  assert.match(filters, /hermitage: "monasteries"/);
  assert.match(filters, /chapel: "churches"/);
  assert.match(filters, /cathedral: "churches"/);
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
  assert.match(explorer, /querySelectorAll<HTMLButtonElement>\("button\[data-filter\]"\)/);
});

test("the required Serbian interface labels are present", async () => {
  const files = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/RecommendedPlaces.astro"),
    source("src/components/PopularRoutes.astro"),
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
  assert.match(css, /@layer reset, tokens, base, components, explorer, homepage, pages, editorial-preview, responsive;/);
});

test("the homepage introduction has no main photograph or empty media column", async () => {
  const homepage = await source("src/pages/index.astro");
  const styles = await source("src/styles/global.css");
  assert.doesNotMatch(homepage, /\/images\/home\/hero\.webp/);
  assert.doesNotMatch(homepage, /project-intro__media/);
  assert.match(homepage, /О водичу/);
  assert.match(homepage, /Уређивачко повјерење/);
  assert.doesNotMatch(styles, /\.project-intro__media/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1\.2fr\) minmax\(16rem, 0\.8fr\)/);
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
