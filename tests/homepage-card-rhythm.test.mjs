import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { publicCopy } from "../src/i18n/public-copy.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("sidebar cards use a semantic stretched detail link without nesting taxonomy links", async () => {
  const card = await source("src/components/PlaceCard.astro");

  assert.match(card, /const detailHref = `\$\{placeDetailRoot\[locale\]\}\$\{place\.slug\}\//);
  assert.match(card, /variant === "sidebar"[\s\S]*?<a class="editorial-place-card__title-link" href=\{detailHref\}>\{place\.name\}<\/a>/);
  assert.match(card, /\{variant !== "sidebar" && \([\s\S]*?<a class="editorial-place-card__link" href=\{detailHref\}>/);
  assert.doesNotMatch(card, /<a[^>]*>\s*<article|<article[^>]*>\s*<a[^>]*>[\s\S]*editorial-place-card__taxonomy/);
  assert.match(card, /editorial-place-card__taxonomy[\s\S]*?item\.href \? <a href=\{item\.href\}/);
});

test("sidebar detail interaction preserves explorer and selected-state data contracts", async () => {
  const [card, explorer] = await Promise.all([
    source("src/components/PlaceCard.astro"),
    source("src/components/MapExplorer.astro"),
  ]);

  for (const attribute of [
    "data-place-card={place.id}",
    'data-place-area={place.browseAreaId ?? ""}',
    'data-place-category={category ?? ""}',
    "data-place-search={place.catalogueSearchText}",
    'data-selected="false"',
    "data-initial-explorer-placement={initialExplorerPlacement}",
  ]) assert.ok(card.includes(attribute), `${attribute} must remain on the card article`);
  assert.match(explorer, /placeCards = \[\.\.\.\(explorerRoot\?\.querySelectorAll<HTMLElement>\("\[data-place-card\]"\)/);
  assert.match(explorer, /card\.dataset\.selected = "false"/);
  assert.doesNotMatch(card, /onclick|onkeydown|role="button"|tabindex=/);
});

test("sidebar text keeps two-line clamps without reserved title or summary height", async () => {
  const styles = await source("src/styles/global.css");
  const sidebarTitleRules = [...styles.matchAll(/\.editorial-place-card--sidebar h2\s*\{([^}]*)\}/g)].map((match) => match[1]).join("\n");
  const sidebarSummaryRules = [...styles.matchAll(/\.editorial-place-card--sidebar \.editorial-place-card__summary\s*\{([^}]*)\}/g)].map((match) => match[1]).join("\n");

  assert.match(sidebarTitleRules, /-webkit-line-clamp:\s*2/);
  assert.doesNotMatch(sidebarTitleRules, /min-height/);
  assert.match(sidebarSummaryRules, /-webkit-line-clamp:\s*2/);
  assert.doesNotMatch(sidebarSummaryRules, /min-height/);
  assert.match(styles, /\.editorial-place-card--sidebar \.editorial-place-card__location\s*\{[\s\S]*?margin-top:\s*0\.2rem;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
});

test("stretched card links leave taxonomy links interactive and expose whole-card focus", async () => {
  const styles = await source("src/styles/global.css");

  assert.match(styles, /\.editorial-place-card--sidebar\s*\{[\s\S]*?position:\s*relative;[\s\S]*?isolation:\s*isolate;/);
  assert.match(styles, /\.editorial-place-card--sidebar \.editorial-place-card__title-link::after\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*1;[\s\S]*?inset:\s*0;/);
  assert.match(styles, /\.editorial-place-card--sidebar \.editorial-place-card__taxonomy\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*2;/);
  assert.match(styles, /\.editorial-place-card--sidebar:has\(\.editorial-place-card__title-link:focus-visible\)/);
  assert.match(styles, /@media \(hover:\s*hover\) and \(pointer:\s*fine\)[\s\S]*?\.editorial-place-card--sidebar:hover/);
});

test("catalogue and featured CTAs remain while the sidebar CTA is conditional", async () => {
  const card = await source("src/components/PlaceCard.astro");

  assert.match(card, /variant\?: "sidebar" \| "catalogue" \| "featured"/);
  assert.match(card, /variant !== "sidebar" && \([\s\S]*?publicCopy\[locale\]\.openPage/);
  assert.equal([...card.matchAll(/publicCopy\[locale\]\.openPage/g)].length, 1);
});

test("recommended cards keep their media geometry and use compact clamped text", async () => {
  const [recommended, styles] = await Promise.all([
    source("src/components/RecommendedPlaces.astro"),
    source("src/styles/global.css"),
  ]);

  assert.equal(publicCopy.sr.homepage.recommended.title, "Најпосјећеније светиње");
  assert.match(recommended, /<h3>\{place\.name\}<\/h3>/);
  assert.match(recommended, /\{location && <small>\{location\}<\/small>\}/);
  assert.doesNotMatch(recommended, /place\.typeLabel|Отвори|openPage|record-action/);
  assert.match(styles, /\.place-preview__media\s*\{[\s\S]*?aspect-ratio:\s*16 \/ 9;/);
  assert.match(styles, /\.place-preview__record-image\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?object-fit:\s*cover;/);
  assert.match(styles, /\.place-preview__record-body h3\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/);
  assert.match(styles, /\.place-preview__record-body small\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/);
  assert.match(styles, /\.place-preview__record-body\s*\{[\s\S]*?gap:\s*0\.22rem;[\s\S]*?padding:\s*0\.62rem 0\.7rem 0\.68rem;/);
});
