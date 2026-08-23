import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("Serbian, Russian, and English place routes use one complete PlaceDetailPage tree", async () => {
  const [srRoute, ruRoute, enRoute, localizedPage, detailPage] = await Promise.all([
    source("src/pages/svetinje/[slug].astro"),
    source("src/pages/ru/[...path].astro"),
    source("src/pages/en/[...path].astro"),
    source("src/components/LocalizedPublicPage.astro"),
    source("src/components/PlaceDetailPage.astro"),
  ]);

  assert.match(srRoute, /<PlaceDetailPage place=\{place\} locale="sr"/);
  assert.match(ruRoute, /<PlaceDetailPage place=\{props\.place\} locale="ru"/);
  assert.match(enRoute, /<PlaceDetailPage place=\{props\.place\} locale="en"/);
  assert.doesNotMatch(localizedPage, /page === "place"|place-profile-hero|place-profile-about|place-detail-gallery|place-practical-panel|narrativeBody\.split/);

  for (const component of ["PlaceDetailHero", "PlaceNarrativeArticle", "PlaceDetailGallery", "PlaceServiceSchedule", "PlacePracticalPanel", "PlaceRelatedShelf", "PlaceRouteBacklinks"]) {
    assert.match(detailPage, new RegExp(`<${component}[^>]+locale=\\{locale\\}`));
  }
  assert.match(detailPage, /<BaseLayout[\s\S]*?canonicalPath=\{`\$\{placeDetailRoot\[locale\]\}\$\{place\.slug\}\/`\}[\s\S]*?locale=\{locale\}[\s\S]*?localeLinks=\{localeLinks\}/);
});

test("shared place detail preserves hero, gallery, practical, related, route, and mini-map contracts", async () => {
  const [hero, narrative, gallery, practical, related, backlinks, miniMap, relatedModel, localizedPaths, styles] = await Promise.all([
    source("src/components/place-detail/PlaceDetailHero.astro"),
    source("src/components/place-detail/PlaceNarrativeArticle.astro"),
    source("src/components/place-detail/PlaceDetailGallery.astro"),
    source("src/components/place-detail/PlacePracticalPanel.astro"),
    source("src/components/place-detail/PlaceRelatedShelf.astro"),
    source("src/components/routes/PlaceRouteBacklinks.astro"),
    source("src/components/place-detail/PlaceMiniMap.astro"),
    source("src/lib/related-places.ts"),
    source("src/lib/localized-static-paths.ts"),
    source("src/styles/global.css"),
  ]);

  assert.match(hero, /const detailCopy = copy\.pages\.placeDetail/);
  assert.match(hero, /place-profile-hero__image[\s\S]*?place-profile-hero__overlay[\s\S]*?place-profile-breadcrumbs[\s\S]*?place-profile-actions[\s\S]*?place-profile-action-status/);
  for (const action of ["plan", "route", "save"]) assert.match(hero, new RegExp(`data-place-detail-action="${action}"`));
  assert.match(narrative, /parsePlaceNarrativeBlocks\(body\)/);
  assert.doesNotMatch(narrative, /split\(\/\\r\?\\n\\s\*\\r\?\\n\//);
  assert.match(gallery, /place-detail-gallery__main/);
  assert.match(gallery, /place-detail-gallery__image/);
  assert.match(gallery, /data-gallery-dialog/);
  assert.match(gallery, /data-gallery-previous/);
  assert.match(gallery, /data-gallery-next/);
  assert.match(gallery, /place\.youtubeVideoId &&/);
  assert.match(styles, /\.place-detail-gallery__main img,[\s\S]*?\.place-detail-gallery__image img[\s\S]*?object-fit: cover;/);
  assert.match(styles, /\.place-detail-gallery__main\s*\{[\s\S]*?aspect-ratio: 16 \/ 10;/);
  for (const field of ["place.settlement", "place.address", "place.typeLabel", "place.ecclesiasticalJurisdiction", "place.patronalFeasts", "coordinateText"]) assert.match(practical, new RegExp(field.replaceAll(".", "\\.")));
  assert.match(practical, /<PlaceMiniMap[\s\S]*?locale=\{locale\}/);
  assert.match(miniMap, /publicCopy\[locale\]\.pages\.placeDetail\.miniMap/);
  assert.match(related, /placeDetailRoot\[locale\]/);
  assert.match(backlinks, /localeSafeRoutes = locale === "sr" \? routes : \[\]/);
  assert.match(backlinks, /copy\.empty/);
  assert.match(relatedModel, /export function relatedPlacesFor/);
  assert.match(localizedPaths, /relatedPlacesFor\(place, places, locale\)/);
});

test("the public page-type parity matrix routes every locale through shared components", async () => {
  const files = await Promise.all([
    source("src/pages/index.astro"), source("src/pages/ru/index.astro"), source("src/pages/en/index.astro"),
    source("src/pages/manastiri/index.astro"), source("src/pages/manastiri/muski/index.astro"), source("src/pages/manastiri/zenski/index.astro"), source("src/pages/crkve/index.astro"),
    source("src/pages/mapa/index.astro"), source("src/pages/rute/index.astro"), source("src/pages/kalendar/index.astro"), source("src/pages/novosti/index.astro"), source("src/pages/o-projektu.astro"),
    source("src/components/LocalizedPublicPage.astro"),
  ]);
  const [srHome, ruHome, enHome, monasteries, male, female, churches, map, routes, calendar, news, about, localized] = files;

  assert.match(srHome, /<HomePage locale="sr" \/>/);
  assert.match(ruHome, /<HomePage locale="ru" \/>/);
  assert.match(enHome, /<HomePage locale="en" \/>/);
  assert.match(monasteries, /<CataloguePage locale="sr" page="monasteries"/);
  assert.match(male, /<CataloguePage locale="sr" page="maleMonasteries"/);
  assert.match(female, /<CataloguePage locale="sr" page="femaleMonasteries"/);
  assert.match(churches, /<CataloguePage locale="sr" page="churches"/);
  assert.match(map, /<MapPage places=\{places\} locale="sr" \/>/);
  assert.match(routes, /<RouteCataloguePage routes=\{routes\} locale="sr"/);
  assert.match(calendar, /<CalendarIndexPage days=\{days\} locale="sr"/);
  assert.match(news, /<NewsArchivePage items=\{news\} locale="sr"/);
  assert.match(about, /<AboutPage locale="sr"/);

  for (const component of ["CataloguePage", "MapPage", "RouteCataloguePage", "CalendarIndexPage", "NewsArchivePage", "AboutPage"]) {
    assert.match(localized, new RegExp(`<${component} locale=\\{locale\\}`));
  }
  assert.doesNotMatch(localized, /<header class="page-hero"|<DedicatedMap|<CategoryCatalogue|place-profile-/);
});

test("shared page shells centralize locale copy and preserve static SEO equivalents", async () => {
  const [catalogue, map, routes, calendar, news, about, copy, layout, localizedLoader] = await Promise.all([
    source("src/components/CataloguePage.astro"), source("src/components/MapPage.astro"), source("src/components/RouteCataloguePage.astro"),
    source("src/components/CalendarIndexPage.astro"), source("src/components/NewsArchivePage.astro"), source("src/components/AboutPage.astro"),
    source("src/i18n/public-copy.ts"), source("src/layouts/BaseLayout.astro"), source("src/lib/content/localized-publication.ts"),
  ]);
  for (const component of [catalogue, map, routes, calendar, news, about]) {
    assert.match(component, /publicCopy\[locale\]\.pages/);
    assert.match(component, /canonicalPath=\{routeFor\(locale,/);
    assert.doesNotMatch(component, /locale === "ru" \?/);
  }
  for (const locale of ["sr", "ru", "en"]) assert.match(copy, new RegExp(`${locale}: \\{[\\s\\S]*?pages: \\{`));
  assert.match(layout, /staticEquivalentForPath\(canonicalPath\)/);
  assert.match(localizedLoader, /translationIsVisible\(narrative\.translationStatus, editorialPreview\)/);
  assert.doesNotMatch(localizedLoader, /fallback/i);
});
