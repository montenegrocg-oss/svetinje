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
  const [monastery, church, holyPlace] = await Promise.all([
    pngInfo("public/images/map/pin-monastery.png"),
    pngInfo("public/images/map/pin-church.png"),
    pngInfo("public/images/map/pin-holy-place.png"),
  ]);

  assert.deepEqual([monastery.width, monastery.height], [354, 473]);
  assert.deepEqual([church.width, church.height], [354, 480]);
  assert.deepEqual([holyPlace.width, holyPlace.height], [352, 497]);
  assert.equal(monastery.colorType, 6);
  assert.equal(church.colorType, 6);
  assert.equal(holyPlace.colorType, 6);
  assert.ok(monastery.asset.length < 350_000, `pin-monastery.png is ${monastery.asset.length} bytes`);
  assert.ok(church.asset.length < 350_000, `pin-church.png is ${church.asset.length} bytes`);
  assert.ok(holyPlace.asset.length < 350_000, `pin-holy-place.png is ${holyPlace.asset.length} bytes`);
});

test("desktop and mobile navigation expose the required Serbian guide sections", async () => {
  const header = await source("src/components/Header.astro");
  const navigation = header.match(/const navigation = \[[\s\S]*?\n\];/)?.[0] ?? "";
  const expectedItems = [
    ["/manastiri/", "Манастири"],
    ["/crkve/", "Цркве"],
    ["/sveta-mjesta/", "Света мјеста"],
    ["/mapa/", "Мапа"],
    ["/rute/", "Руте"],
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
  assert.match(homepage, /import PlaceAreas/);
  assert.match(homepage, /loadVisibleRoutes/);
  assert.match(homepage, /<MapExplorer places=\{places\} routes=\{routes\} \/>/);
  assert.match(homepage, /<PlaceAreas places=\{places\} \/>/);
  assert.doesNotMatch(homepage, /PopularRoutes/);
  assert.doesNotMatch(homepage, /HomepagePreviews/);

  const [explorer, sidebar, recommended, routes] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/RecommendedPlaces.astro"),
    source("src/components/PopularRoutes.astro"),
  ]);
  assert.match(explorer, /<MapCanvas places=\{places\} \/>/);
  assert.match(explorer, /<MapControls \/>/);
  assert.match(explorer, /const initialPlaces = places\.slice\(0, HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /const inventoryPlaces = places\.slice\(HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /<ExplorerSidebar places=\{initialPlaces\} totalPlaces=\{places\.length\} \/>/);
  assert.match(explorer, /<RecommendedPlaces places=\{places\} \/>/);
  assert.match(explorer, /import PopularRoutes from "\.\/PopularRoutes\.astro"/);
  assert.match(explorer, /<PopularRoutes routes=\{routes\} \/>/);
  assert.ok(
    explorer.indexOf("<ExplorerSidebar places={initialPlaces} totalPlaces={places.length} />") < explorer.indexOf("<RecommendedPlaces places={places} />")
      && explorer.indexOf("<RecommendedPlaces places={places} />") < explorer.indexOf("<PopularRoutes routes={routes} />"),
    "homepage preview, recommendations, and routes must retain their editorial order",
  );
  assert.doesNotMatch(explorer, /ExplorerContinuation|ExplorerPagination|data-continuation|data-explorer-pagination/);
  assert.match(sidebar, /data-homepage-pagination/);
  assert.match(sidebar, /data-homepage-pagination-prev/);
  assert.match(sidebar, /data-homepage-pagination-next/);
  assert.match(sidebar, /data-homepage-pagination-status/);
  assert.doesNotMatch(sidebar, /data-explorer-catalogue-link/);
  assert.match(explorer, /data-testid="map-explorer"/);
  assert.match(recommended, /Препоручене светиње/);
  assert.match(recommended, /data-testid="recommended-places"/);
  assert.match(recommended, /const TOTAL_RECOMMENDATION_SLOTS = 10/);
  assert.match(recommended, /RECOMMENDED_PLACE_IDS = \["saborni-hram-podgorica", "dajbabe"\]/);
  assert.match(recommended, /places\.find\(\(candidate\) => candidate\.id === id\)/);
  assert.match(recommended, /TOTAL_RECOMMENDATION_SLOTS - recommendations\.length/);
  assert.match(recommended, /String\(number\)\.padStart\(2, "0"\)/);
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
  assert.match(routes, /class="popular-routes map-explorer__routes"/);
  assert.match(routes, /data-testid="popular-routes"/);
  assert.match(routes, /class="popular-routes__inner"/);
  assert.doesNotMatch(routes, /class="shell popular-routes__inner"/);
});

test("the dedicated map route reuses the shared map without homepage-only UI", async () => {
  const [page, dedicatedMap, canvas, controls, header, outputModel, styles] = await Promise.all([
    source("src/pages/mapa/index.astro"),
    source("src/components/DedicatedMap.astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/Header.astro"),
    source("scripts/lib/output-expectations.mjs"),
    source("src/styles/global.css"),
  ]);

  assert.match(page, /loadVisiblePlaces/);
  assert.match(page, /<DedicatedMap places=\{places\} \/>/);
  assert.match(page, /canonicalPath="\/mapa\/"/);
  assert.doesNotMatch(page, /MapExplorer|ExplorerSidebar|RecommendedPlaces|PopularRoutes|PlaceAreas/);
  assert.match(dedicatedMap, /<MapCanvas places=\{places\} layout="full" \/>/);
  assert.match(dedicatedMap, /<MapControls variant="map-page" \/>/);
  assert.match(canvas, /data-map-layout=\{layout\}/);
  assert.match(canvas, /if \(layout === "full"\)/);
  assert.match(controls, /variant === "homepage"/);
  assert.match(controls, /map-tool-stack--page/);
  assert.match(header, /\{ href: "\/mapa\/", label: "Мапа" \}/);
  assert.doesNotMatch(header, /\{ href: "\/#mapa", label: "Мапа" \}/);
  assert.match(outputModel, /"mapa\/index\.html"/);
  assert.match(styles, /\.dedicated-map-page__stage\s*\{[\s\S]*?100dvh/);
});

test("the homepage sidebar overlays the map without pulling secondary content upward", async () => {
  const styles = await source("src/styles/global.css");
  const desktopStart = styles.indexOf("@media (min-width: 48rem)");
  const desktopStyles = styles.slice(desktopStart);

  assert.ok(desktopStart > -1, "the explorer overlay must start at the tablet breakpoint");
  assert.match(styles, /\.map-explorer\s*\{[\s\S]*?--map-stage-height: 24rem;[\s\S]*?--explorer-content-block-padding: 1rem;/);
  assert.match(styles, /\.map-stage\s*\{[\s\S]*?height: var\(--map-stage-height\);/);
  assert.match(desktopStyles, /--map-stage-height: 34rem;/);
  assert.match(desktopStyles, /--explorer-sidebar-map-offset: 10\.875rem;/);
  assert.match(
    desktopStyles,
    /\.explorer-sidebar\s*\{[\s\S]*?margin-block-start: calc\([\s\S]*?var\(--explorer-sidebar-map-offset\)[\s\S]*?- var\(--map-stage-height\)[\s\S]*?- var\(--explorer-content-block-padding\)[\s\S]*?\);/,
  );
  assert.match(desktopStyles, /\.map-explorer__content\s*\{[\s\S]*?padding: var\(--explorer-content-block-padding\) var\(--explorer-panel-left\);/);
  assert.match(desktopStyles, /\.map-attribution\s*\{[\s\S]*?left: calc\(var\(--explorer-panel-left\) \+ var\(--explorer-panel-width\) \+ 1rem\);/);
  assert.match(desktopStyles, /\.map-actions\s*\{[\s\S]*?left: calc\(var\(--explorer-panel-left\) \+ var\(--explorer-panel-width\) \+ 1rem\);/);
  assert.match(desktopStyles, /--explorer-panel-left: max\([\s\S]*?clamp\(1\.5rem, 2\.25vw, 2rem\),[\s\S]*?calc\(\(100vw - 104rem\) \/ 2\)[\s\S]*?\);/);
  assert.match(desktopStyles, /\.map-actions\s*\{[\s\S]*?right: var\(--explorer-panel-left\);/);
  assert.match(desktopStyles, /\.map-tool-stack,[\s\S]*?\.map-help\s*\{[\s\S]*?right: var\(--explorer-panel-left\);/);
  assert.doesNotMatch(desktopStyles.match(/\.explorer-sidebar\s*\{[\s\S]*?\}/)?.[0] ?? "", /transform:/);
});

test("the map loading surface is neutral and cannot reveal the decorative fallback", async () => {
  const styles = await source("src/styles/global.css");

  assert.match(styles, /\.map-loading-surface\s*\{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?background:/);
  assert.match(styles, /\.map-canvas\[data-map-state="loading"\] \.map-fallback,[\s\S]*?\.map-canvas\[data-map-state="ready"\] \.map-fallback/);
  assert.match(styles, /\.map-canvas\[data-map-state="ready"\] \.map-loading-surface/);
  assert.match(styles, /\.map-canvas\[data-map-state="fallback"\] \.map-renderer,[\s\S]*?\.map-canvas\[data-map-state="fallback"\] \.map-loading-surface/);
  assert.doesNotMatch(styles, /map-loading-surface[\s\S]{0,180}animation:/);
});

test("catalogue pages share category mapping, featured selection, filters, and eight-card pagination", async () => {
  const [catalogue, card, pagination, paginationModel, featuredModel, areas, monasteries, churches, holyPlaces, general, filters] = await Promise.all([
    source("src/components/CategoryCatalogue.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/components/ExplorerPagination.astro"),
    source("src/lib/explorer-pagination.ts"),
    source("src/lib/category-catalogue.ts"),
    source("src/lib/place-areas.ts"),
    source("src/pages/manastiri/index.astro"),
    source("src/pages/crkve/index.astro"),
    source("src/pages/sveta-mjesta/index.astro"),
    source("src/pages/svetinje/index.astro"),
    source("src/lib/place-filters.ts"),
  ]);

  assert.match(catalogue, /categoryForPlaceType\(place\.placeType\) === category/);
  assert.match(catalogue, /loadVisiblePlaces/);
  assert.match(catalogue, /PLACE_AREAS\.filter/);
  assert.match(catalogue, /selectFeaturedCataloguePlaces\(places\)/);
  assert.match(catalogue, /<PlaceCard place=\{place\} variant="featured" \/>/);
  assert.match(catalogue, /<PlaceCard place=\{place\} variant="catalogue" \/>/);
  assert.match(catalogue, /data-catalogue-featured-item/);
  assert.match(catalogue, /data-catalogue-item/);
  assert.match(catalogue, /<ExplorerPagination totalPlaces=\{cataloguePlaces\.length\} \/>/);
  assert.match(catalogue, /data-catalogue-search/);
  assert.match(catalogue, /data-catalogue-area/);
  assert.match(catalogue, /href="\/mapa\/"/);
  assert.match(catalogue, /data-catalogue-reset/);
  assert.match(catalogue, /matchedItems\.forEach\(\(item, index\)/);
  assert.match(catalogue, /item\.hidden = index < pageStart \|\| index >= pageEnd/);
  assert.match(catalogue, /const matchedTotal = matchedFeaturedItems\.length \+ matchedItems\.length/);
  assert.match(catalogue, /currentPage = 1;[\s\S]*?renderPage\(1\)/);
  assert.match(card, /place\.previewImageSrc && variant !== "catalogue"/);
  assert.match(pagination, /data-catalogue-pagination/);
  assert.match(pagination, /data-pagination-previous/);
  assert.match(pagination, /data-pagination-next/);
  assert.match(paginationModel, /export const PLACES_PER_PAGE = 8/);
  assert.match(paginationModel, /pagePlaces/);
  assert.match(featuredModel, /FEATURED_CATALOGUE_LIMIT = 2/);
  assert.match(featuredModel, /filter\(\(place\) => Boolean\(place\.previewImageSrc\)\)/);
  assert.match(areas, /Будва и Паштровићи/);
  assert.doesNotMatch(paginationModel, /primaryPlaces|continuationPlaces|CONTINUATION/);
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

test("the homepage replaces its news feed with shared geographic-area navigation", async () => {
  const [homepage, areas] = await Promise.all([
    source("src/pages/index.astro"),
    source("src/components/PlaceAreas.astro"),
  ]);
  const styles = await source("src/styles/global.css");
  assert.doesNotMatch(homepage, /\/images\/home\/hero\.webp/);
  assert.doesNotMatch(homepage, /project-intro|trust-note|О водичу|Уређивачко повјерење|Провјерено прије објаве/);
  assert.doesNotMatch(homepage, /loadVisibleNews|selectLatestNews|NewsFeed|homepage-news/);
  assert.match(homepage, /<PlaceAreas places=\{places\} \/>/);
  assert.match(areas, /PLACE_AREAS\.map/);
  assert.match(areas, /ИСТРАЖИТЕ/);
  assert.match(areas, /По областима/);
  assert.match(areas, /class="shell homepage-wide-shell homepage-areas__inner"/);
  assert.match(areas, /\?area=\$\{area\.id\}#mapa/);
  assert.match(areas, /area\.count > 0/);
  assert.match(styles, /\.homepage-wide-shell\s*\{[\s\S]*?width: min\(calc\(100% - clamp\(3rem, 4\.5vw, 4rem\)\), 104rem\);/);
  assert.match(styles, /\.homepage-areas\s*\{[\s\S]*?padding-block: clamp\(2\.5rem, 3\.6vw, 3\.5rem\) clamp\(3rem, 4vw, 4rem\);/);
  assert.doesNotMatch(styles, /\.project-intro|\.trust-note/);
  assert.doesNotMatch(styles, /\.homepage-news/);
  assert.match(styles, /\.homepage-areas__list a:focus-visible/);
  assert.match(styles, /\.news-feed-item__link:focus-visible/);
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
