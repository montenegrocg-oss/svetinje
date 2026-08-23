import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  derivePlaceAddedNews,
  loadVisibleNews,
  mergeDerivedAndManualNews,
  selectLatestNews,
  sortVisibleNews,
} from "../src/lib/content/news.ts";
import { loadLocalizedVisiblePlaces } from "../src/lib/content/localized-publication.ts";
import { loadVisiblePlaces } from "../src/lib/content/publication.ts";
import { newsDateParts, serbianNewsDateParts } from "../src/lib/news-types.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

function countsBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

test("every preview-visible place yields one derived addition without a news allowlist entry", async () => {
  const [places, preview, production, previewAllowlist] = await Promise.all([
    loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true }),
    loadVisibleNews(PROJECT_ROOT, { editorialPreview: true }),
    loadVisibleNews(PROJECT_ROOT, { editorialPreview: false }),
    readFile(path.join(PROJECT_ROOT, "validation", "editorial-news-preview.json"), "utf8"),
  ]);
  assert.equal(preview.length, places.length);
  assert.deepEqual(JSON.parse(previewAllowlist), { news_ids: [] });
  assert.deepEqual(new Set(preview.map((item) => item.relatedPlaceId)), new Set(places.map((place) => place.id)));
  assert.equal(new Set(preview.map((item) => item.id)).size, places.length);
  assert.equal(preview.every((item) => item.id === `place-added-${item.relatedPlaceId}`), true);
  assert.equal(preview.every((item) => item.type === "place-added" && item.preview && item.href.startsWith("/svetinje/")), true);
  assert.deepEqual(preview.map((item) => item.id), sortVisibleNews(preview).map((item) => item.id));
  assert.deepEqual(production, []);
});

test("created_at is immutable news identity while updated_at is ignored", async () => {
  const [place] = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  assert.ok(place);
  const original = derivePlaceAddedNews([{ ...place, createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z" }], "sr")[0];
  const edited = derivePlaceAddedNews([{ ...place, createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-22T00:00:00Z" }], "sr")[0];
  assert.equal(original?.publishedAt, "2026-08-04T00:00:00Z");
  assert.deepEqual(edited, original);
});

test("a synthetic eligible place appears automatically without manual news migration", async () => {
  const places = await loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true });
  const synthetic = { ...places[0], id: "synthetic-new-place", slug: "synthetic-new-place", name: "Синтетички објекат", createdAt: "2026-08-23T00:00:00Z" };
  const news = derivePlaceAddedNews([...places, synthetic], "sr");
  const item = news.find((candidate) => candidate.id === "place-added-synthetic-new-place");
  assert.equal(news.length, places.length + 1);
  assert.equal(item?.publishedAt, synthetic.createdAt);
  assert.equal(item?.href, "/svetinje/synthetic-new-place/");
});

test("manual duplicates are suppressed while independent editorial news remains", () => {
  const derived = [{ id: "place-added-place-a", locale: "sr", type: "place-added", typeLabel: "НОВИ ОБЈЕКАТ", publishedAt: "2026-08-04T00:00:00Z", title: "Објекат додат на сајт", summary: "Мјесто", href: "/svetinje/place-a/", relatedPlaceId: "place-a", preview: true }];
  const duplicate = { ...derived[0], title: "Историјски ручни дупликат" };
  const editorial = ["site-update", "announcement", "news"].map((type, index) => ({ id: `manual-${index}`, locale: "sr", type, typeLabel: type, publishedAt: `2026-08-0${index + 1}T00:00:00Z`, title: `Manual ${index}`, summary: "Editorial", href: "/o-projektu/", preview: true }));
  const merged = mergeDerivedAndManualNews(derived, [duplicate, ...editorial]);
  assert.equal(merged.filter((item) => item.relatedPlaceId === "place-a").length, 1);
  assert.deepEqual(new Set(merged.map((item) => item.id)), new Set([derived[0].id, ...editorial.map((item) => item.id)]));
});

test("the preview allowlist continues to publish independent manual editorial news", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "svetinje-manual-news-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(PROJECT_ROOT, "content"), path.join(root, "content"), { recursive: true });
  await cp(path.join(PROJECT_ROOT, "validation"), path.join(root, "validation"), { recursive: true });
  await writeFile(path.join(root, "content", "news", "manual-site-update.md"), `---
schema_version: 1
id: manual-site-update
locale: sr
editorial_status: research
published_at: 2026-08-23T12:00:00Z
type: site-update
title: Ручна вијест о сајту
summary: Независна уредничка вијест.
target_url: /o-projektu/
approvals: []
audit:
  created_at: 2026-08-23T12:00:00Z
  created_by: test
  updated_at: 2026-08-23T12:00:00Z
  updated_by: test
---
`, "utf8");
  await writeFile(path.join(root, "validation", "editorial-news-preview.json"), '{\n  "news_ids": ["manual-site-update"]\n}\n', "utf8");

  const [places, news] = await Promise.all([
    loadVisiblePlaces(root, { editorialPreview: true }),
    loadVisibleNews(root, { editorialPreview: true }),
  ]);
  assert.equal(news.filter((item) => item.type === "place-added").length, places.length);
  assert.equal(news.filter((item) => item.id === "manual-site-update").length, 1);
  assert.equal(news.length, places.length + 1);
});

test("Russian and English derived feeds use localized names, labels, and links without Serbian fallback", async () => {
  const [ruPlaces, enPlaces] = await Promise.all([
    loadLocalizedVisiblePlaces("ru", PROJECT_ROOT, { editorialPreview: true }),
    loadLocalizedVisiblePlaces("en", PROJECT_ROOT, { editorialPreview: true }),
  ]);
  const [ruNews, enNews] = await Promise.all([
    loadVisibleNews(PROJECT_ROOT, { editorialPreview: true, locale: "ru", visiblePlaces: ruPlaces }),
    loadVisibleNews(PROJECT_ROOT, { editorialPreview: true, locale: "en", visiblePlaces: enPlaces }),
  ]);
  const ruPlace = ruPlaces.find((place) => place.id === "podmaine");
  const enPlace = enPlaces.find((place) => place.id === "podmaine");
  const ruItem = ruNews.find((item) => item.relatedPlaceId === "podmaine");
  const enItem = enNews.find((item) => item.relatedPlaceId === "podmaine");
  assert.equal(ruNews.length, ruPlaces.length);
  assert.equal(enNews.length, enPlaces.length);
  assert.equal(ruItem?.title, `${ruPlace?.name} добавлен на сайт`);
  assert.equal(ruItem?.href, `/ru/svyatyni/${ruPlace?.slug}/`);
  assert.equal(ruItem?.typeLabel, "НОВЫЙ ОБЪЕКТ");
  assert.equal(enItem?.title, `${enPlace?.name} added to the site`);
  assert.equal(enItem?.href, `/en/holy-places/${enPlace?.slug}/`);
  assert.equal(enItem?.typeLabel, "NEW PLACE");
  assert.equal(ruNews.some((item) => /додат на сајт/.test(item.title)), false);
  assert.equal(enNews.some((item) => /додат на сајт/.test(item.title)), false);
});

test("category and archive counts derive from visible items and canonical creation months", async () => {
  const [places, news] = await Promise.all([
    loadVisiblePlaces(PROJECT_ROOT, { editorialPreview: true }),
    loadVisibleNews(PROJECT_ROOT, { editorialPreview: true }),
  ]);
  assert.equal(news.filter((item) => item.type === "place-added").length, places.length);
  assert.deepEqual(
    countsBy(news, (item) => newsDateParts(item.publishedAt, "sr").archiveKey),
    countsBy(places, (place) => place.createdAt.slice(0, 7)),
  );
});

test("the production place gate remains fail-closed", async () => {
  const production = await loadVisibleNews(PROJECT_ROOT, { editorialPreview: false });
  assert.deepEqual(production, []);
});

test("sorting is deterministic and the homepage selects only the newest five", () => {
  const records = Array.from({ length: 6 }, (_, index) => ({
    id: `record-${String.fromCharCode(102 - index)}`,
    publishedAt: `2026-01-0${index + 1}T00:00:00Z`,
  }));
  const sorted = sortVisibleNews(records);
  assert.equal(sorted.length, 6);
  assert.deepEqual(selectLatestNews(records).map((item) => item.id), sorted.slice(0, 5).map((item) => item.id));
  assert.deepEqual(sortVisibleNews([
    { id: "record-b", publishedAt: "2026-01-01T00:00:00Z" },
    { id: "record-a", publishedAt: "2026-01-01T00:00:00Z" },
  ]).map((item) => item.id), ["record-a", "record-b"]);
});

test("preview news is suppressed when its related place is not visible", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "svetinje-news-publication-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(PROJECT_ROOT, "content"), path.join(root, "content"), { recursive: true });
  await cp(path.join(PROJECT_ROOT, "validation"), path.join(root, "validation"), { recursive: true });
  await writeFile(path.join(root, "validation", "editorial-preview-routes.json"), '{\n  "route_ids": []\n}\n', "utf8");
  const file = path.join(root, "validation", "editorial-preview.json");
  const allowlist = JSON.parse(await readFile(file, "utf8"));
  allowlist.place_ids = allowlist.place_ids.filter((id) => id !== "manastir-savina");
  await writeFile(file, `${JSON.stringify(allowlist, null, 2)}\n`, "utf8");

  const [remainingPlaces, preview] = await Promise.all([
    loadVisiblePlaces(root, { editorialPreview: true }),
    loadVisibleNews(root, { editorialPreview: true }),
  ]);
  assert.equal(preview.some((item) => item.relatedPlaceId === "manastir-savina"), false);
  assert.equal(preview.some((item) => item.href === "/svetinje/manastir-savina/"), false);
  assert.equal(preview.length, remainingPlaces.length);
});

test("news UI remains isolated to its shared archive and uses semantic linked rows", async () => {
  const [homepage, feed, item, route, archive] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "src", "pages", "index.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "components", "news", "NewsFeed.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "components", "news", "NewsFeedItem.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "pages", "novosti", "index.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "components", "NewsArchivePage.astro"), "utf8"),
  ]);
  assert.match(item, /<article[^>]*data-news-item/);
  assert.match(item, /<a class="news-feed-item__link" href=\{item\.href\}>/);
  assert.match(item, /<time class="news-feed-item__date" datetime=\{item\.publishedAt\}>/);
  assert.match(item, /news-feed-item__day/);
  assert.match(item, /news-feed-item__date-compact/);
  assert.doesNotMatch(`${feed}\n${item}`, /<img|carousel|slider/i);
  assert.doesNotMatch(item, /bookmark/i);
  assert.doesNotMatch(homepage, /loadVisibleNews|selectLatestNews|NewsFeed|homepage-news|data-news-item/);
  assert.match(route, /<NewsArchivePage items=\{news\} locale="sr"/);
  assert.match(archive, /<NewsFeed items=\{items\} variant="archive"/);
});

test("news archive derives dates and filters from visible records", async () => {
  const archive = await readFile(path.join(PROJECT_ROOT, "src", "components", "NewsArchivePage.astro"), "utf8");
  assert.deepEqual(serbianNewsDateParts("2026-08-04T12:00:00Z"), {
    day: "04",
    monthYear: "авг 2026.",
    archiveKey: "2026-08",
    archiveLabel: "август 2026.",
  });
  assert.match(archive, /NEWS_TYPES\.map/);
  assert.match(archive, /archiveByKey/);
  assert.match(archive, /newsDateParts\(item\.publishedAt, locale\)/);
  assert.match(archive, /id="news-archive-feed"/);
  assert.match(archive, /aria-live="polite"/);
  assert.match(archive, /data-news-category/);
  assert.match(archive, /data-news-month/);
  assert.match(archive, /selectedCategory === "all" \|\| item\.dataset\.newsType === selectedCategory/);
  assert.match(archive, /selectedMonth === "all" \|\| item\.dataset\.newsMonth === selectedMonth/);
  assert.match(archive, /copy\.empty/);
});
