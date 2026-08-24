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

  assert.match(header, /href=\{routeFor\(locale, "home"\)\}/);
  assert.match(header, /aria-label=\{`\$\{copy\.siteName\}/);
  assert.match(header, /src="\/images\/brand\/logo-svetinje\.png"/);
  assert.match(header, /width="1000"/);
  assert.match(header, /height="321"/);
  assert.match(header, /alt=\{copy\.siteName\}/);
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
  const [header, styles] = await Promise.all([
    source("src/components/Header.astro"),
    source("src/styles/global.css"),
  ]);
  const navigation = header.match(/const navigation = \[[\s\S]*?\n\];/)?.[0] ?? "";
  const expectedItems = [
    ["monasteries", "monasteries"], ["churches", "churches"], ["map", "map"], ["routes", "routes"],
    ["calendar", "calendar"], ["news", "news"], ["about", "about"],
  ];
  let previousIndex = -1;
  for (const [route, label] of expectedItems) {
    const index = navigation.indexOf(`{ href: routeFor(locale, "${route}"), label: copy.nav.${label} }`);
    assert.ok(index > previousIndex, `${label} must follow the required navigation order`);
    previousIndex = index;
  }
  assert.doesNotMatch(navigation, /Почетна|href: "\/"/);
  assert.equal((header.match(/navigation\.map/g) ?? []).length, 2);
  assert.match(header, /<details class="mobile-navigation">/);
  assert.match(header, /aria-label=\{copy\.openMenu\}/);
  assert.match(header, /Омиљене светиње — 0/);
  assert.doesNotMatch(header, /header-search|aria-label="Претрага светиња"|> Претрага</);
  assert.match(header, /routeFor\(locale, "monasteries"\)/);
  assert.match(header, /routeFor\(locale, "churches"\)/);
  assert.doesNotMatch(header, /\/sveta-mjesta\/|Света мјеста/);
  assert.doesNotMatch(header, /\{ href: "\/svetinje\/", label: "Манастири" \}/);
  assert.doesNotMatch(header, /\{ href: "\/svetinje\/", label: "Цркве" \}/);
  assert.match(header, /const monasteryNavigation = \[[\s\S]*?maleMonasteries[\s\S]*?femaleMonasteries/);
  assert.match(header, /const mobileMonasteryNavigation = \[[\s\S]*?allMonasteries[\s\S]*?\.\.\.monasteryNavigation/);
  assert.match(header, /<li class="desktop-navigation__submenu-item">[\s\S]*?href=\{item\.href\}[\s\S]*?aria-current=\{isExactPage\(item\.href\) \? "page" : undefined\}[\s\S]*?data-section-active=\{isMonasteryActive \? "true" : undefined\}[\s\S]*?desktop-navigation__submenu/);
  assert.match(header, /monasteryNavigation\.map[\s\S]*?aria-current=\{isExactPage\(subcategory\.href\) \? "page" : undefined\}/);
  assert.match(header, /<details class="mobile-navigation__submenu" open=\{isMonasteryActive\}>[\s\S]*?<summary data-section-active=\{isMonasteryActive \? "true" : undefined\}>\{copy\.nav\.monasteries\}<\/summary>/);
  assert.doesNotMatch(header, /<summary[^>]*aria-current/);
  assert.match(header, /mobileMonasteryNavigation\.map[\s\S]*?aria-current=\{isExactPage\(subcategory\.href\) \? "page" : undefined\}/);
  assert.doesNotMatch(header, /<script>|addEventListener/);
  assert.match(styles, /\.desktop-navigation__submenu-item:hover > \.desktop-navigation__submenu,[\s\S]*?\.desktop-navigation__submenu-item:focus-within > \.desktop-navigation__submenu/);
  assert.match(styles, /\.desktop-navigation__submenu\s*\{[\s\S]*?position: absolute;[\s\S]*?z-index: 95;[\s\S]*?top: calc\(100% - 0\.2rem\);/);
  assert.match(styles, /\.primary-navigation a\[data-section-active="true"\]::after/);
  assert.match(styles, /\.primary-navigation \.desktop-navigation__submenu a\[aria-current="page"\][\s\S]*?background: var\(--paper\);/);
  assert.match(styles, /\.mobile-navigation__submenu > summary\s*\{[\s\S]*?min-height: 2\.85rem;/);
  assert.match(styles, /\.mobile-navigation__submenu > summary\[data-section-active="true"\][\s\S]*?color: var\(--gold\);/);
  assert.match(styles, /\.mobile-navigation-panel nav \.mobile-navigation__submenu a\s*\{[\s\S]*?min-height: 2\.75rem;[\s\S]*?padding-left: 0\.65rem;/);
});

test("language switcher links only actual equivalent destinations", async () => {
  const languages = await source("src/components/LanguageSwitcher.astro");
  assert.match(languages, /class="language-unavailable"/);
  assert.match(languages, /aria-disabled="true"/);
  assert.match(languages, /config\.available && destinations\[locale\]/);
  assert.match(languages, /href=\{destinations\[locale\]\}/);
});

test("the homepage is composed from reusable map-explorer components", async () => {
  const [homepage, srPage, ruPage, enPage, selection] = await Promise.all([
    source("src/components/HomePage.astro"),
    source("src/pages/index.astro"),
    source("src/pages/ru/index.astro"),
    source("src/pages/en/index.astro"),
    source("src/lib/homepage-selections.ts"),
  ]);
  assert.match(homepage, /import MapExplorer/);
  assert.match(homepage, /import PlaceAreas/);
  assert.match(homepage, /loadVisibleRoutes/);
  assert.match(homepage, /<MapExplorer places=\{places\} routes=\{routes\} calendarDays=\{calendarDays\} locale=\{locale\} \/>/);
  assert.match(homepage, /<PlaceAreas places=\{places\} locale=\{locale\} \/>/);
  assert.match(srPage, /<HomePage locale="sr" \/>/);
  assert.match(ruPage, /<HomePage locale="ru" \/>/);
  assert.match(enPage, /<HomePage locale="en" \/>/);
  assert.doesNotMatch(homepage, /PopularRoutes/);
  assert.doesNotMatch(homepage, /HomepagePreviews/);

  const [explorer, sidebar, homepagePagination, recommended, routes, copy, styles] = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/HomepagePagination.astro"),
    source("src/components/RecommendedPlaces.astro"),
    source("src/components/PopularRoutes.astro"),
    source("src/i18n/public-copy.ts"),
    source("src/styles/global.css"),
  ]);
  assert.match(explorer, /<MapCanvas places=\{discoveryPlaces\} locale=\{locale\} \/>/);
  assert.match(explorer, /<MapControls locale=\{locale\} \/>/);
  assert.match(explorer, /const discoveryPlaces = selectPublicDiscoveryPlaces\(places\)/);
  assert.match(explorer, /const initialPlaces = discoveryPlaces\.slice\(0, HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /const inventoryPlaces = discoveryPlaces\.slice\(HOMEPAGE_PREVIEW_LIMIT\)/);
  assert.match(explorer, /<ExplorerSidebar places=\{initialPlaces\} totalPlaces=\{discoveryPlaces\.length\} locale=\{locale\} \/>/);
  assert.match(explorer, /<RecommendedPlaces places=\{discoveryPlaces\} locale=\{locale\} \/>/);
  assert.match(explorer, /<TodayCalendar days=\{calendarDays\} locale=\{locale\} \/>/);
  assert.match(explorer, /import PopularRoutes from "\.\/PopularRoutes\.astro"/);
  assert.match(explorer, /<PopularRoutes routes=\{routes\} locale=\{locale\} \/>/);
  assert.ok(
    explorer.indexOf("<ExplorerSidebar places={initialPlaces} totalPlaces={discoveryPlaces.length} locale={locale} />") < explorer.indexOf("<RecommendedPlaces places={discoveryPlaces} locale={locale} />")
      && explorer.indexOf("<RecommendedPlaces places={discoveryPlaces} locale={locale} />") < explorer.indexOf("<TodayCalendar days={calendarDays} locale={locale} />")
      && explorer.indexOf("<TodayCalendar days={calendarDays} locale={locale} />") < explorer.indexOf("<PopularRoutes routes={routes} locale={locale} />"),
    "homepage preview, recommendations, Today, and routes must retain their editorial order",
  );
  assert.doesNotMatch(explorer, /ExplorerContinuation|ExplorerPagination|data-continuation|data-explorer-pagination/);
  assert.equal([...sidebar.matchAll(/<HomepagePagination totalPages=\{totalPages\} position="(top|bottom)" locale=\{locale\} \/>/g)].length, 2);
  assert.match(sidebar, /<form class="explorer-search"[\s\S]*?<InterfaceIcon name="search" size=\{20\} \/>[\s\S]*?<input[\s\S]*?type="search"/);
  assert.doesNotMatch(sidebar, /class="icon-button"|name="filter"|filterSettings(?:Label|Title)/);
  assert.doesNotMatch(copy, /filterSettings(?:Label|Title)/);
  assert.match(styles, /\.explorer-search\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(homepagePagination, /data-homepage-pagination/);
  assert.match(homepagePagination, /data-homepage-pagination-prev/);
  assert.match(homepagePagination, /data-homepage-pagination-next/);
  assert.match(homepagePagination, /data-homepage-pagination-status/);
  assert.doesNotMatch(sidebar, /data-explorer-catalogue-link/);
  assert.match(explorer, /data-testid="map-explorer"/);
  assert.match(recommended, /publicCopy\[locale\]\.homepage\.recommended/);
  assert.match(recommended, /\{copy\.title\}/);
  assert.match(recommended, /data-testid="recommended-places"/);
  assert.match(recommended, /MOST_VISITED_PLACE_IDS/);
  const selectedIds = [...selection.matchAll(/^\s*"([a-z0-9-]+)",?$/gm)].map((match) => match[1]);
  assert.deepEqual(selectedIds, ["manastir-ostrog", "cetinjski-manastir", "manastir-moraca", "dajbabe", "saborni-hram-podgorica"]);
  assert.match(recommended, /places\.find\(\(candidate\) => candidate\.id === id\)/);
  assert.match(recommended, /href=\{`\$\{placeDetailRoot\[locale\]\}\$\{place\.slug\}\/`\}/);
  assert.match(recommended, /data-testid="recommended-place-card"/);
  assert.doesNotMatch(recommended, /recommended-placeholder|placeholderCount|TOTAL_RECOMMENDATION_SLOTS/);
  assert.doesNotMatch(recommended, /Радни приказ|preview-badge/);
  assert.doesNotMatch(recommended, /place\.typeLabel|place-preview__record-meta|Отвори страницу|place-preview__record-action/);
  assert.match(recommended, /<a class="place-preview__record-link" href=\{`\$\{placeDetailRoot\[locale\]\}\$\{place\.slug\}\/`\}>[\s\S]*?<h3>\{place\.name\}<\/h3>[\s\S]*?\{location && <small>\{location\}<\/small>\}[\s\S]*?<\/a>/);
  assert.match(recommended, /place\.previewImageSrc/);
  assert.match(recommended, /class="place-preview__record-image"/);
  assert.match(recommended, /alt=\{place\.previewImageAlt \?\? place\.name\}/);
  assert.match(recommended, /place\.previewImageSrc/);
  assert.match(recommended, /class="place-preview__record-image"/);
  assert.match(recommended, /alt=\{place\.previewImageAlt \?\? place\.name\}/);
  assert.doesNotMatch(recommended, /podmaine|hero\.webp|https?:\/\//i);
  assert.doesNotMatch(recommended, /saborni-hram-bar|Саборни храм Светог Јована Владимира/);
  assert.match(routes, /publicCopy\[locale\]\.homepage\.routes/);
  assert.match(routes, /<h2 id="routes-title">\{copy\.title\}<\/h2>/);
  assert.match(routes, /class="popular-routes map-explorer__routes"/);
  assert.match(routes, /data-testid="popular-routes"/);
  assert.match(routes, /class="popular-routes__inner"/);
  assert.doesNotMatch(routes, /class="shell popular-routes__inner"/);
});

test("the dedicated map route reuses the shared map without homepage-only UI", async () => {
  const [page, mapPage, dedicatedMap, canvas, controls, header, outputModel, styles] = await Promise.all([
    source("src/pages/mapa/index.astro"),
    source("src/components/MapPage.astro"),
    source("src/components/DedicatedMap.astro"),
    source("src/components/MapCanvas.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/Header.astro"),
    source("scripts/lib/output-expectations.mjs"),
    source("src/styles/global.css"),
  ]);

  assert.match(page, /loadVisiblePlaces/);
  assert.match(page, /<MapPage places=\{places\} locale="sr" \/>/);
  assert.match(mapPage, /selectPublicDiscoveryPlaces\(places\)/);
  assert.match(mapPage, /<DedicatedMap places=\{discoveryPlaces\} locale=\{locale\} \/>/);
  assert.match(mapPage, /canonicalPath=\{routeFor\(locale, "map"\)\}/);
  assert.doesNotMatch(page, /MapExplorer|ExplorerSidebar|RecommendedPlaces|PopularRoutes|PlaceAreas/);
  assert.match(dedicatedMap, /<MapCanvas places=\{places\} layout="full" locale=\{locale\} \/>/);
  assert.match(dedicatedMap, /<MapControls variant="map-page" locale=\{locale\} \/>/);
  assert.match(canvas, /data-map-layout=\{layout\}/);
  assert.match(canvas, /if \(layout === "full"\)/);
  assert.match(controls, /variant === "homepage"/);
  assert.match(controls, /map-tool-stack--page/);
  assert.match(header, /routeFor\(locale, "map"\), label: copy\.nav\.map/);
  assert.doesNotMatch(header, /\{ href: "\/#mapa", label: "Мапа" \}/);
  assert.match(outputModel, /"mapa\/index\.html"/);
  assert.match(styles, /\.dedicated-map-page__stage\s*\{[\s\S]*?100dvh/);
});

test("the homepage grid keeps the sidebar below its heading while secondary content follows the map", async () => {
  const styles = await source("src/styles/global.css");
  const desktopStart = styles.lastIndexOf("@media (min-width: 68rem)", styles.indexOf("@media (min-width: 90rem)"));
  const desktopStyles = styles.slice(desktopStart);

  assert.ok(desktopStart > -1, "the explorer grid must start at the desktop breakpoint");
  assert.match(styles, /\.map-explorer\s*\{[\s\S]*?--map-stage-height: 24rem;[\s\S]*?--explorer-content-block-padding: 0\.75rem;/);
  assert.match(styles, /\.map-stage\s*\{[\s\S]*?height: var\(--map-stage-height\);/);
  assert.match(desktopStyles, /--map-stage-height: 39\.5rem;/);
  assert.match(desktopStyles, /\.map-explorer\s*\{[\s\S]*?display: grid;[\s\S]*?grid-template-rows: auto 1\.125rem minmax\(0, 1fr\) auto;/);
  assert.match(desktopStyles, /\.map-stage\s*\{[\s\S]*?grid-row: 1 \/ 4;/);
  assert.match(desktopStyles, /\.map-explorer__heading\s*\{[\s\S]*?grid-row: 1;[\s\S]*?margin-top: 1rem;/);
  assert.match(desktopStyles, /\.map-explorer__content\s*\{[\s\S]*?display: contents;/);
  assert.match(desktopStyles, /\.explorer-sidebar\s*\{[\s\S]*?grid-row: 3 \/ 5;/);
  assert.match(desktopStyles, /\.map-explorer__secondary\s*\{[\s\S]*?grid-row: 1 \/ -1;[\s\S]*?grid-template-rows: var\(--map-stage-height\) auto;[\s\S]*?row-gap: 1\.25rem;/);
  assert.match(desktopStyles, /\.map-explorer__secondary-content\s*\{[\s\S]*?grid-row: 2;/);
  assert.match(desktopStyles, /\.map-attribution\s*\{[\s\S]*?left: calc\(var\(--explorer-panel-left\) \+ var\(--explorer-panel-width\) \+ 1rem\);/);
  assert.match(desktopStyles, /\.map-actions\s*\{[\s\S]*?left: calc\(var\(--explorer-panel-left\) \+ var\(--explorer-panel-width\) \+ 1rem\);/);
  assert.match(desktopStyles, /--explorer-panel-left: max\([\s\S]*?clamp\(1\.5rem, 2\.25vw, 2rem\),[\s\S]*?calc\(\(100vw - 104rem\) \/ 2\)[\s\S]*?\);/);
  assert.match(desktopStyles, /\.map-actions\s*\{[\s\S]*?right: var\(--explorer-panel-left\);/);
  assert.match(desktopStyles, /\.map-tool-stack,[\s\S]*?\.map-help\s*\{[\s\S]*?right: var\(--explorer-panel-left\);/);
  assert.doesNotMatch(styles, /--explorer-sidebar-map-offset|\.explorer-sidebar\s*\{[\s\S]*?margin-block-start:/);
  assert.doesNotMatch(desktopStyles, /\.map-explorer__secondary\s*\{[^}]*?(?:grid-row: 4|padding-top:)/);
  assert.doesNotMatch(styles, /\.map-explorer__secondary(?:-content)?\s*\{[^}]*?(?:margin-(?:top|block-start):\s*-|transform:)/);
});

test("the map loading surface is neutral and cannot reveal the decorative fallback", async () => {
  const styles = await source("src/styles/global.css");

  assert.match(styles, /\.map-loading-surface\s*\{[\s\S]*?position: absolute;[\s\S]*?inset: 0;[\s\S]*?background:/);
  assert.match(styles, /\.map-canvas\[data-map-state="loading"\] \.map-fallback,[\s\S]*?\.map-canvas\[data-map-state="ready"\] \.map-fallback/);
  assert.match(styles, /\.map-canvas\[data-map-state="ready"\] \.map-loading-surface/);
  assert.match(styles, /\.map-canvas\[data-map-state="fallback"\] \.map-renderer,[\s\S]*?\.map-canvas\[data-map-state="fallback"\] \.map-loading-surface/);
  assert.doesNotMatch(styles, /map-loading-surface[\s\S]{0,180}animation:/);
});

test("public catalogue pages share discovery policy, category mapping, filters, and pagination", async () => {
  const [cataloguePage, catalogue, toolbar, card, pagination, paginationModel, featuredModel, areas, monasteries, churches, general, filters, discovery, detailHero, styles, outputVerifier, copy] = await Promise.all([
    source("src/components/CataloguePage.astro"),
    source("src/components/CategoryCatalogue.astro"),
    source("src/components/CatalogueToolbar.astro"),
    source("src/components/PlaceCard.astro"),
    source("src/components/ExplorerPagination.astro"),
    source("src/lib/explorer-pagination.ts"),
    source("src/lib/category-catalogue.ts"),
    source("src/lib/place-areas.ts"),
    source("src/pages/manastiri/index.astro"),
    source("src/pages/crkve/index.astro"),
    source("src/pages/svetinje/index.astro"),
    source("src/lib/place-filters.ts"),
    source("src/lib/public-place-discovery.ts"),
    source("src/components/place-detail/PlaceDetailHero.astro"),
    source("src/styles/global.css"),
    source("scripts/verify-production-output.mjs"),
    source("src/i18n/public-copy.ts"),
  ]);
  const [maleMonasteries, femaleMonasteries] = await Promise.all([
    source("src/pages/manastiri/muski/index.astro"),
    source("src/pages/manastiri/zenski/index.astro"),
  ]);

  assert.match(catalogue, /categoryForPlaceType\(place\.placeType\) === category/);
  assert.match(catalogue, /loadVisiblePlaces/);
  assert.match(catalogue, /selectPublicDiscoveryPlaces\(suppliedPlaces \?\? await loadVisiblePlaces\(\)\)/);
  assert.match(catalogue, /const categoryPlaces = category[\s\S]*?const places = category === "monasteries"[\s\S]*?selectMonasticCommunityPlaces\(categoryPlaces, monasticCommunity\)/);
  assert.ok(catalogue.indexOf("selectMonasticCommunityPlaces(categoryPlaces, monasticCommunity)") < catalogue.indexOf("const relevantAreaIds"));
  assert.match(catalogue, /data-monastic-community=\{monasticCommunity\}/);
  assert.match(catalogue, /PLACE_AREAS\.filter/);
  assert.match(catalogue, /selectFeaturedCataloguePlaces\(places\)/);
  assert.match(catalogue, /const usesSidebarCatalogue = category === "monasteries" \|\| category === "churches"/);
  assert.match(catalogue, /const featuredPlaces = usesSidebarCatalogue \? \[\] : selectFeaturedCataloguePlaces\(places\)/);
  assert.match(catalogue, /!usesSidebarCatalogue && featuredPlaces\.length > 0/);
  assert.doesNotMatch(catalogue, /\{usesSidebarCatalogue && featuredPlaces\.length > 0/);
  assert.doesNotMatch(catalogue, /catalogue-main__featured|category-page-hero--catalogue|category-page-hero__layout/);
  assert.match(catalogue, /<header class="page-hero compact category-page-hero">[\s\S]*?<div class="shell narrow">/);
  assert.match(styles, /\.page-hero\.category-page-hero\s*\{[\s\S]*?padding-block: clamp\(1\.25rem, 2\.4vw, 1\.5rem\);/);
  assert.equal([...catalogue.matchAll(/<h1>/g)].length, 1);
  assert.match(catalogue, /<h1>\{heading\}<\/h1>/);
  assert.match(catalogue, /<aside class="catalogue-sidebar"[\s\S]*?<CatalogueToolbar searchPlaceholder=\{copy\.searchPlaceholder\} areas=\{relevantAreas\} locale=\{locale\} \/>[\s\S]*?<section class="catalogue-main"/);
  assert.match(catalogue, /statusPrefix: "Пронађено је"/);
  assert.match(catalogue, /searchPlaceholder: "Претражите цркве…", statusPrefix: "Пронађено је", statusNoun: "цркава"/);
  assert.match(catalogue, /<section class="catalogue-main"[\s\S]*?<div class="catalogue-section-heading">\s*<h2 id="catalogue-main-title">\{copy\.allHeading\}<\/h2>/);
  assert.doesNotMatch(catalogue, /<section class="catalogue-main"[\s\S]*?<div class="catalogue-section-heading">\s*<p class="eyebrow">/);
  assert.match(catalogue, /<PlaceCard place=\{place\} variant="featured" locale=\{locale\} \/>/);
  assert.match(catalogue, /<PlaceCard place=\{place\} variant="catalogue" locale=\{locale\} \/>/);
  assert.match(catalogue, /data-catalogue-featured-item/);
  assert.match(catalogue, /data-catalogue-item/);
  assert.match(catalogue, /<ExplorerPagination totalPlaces=\{cataloguePlaces\.length\} locale=\{locale\} \/>/);
  assert.match(toolbar, /data-catalogue-search/);
  assert.match(toolbar, /data-catalogue-area/);
  assert.match(toolbar, /href=\{routeFor\(locale, "map"\)\}/);
  assert.match(toolbar, /data-catalogue-reset hidden disabled/);
  assert.match(catalogue, /matchedItems\.forEach\(\(item, index\)/);
  assert.match(catalogue, /item\.hidden = index < pageStart \|\| index >= pageEnd/);
  assert.match(catalogue, /const matchedTotal = matchedFeaturedItems\.length \+ matchedItems\.length/);
  assert.match(catalogue, /resultStatus\.textContent = `\$\{statusPrefix\} \$\{matchedTotal\} \$\{statusNoun\}`/);
  assert.match(catalogue, /currentPage = 1;[\s\S]*?renderPage\(1\)/);
  assert.match(card, /place\.previewImageSrc && variant !== "catalogue"/);
  assert.match(styles, /\.category-catalogue__body--sidebar\s*\{[\s\S]*?display: grid;[\s\S]*?gap: 1rem;/);
  assert.match(styles, /@media \(min-width: 68rem\)[\s\S]*?\.category-catalogue__body--sidebar\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) clamp\(18rem, 25vw, 22rem\);/);
  assert.match(styles, /\.catalogue-sidebar\s*\{[\s\S]*?position: sticky;[\s\S]*?top: 6\.25rem;/);
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;/);
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar__search,[\s\S]*?\.catalogue-sidebar \.catalogue-toolbar__area,[\s\S]*?\.catalogue-sidebar \.catalogue-toolbar__actions\s*\{[\s\S]*?width: 100%;/);
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar__actions\s*\{[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch;/);
  assert.match(styles, /\.catalogue-sidebar \.catalogue-toolbar__actions a,[\s\S]*?\.catalogue-sidebar \.catalogue-toolbar__actions button\s*\{[\s\S]*?width: 100%;[\s\S]*?justify-content: flex-start;/);
  assert.doesNotMatch(styles, /\.catalogue-sidebar \.catalogue-toolbar\s*\{[^}]*grid-template-columns:/);
  assert.match(styles, /@media \(min-width: 48rem\)[\s\S]*?\.catalogue-toolbar\s*\{[\s\S]*?grid-template-columns: minmax\(16rem, 1\.35fr\) minmax\(12rem, 0\.8fr\);/);
  assert.match(outputVerifier, /const useFeaturedTier = category !== "monasteries" && category !== "churches"/);
  assert.match(outputVerifier, /verifyCataloguePagination\(page, members, `\$\{category\} catalogue`, failures, useFeaturedTier\)/);
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
  assert.match(monasteries, /<CataloguePage locale="sr" page="monasteries" category="monasteries" \/>/);
  assert.match(maleMonasteries, /<CataloguePage locale="sr" page="maleMonasteries" category="monasteries" monasticCommunity="male"/);
  assert.match(femaleMonasteries, /<CataloguePage locale="sr" page="femaleMonasteries" category="monasteries" monasticCommunity="female"/);
  assert.match(cataloguePage, /publicCopy\[locale\]\.pages\.catalogues\[page\]/);
  assert.match(cataloguePage, /canonicalPath=\{routeFor\(locale, page\)\}/);
  assert.match(cataloguePage, /<CategoryCatalogue[\s\S]*?heading=\{copy\.title\}[\s\S]*?category=\{category\}[\s\S]*?catalogueHeading=\{copy\.listTitle\}[\s\S]*?monasticCommunity=\{monasticCommunity\}/);
  assert.match(copy, /monasteries: \{ title: "Манастири", listTitle: "Сви манастири"/);
  assert.match(copy, /churches: \{ title: "Цркве", listTitle: "Све цркве"/);
  assert.match(copy, /maleMonasteries: \{ title: "Мушки манастири", listTitle: "Мушки манастири"[\s\S]*?empty: "Још нема мушких манастира спремних за приказ\."/);
  assert.match(copy, /femaleMonasteries: \{ title: "Женски манастири", listTitle: "Женски манастири"[\s\S]*?empty: "Још нема женских манастира спремних за приказ\."/);
  assert.match(outputVerifier, /MONASTERY_SUBCATEGORY_HTML_ROUTES/);
  assert.match(outputVerifier, /model\.monasteryCommunityMembership\[community\]/);
  assert.match(outputVerifier, /verifyCataloguePagination\(page, members, `\$\{community\} monastery catalogue`, failures, false\)/);
  assert.match(churches, /category="churches"/);
  await assert.rejects(source("src/pages/sveta-mjesta/index.astro"), /ENOENT/);
  assert.doesNotMatch(general, /category=/);
  assert.match(filters, /skete: "monasteries"/);
  assert.match(filters, /hermitage: "monasteries"/);
  assert.match(filters, /chapel: "churches"/);
  assert.match(filters, /cathedral: "churches"/);
  assert.match(discovery, /PUBLIC_DISCOVERY_CATEGORIES = \["monasteries", "churches"\]/);
  assert.match(discovery, /selectPublicDiscoveryPlaces/);
  assert.doesNotMatch(detailHero, /\/sveta-mjesta\/|label: "Света мјеста"/);
  assert.match(detailHero, /routeFor\(locale, "holyPlaces"\)/);
  assert.match(detailHero, /routeFor\(locale, "map"\)/);
});

test("map controls, search, and filters expose accessible states and honest feedback", async () => {
  const [controls, sidebar, filters, explorer, styles, copy] = await Promise.all([
    source("src/components/MapControls.astro"),
    source("src/components/ExplorerSidebar.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/MapExplorer.astro"),
    source("src/styles/global.css"),
    source("src/i18n/public-copy.ts"),
  ]);
  assert.match(sidebar, /<label class="sr-only" for="holy-place-search">/);
  assert.match(sidebar, /placeholder=\{copy\.searchPlaceholder\}/);
  assert.match(copy, /searchPlaceholder: "Претражите светиње…"/);
  assert.match(filters, /type="button"/);
  assert.match(filters, /aria-pressed=/);
  assert.match(controls, /\{c\.builderNotice\}/);
  assert.match(copy, /builderNotice: "Функција планирања руте је у припреми\."/);
  assert.match(controls, /role="status"/);
  assert.match(controls, /data-map-zoom-in/);
  assert.match(controls, /data-map-zoom-out/);
  assert.match(controls, /data-map-reset/);
  assert.match(copy, /reset: "Прикажи поново Црну Гору"/);
  assert.match(controls, /aria-label=\{c\.reset\}/);
  assert.match(explorer, /querySelectorAll<HTMLButtonElement>\("button\[data-filter\]"\)/);
  assert.ok(
    controls.indexOf("map-layers") < controls.indexOf("data-map-zoom-in")
      && controls.indexOf("data-map-zoom-in") < controls.indexOf("data-map-zoom-out")
      && controls.indexOf("data-map-zoom-out") < controls.indexOf("data-map-reset"),
    "map controls must remain layers, zoom in, zoom out, and recenter",
  );
  assert.match(styles, /\.map-popover summary,[\s\S]*?\.map-zoom button\s*\{[\s\S]*?width: 2\.75rem;[\s\S]*?height: 2\.75rem;/);
});

test("the required Serbian interface labels are present", async () => {
  const files = await Promise.all([
    source("src/components/MapExplorer.astro"),
    source("src/components/MapControls.astro"),
    source("src/components/FilterChips.astro"),
    source("src/components/RecommendedPlaces.astro"),
    source("src/components/PopularRoutes.astro"),
    source("src/i18n/public-copy.ts"),
  ]);
  const content = files.join("\n");
  for (const label of [
    "Православна Црна Гора",
    "Манастири",
    "Цркве",
    "Поклоничке руте",
    "Изгради руту",
    "Слојеви",
    "Како користити карту?",
    "Популарне руте",
    "Најпосјећеније светиње",
    "Прикажи све",
  ]) {
    assert.match(content, new RegExp(label.replace(/[?]/g, "\\?")));
  }
  assert.doesNotMatch(content, /Света мјеста|data-filter="holy-places"/);
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
    source("src/components/HomePage.astro"),
    source("src/components/PlaceAreas.astro"),
  ]);
  const styles = await source("src/styles/global.css");
  assert.doesNotMatch(homepage, /\/images\/home\/hero\.webp/);
  assert.doesNotMatch(homepage, /project-intro|trust-note|О водичу|Уређивачко повјерење|Провјерено прије објаве/);
  assert.doesNotMatch(homepage, /loadVisibleNews|selectLatestNews|NewsFeed|homepage-news/);
  assert.match(homepage, /<PlaceAreas places=\{places\} locale=\{locale\} \/>/);
  assert.match(areas, /PLACE_AREAS\.map/);
  assert.match(areas, /publicCopy\[locale\]\.homepage\.areas/);
  assert.match(areas, /class="shell homepage-wide-shell homepage-areas__inner"/);
  assert.match(areas, /\$\{homePath\}\?area=\$\{area\.id\}#mapa/);
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
