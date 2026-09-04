#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadExcludedContentMarkers } from "../src/lib/content/publication.ts";
import { loadExcludedNewsMarkers } from "../src/lib/content/news.ts";
import {
  CATEGORY_HTML_ROUTES,
  CALENDAR_HTML_ROUTES,
  MONASTERY_SUBCATEGORY_HTML_ROUTES,
  createOutputExpectations,
} from "./lib/output-expectations.mjs";
import { PLACE_AREAS } from "../src/lib/place-areas.ts";
import { PLACES_PER_PAGE } from "../src/lib/explorer-pagination.ts";
import { pageCountForHomepagePreview } from "../src/lib/explorer-preview.ts";
import { selectFeaturedCataloguePlaces } from "../src/lib/category-catalogue.ts";
import { getPlaceAboutLabel } from "../src/lib/place-content.ts";
import { MOST_VISITED_PLACE_IDS } from "../src/lib/homepage-selections.ts";
import { containsUnsupportedReferenceScreenshotContent } from "./lib/reference-screenshot-guard.mjs";
import { localeConfig, placeDetailRoot } from "../src/i18n/config.ts";
import { loadLocalizedNarrative } from "../src/lib/content/localized-narrative.ts";
import { loadFeastRegistry } from "../src/lib/content/feast-registry.ts";
import {
  patronalFeastDay,
  patronalFeastProjectionDates,
} from "../src/lib/public-feast-catalogues.ts";

const EMPTY_STATES = {
  monasteries: "Још нема манастира спремних за јавно објављивање.",
  male: "Још нема мушких манастира спремних за приказ.",
  female: "Још нема женских манастира спремних за приказ.",
  churches: "Још нема храмова спремних за јавно објављивање.",
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

function verifyCataloguePagination(page, expectedPlaces, label, failures, useFeaturedTier = true) {
  if (!page || expectedPlaces.length === 0) return;
  const featuredPlaces = useFeaturedTier ? selectFeaturedCataloguePlaces(expectedPlaces) : [];
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
  const articleEnd = html.indexOf("</article>", articleStart);
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
  }
  if (place.galleryImages.length === 0 && gallery) {
    failures.push(`${place.id} detail page renders a gallery without real media`);
  }
  if (place.galleryImages.length > 0 && !gallery) {
    failures.push(`${place.id} detail page is missing its real gallery media`);
  }
  if (gallery && countMatches(gallery, /data-gallery-open(?:\s|>)/g) !== place.galleryImages.length) {
    failures.push(`${place.id} detail gallery must contain exactly ${place.galleryImages.length} real media item(s)`);
  }
  if (gallery && /data-gallery-slot=|place-detail-gallery__placeholder|Фото у припреми|Галерија у припреми/.test(gallery)) {
    failures.push(`${place.id} detail gallery renders a synthetic or preparation placeholder`);
  }

  if (/Планирај посјету|Изгради руту|Функција планирања посјете је у припреми|Израда персонализоване руте је у припреми/.test(hero)) {
    failures.push(`${place.id} detail hero renders a non-functional launch CTA`);
  }
  if (!hero.includes("data-favorite-toggle")) failures.push(`${place.id} detail hero lost its working Favorites action`);

  const linkedRoutes = model.routes.filter((candidate) => candidate.startPlace.id === place.id || candidate.endPlace.id === place.id);
  const routeSections = countMatches(html, /data-testid="place-route-backlinks"/g);
  if (linkedRoutes.length === 0 && routeSections !== 0) failures.push(`${place.id} detail page renders an empty pilgrimage-route section`);
  if (linkedRoutes.length > 0 && routeSections === 0) failures.push(`${place.id} detail page is missing a publication-visible linked route`);

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
  for (const feast of place.patronalFeastReferences) {
    if (!html.includes(feast.name)) failures.push(`${place.id} detail page is missing patronal feast ${feast.name}`);
    const feastHref = `/slave/${feast.id}/`;
    const routeExists = model.feastDetailRoutesById.has(feast.id);
    if (routeExists && !html.includes(`href="${feastHref}"`)) failures.push(`${place.id} detail page does not link visible feast ${feast.id}`);
    if (!routeExists && html.includes(`href="${feastHref}"`)) failures.push(`${place.id} detail page links unavailable feast ${feast.id}`);
  }
  for (const feast of place.unlinkedPatronalFeasts) {
    if (!html.includes(feast)) failures.push(`${place.id} detail page is missing unresolved legacy patronal feast ${feast}`);
  }
  if (place.patronalFeasts.length === 0 && /<dt[^>]*>[^<]*Слава/.test(html)) failures.push(`${place.id} detail page renders an empty patronal-feast row`);
  const video = elementContaining(html, "section", 'data-testid="place-detail-video"');
  if (place.youtubeVideoId) {
    if (!video.includes(`data-youtube-video-id="${place.youtubeVideoId}"`) || !video.includes("data-youtube-load")) {
      failures.push(`${place.id} detail page is missing its click-to-load YouTube control`);
    }
    if (/<iframe\b/i.test(video)) failures.push(`${place.id} detail page creates a YouTube iframe before user action`);
  } else if (video) {
    failures.push(`${place.id} detail page renders an empty video control`);
  }
  if (/<link\b[^>]*rel="(?:preconnect|prefetch|dns-prefetch)"[^>]*(?:youtube|ytimg)|<link\b[^>]*(?:youtube|ytimg)[^>]*rel="(?:preconnect|prefetch|dns-prefetch)"/i.test(html)) {
    failures.push(`${place.id} detail page preconnects or prefetches YouTube before user action`);
  }
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
  if (explorerCardIds.length !== model.discoveryPlaces.length) {
    failures.push(`homepage inventory must retain all ${model.discoveryPlaces.length} public-discovery place card(s), found ${explorerCardIds.length}`);
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
  const expectedHomepagePages = pageCountForHomepagePreview(model.discoveryPlaces.length);
  if (model.discoveryPlaces.length > 0) {
    const expectedPaginationStatus = `1 / ${expectedHomepagePages}`;
    if (!htmlToPlainText(homepagePagination).includes(expectedPaginationStatus)) {
      failures.push(`homepage pagination must initially report ${expectedPaginationStatus}`);
    }
  } else if (homepagePagination && !/<nav\b[^>]*\bhidden\b/.test(homepagePagination)) {
    failures.push("homepage pagination must remain hidden for an empty inventory");
  }
  const expectedInitialStatus = model.discoveryPlaces.length > model.homepagePreviewPlaces.length
    ? `Приказана су ${model.homepagePreviewPlaces.length} од ${model.discoveryPlaces.length} резултата.`
    : null;
  if (expectedInitialStatus && !htmlToPlainText(homepageHtml).includes(expectedInitialStatus)) {
    failures.push("homepage accessible result status must distinguish shown cards from full matches");
  }

  const visibleRecommendations = MOST_VISITED_PLACE_IDS.flatMap((id) => {
    const place = model.discoveryPlacesById.get(id);
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
  if (homepageHtml.includes('class="popular-routes') || homepageHtml.includes("Популарне руте")) failures.push("homepage still renders the removed Popular Routes section");
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

const homepageOutput = pagesByRoute.get("index.html")?.html ?? "";
if (!editorialPreview && homepageOutput.includes('data-preview-today-override="true"')) {
  failures.push("production enables the editorial-preview Calendar date override");
}
if (editorialPreview && !homepageOutput.includes('data-preview-today-override="true"')) {
  failures.push("editorial preview is missing its deterministic Calendar date QA control");
}

try {
  const calendarJson = await readFile(path.join(distRoot, "calendar", "2026.json"), "utf8");
  const calendarPayload = JSON.parse(calendarJson);
  if (calendarPayload.year !== 2026 || calendarPayload.time_zone !== "Europe/Podgorica" || calendarPayload.days?.length !== CALENDAR_HTML_ROUTES.length) {
    failures.push("calendar/2026.json must contain exactly the verified Podgorica calendar inventory");
  }
  const firstCalendarDay = calendarPayload.days?.[0];
  const lastCalendarDay = calendarPayload.days?.at(-1);
  const calendarByDate = new Map(calendarPayload.days?.map((day) => [day.date, day]) ?? []);
  if (firstCalendarDay?.date !== "2026-08-01" || lastCalendarDay?.date !== "2026-12-31" || calendarByDate.has("2026-07-31")) {
    failures.push("calendar/2026.json must fail closed outside the verified August-December range");
  }
  if (calendarByDate.get("2026-08-19")?.commemoration_sr !== "Преображење Господње"
    || calendarByDate.get("2026-08-20")?.commemoration_sr !== "Свети преподобномученик Дометије; Преподобни Ор") {
    failures.push("calendar/2026.json does not preserve exact verified control-day text");
  }
  const publicCalendarOutput = `${calendarJson}\n${pages.filter((page) => page.relative.startsWith("kalendar/")).map((page) => page.html).join("\n")}`;
  for (const forbidden of ["source_ref", "APKPure", ".xapk", "com.tipik.app.apk", "data_data.zip", "Microsoft Word 15", "mso-", "svetosavlje.org", "ebible.org", "_provenance", "srp1865", "Типик"]) {
    if (publicCalendarOutput.toLocaleLowerCase("sr").includes(forbidden.toLocaleLowerCase("sr"))) {
      failures.push(`public calendar output exposes forbidden source material: ${forbidden}`);
    }
  }
} catch {
  failures.push("calendar/2026.json is missing or invalid");
}

try {
  const gospelDirectory = path.join(distRoot, "gospel");
  const gospelFiles = (await readdir(gospelDirectory)).filter((file) => /^2026-\d{2}-\d{2}\.json$/.test(file)).sort();
  const expectedGospelFiles = CALENDAR_HTML_ROUTES.map((route) => `${route.split("/")[1]}.json`).sort();
  if (JSON.stringify(gospelFiles) !== JSON.stringify(expectedGospelFiles)) {
    failures.push(`gospel/ must contain exactly ${expectedGospelFiles.length} verified daily JSON files`);
  }

  const gospelByDate = new Map();
  for (const file of gospelFiles) {
    const payload = JSON.parse(await readFile(path.join(gospelDirectory, file), "utf8"));
    if (!Array.isArray(payload.readings)) {
      failures.push(`gospel/${file} must contain a readings array`);
      continue;
    }
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["entry_id", "reading_type", "feast_or_reason", "needs_review", "source_ref"]) {
      if (serialized.includes(forbidden)) failures.push(`gospel/${file} exposes internal field ${forbidden}`);
    }
    for (const reading of payload.readings) {
      const allowedFields = new Set(["reading_id", "book", "zachalo", "passage", "conditional", "verses", "text"]);
      if (Object.keys(reading).some((field) => !allowedFields.has(field)) || !reading.reading_id || !reading.passage || !reading.text || !Array.isArray(reading.verses)) {
        failures.push(`gospel/${file} contains an invalid public reading`);
      }
    }
    gospelByDate.set(file.slice(0, -5), payload.readings);
  }

  if (gospelByDate.get("2026-08-19")?.length !== 2 || gospelByDate.get("2026-08-25")?.length !== 2) {
    failures.push("daily Gospel output does not preserve multiple-readings control dates");
  }
} catch {
  failures.push("daily Gospel JSON output is missing or invalid");
}

try {
  const feastDirectory = path.join(distRoot, "feast-days");
  const feastFiles = (await readdir(feastDirectory)).filter((file) => /^2026-\d{2}-\d{2}\.json$/.test(file)).sort();
  const expectedFeastFiles = patronalFeastProjectionDates().map((date) => `${date}.json`);
  if (JSON.stringify(feastFiles) !== JSON.stringify(expectedFeastFiles)) {
    failures.push(`feast-days/ must contain exactly ${expectedFeastFiles.length} daily public projections`);
  }

  const registry = await loadFeastRegistry(root);
  for (const file of feastFiles) {
    const date = file.slice(0, -5);
    const payload = JSON.parse(await readFile(path.join(feastDirectory, file), "utf8"));
    const expected = patronalFeastDay(registry, model.feastCatalogues, date);
    if (JSON.stringify(payload) !== JSON.stringify(expected)) {
      failures.push(`feast-days/${file} differs from the public-discovery feast projection`);
      continue;
    }
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["summary", "narrativeBody", "sourceIds", "sources", "previewStatus", "latitude", "longitude"]) {
      if (serialized.includes(`"${forbidden}"`)) failures.push(`feast-days/${file} exposes internal place field ${forbidden}`);
    }
    const groups = [...(payload.feasts ?? []), ...(payload.upcoming?.feasts ?? [])];
    for (const feast of groups) {
      if (Object.keys(feast).some((field) => !["id", "name", "href", "places"].includes(field))) {
        failures.push(`feast-days/${file} contains an invalid public feast field`);
      }
      for (const place of feast.places ?? []) {
        const visible = model.discoveryPlacesById.get(place.id);
        if (!visible || place.href !== `/svetinje/${visible.slug}/` || place.name !== visible.name) {
          failures.push(`feast-days/${file} exposes a place outside public discovery: ${place.id}`);
        }
        if (Object.keys(place).some((field) => !["id", "name", "href", "meta"].includes(field))) {
          failures.push(`feast-days/${file} contains an invalid public place field`);
        }
      }
    }
  }
} catch {
  failures.push("daily patronal feast JSON output is missing or invalid");
}

if (files.length !== model.expectedPageCount) failures.push(`${editorialPreview ? "editorial preview" : "production"} must generate ${model.expectedPageCount} data-derived HTML page(s), found ${files.length}`);
for (const route of model.allExpectedRoutes) {
  if (!pagesByRoute.has(route)) failures.push(`expected output route is missing: ${route}`);
}

const feastIndex = pagesByRoute.get("slave/index.html");
if (!feastIndex) failures.push("public feast index is missing");
else {
  for (const feast of model.feastCatalogues) {
    if (!feastIndex.html.includes(`/slave/${feast.id}/`) || !feastIndex.html.includes(feast.name)) {
      failures.push(`public feast index is missing ${feast.id}`);
    }
  }
}
for (const { feast, route } of model.feastDetailRoutes) {
  const page = pagesByRoute.get(route);
  if (!page) continue;
  if (!page.html.includes(`<h1>${feast.name}</h1>`)) failures.push(`${feast.id} feast catalogue is missing its heading`);
  if (!page.html.includes("data-category-catalogue") || !page.html.includes("data-catalogue-eparchy") || !page.html.includes("data-catalogue-municipality")) {
    failures.push(`${feast.id} feast catalogue is missing shared catalogue filters`);
  }
  for (const place of feast.places) {
    if (!page.html.includes(`data-place-card="${place.id}"`)) failures.push(`${feast.id} feast catalogue is missing ${place.id}`);
  }
}
for (const page of pages) {
  if (!model.allExpectedRoutes.includes(page.relative)) failures.push(`unexpected output route was generated: ${page.relative}`);
  if (editorialPreview && !page.html.includes('<meta name="robots" content="noindex,nofollow,noarchive">')) failures.push(`${page.relative} is missing editorial-preview noindex metadata`);
  for (const forbidden of ["Радни приказ", "Није у радном приказу"]) {
    if (page.html.includes(forbidden)) failures.push(`${page.relative} exposes internal visibility terminology: ${forbidden}`);
  }
}

for (const locale of ["ru", "en"]) {
  const prefix = `${locale}/`;
  for (const page of pages.filter((candidate) => candidate.relative.startsWith(prefix))) {
    if (!page.html.includes(`<html lang="${localeConfig[locale].htmlLang}">`)) failures.push(`${page.relative} has the wrong html lang`);
    if (!page.html.includes(`rel="canonical"`)) failures.push(`${page.relative} is missing a canonical link`);
  }
  for (const place of model.localizedPlaces[locale]) {
    const route = `${placeDetailRoot[locale].slice(1)}${place.slug}/index.html`;
    const detail = pagesByRoute.get(route);
    if (!detail?.html.includes(`data-place-id="${place.id}"`) || !detail.html.includes(place.name) || !detail.html.includes(place.summary)) {
      failures.push(`${locale} detail ${place.id} is missing its localized identity or narrative summary`);
    }
  }
}
if (pagesByRoute.has("ru/svyatyni/index.html") || pagesByRoute.has("en/holy-places/index.html")) failures.push("localized holy-place discovery archive was generated");

const homepage = pagesByRoute.get("index.html");
const catalogue = pagesByRoute.get("svetinje/index.html");
const newsArchive = pagesByRoute.get("novosti/index.html");
const homepageHtml = homepage?.html ?? "";
if (pagesByRoute.has("sveta-mjesta/index.html")) failures.push("removed public holy-places category route was generated");
verifyFixedHomepageContracts(homepageHtml, model, failures);
verifyNewsContracts(newsArchive, model, pagesByRoute, failures);
verifyAreaNavigation(homepage, model, failures);
verifyCards(homepage, model.discoveryPlaces, model.places, "homepage explorer", failures);
const generalCatalogueImageIds = new Set(selectFeaturedCataloguePlaces(model.discoveryPlaces).map((place) => place.id));
verifyCards(catalogue, model.discoveryPlaces, model.places, "general catalogue", failures, generalCatalogueImageIds);
verifyCataloguePagination(catalogue, model.discoveryPlaces, "general catalogue", failures);

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
  if (homepageHtml.includes(`/rute/${route.slug}/`)) {
    failures.push(`homepage must not render the removed Popular Routes card ${route.id}`);
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
  const useFeaturedTier = category !== "monasteries" && category !== "churches";
  const featuredImageIds = new Set(
    useFeaturedTier ? selectFeaturedCataloguePlaces(members).map((place) => place.id) : [],
  );
  verifyCards(page, members, model.places, `${category} catalogue`, failures, featuredImageIds);
  verifyCataloguePagination(page, members, `${category} catalogue`, failures, useFeaturedTier);
  if (members.length === 0 && !page?.html.includes(EMPTY_STATES[category])) failures.push(`${category} catalogue is missing its protected empty state`);
  if (members.length > 0 && page?.html.includes(EMPTY_STATES[category])) failures.push(`${category} catalogue incorrectly renders its empty state`);
}

for (const [community, route] of Object.entries(MONASTERY_SUBCATEGORY_HTML_ROUTES)) {
  const page = pagesByRoute.get(route);
  const members = model.monasteryCommunityMembership[community];
  verifyCards(page, members, model.places, `${community} monastery catalogue`, failures, new Set());
  verifyCataloguePagination(page, members, `${community} monastery catalogue`, failures, false);
  if (members.length === 0 && !page?.html.includes(EMPTY_STATES[community])) failures.push(`${community} monastery catalogue is missing its protected empty state`);
  if (members.length > 0 && page?.html.includes(EMPTY_STATES[community])) failures.push(`${community} monastery catalogue incorrectly renders its empty state`);
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
  if (/\brating\b|>\s*Оцјена\s*</i.test(page.html) || /033\/459-084|manastirmaine@gmail\.com/i.test(page.html)) failures.push(`${page.relative} contains prohibited practical or commercial preview data`);
  if (containsUnsupportedReferenceScreenshotContent(page.html)) failures.push(`${page.relative} contains unsupported reference-screenshot content`);
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
  const allPlaceIds = (await readdir(path.join(root, "content", "places"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const placeId of allPlaceIds) {
    for (const locale of ["ru", "en"]) {
      const narrative = await loadLocalizedNarrative(root, placeId, locale);
      if (!narrative || narrative.translationStatus === "published") continue;
      if (narrative.slug && pagesByRoute.has(`${placeDetailRoot[locale].slice(1)}${narrative.slug}/index.html`)) failures.push(`production generated excluded ${locale} translation route for ${placeId}`);
      for (const value of [narrative.preferredName, narrative.summary].filter((item) => typeof item === "string" && item.length >= 8)) {
        if (pages.filter((page) => page.relative.startsWith(`${locale}/`)).some((page) => page.html.includes(value))) failures.push(`production contains excluded ${locale} translation value for ${placeId}`);
      }
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
