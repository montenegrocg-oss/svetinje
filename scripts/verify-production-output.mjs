#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadExcludedContentMarkers } from "../src/lib/content/publication.ts";
import { loadExcludedNewsMarkers } from "../src/lib/content/news.ts";
import {
  CATEGORY_HTML_ROUTES,
  createOutputExpectations,
} from "./lib/output-expectations.mjs";

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
    if (
      !row.includes(`data-published-at="${item.publishedAt}"`) ||
      !row.includes(`href="${item.href}"`) ||
      !row.includes(item.title) ||
      !row.includes(item.summary) ||
      !row.includes(`<time datetime="${item.publishedAt}"`)
    ) {
      failures.push(`${label} news ${item.id} does not match its loaded timestamp, href, or copy`);
    }
  }
}

function verifyNewsContracts(homepage, archive, model, pagesByRoute, failures) {
  const latest = model.news.slice(0, 5);
  verifyNewsFeed(homepage, latest, "homepage", failures);
  verifyNewsFeed(archive, model.news, "news archive", failures);
  const homepageHtml = homepage?.html ?? "";
  if (!homepageHtml.includes("НОВОСТИ") || !homepageHtml.includes("Последње додато")) {
    failures.push("homepage is missing the new news section identity");
  }
  if (!homepageHtml.includes("Сајт се тренутно активно допуњава новим садржајем и објектима.")) {
    failures.push("homepage is missing the exact news introduction");
  }
  if (/О водичу|Светиње на једном мјесту|Уређивачко повјерење|Провјерено прије објаве/.test(homepageHtml)) {
    failures.push("homepage still contains the retired project-intro or trust block");
  }
  if (!homepageHtml.includes('href="/novosti/"') || !homepageHtml.includes("Све новости")) {
    failures.push("homepage is missing its /novosti/ archive link");
  }
  if (latest.length === 0 && !homepageHtml.includes("Нове објаве биће доступне овдје.")) {
    failures.push("homepage is missing its protected empty-news state");
  }
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

function verifyNarrative(detail, place, failures) {
  const html = detail.html;
  for (const heading of FIXED_DETAIL_HEADINGS) {
    const headingPattern = new RegExp(`<h[23][^>]*>${escapeRegExp(heading)}</h[23]>`, "g");
    if (countMatches(html, headingPattern) !== 1) failures.push(`${place.id} detail page must contain exactly one ${heading} heading`);
  }

  const blockBoundaries = {
    about: [html.indexOf('id="place-about-title"'), html.indexOf('data-testid="place-detail-gallery"')],
    practical: [html.indexOf('class="place-practical-panel"'), html.indexOf('class="place-profile-cards"')],
    history: [html.indexOf('id="place-history-title"'), html.indexOf('id="place-arrival-title"')],
    arrival: [html.indexOf('id="place-arrival-title"'), html.indexOf('data-testid="place-related-shelf"')],
  };
  if (Object.values(blockBoundaries).some(([start, end]) => start < 0 || end < 0 || start >= end)) {
    failures.push(`${place.id} detail page is missing a stable four-block narrative boundary`);
    return;
  }

  const pageText = htmlToPlainText(html);
  const lastSectionIndexByGroup = { about: -1, history: -1, arrival: -1, practical: -1 };
  const expectedCitationCounts = new Map();
  for (const section of place.narrativeSections) {
    const marker = `data-narrative-source-section="${section.id}"`;
    if (countMatches(html, new RegExp(escapeRegExp(marker), "g")) !== 1) {
      failures.push(`${place.id} narrative section ${section.id} must be rendered exactly once`);
      continue;
    }
    const group = HISTORY_SECTION_IDS.has(section.id)
      ? "history"
      : ARRIVAL_SECTION_IDS.has(section.id)
        ? "arrival"
        : PRACTICAL_SECTION_IDS.has(section.id)
          ? "practical"
          : "about";
    const markerIndex = html.indexOf(marker);
    const [start, end] = blockBoundaries[group];
    if (markerIndex < start || markerIndex >= end) failures.push(`${place.id} narrative section ${section.id} is outside its ${group} block`);
    if (markerIndex <= lastSectionIndexByGroup[group]) failures.push(`${place.id} narrative section ${section.id} is outside its original ${group} order`);
    lastSectionIndexByGroup[group] = markerIndex;
    for (const paragraph of section.paragraphs) {
      const paragraphText = paragraph.text.replace(/\s+/g, " ").trim();
      if (!pageText.includes(paragraphText)) failures.push(`${place.id} is missing narrative text from section ${section.id}`);
      for (const sourceId of paragraph.sourceIds) {
        expectedCitationCounts.set(sourceId, (expectedCitationCounts.get(sourceId) ?? 0) + 1);
      }
    }
    if (!FIXED_DETAIL_HEADINGS.includes(section.title)) {
      const originalHeadingPattern = new RegExp(`<h[23][^>]*>${escapeRegExp(section.title)}</h[23]>`, "g");
      if (countMatches(html, originalHeadingPattern) !== 0) failures.push(`${place.id} exposes original narrative heading ${section.title}`);
    }
  }
  for (const [sourceId, expectedCount] of expectedCitationCounts) {
    const citationPattern = new RegExp(`href="#source-${escapeRegExp(sourceId)}"`, "g");
    if (countMatches(html, citationPattern) !== expectedCount) failures.push(`${place.id} must preserve all ${expectedCount} citation link(s) for ${sourceId}`);
  }
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

  const related = elementContaining(html, "section", 'data-testid="place-related-shelf"');
  if (!related) failures.push(`${place.id} detail page is missing its related-place shelf`);
  if (countMatches(related, /data-related-place=/g) !== model.expectedRealRelatedCount) {
    failures.push(`${place.id} detail page must contain ${model.expectedRealRelatedCount} real related place(s)`);
  }
  if (countMatches(related, /data-related-placeholder/g) !== model.expectedRelatedPlaceholderCount) {
    failures.push(`${place.id} detail page must contain ${model.expectedRelatedPlaceholderCount} related placeholder(s)`);
  }
  if (related.includes(`data-related-place="${place.id}"`)) failures.push(`${place.id} detail page must exclude itself from related places`);
  if (!html.includes("Извори и напомене") || !html.includes('id="source-')) failures.push(`${place.id} detail page must preserve its source trail`);
  verifyNarrative(detail, place, failures);
}

function verifyFixedHomepageContracts(homepageHtml, model, failures) {
  const realContinuationCards = countMatches(homepageHtml, /data-place-card="[^"]+"[^>]*data-continuation-slot=/g);
  const continuationPlaceholderCount = countMatches(homepageHtml, /data-testid="explorer-continuation-placeholder"/g);
  if (realContinuationCards !== model.continuationRealCount) {
    failures.push(`homepage must contain ${model.continuationRealCount} real continuation card(s), found ${realContinuationCards}`);
  }
  if (continuationPlaceholderCount !== model.continuationPlaceholderCount) {
    failures.push(`homepage must contain ${model.continuationPlaceholderCount} neutral continuation placeholder(s), found ${continuationPlaceholderCount}`);
  }
  for (const { slot, place } of model.continuationSlots) {
    const card = place ? elementContaining(homepageHtml, "article", `data-place-card="${place.id}"`) : "";
    const placeholder = !place ? elementContaining(homepageHtml, "article", `data-continuation-slot="${slot}"`) : "";
    if (place) {
      if (!card || !card.includes(`data-continuation-slot="${slot}"`)) {
        failures.push(`homepage continuation slot ${slot} must contain the loaded place ${place.id}`);
      } else if (!card.includes(`href="/svetinje/${place.slug}/"`)) {
        failures.push(`homepage continuation card ${place.id} has the wrong detail route`);
      } else if (!place.previewImageSrc && !card.includes("editorial-place-card__media--fallback")) {
        failures.push(`homepage continuation card ${place.id} must retain its honest no-image fallback`);
      }
    } else if (!placeholder || !placeholder.includes('data-testid="explorer-continuation-placeholder"')) {
      failures.push(`homepage continuation slot ${slot} must remain an honest placeholder`);
    }
  }
  if (/data-continuation-slot="00\d+"/.test(homepageHtml)) failures.push("homepage continuation slots must use two-digit numbering");

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
verifyNewsContracts(homepage, newsArchive, model, pagesByRoute, failures);
verifyCards(homepage, model.places, model.places, "homepage explorer", failures);
verifyCards(catalogue, model.places, model.places, "general catalogue", failures);

for (const [category, route] of Object.entries(CATEGORY_HTML_ROUTES)) {
  const page = pagesByRoute.get(route);
  const members = model.categoryMembership[category];
  verifyCards(page, members, model.places, `${category} catalogue`, failures);
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
  if (/180\s*m|08:00|16:00|18:00|Дјелимично активан|Манастир Прасквица|Црква Св\. Тројице|Манастир Стањевићи|Манастир Дуљево/i.test(page.html)) failures.push(`${page.relative} contains unsupported reference-screenshot content`);
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
