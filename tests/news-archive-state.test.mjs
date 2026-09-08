import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  NEWS_PER_PAGE,
  activeNewsFilterCount,
  filterNews,
  pageCountForNews,
  paginateNews,
} from "../src/lib/news-archive-state.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const items = (count) => Array.from({ length: count }, (_, index) => ({
  id: `news-${index + 1}`,
  type: index % 2 === 0 ? "place-added" : "site-update",
  month: index < 20 ? "2026-09" : "2026-08",
}));

test("news pagination uses twelve items and has correct page boundaries", () => {
  assert.equal(NEWS_PER_PAGE, 12);
  assert.equal(pageCountForNews(0), 0);
  assert.equal(pageCountForNews(1), 1);
  assert.equal(pageCountForNews(12), 1);
  assert.equal(pageCountForNews(13), 2);
  assert.equal(pageCountForNews(62), 6);
  assert.deepEqual(paginateNews(items(62), 6).pageItems.map((item) => item.id), ["news-61", "news-62"]);
});

test("news pagination preserves ordering and clamps the selected page", () => {
  const ordered = items(13);
  assert.deepEqual(paginateNews(ordered, 1).pageItems.map((item) => item.id), ordered.slice(0, 12).map((item) => item.id));
  assert.deepEqual(paginateNews(ordered, 2).pageItems.map((item) => item.id), ["news-13"]);
  assert.equal(paginateNews(ordered, 99).currentPage, 2);
  assert.equal(paginateNews([], 3).currentPage, 1);
});

test("news filters run before pagination and combine category with month", () => {
  const source = items(30);
  const filtered = filterNews(source, { category: "site-update", month: "2026-09" });
  assert.deepEqual(filtered.map((item) => item.id), ["news-2", "news-4", "news-6", "news-8", "news-10", "news-12", "news-14", "news-16", "news-18", "news-20"]);
  assert.equal(paginateNews(filtered, 1).totalPages, 1);
  assert.equal(filterNews(source, { category: "missing", month: "all" }).length, 0);
});

test("mobile filter count includes only available active dimensions", () => {
  assert.equal(activeNewsFilterCount({ category: "place-added", month: "2026-09" }, { hasCategories: true, hasArchive: true }), 2);
  assert.equal(activeNewsFilterCount({ category: "place-added", month: "2026-09" }, { hasCategories: false, hasArchive: true }), 1);
  assert.equal(activeNewsFilterCount({ category: "all", month: "all" }, { hasCategories: true, hasArchive: true }), 0);
});

test("news archive renders useful filters only, a compact mobile disclosure, and accessible pagination", async () => {
  const archive = await readFile(path.join(PROJECT_ROOT, "src", "components", "NewsArchivePage.astro"), "utf8");
  assert.match(archive, /filter\(\(category\) => category\.count > 0\)/);
  assert.match(archive, /const hasCategoryFilters = categories\.length >= 2/);
  assert.match(archive, /const hasArchiveFilters = archiveGroups\.length >= 2/);
  assert.match(archive, /news-archive__layout--with-filters/);
  assert.match(archive, /data-news-filter-toggle aria-expanded="false"/);
  assert.match(archive, /data-news-mobile-filter-count/);
  assert.match(archive, /data-news-pagination/);
  assert.match(archive, /aria-current=\{page === 1 \? "page" : undefined\}/);
  assert.match(archive, /previousButton\.disabled = totalPages === 0 \|\| currentPage === 1/);
  assert.match(archive, /nextButton\.disabled = totalPages === 0 \|\| currentPage === totalPages/);
  assert.match(archive, /applyFilters\(1\)/);
  assert.match(archive, /role="status" data-news-filter-empty/);
  assert.doesNotMatch(archive, /news-info-strip|news-status-card/);
});

test("archive presentation keeps derived additions compact and manual news available for richer summaries", async () => {
  const [item, styles] = await Promise.all([
    readFile(path.join(PROJECT_ROOT, "src", "components", "news", "NewsFeedItem.astro"), "utf8"),
    readFile(path.join(PROJECT_ROOT, "src", "styles", "global.css"), "utf8"),
  ]);
  assert.match(item, /<p>\{item\.summary\}<\/p>/);
  assert.match(styles, /\.news-feed-item--archive\[data-news-type="place-added"\] \.news-feed-item__link/);
  assert.match(styles, /\.news-feed-item--archive\[data-news-type="place-added"\] \.news-feed-item__content h3/);
});
