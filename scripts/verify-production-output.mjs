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

const HISTORY_SECTION_IDS = new Set([
  "history", "discovery", "foundation", "consecration", "saint-simeon", "relics", "canonization",
]);
const ARRIVAL_SECTION_IDS = new Set(["location"]);
const PRACTICAL_SECTION_IDS = new Set(["services", "visitor-information", "verification-notes"]);
const FIXED_DETAIL_HEADINGS = ["О светињи", "Историја", "Како стићи", "Практичне информације"];
const RECOMMENDED_PLACE_IDS = ["saborni-hram-podgorica", "dajbabe"];
const TOTAL_RECOMMENDATION_SLOTS = 10;
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

function verifyCards(page, expectedPlaces, allPlaces, label, failures) {
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
    if (place.previewImageSrc && !card.includes(`src="${place.previewImageSrc}"`)) {
      failures.push(`${label} card for ${place.id} is missing its eligible preview image`);
    }
  }
}

function verifyCataloguePagination(page, expectedPlaces, label, failures) {
  if (!page || expectedPlaces.length === 0) return;
  const itemTags = [...page.html.matchAll(/<li\b(?=[^>]*\bdata-catalogue-item\b)[^>]*>/g)].map((match) => match[0]);
  const initiallyVisible = itemTags.filter((tag) => !/\bhidden\b/.test(tag));
  const expectedVisible = Math.min(PLACES_PER_PAGE, expectedPlaces.length);
  const expectedPages = Math.ceil(expectedPlaces.length / PLACES_PER_PAGE);
  const pagination = elementContaining(page.html, "nav", "data-catalogue-pagination");

  if (itemTags.length !== expectedPlaces.length) {
    failures.push(`${label} pagination must retain ${expectedPlaces.length} unique catalogue item(s), found ${itemTags.length}`);
  }
  if (initiallyVisible.length !== expectedVisible) {
    failures.push(`${label} first page must expose ${expectedVisible} card(s), found ${initiallyVisible.length}`);
  }
  if (!pagination.includes(`data-total-pages="${expectedPages}"`)) {
    failures.push(`${label} pagination must derive ${expectedPages} page(s) from its visible inventory`);
  }
  if (expectedPages <= 1 && !/\bhidden\b/.test(pagination)) {
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
  for (const heading of FIXED_DETAIL_HEADINGS) {
    const headingPattern = new RegExp(`<h[23][^>]*>${escapeRegExp(heading)}</h[23]>`, "g");
    if (countMatches(html, headingPattern) !== 1) failures.push(`${place.id} detail page must contain exactly one ${heading} heading`);
  }

  const blockBoundaries = {
    about: [html.indexOf('id="place-about-title"'), html.indexOf('data-testid="place-detail-gallery"')],
    history: [html.indexOf('id="place-history-title"'), html.indexOf('id="place-arrival-title"')],
    arrival: [html.indexOf('id="place-arrival-title"'), html.indexOf('data-testid="place-related-shelf"')],
  };
  if (Object.values(blockBoundaries).some(([start, end]) => start < 0 || end < 0 || start >= end)) {
    failures.push(`${place.id} detail page is missing a stable four-block narrative boundary`);
    return;
  }

  const pageText = htmlToPlainText(html);
  const lastSectionIndexByGroup = { about: -1, history: -1, arrival: -1 };
  for (const section of place.narrativeSections) {
    const marker = `data-narrative-source-section="${section.id}"`;
    if (PRACTICAL_SECTION_IDS.has(section.id)) {
      if (html.includes(marker)) failures.push(`${place.id} exposes internal practical note section ${section.id}`);
      continue;
    }
    if (countMatches(html, new RegExp(escapeRegExp(marker), "g")) !== 1) {
      failures.push(`${place.id} narrative section ${section.id} must be rendered exactly once`);
      continue;
    }
    const group = HISTORY_SECTION_IDS.has(section.id)
      ? "history"
      : ARRIVAL_SECTION_IDS.has(section.id)
        ? "arrival"
        : "about";
    const markerIndex = html.indexOf(marker);
    const [start, end] = blockBoundaries[group];
    if (markerIndex < start || markerIndex >= end) failures.push(`${place.id} narrative section ${section.id} is outside its ${group} block`);
    if (markerIndex <= lastSectionIndexByGroup[group]) failures.push(`${place.id} narrative section ${section.id} is outside its original ${group} order`);
    lastSectionIndexByGroup[group] = markerIndex;
    for (const paragraph of section.paragraphs) {
      const paragraphText = paragraph.text.replace(/\s+/g, " ").trim();
      if (!pageText.includes(paragraphText)) failures.push(`${place.id} is missing narrative text from section ${section.id}`);
    }
    if (!FIXED_DETAIL_HEADINGS.includes(section.title)) {
      const originalHeadingPattern = new RegExp(`<h[23][^>]*>${escapeRegExp(section.title)}</h[23]>`, "g");
      if (countMatches(html, originalHeadingPattern) !== 0) failures.push(`${place.id} exposes original narrative heading ${section.title}`);
    }
  }
  if (/href="#source-|<sup\b[^>]*>\s*\[\d+\]/.test(html)) failures.push(`${place.id} detail page exposes inline source footnotes`);
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
  if (!gallery || countMatches(gallery, /data-gallery-slot=/g) !== 4) failures.push(`${place.id} detail gallery must retain four honest preparation slots`);

  if (!html.includes("Практичне информације")) failures.push(`${place.id} detail page is missing its repository-backed practical panel`);
  if (hasCoordinates && (!html.includes(`data-latitude="${place.latitude}"`) || !html.includes(`data-longitude="${place.longitude}"`))) {
    failures.push(`${place.id} detail page is missing its loaded mini-map coordinates`);
  }
  if (!hasCoordinates) {
    const arrival = elementContaining(html, "section", 'id="place-arrival-title"');
    if (!html.includes("Тачан положај на интерактивној карти биће додат након географске провјере.")) {
      failures.push(`${place.id} detail page is missing the neutral unverified-location message`);
    }
    if (arrival.includes('href="/#mapa"') || hero.includes('href="/#mapa"')) {
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
    failures.push("homepage must not render continuation cards or pagination controls");
  }
  const catalogueLink = elementContaining(homepageHtml, "a", "data-explorer-catalogue-link");
  if (!catalogueLink.includes('href="/svetinje/"')) {
    failures.push("homepage preview is missing its full-catalogue link");
  }
  const catalogueLinkText = htmlToPlainText(catalogueLink);
  if (model.places.length > 0 && !catalogueLinkText.includes(`Све светиње — ${model.places.length}`)) {
    failures.push("homepage full-catalogue count must be derived from the complete build-visible inventory");
  }
  if (model.places.length === 0 && /Све светиње\s*—\s*0/.test(catalogueLinkText)) {
    failures.push("homepage must not present a misleading zero catalogue count");
  }
  const expectedInitialStatus = model.places.length > model.homepagePreviewPlaces.length
    ? `Приказана су ${model.homepagePreviewPlaces.length} од ${model.places.length} резултата.`
    : null;
  if (expectedInitialStatus && !htmlToPlainText(homepageHtml).includes(expectedInitialStatus)) {
    failures.push("homepage accessible result status must distinguish shown cards from full matches");
  }

  const visibleRecommendations = RECOMMENDED_PLACE_IDS.flatMap((id) => {
    const place = model.placesById.get(id);
    return place ? [place] : [];
  });
  const realCount = countMatches(homepageHtml, /data-recommended-place=/g);
  const placeholderCount = countMatches(homepageHtml, /data-testid="recommended-placeholder"/g);
  if (realCount !== visibleRecommendations.length || placeholderCount !== TOTAL_RECOMMENDATION_SLOTS - visibleRecommendations.length) {
    failures.push("homepage recommendations do not preserve the intentional visible-ID selection and ten-slot contract");
  }
  if (realCount + placeholderCount !== TOTAL_RECOMMENDATION_SLOTS) failures.push("homepage recommendations must contain exactly ten total slots");
  for (const place of visibleRecommendations) {
    const card = elementContaining(homepageHtml, "article", `data-recommended-place="${place.id}"`);
    if (!card.includes(`href="/svetinje/${place.slug}/"`)) failures.push(`recommended place ${place.id} has the wrong detail route`);
    if (place.previewImageSrc && !card.includes(`src="${place.previewImageSrc}"`)) failures.push(`recommended place ${place.id} is missing its eligible image`);
  }
  const recommendationIds = [...homepageHtml.matchAll(/data-recommended-place="([^"]+)"/g)].map((match) => match[1]);
  if (recommendationIds.some((id) => !RECOMMENDED_PLACE_IDS.includes(id))) failures.push("homepage recommends a place outside the intentional recommendation list");
  if (homepageHtml.includes("<b>010</b>")) failures.push("homepage must never format recommendation slot 10 as 010");
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

if (files.length !== model.expectedPageCount) failures.push(`${editorialPreview ? "editorial preview" : "production"} must generate ${model.expectedPageCount} data-derived HTML page(s), found ${files.length}`);
for (const route of model.allExpectedRoutes) {
  if (!pagesByRoute.has(route)) failures.push(`expected output route is missing: ${route}`);
}
for (const page of pages) {
  if (!model.allExpectedRoutes.includes(page.relative)) failures.push(`unexpected output route was generated: ${page.relative}`);
  if (editorialPreview && !page.html.includes('<meta name="robots" content="noindex,nofollow,noarchive">')) failures.push(`${page.relative} is missing editorial-preview noindex metadata`);
}

const homepage = pagesByRoute.get("index.html");
const catalogue = pagesByRoute.get("svetinje/index.html");
const newsArchive = pagesByRoute.get("novosti/index.html");
const homepageHtml = homepage?.html ?? "";
verifyFixedHomepageContracts(homepageHtml, model, failures);
verifyNewsContracts(newsArchive, model, pagesByRoute, failures);
verifyAreaNavigation(homepage, model, failures);
verifyCards(homepage, model.places, model.places, "homepage explorer", failures);
verifyCards(catalogue, model.places, model.places, "general catalogue", failures);
verifyCataloguePagination(catalogue, model.places, "general catalogue", failures);

for (const [category, route] of Object.entries(CATEGORY_HTML_ROUTES)) {
  const page = pagesByRoute.get(route);
  const members = model.categoryMembership[category];
  verifyCards(page, members, model.places, `${category} catalogue`, failures);
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
  console.log(`Editorial preview output check passed: ${files.length} HTML page(s), ${model.places.length} allowlisted place(s), ${model.news.length} allowlisted news item(s), noindex enforced.`);
} else {
  const excluded = await loadExcludedContentMarkers(root);
  console.log(`Production output check passed: ${files.length} HTML page(s), ${model.places.length} visible place(s), ${model.news.length} visible news item(s), ${excluded.length} excluded narrative(s), 0 leaks.`);
}
