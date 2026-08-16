#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadExcludedContentMarkers } from "../src/lib/content/publication.ts";
import { loadExcludedNewsMarkers } from "../src/lib/content/news.ts";
import {
  CATEGORY_HTML_ROUTES,
  createOutputExpectations,
} from "./lib/output-expectations.mjs";
import { PLACE_AREAS } from "../src/lib/place-areas.ts";
import { PLACES_PER_PAGE } from "../src/lib/explorer-pagination.ts";
import { pageCountForHomepagePreview } from "../src/lib/explorer-preview.ts";
import { selectFeaturedCataloguePlaces } from "../src/lib/category-catalogue.ts";
import { getPlaceAboutLabel } from "../src/lib/place-content.ts";
import { MOST_VISITED_PLACE_IDS } from "../src/lib/homepage-selections.ts";

const EMPTY_STATES = {
  monasteries: "Још нема манастира спремних за јавно објављивање.",
  churches: "Још нема храмова спремних за јавно објављивање.",
  "holy-places": "Још нема светих мјеста спремних за јавно објављивање.",
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const countMatches = (text, pattern) => text.match(pattern)?.length ?? 0;
const htmlToPlainText = (html) => html
  .replace(/<[^>]*>/g, " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&nbsp;", " ")
  .replace(/\s+/g, " ")
  .trim();

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

function elementContaining(html, tag, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return "";
  const start = html.lastIndexOf(`<${tag}`, markerIndex);
  const end = html.indexOf(`</${tag}>`, markerIndex);
  return start < 0 || end < 0 ? "" : html.slice(start, end + tag.length + 3);
}

function parseMarkerPayload(homepageHtml, failures) {
  const match = homepageHtml.match(/<script[^>]*data-map-place-data[^>]*>([\s\S]*?)<\/script>/);
  if (!match) {
    failures.push("homepage is missing its map marker payload");
    return [];
  }
  try {
    const payload = JSON.parse(match[1]);
    if (!Array.isArray(payload)) throw new Error("payload is not an array");
    return payload;
  } catch (error) {
    failures.push(`homepage map marker payload is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function verifyCards(page, expectedPlaces, allPlaces, label, failures, expectedImageIds) {
  const html = page?.html ?? "";
  if (!page) {
    failures.push(`${label} page is missing`);
    return;
  }
  const count = countMatches(html, /data-place-card=/g);
  if (count !== expectedPlaces.length) failures.push(`${label} must contain ${expectedPlaces.length} data-driven place card(s), found ${count}`);
  const expectedIds = new Set(expectedPlaces.map((place) => place.id));
  for (const place of allPlaces) {
    const card = elementContaining(html, "article", `data-place-card="${place.id}"`);
    if (!expectedIds.has(place.id)) {
      if (card) failures.push(`${label} contains place ${place.id} from another category`);
      continue;
    }
    if (!card) {
      failures.push(`${label} is missing the place card for ${place.id}`);
      continue;
    }
    if (!card.includes(place.name) || !card.includes(`href="/svetinje/${place.slug}/"`)) {
      failures.push(`${label} card for ${place.id} does not match its loaded name or slug`);
    }
    if (place.previewImageSrc && (!expectedImageIds || expectedImageIds.has(place.id)) && !card.includes(`src="${place.previewImageSrc}"`)) {
      failures.push(`${label} card for ${place.id} is missing its eligible preview image`);
    }
  }
}

function verifyCataloguePagination(page, expectedPlaces, label, failures) {
  if (!page || expectedPlaces.length === 0) return;
  const featuredPlaces = selectFeaturedCataloguePlaces(expectedPlaces);
  const featuredIds = new Set(featuredPlaces.map((place) => place.id));
  const paginatedPlaces = expectedPlaces.filter((place) => !featuredIds.has(place.id));
  const featuredItemTags = [...page.html.matchAll(/<li\b(?=[^>]*\bdata-catalogue-featured-item\b)[^>]*>/g)].map((match) => match[0]);
  const itemTags = [...page.html.matchAll(/<li\b(?=[^>]*\bdata-catalogue-item\b)[^>]*>/g)].map((match) => match[0]);
  const initiallyVisible = itemTags.filter((tag) => !/\bhidden\b/.test(tag));
  const expectedVisible = Math.min(PLACES_PER_PAGE, paginatedPlaces.length);
  const expectedPages = Math.ceil(paginatedPlaces.length / PLACES_PER_PAGE);
  const pagination = elementContaining(page.html, "nav", "data-catalogue-pagination");

  if (featuredItemTags.length !== featuredPlaces.length) {
    failures.push(`${label} must feature ${featuredPlaces.length} image-bearing place(s), found ${featuredItemTags.length}`);
  }
  if (itemTags.length !== paginatedPlaces.length) {
    failures.push(`${label} pagination must retain ${paginatedPlaces.length} non-featured catalogue item(s), found ${itemTags.length}`);
  }
  if (initiallyVisible.length !== expectedVisible) {
    failures.push(`${label} first page must expose ${expectedVisible} card(s), found ${initiallyVisible.length}`);
  }
  if (!pagination.includes(`data-total-pages="${expectedPages}"`)) {
    failures.push(`${label} pagination must derive ${expectedPages} page(s) from its visible inventory`);
  }
  if (expectedPages <= 1 && pagination && !/\bhidden\b/.test(pagination)) {
    failures.push(`${label} pagination must stay hidden for a single page`);
  }
  if (expectedPages > 1 && /<nav\b[^>]*\bhidden\b/.test(pagination)) {
    failures.push(`${label} pagination must be available when more than ${PLACES_PER_PAGE} records exist`);
  }
}

function verifyNewsFeed(page, expectedItems, label, failures) {
  if (!page) {
    failures.push(`${label} page is missing`);
    return;
  }
  const ids = [...page.html.matchAll(/data-news-item="([^"]+)"/g)].map((match) => match[1]);
  const expectedIds = expectedItems.map((item) => item.id);
  if (ids.length !== expectedItems.length) {
    failures.push(`${label} must contain ${expectedItems.length} visible news item(s), found ${ids.length}`);
  }
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
    failures.push(`${label} news is not in descending timestamp order`);
  }
  for (const item of expectedItems) {
    const row = elementContaining(page.html, "article", `data-news-item="${item.id}"`);
    if (!row) {
      failures.push(`${label} is missing news ${item.id}`);
      continue;
    }
    const timePattern = new RegExp(
      `<time\\b[^>]*\\bdatetime="${escapeRegExp(item.publishedAt)}"[^>]*>`,
    );
    if (
      !row.includes(`data-published-at="${item.publishedAt}"`) ||
      !row.includes(`href="${item.href}"`) ||
      !row.includes(item.title) ||
      !row.includes(item.summary) ||
      !timePattern.test(row)
    ) {
      failures.push(`${label} news ${item.id} does not match its loaded timestamp, href, or copy`);
    }
  }
}

function verifyNewsContracts(archive, model, pagesByRoute, failures) {
  verifyNewsFeed(archive, model.news, "news archive", failures);
  for (const item of model.news) {
    if (!item.relatedPlaceId) continue;
    const place = model.placesById.get(item.relatedPlaceId);
    if (!place || item.href !== `/svetinje/${place.slug}/`) {
      failures.push(`related-place news ${item.id} does not resolve from the visible place slug`);
    }
  }
  for (const { item, route } of model.newsDetailRoutes) {
    const detail = pagesByRoute.get(route);
    if (!detail || !detail.html.includes(`data-news-article="${item.id}"`)) {
      failures.push(`visible own-detail news route ${route} is missing or mismatched`);
    }
  }
}

function verifyAreaNavigation(homepage, model, failures) {
  const html = homepage?.html ?? "";
  const areaIds = [...html.matchAll(/data-place-area-link="([^"]+)"/g)].map((match) => match[1]);
  const expectedIds = PLACE_AREAS.map((area) => area.id);
  if (JSON.stringify(areaIds) !== JSON.stringify(expectedIds)) {
    failures.push("homepage area navigation must derive every area once and in catalogue order");
  }
  for (const area of PLACE_AREAS) {
    const link = elementContaining(html, "a", `data-place-area-link="${area.id}"`);
    if (!link || !link.includes(area.label) || !link.includes(`href="/?area=${area.id}#mapa"`)) {
      failures.push(`homepage area link ${area.id} does not match the shared catalogue`);
      continue;
    }
    const expectedCount = model.areaMembership[area.id].length;
    const countMarker = `data-place-area-count="${expectedCount}"`;
    if (expectedCount > 0 && !link.includes(countMarker)) {
      failures.push(`homepage area ${area.id} is missing its visible-place count`);
    }
    if (expectedCount === 0 && /data-place-area-count=/.test(link)) {
      failures.push(`homepage area ${area.id} must not display a fabricated zero count`);
    }
  }
  if (/data-news-item=|homepage-news/.test(html)) failures.push("homepage still renders the standalone news feed");
}

function verifyNarrative(detail, place, failures) {
  const html = detail.html;
  const aboutHeading = getPlaceAboutLabel(place.placeType);
  const aboutHeadingPattern = new RegExp(`<h2[^>]*id="place-about-title"[^>]*>${escapeRegExp(aboutHeading)}</h2>`, "g");
  if (countMatches(html, aboutHeadingPattern) !== 1) {
    failures.push(`${place.id} detail page must contain exactly one ${aboutHeading} heading`);
  }
  if (/id="place-history-title"|id="place-arrival-title"|class="[^"]*place-profile-cards/.test(html)) {
    failures.push(`${place.id} detail page still renders a retired standalone narrative card`);
  }

  const articleStart = html.indexOf('id="place-about-title"');
  const articleEnd = html.indexOf('data-testid="place-detail-gallery"');
  if (articleStart < 0 || articleEnd < 0 || articleStart >= articleEnd) {
    failures.push(`${place.id} detail page is missing its unified narrative boundary`);
    return;
  }

  const pageText = htmlToPlainText(html);
  let lastSectionIndex = articleStart;
  for (const [sectionIndex, section] of place.narrativeSections.entries()) {
    const mergedIntoMainHeading = sectionIndex === 0
      && (section.title === aboutHeading || section.title === "О светињи");
    const marker = `id="${section.id}"`;
    if (!mergedIntoMainHeading) {
      if (countMatches(html, new RegExp(escapeRegExp(marker), "g")) !== 1) {
        failures.push(`${place.id} unified narrative section ${section.id} must be rendered exactly once`);
        continue;
      }
      const markerIndex = html.indexOf(marker);
      if (markerIndex < articleStart || markerIndex >= articleEnd) failures.push(`${place.id} narrative section ${section.id} is outside the unified article`);
      if (markerIndex <= lastSectionIndex) failures.push(`${place.id} narrative section ${section.id} is outside its original order`);
      lastSectionIndex = markerIndex;
    }
    for (const paragraph of section.paragraphs) {
      const paragraphText = paragraph.text.replace(/\s+/g, " ").trim();
      if (!pageText.includes(paragraphText)) failures.push(`${place.id} is missing narrative text from section ${section.id}`);
    }
  }
  if (/href="#source-|<sup\b[^>]*>\s*\[\d+\]/.test(html)) failures.push(`${place.id} detail page exposes inline source footnotes`);
  if (/\[\^[^\]]+\]|Регистар извора/.test(html)) failures.push(`${place.id} detail page exposes source-registry syntax`);
}

function verifyDetail(detailCase, model, pagesByRoute, failures) {
  const { place, route, categoryHref, hasCoordinates } = detailCase;
  const detail = pagesByRoute.get(route);
  if (!detail) {
    failures.push(`missing data-driven detail route ${route}`);
    return;
  }
  const html = detail.html;
  if (!html.includes(`data-place-id="${place.id}"`) || !html.includes(place.name)) {
    failures.push(`${place.id} detail page does not match its loaded ID or name`);
  }
  const breadcrumbs = elementContaining(html, "nav", 'class="place-profile-breadcrumbs"');
  if (!breadcrumbs.includes(`href="${categoryHref}"`)) failures.push(`${place.id} detail page has the wrong category breadcrumb`);

  const hero = elementContaining(html, "header", `data-place-id="${place.id}"`);
  const gallery = elementContaining(html, "section", 'data-testid="place-detail-gallery"');
  if (place.previewImageSrc) {
    if (!hero.includes(`src="${place.previewImageSrc}"`)) failures.push(`${place.id} detail hero is missing its eligible image`);
    if (!gallery.includes(`src="${place.previewImageSrc}"`)) failures.push(`${place.id} detail gallery is missing its eligible image`);
  } else {
    if (!hero.includes("place-profile-hero__fallback")) failures.push(`${place.id} detail hero is missing its honest media fallback`);
    if (!gallery.includes("Ауторска фотографија биће додата")) failures.push(`${place.id} detail gallery is missing its honest media fallback`);
  }
  const expectedPlaceholderSlots = place.galleryImages.length === 0 ? 4 : Math.max(0, 5 - place.galleryImages.length);
  if (!gallery || countMatches(gallery, /data-gallery-slot=/g) !== expectedPlaceholderSlots) {
    failures.push(`${place.id} detail gallery must retain ${expectedPlaceholderSlots} honest preparation slot(s)`);
  }

  if (!html.includes("Практичне информације")) failures.push(`${place.id} detail page is missing its repository-backed practical panel`);
  if (hasCoordinates && (!html.includes(`data-latitude="${place.latitude}"`) || !html.includes(`data-longitude="${place.longitude}"`))) {
    failures.push(`${place.id} detail page is missing its loaded mini-map coordinates`);
  }
  if (!hasCoordinates) {
    if (html.includes("data-place-mini-map")) failures.push(`${place.id} detail page exposes a mini-map without verified coordinates`);
    if (hero.includes('href="/#mapa"')) {
      failures.push(`${place.id} detail page exposes a contextual map link without verified coordinates`);
    }
    if (html.includes("Локација је означена на главној карти")) failures.push(`${place.id} detail page makes a false map-location claim`);
  }
  if (/\bundefined\b/.test(htmlToPlainText(html))) failures.push(`${place.id} detail page renders an undefined value`);

  const related = elementContaining(html, "section", 'data-testid="place-related-shelf"');
  if (!related) failures.push(`${place.id} detail page is missing its related-place shelf`);
  if (countMatches(related, /data-related-place=/g) !== model.expectedRealRelatedCount) {
    failures.push(`${place.id} detail page must contain ${model.expectedRealRelatedCount} real related place(s)`);
  }
  if (countMatches(related, /data-related-placeholder/g) !== model.expectedRelatedPlaceholderCount) {
    failures.push(`${place.id} detail page must contain ${model.expectedRelatedPlaceholderCount} related placeholder(s)`);
  }
  if (related.includes(`data-related-place="${place.id}"`)) failures.push(`${place.id} detail page must exclude itself from related places`);
  if (/Траг извора|Извори и напомене|class="place-profile-sources"|id="source-/.test(html)) {
    failures.push(`${place.id} detail page exposes the retired source-trail presentation`);
  }
  if (/Уређивачки преглед|Ауторски медији/.test(html)) failures.push(`${place.id} detail page exposes retired editorial labels`);
  if (/Тачност положаја|Статус записа|Напомена о подацима|Црквена припадност/.test(html)) {
    failures.push(`${place.id} detail page exposes retired practical-information labels`);
  }
  if (place.ecclesiasticalJurisdiction && !html.includes("Епархија")) failures.push(`${place.id} detail page is missing the Eparchy label`);
  if (place.patronalFeast && !html.includes(`<dd>${place.patronalFeast}</dd>`)) failures.push(`${place.id} detail page is missing its patronal feast`);
  if (!place.patronalFeast && /<dt[^>]*>[^<]*Слава/.test(html)) failures.push(`${place.id} detail page renders an empty patronal-feast row`);
  if (place.youtubeVideoId && !gallery.includes(`https://www.youtube-nocookie.com/embed/${place.youtubeVideoId}`)) {
    failures.push(`${place.id} detail page is missing its privacy-enhanced YouTube embed`);
  }
  if (!place.youtubeVideoId && gallery.includes("youtube-nocookie.com/embed/")) failures.push(`${place.id} detail page renders an empty video embed`);
  verifyNarrative(detail, place, failures);
}

function verifyFixedHomepageContracts(homepageHtml, model, failures) {
  const explorerCardIds = [...homepageHtml.matchAll(/data-place-card="([^"]+)"/g)].map((match) => match[1]);
  const uniqueExplorerCardIds = new Set(explorerCardIds);
  const initialPrimaryCards = countMatches(homepageHtml, /data-initial-explorer-placement="primary"/g);
  const pooledCards = countMatches(homepageHtml, /data-initial-explorer-placement="pool"/g);
  if (explorerCardIds.length !== uniqueExplorerCardIds.size) {
    failures.push("homepage inventory must contain each data-place-card ID exactly once");
  }
  if (explorerCardIds.length !== model.places.length) {
    failures.push(`homepage inventory must retain all ${model.places.length} filterable place card(s), found ${explorerCardIds.length}`);
  }
  if (initialPrimaryCards !== model.homepagePreviewPlaces.length) {
    failures.push(`homepage preview must contain ${model.homepagePreviewPlaces.length} initial card(s), found ${initialPrimaryCards}`);
  }
  if (initialPrimaryCards > model.homepagePreviewLimit) {
    failures.push(`homepage preview must never expose more than ${model.homepagePreviewLimit} initial cards`);
  }
  if (pooledCards !== model.homepagePooledPlaces.length) {
    failures.push(`homepage hidden inventory must contain ${model.homepagePooledPlaces.length} card(s), found ${pooledCards}`);
  }
  if (!/<div\b(?=[^>]*data-explorer-card-pool)(?=[^>]*\bhidden\b)[^>]*>/.test(homepageHtml)) {
    failures.push("homepage inventory pool must remain hidden until filter state distributes its cards");
  }
  if (/data-testid="explorer-continuation"|data-continuation-slot|data-explorer-pagination/.test(homepageHtml)) {
    failures.push("homepage must not render the legacy continuation-card or explorer-pagination system");
  }
  if (homepageHtml.includes("data-explorer-catalogue-link")) {
    failures.push("homepage must not render the retired full-catalogue link");
  }
  const homepagePagination = elementContaining(homepageHtml, "nav", "data-homepage-pagination");
  const homepagePaginationMarkers = [
    "data-homepage-pagination",
    "data-homepage-pagination-prev",
    "data-homepage-pagination-next",
    "data-homepage-pagination-status",
  ];
  for (const marker of homepagePaginationMarkers) {
    if (!homepagePagination.includes(marker)) {
      failures.push(`homepage pagination is missing ${marker}`);
    }
  }
  const expectedHomepagePages = pageCountForHomepagePreview(model.places.length);
  if (model.places.length > 0) {
    const expectedPaginationStatus = `1 / ${expectedHomepagePages}`;
    if (!htmlToPlainText(homepagePagination).includes(expectedPaginationStatus)) {
      failures.push(`homepage pagination must initially report ${expectedPaginationStatus}`);
    }
  } else if (homepagePagination && !/<nav\b[^>]*\bhidden\b/.test(homepagePagination)) {
    failures.push("homepage pagination must remain hidden for an empty inventory");
  }
  const expectedInitialStatus = model.places.length > model.homepagePreviewPlaces.length
    ? `Приказана су ${model.homepagePreviewPlaces.length} од ${model.places.length} резултата.`
    : null;
  if (expectedInitialStatus && !htmlToPlainText(homepageHtml).includes(expectedInitialStatus)) {
    failures.push("homepage accessible result status must distinguish shown cards from full matches");
  }

  const visibleRecommendations = MOST_VISITED_PLACE_IDS.flatMap((id) => {
    const place = model.placesById.get(id);
    return place ? [place] : [];
  });
  const realCount = countMatches(homepageHtml, /data-recommended-place=/g);
  const placeholderCount = countMatches(homepageHtml, /data-testid="recommended-placeholder"/g);
  if (realCount !== visibleRecommendations.length || placeholderCount !== 0) failures.push("homepage most-visited places must contain only the canonical visible selection");
  for (const place of visibleRecommendations) {
    const card = elementContaining(homepageHtml, "article", `data-recommended-place="${place.id}"`);
    if (!card.includes(`href="/svetinje/${place.slug}/"`)) failures.push(`recommended place ${place.id} has the wrong detail route`);
    if (place.previewImageSrc && !card.includes(`src="${place.previewImageSrc}"`)) failures.push(`recommended place ${place.id} is missing its eligible image`);
  }
  const recommendationIds = [...homepageHtml.matchAll(/data-recommended-place="([^"]+)"/g)].map((match) => match[1]);
  if (JSON.stringify(recommendationIds) !== JSON.stringify(visibleRecommendations.map((place) => place.id))) failures.push("homepage most-visited places are outside canonical order");
  if (!homepageHtml.includes("Најпосјећеније светиње") || !homepageHtml.includes("data-today-calendar")) failures.push("homepage is missing its most-visited or Today section");
}

const root = process.cwd();
const editorialPreview = process.env.EDITORIAL_PREVIEW === "true";
const distRoot = path.join(root, "dist");
const files = await htmlFiles(distRoot);
const pages = await Promise.all(files.map(async (file) => ({
  file,
  relative: path.relative(distRoot, file).replaceAll("\\", "/"),
  html: await readFile(file, "utf8"),
})));
const pagesByRoute = new Map(pages.map((page) => [page.relative, page]));
const failures = [];
const model = await createOutputExpectations(root, { editorialPreview });

try {
  const calendarJson = await readFile(path.join(distRoot, "calendar", "2026.json"), "utf8");
  const calendarPayload = JSON.parse(calendarJson);
  if (calendarPayload.year !== 2026 || calendarPayload.time_zone !== "Europe/Podgorica" || calendarPayload.days?.length !== 365) {
    failures.push("calendar/2026.json must contain 365 compact Podgorica calendar days");
  }
  const publicCalendarOutput = `${calendarJson}\n${pages.filter((page) => page.relative.startsWith("kalendar/")).map((page) => page.html).join("\n")}`;
  for (const forbidden of ["APKPure", ".xapk", "com.tipik.app.apk", "data_data.zip", "Microsoft Word 15", "mso-", "svetosavlje.org", "ebible.org", "_provenance", "srp1865", "Типик"]) {
    if (publicCalendarOutput.toLocaleLowerCase("sr").includes(forbidden.toLocaleLowerCase("sr"))) {
      failures.push(`public calendar output exposes forbidden source material: ${forbidden}`);
    }
  }
} catch {
  failures.push("calendar/2026.json is missing or invalid");
}

if (files.length !== model.expectedPageCount) failures.push(`${editorialPreview ? "editorial preview" : "production"} must generate ${model.expectedPageCount} data-derived HTML page(s), found ${files.length}`);
for (const route of model.allExpectedRoutes) {
  if (!pagesByRoute.has(route)) failures.push(`expected output route is missing: ${route}`);
}
for (const page of pages) {
  if (!model.allExpectedRoutes.includes(page.relative)) failures.push(`unexpected output route was generated: ${page.relative}`);
  if (editorialPreview && !page.html.includes('<meta name="robots" content="noindex,nofollow,noarchive">')) failures.push(`${page.relative} is missing editorial-preview noindex metadata`);
  for (const forbidden of ["Радни приказ", "Није у радном приказу"]) {
    if (page.html.includes(forbidden)) failures.push(`${page.relative} exposes internal visibility terminology: ${forbidden}`);
  }
}

const homepage = pagesByRoute.get("index.html");
const catalogue = pagesByRoute.get("svetinje/index.html");
const newsArchive = pagesByRoute.get("novosti/index.html");
const homepageHtml = homepage?.html ?? "";
verifyFixedHomepageContracts(homepageHtml, model, failures);
verifyNewsContracts(newsArchive, model, pagesByRoute, failures);
verifyAreaNavigation(homepage, model, failures);
verifyCards(homepage, model.places, model.places, "homepage explorer", failures);
const generalCatalogueImageIds = new Set(selectFeaturedCataloguePlaces(model.places).map((place) => place.id));
verifyCards(catalogue, model.places, model.places, "general catalogue", failures, generalCatalogueImageIds);
verifyCataloguePagination(catalogue, model.places, "general catalogue", failures);

const routeCatalogue = pagesByRoute.get("rute/index.html");
for (const { route, path: routePath } of model.routeDetailRoutes) {
  const detail = pagesByRoute.get(routePath);
  if (!routeCatalogue?.html.includes(route.shortName) || !routeCatalogue.html.includes(`/rute/${route.slug}/`)) {
    failures.push(`route catalogue is missing ${route.id}`);
  }
  if (!detail?.html.includes(route.name) || !detail.html.includes(route.startPlace.name) || !detail.html.includes(route.endPlace.name)) {
    failures.push(`route detail ${route.id} does not derive linked place content`);
  }
  if (!detail?.html.includes("Висински профил") || !detail.html.includes("Преузми GPX")) {
    failures.push(`route detail ${route.id} is missing profile or GPX download`);
  }
  if (detail && (!detail.html.includes("Интерактивна карта руте") || !detail.html.includes("Детаљи руте") || !detail.html.includes("Практичне информације"))) {
    failures.push(`route detail ${route.id} is missing the public map or elevation headings`);
  }
  if (detail && (!detail.html.includes("Назад на све руте") || !detail.html.includes("Прегледај све руте"))) {
    failures.push(`route detail ${route.id} is missing route navigation or CTA`);
  }
  if (detail && (route.highlights?.length ?? 0) === 0 && detail.html.includes("Успут вриједи видјети")) {
    failures.push(`route detail ${route.id} renders an empty highlights section`);
  }
  if (detail && route.direction === "one-way" && !detail.html.includes("Једносмјерна рута")) {
    failures.push(`one-way route detail ${route.id} is missing its direction label`);
  }
  if (detail && route.direction === "one-way" && route.metrics.recorded_duration_minutes !== undefined && route.metrics.estimated_duration_minutes === undefined && !detail.html.includes("повратак није урачунат")) {
    failures.push(`recorded one-way route ${route.id} does not explain that return time is excluded`);
  }
  const practical = detail ? elementContaining(detail.html, "section", 'class="route-practical"') : "";
  if (route.direction === "one-way" && route.metrics.descent_m === 0 && practical.includes("Спуст")) failures.push(`one-way ascent route ${route.id} exposes a misleading zero descent row`);
  for (const duplicate of ["Дужина", "Вријеме", "Успон", "Најнижа тачка", "Највиша тачка", "Тежина"]) {
    if (practical.includes(`<dt>${duplicate}</dt>`)) failures.push(`route practical panel ${route.id} duplicates the ${duplicate} hero/profile metric`);
  }
  if (!homepageHtml.includes(route.shortName) || !homepageHtml.includes(`/rute/${route.slug}/`)) {
    failures.push(`homepage featured routes are missing ${route.id}`);
  }
  for (const extension of ["track.geojson", "track.gpx"]) {
    try { await readFile(path.join(distRoot, "rute", route.slug, extension), "utf8"); }
    catch { failures.push(`visible route ${route.id} is missing ${extension}`); }
  }
  const startDetail = pagesByRoute.get(`svetinje/${route.startPlace.slug}/index.html`);
  const endDetail = pagesByRoute.get(`svetinje/${route.endPlace.slug}/index.html`);
  if (!startDetail?.html.includes("Руте од ове светиње") || !startDetail.html.includes(`/rute/${route.slug}/`)) failures.push(`start place backlink is missing for ${route.id}`);
  if (!endDetail?.html.includes("Руте до ове светиње") || !endDetail.html.includes(`/rute/${route.slug}/`)) failures.push(`end place backlink is missing for ${route.id}`);
}

for (const [category, route] of Object.entries(CATEGORY_HTML_ROUTES)) {
  const page = pagesByRoute.get(route);
  const members = model.categoryMembership[category];
  const featuredImageIds = new Set(selectFeaturedCataloguePlaces(members).map((place) => place.id));
  verifyCards(page, members, model.places, `${category} catalogue`, failures, featuredImageIds);
  verifyCataloguePagination(page, members, `${category} catalogue`, failures);
  if (members.length === 0 && !page?.html.includes(EMPTY_STATES[category])) failures.push(`${category} catalogue is missing its protected empty state`);
  if (members.length > 0 && page?.html.includes(EMPTY_STATES[category])) failures.push(`${category} catalogue incorrectly renders its empty state`);
}

const markerPayload = parseMarkerPayload(homepageHtml, failures);
if (markerPayload.length !== model.markerPlaces.length) failures.push(`homepage marker payload must contain ${model.markerPlaces.length} place(s), found ${markerPayload.length}`);
const markerById = new Map(markerPayload.map((marker) => [marker.id, marker]));
for (const detailCase of model.detailRoutes) {
  const { place, category, hasCoordinates } = detailCase;
  const marker = markerById.get(place.id);
  if (hasCoordinates) {
    if (!marker) failures.push(`homepage marker payload is missing ${place.id}`);
    else if (
      marker.slug !== place.slug ||
      marker.placeType !== place.placeType ||
      marker.category !== category ||
      marker.latitude !== place.latitude ||
      marker.longitude !== place.longitude
    ) failures.push(`homepage marker payload for ${place.id} does not match the loaded record`);
    if (place.previewImageSrc && marker?.previewImageSrc !== place.previewImageSrc) failures.push(`homepage marker popup data for ${place.id} is missing its eligible image`);
    if (!place.previewImageSrc && marker?.previewImageSrc) failures.push(`homepage marker popup data invents an image for ${place.id}`);
  } else if (marker) failures.push(`homepage marker payload must not require coordinates for ${place.id}`);
  verifyDetail(detailCase, model, pagesByRoute, failures);
}

for (const page of pages) {
  if (/rating|>\s*Оцјена\s*</i.test(page.html) || /033\/459-084|manastirmaine@gmail\.com/i.test(page.html)) failures.push(`${page.relative} contains prohibited practical or commercial preview data`);
  if (/180\s*m|08:00|16:00|18:00|Дјелимично активан|Црква Св\. Тројице|Манастир Дуљево/i.test(page.html)) failures.push(`${page.relative} contains unsupported reference-screenshot content`);
}

if (!editorialPreview) {
  const routeRegistry = JSON.parse(await readFile(path.join(root, "validation", "editorial-preview-routes.json"), "utf8"));
  for (const routeId of routeRegistry.route_ids ?? []) {
    const narrative = await readFile(path.join(root, "content", "routes", routeId, "narratives", "sr.md"), "utf8");
    const routeSlug = narrative.match(/^slug:\s*(.+)$/m)?.[1]?.trim();
    const routeName = narrative.match(/^preferred_name:\s*(.+)$/m)?.[1]?.trim();
    for (const value of [routeId, routeSlug, routeName].filter(Boolean)) {
      if (pages.some((page) => page.html.includes(value))) failures.push(`production contains excluded research route value ${value}`);
    }
    if (routeSlug) {
      for (const extension of ["index.html", "track.geojson", "track.gpx"]) {
        try { await readFile(path.join(distRoot, "rute", routeSlug, extension), "utf8"); failures.push(`production generated excluded research route asset ${routeSlug}/${extension}`); }
        catch { /* Expected. */ }
      }
    }
  }
  const excludedContent = await loadExcludedContentMarkers(root);
  for (const marker of excludedContent) {
    if (marker.slug) {
      const route = `svetinje/${marker.slug}/index.html`;
      if (pagesByRoute.has(route)) failures.push(`production generated excluded editorial-preview route ${route}`);
    }
    const excludedValues = [marker.placeId, marker.slug, marker.preferredName, marker.previewImageSrc];
    if (Number.isFinite(marker.latitude)) excludedValues.push(String(marker.latitude));
    if (Number.isFinite(marker.longitude)) excludedValues.push(String(marker.longitude));
    for (const value of excludedValues.filter((candidate) => typeof candidate === "string" && candidate.length >= 4)) {
      if (pages.some((page) => page.html.includes(value))) failures.push(`production contains excluded research value ${value}`);
    }
  }
  const excludedNews = await loadExcludedNewsMarkers(root);
  for (const marker of excludedNews) {
    const excludedValues = [marker.id, marker.title, marker.summary, marker.relatedPlaceId, marker.slug, marker.body];
    for (const value of excludedValues.filter((candidate) => typeof candidate === "string" && candidate.length >= 4)) {
      if (pages.some((page) => page.html.includes(value))) failures.push(`production contains excluded research news value ${value}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`${editorialPreview ? "Editorial preview" : "Production"} output validation failed:`);
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else if (editorialPreview) {
  console.log(`Editorial preview output check passed: ${files.length} HTML page(s), ${model.places.length} allowlisted place(s), ${model.news.length} allowlisted news item(s), ${model.routes.length} allowlisted route(s), noindex enforced.`);
} else {
  const excluded = await loadExcludedContentMarkers(root);
  console.log(`Production output check passed: ${files.length} HTML page(s), ${model.places.length} visible place(s), ${model.news.length} visible news item(s), ${model.routes.length} visible route(s), ${excluded.length} excluded narrative(s), 0 leaks.`);
}
