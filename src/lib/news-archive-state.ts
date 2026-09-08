export const NEWS_PER_PAGE = 12;

export interface NewsArchiveFilter {
  category: string;
  month: string;
}

export function pageCountForNews(itemCount: number) {
  return Math.ceil(Math.max(0, itemCount) / NEWS_PER_PAGE);
}

export function paginateNews<T>(items: readonly T[], requestedPage: number) {
  const totalPages = pageCountForNews(items.length);
  const currentPage = totalPages === 0 ? 1 : Math.min(Math.max(1, requestedPage), totalPages);
  const start = (currentPage - 1) * NEWS_PER_PAGE;

  return {
    currentPage,
    totalPages,
    pageItems: items.slice(start, start + NEWS_PER_PAGE),
  };
}

export function filterNews<T extends { type: string; month: string }>(items: readonly T[], filter: NewsArchiveFilter) {
  return items.filter((item) => (
    (filter.category === "all" || item.type === filter.category)
    && (filter.month === "all" || item.month === filter.month)
  ));
}

export function activeNewsFilterCount(filter: NewsArchiveFilter, options: { hasCategories: boolean; hasArchive: boolean }) {
  return Number(options.hasCategories && filter.category !== "all")
    + Number(options.hasArchive && filter.month !== "all");
}
