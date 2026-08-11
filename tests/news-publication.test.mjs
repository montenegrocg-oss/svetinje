import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadVisibleNews,
  selectLatestNews,
  sortVisibleNews,
} from "../src/lib/content/news.ts";
import { serbianNewsDateParts } from "../src/lib/news-types.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const EXPECTED_ORDER = [
  "place-added-manastir-savina",
  "place-added-saborni-hram-bar",
  "place-added-dajbabe",
  "place-added-saborni-hram-podgorica",
  "place-added-podmaine",
];

test("the repository preview exposes only allowlisted news in newest-first order", async () => {
  const preview = await loadVisibleNews(PROJECT_ROOT, { editorialPreview: true });
  const production = await loadVisibleNews(PROJECT_ROOT, { editorialPreview: false });
  assert.deepEqual(preview.map((item) => item.id), EXPECTED_ORDER);
  assert.equal(preview.every((item) => item.preview && item.relatedPlaceId && item.href.startsWith("/svetinje/")), true);
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
  const file = path.join(root, "validation", "editorial-preview.json");
  const allowlist = JSON.parse(await readFile(file, "utf8"));
  allowlist.place_ids = allowlist.place_ids.filter((id) => id !== "manastir-savina");
  await writeFile(file, `${JSON.stringify(allowlist, null, 2)}\n`, "utf8");

  const preview = await loadVisibleNews(root, { editorialPreview: true });
  assert.equal(preview.some((item) => item.relatedPlaceId === "manastir-savina"), false);
  assert.equal(preview.some((item) => item.href === "/svetinje/manastir-savina/"), false);
  assert.equal(preview.length, 4);
});

test("news UI remains isolated to its archive and uses semantic linked rows", async () => {
  const [homepage, feed, item, archive] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "src", "pages", "index.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "components", "news", "NewsFeed.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "components", "news", "NewsFeedItem.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "pages", "novosti", "index.astro"), "utf8"),
  ]);
  assert.match(item, /<article[^>]*data-news-item/);
  assert.match(item, /<a class="news-feed-item__link" href=\{item\.href\}>/);
  assert.match(item, /<time class="news-feed-item__date" datetime=\{item\.publishedAt\}>/);
  assert.match(item, /news-feed-item__day/);
  assert.match(item, /news-feed-item__date-compact/);
  assert.doesNotMatch(`${feed}\n${item}`, /<img|carousel|slider/i);
  assert.doesNotMatch(item, /bookmark/i);
  assert.doesNotMatch(homepage, /loadVisibleNews|selectLatestNews|NewsFeed|homepage-news|data-news-item/);
  assert.match(archive, /<NewsFeed items=\{news\} variant="archive"/);
});

test("news archive derives dates and filters from visible records", async () => {
  const archive = await readFile(path.join(PROJECT_ROOT, "src", "pages", "novosti", "index.astro"), "utf8");
  assert.deepEqual(serbianNewsDateParts("2026-08-04T12:00:00Z"), {
    day: "04",
    monthYear: "авг 2026.",
    archiveKey: "2026-08",
    archiveLabel: "август 2026.",
  });
  assert.match(archive, /NEWS_TYPES\.map/);
  assert.match(archive, /archiveByKey/);
  assert.match(archive, /id="news-archive-feed"/);
  assert.match(archive, /aria-live="polite"/);
  assert.match(archive, /data-news-category/);
  assert.match(archive, /data-news-month/);
  assert.match(archive, /selectedCategory === "all" \|\| item\.dataset\.newsType === selectedCategory/);
  assert.match(archive, /selectedMonth === "all" \|\| item\.dataset\.newsMonth === selectedMonth/);
  assert.match(archive, /Нема новости за изабрани период и категорију\./);
});
