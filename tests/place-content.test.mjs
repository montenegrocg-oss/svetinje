import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  canonicalYoutubeUrl,
  getPlaceAboutLabel,
  normalizeUnifiedNarrativeBody,
  parsePlaceNarrativeBlocks,
  parseYoutubeVideoId,
} from "../src/lib/place-content.ts";

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("place about labels share one type mapping", () => {
  assert.equal(getPlaceAboutLabel("monastery"), "О манастиру");
  assert.equal(getPlaceAboutLabel("church"), "О цркви");
  assert.equal(getPlaceAboutLabel("cathedral"), "О цркви");
  assert.equal(getPlaceAboutLabel("holy-spring"), "О светињи");
});

test("YouTube parser accepts supported formats and rejects unsafe hosts", () => {
  const id = "dQw4w9WgXcQ";
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
  ]) assert.equal(parseYoutubeVideoId(url), id);
  assert.equal(canonicalYoutubeUrl(`https://youtu.be/${id}`), `https://www.youtube.com/watch?v=${id}`);
  for (const value of [
    `https://youtube.example.com/watch?v=${id}`,
    `javascript:alert(1)`,
    `<iframe src="https://www.youtube.com/embed/${id}"></iframe>`,
    `https://www.youtube.com/watch?v=short`,
    `https://youtu.be/${id}/extra`,
    `https://www.youtube.com/embed/${id}/extra`,
  ]) assert.equal(parseYoutubeVideoId(value), undefined);
});

test("unified narrative compatibility retains every real non-empty heading and paragraph", async () => {
  const placesRoot = new URL("../content/places/", import.meta.url);
  const directories = await readdir(placesRoot, { withFileTypes: true });
  let checked = 0;
  for (const directory of directories.filter((entry) => entry.isDirectory())) {
    const file = new URL(`${directory.name}/narratives/sr.md`, placesRoot);
    let markdown;
    try { markdown = await readFile(file, "utf8"); } catch { continue; }
    const end = markdown.indexOf("\n---\n", 4);
    const body = markdown.slice(end + 5);
    const normalized = normalizeUnifiedNarrativeBody(body);
    assert.notEqual(normalized, undefined);
    const renderedText = parsePlaceNarrativeBlocks(normalized).map(({ text }) => text).join("\n");
    const expectedBlocks = body.replaceAll("\r\n", "\n").split(/\n\s*\n/).flatMap((block) => {
      const value = block.trim();
      if (!value || /^\[\^[^\]]+\]:/.test(value)) return [];
      const heading = value.match(/^#{2,}\s+(.+?)(?:\s+\{#[a-z0-9-]+\})?\s*$/);
      const text = (heading?.[1] ?? value).replace(/\[\^[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
      return text ? [text] : [];
    });
    for (const text of expectedBlocks) assert.ok(renderedText.includes(text), `${directory.name} lost narrative text: ${text}`);
    checked += 1;
  }
  assert.ok(checked >= 27);
});

test("place detail keeps one shared article, ordered interactive gallery, optional video, and optional feast", async () => {
  const [route, page, gallery, practical, publication] = await Promise.all([
    source("src/pages/svetinje/[slug].astro"),
    source("src/components/PlaceDetailPage.astro"),
    source("src/components/place-detail/PlaceDetailGallery.astro"),
    source("src/components/place-detail/PlacePracticalPanel.astro"),
    source("src/lib/content/publication.ts"),
  ]);
  assert.match(route, /<PlaceDetailPage place=\{place\} locale="sr"/);
  assert.match(page, /<PlaceNarrativeArticle body=\{place\.narrativeBody\} heading=\{aboutLabel\} locale=\{locale\}/);
  assert.doesNotMatch(page, /place-history-title|place-arrival-title|Историјски подаци су у припреми/);
  assert.match(gallery, /secondaryImages\.map/);
  assert.match(gallery, /data-gallery-index=\{String\(index \+ 1\)\}/);
  assert.match(gallery, /place\.youtubeVideoId &&/);
  assert.match(gallery, /youtube-nocookie\.com\/embed/);
  assert.match(gallery, /alt=\{primaryImage\.alt\}/);
  assert.match(practical, /value: place\.patronalFeast/);
  assert.match(publication, /mediaOrder/);
  assert.match(publication, /order\.get\(left\.id\)/);
  assert.match(await source("src/components/place-detail/PlaceNarrativeArticle.astro"), /block\.text === heading \|\| block\.text === genericHeading/);
});
