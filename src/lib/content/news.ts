import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import { placeDetailRoot, type Locale } from "../../i18n/config.ts";
import { areaLabels, publicCopy } from "../../i18n/public-copy.ts";
import { isNewsType, newsTypeLabel, type NewsType } from "../news-types.ts";
import { loadLocalizedVisiblePlaces } from "./localized-publication.ts";
import { loadVisiblePlaces, type VisiblePlace } from "./publication.ts";

interface Approval {
  role: string;
  reviewer_id: string;
  outcome: string;
}

interface PublicationPolicy {
  public_publication_locked: boolean;
  role_assignments: Record<string, string[]>;
}

export interface NewsRecord {
  schema_version: 1;
  id: string;
  locale: "sr";
  editorial_status: string;
  published_at: string;
  type: NewsType;
  title: string;
  summary: string;
  related_place_id?: string;
  target_url?: string;
  slug?: string;
  approvals: Approval[];
  audit: {
    created_at: string;
    created_by: string;
    updated_at: string;
    updated_by: string;
  };
  body: string;
}

export interface VisibleNewsItem {
  id: string;
  locale: Locale;
  type: NewsType;
  typeLabel: string;
  publishedAt: string;
  title: string;
  summary: string;
  href: string;
  relatedPlaceId?: string;
  slug?: string;
  preview: boolean;
  body?: string;
}

export interface ExcludedNewsMarker {
  id: string;
  title: string;
  summary: string;
  relatedPlaceId?: string;
  slug?: string;
  body?: string;
}

interface LoadVisibleNewsOptions {
  editorialPreview?: boolean;
  visiblePlaces?: VisiblePlace[];
  locale?: Locale;
}

const ENTITY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const PUBLIC_NEWS_ROLES = ["factual", "sr-language", "publishing"];
const NEWS_FIELDS = new Set([
  "schema_version", "id", "locale", "editorial_status", "published_at", "type", "title", "summary",
  "related_place_id", "target_url", "slug", "approvals", "audit",
]);
const EDITORIAL_STATUSES = new Set([
  "research", "draft", "fact-review", "ecclesiastical-review", "language-review", "approved", "published",
  "needs-reverification", "disputed", "archived", "rejected",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertNews(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`News content validation failed: ${message}`);
}

function parseYamlObject(text: string, file: string): Record<string, unknown> {
  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  if (document.errors.length > 0) {
    throw new Error(`Cannot parse ${file}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (!isObject(value)) throw new Error(`${file} must contain a YAML mapping`);
  return value;
}

export function isSafeNewsTargetUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/svetinje/") &&
    !/[\\\u0000-\u001f\u007f]/u.test(value)
  );
}

export function validateNewsNavigation(record: {
  related_place_id?: unknown;
  target_url?: unknown;
  slug?: unknown;
  body?: unknown;
}): string[] {
  const errors: string[] = [];
  const hasRelatedPlace = typeof record.related_place_id === "string";
  const hasTargetUrl = typeof record.target_url === "string";
  const hasSlug = typeof record.slug === "string";
  const modeCount = [hasRelatedPlace, hasTargetUrl, hasSlug].filter(Boolean).length;
  if (modeCount !== 1) errors.push("exactly one navigation strategy is required");
  if (hasTargetUrl && !isSafeNewsTargetUrl(record.target_url)) {
    errors.push("target_url must be a safe same-site absolute path and cannot bypass place publication gating");
  }
  if (hasSlug && (typeof record.body !== "string" || record.body.trim().length === 0)) {
    errors.push("slug navigation requires a non-empty Markdown body");
  }
  return errors;
}

function parseNewsMarkdown(text: string, file: string): NewsRecord {
  assertNews(text.startsWith("---\n"), `${file} must begin with YAML front matter`);
  const closing = text.indexOf("\n---\n", 4);
  assertNews(closing !== -1, `${file} has unclosed front matter`);
  const frontMatter = parseYamlObject(`${text.slice(4, closing)}\n`, file);
  const body = text.slice(closing + 5);
  const record = { ...frontMatter, body } as unknown as NewsRecord;

  assertNews(Object.keys(frontMatter).every((key) => NEWS_FIELDS.has(key)), `${file} contains an unsupported front-matter field`);
  assertNews(record.schema_version === 1, `${file} requires schema_version 1`);
  assertNews(typeof record.id === "string" && ENTITY_ID.test(record.id), `${file} has an invalid ID`);
  assertNews(record.locale === "sr", `${file} must use Serbian source locale sr`);
  assertNews(EDITORIAL_STATUSES.has(record.editorial_status), `${file} has an invalid editorial_status`);
  assertNews(typeof record.published_at === "string" && ISO_TIMESTAMP.test(record.published_at), `${file} has an invalid published_at timestamp`);
  assertNews(isNewsType(record.type), `${file} has an unsupported news type`);
  assertNews(typeof record.title === "string" && record.title.trim(), `${file} requires a title`);
  assertNews(typeof record.summary === "string" && record.summary.trim(), `${file} requires a summary`);
  assertNews(Array.isArray(record.approvals), `${file} requires approvals`);
  assertNews(isObject(record.audit), `${file} requires audit metadata`);
  assertNews(
    [record.audit.created_at, record.audit.updated_at].every((value) => typeof value === "string" && ISO_TIMESTAMP.test(value)),
    `${file} has invalid audit timestamps`,
  );
  assertNews(
    [record.audit.created_by, record.audit.updated_by].every((value) => typeof value === "string" && ENTITY_ID.test(value)),
    `${file} has invalid audit editors`,
  );
  const navigationErrors = validateNewsNavigation(record);
  assertNews(navigationErrors.length === 0, `${file}: ${navigationErrors.join("; ")}`);
  return record;
}

async function readNewsRecords(root: string): Promise<NewsRecord[]> {
  const directory = path.join(root, "content", "news");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return [];
    throw error;
  }
  const records: NewsRecord[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    assertNews(entry.isFile() && entry.name.endsWith(".md"), `content/news/${entry.name} is not an allowed news file`);
    const file = path.join(directory, entry.name);
    const record = parseNewsMarkdown(await readFile(file, "utf8"), file);
    assertNews(path.basename(entry.name, ".md") === record.id, `${file} ID must match its filename`);
    records.push(record);
  }
  assertNews(new Set(records.map((record) => record.id)).size === records.length, "news IDs must be unique");
  const detailSlugs = records.flatMap((record) => record.slug ? [record.slug] : []);
  assertNews(new Set(detailSlugs).size === detailSlugs.length, "active news detail slugs must be unique");
  return records;
}

async function loadPolicy(root: string): Promise<PublicationPolicy> {
  const value: unknown = JSON.parse(await readFile(path.join(root, "validation", "publication-policy.json"), "utf8"));
  assertNews(isObject(value), "publication policy must be an object");
  return value as unknown as PublicationPolicy;
}

async function loadPreviewAllowlist(root: string, knownIds: Set<string>): Promise<string[]> {
  const file = path.join(root, "validation", "editorial-news-preview.json");
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  assertNews(isObject(value), "editorial-news-preview.json must contain an object");
  assertNews(
    Object.keys(value).length === 1 && Object.hasOwn(value, "news_ids"),
    "editorial-news-preview.json may contain only news_ids",
  );
  assertNews(Array.isArray(value.news_ids), "news_ids must be an array");
  assertNews(value.news_ids.every((id) => typeof id === "string" && ENTITY_ID.test(id)), "news_ids must contain valid entity IDs");
  const ids = value.news_ids as string[];
  assertNews(new Set(ids).size === ids.length, "news_ids must not contain duplicates");
  for (const id of ids) assertNews(knownIds.has(id), `unknown allowlisted news ID ${id}`);
  return ids;
}

function hasPublicationApprovals(record: NewsRecord, policy: PublicationPolicy): boolean {
  return PUBLIC_NEWS_ROLES.every((role) => {
    const assigned = policy.role_assignments[role] ?? [];
    return record.approvals.some(
      (approval) => approval.role === role && approval.outcome === "approved" && assigned.includes(approval.reviewer_id),
    );
  });
}

function normalizeNews(record: NewsRecord, placesById: Map<string, VisiblePlace>, preview: boolean): VisibleNewsItem | undefined {
  const relatedPlace = record.related_place_id ? placesById.get(record.related_place_id) : undefined;
  if (record.related_place_id && !relatedPlace) return undefined;
  const href = relatedPlace
    ? `/svetinje/${relatedPlace.slug}/`
    : record.target_url
      ? record.target_url
      : `/novosti/${record.slug}/`;
  return {
    id: record.id,
    locale: "sr",
    type: record.type,
    typeLabel: newsTypeLabel(record.type),
    publishedAt: record.published_at,
    title: record.title,
    summary: record.summary,
    href,
    ...(record.related_place_id ? { relatedPlaceId: record.related_place_id } : {}),
    ...(record.slug ? { slug: record.slug, body: record.body.trim() } : {}),
    preview,
  };
}

function derivedPlaceSummary(place: VisiblePlace, locale: Locale): string {
  const location = [place.municipality, place.settlement].filter((value): value is string => Boolean(value?.trim()));
  if (location.length > 0) return location.join(" · ");
  if (place.browseAreaId) return areaLabels[locale][place.browseAreaId] ?? place.summary;
  return place.summary;
}

export function derivePlaceAddedNews(places: VisiblePlace[], locale: Locale = "sr"): VisibleNewsItem[] {
  const copy = publicCopy[locale].pages.news;
  return sortVisibleNews(places.map((place) => ({
    id: `place-added-${place.id}`,
    locale,
    type: "place-added",
    typeLabel: copy.types["place-added"],
    publishedAt: place.createdAt,
    title: copy.placeAddedTitle.replace("{name}", place.name),
    summary: derivedPlaceSummary(place, locale),
    href: `${placeDetailRoot[locale]}${place.slug}/`,
    relatedPlaceId: place.id,
    preview: place.preview,
  })));
}

export function mergeDerivedAndManualNews(
  derivedItems: VisibleNewsItem[],
  manualItems: VisibleNewsItem[],
): VisibleNewsItem[] {
  const derivedIds = new Set(derivedItems.map((item) => item.id));
  const derivedPlaceIds = new Set(derivedItems.flatMap((item) => item.relatedPlaceId ? [item.relatedPlaceId] : []));
  const uniqueManualItems = manualItems.filter((item) => (
    !derivedIds.has(item.id) &&
    !(item.type === "place-added" && item.relatedPlaceId && derivedPlaceIds.has(item.relatedPlaceId))
  ));
  return sortVisibleNews([...derivedItems, ...uniqueManualItems]);
}

export function sortVisibleNews(items: VisibleNewsItem[]): VisibleNewsItem[] {
  return [...items].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id),
  );
}

export function selectLatestNews(items: VisibleNewsItem[], limit = 5): VisibleNewsItem[] {
  return sortVisibleNews(items).slice(0, Math.max(0, limit));
}

export function formatNewsDate(timestamp: string): string {
  const date = new Date(timestamp);
  assertNews(!Number.isNaN(date.getTime()), `cannot format invalid timestamp ${timestamp}`);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()}`;
}

export async function loadVisibleNews(
  root = process.cwd(),
  options: LoadVisibleNewsOptions = {},
): Promise<VisibleNewsItem[]> {
  const editorialPreview = options.editorialPreview ?? process.env.EDITORIAL_PREVIEW === "true";
  const locale = options.locale ?? "sr";
  const [records, policy, visiblePlaces] = await Promise.all([
    readNewsRecords(root),
    loadPolicy(root),
    options.visiblePlaces ?? (locale === "sr"
      ? loadVisiblePlaces(root, { editorialPreview })
      : loadLocalizedVisiblePlaces(locale, root, { editorialPreview })),
  ]);
  const placesById = new Map(visiblePlaces.map((place) => [place.id, place]));
  const derivedItems = derivePlaceAddedNews(visiblePlaces, locale);
  const publicItems = locale !== "sr" || policy.public_publication_locked
    ? []
    : records.flatMap((record) => {
        if (record.editorial_status !== "published" || !hasPublicationApprovals(record, policy)) return [];
        const item = normalizeNews(record, placesById, false);
        return item ? [item] : [];
      });
  if (!editorialPreview) return mergeDerivedAndManualNews(derivedItems, publicItems);

  if (locale !== "sr") return derivedItems;

  const allowlist = await loadPreviewAllowlist(root, new Set(records.map((record) => record.id)));
  const recordById = new Map(records.map((record) => [record.id, record]));
  const previewItems = allowlist.flatMap((id) => {
    const record = recordById.get(id);
    assertNews(record, `missing allowlisted news record ${id}`);
    if (["archived", "rejected"].includes(record.editorial_status)) return [];
    const item = normalizeNews(record, placesById, record.editorial_status !== "published");
    return item ? [item] : [];
  });
  const previewIds = new Set(previewItems.map((item) => item.id));
  return mergeDerivedAndManualNews(
    derivedItems,
    [...publicItems.filter((item) => !previewIds.has(item.id)), ...previewItems],
  );
}

export async function loadExcludedNewsMarkers(root = process.cwd()): Promise<ExcludedNewsMarker[]> {
  const [records, visible] = await Promise.all([
    readNewsRecords(root),
    loadVisibleNews(root, { editorialPreview: false }),
  ]);
  const visibleIds = new Set(visible.map((item) => item.id));
  return records.filter((record) => !visibleIds.has(record.id)).map((record) => ({
    id: record.id,
    title: record.title,
    summary: record.summary,
    ...(record.related_place_id ? { relatedPlaceId: record.related_place_id } : {}),
    ...(record.slug ? { slug: record.slug, body: record.body.trim() } : {}),
  }));
}
