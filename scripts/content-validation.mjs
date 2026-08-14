import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parseDocument } from "yaml";
import { isPlaceAreaId } from "../src/lib/place-areas.ts";

const SCHEMA_FILES = {
  place: "place.schema.json",
  narrative: "narrative.schema.json",
  source: "source.schema.json",
  practical: "practical.schema.json",
  media: "media.schema.json",
  news: "news.schema.json",
  policy: "publication-policy.schema.json",
};

const ALLOWED_SECTION_KEYS = new Set([
  "introduction",
  "history",
  "consecration",
  "spiritual-significance",
  "architecture-and-art",
  "frescoes-and-interior",
  "crypt-of-all-saints",
  "relics-icons-and-traditions",
  "spiritual-and-cultural-life",
  "services",
  "visitor-information",
  "verification-notes",
  "practical-context",
  "accessibility-context",
  "discovery",
  "foundation",
  "saint-simeon",
  "relics",
  "canonization",
  "feasts",
  "spiritual-life",
  "location",
]);

const ENTITY_PATHS = [
  { kind: "place", pattern: /^content\/places\/([^/]+)\/place\.yaml$/ },
  { kind: "narrative", pattern: /^content\/places\/([^/]+)\/narratives\/(sr|ru|en)\.md$/ },
  { kind: "source", pattern: /^content\/sources\/([^/]+)\.yaml$/ },
  { kind: "practical", pattern: /^content\/practical\/([^/]+)\/([^/]+)\.yaml$/ },
  { kind: "media", pattern: /^content\/media\/([^/]+)\.yaml$/ },
  { kind: "news", pattern: /^content\/news\/([^/]+)\.md$/ },
];

const COUNT_KEY = {
  place: "places",
  narrative: "narratives",
  source: "sources",
  practical: "practical",
  media: "media",
  news: "news",
};

const PUBLIC_STATUSES = new Set(["approved", "published"]);
const PLACE_ROLES = ["factual", "ecclesiastical"];
const LOCALE_ROLE = { sr: "sr-language", ru: "ru-language", en: "en-language" };

function issue(file, field, message) {
  return { file: file.replaceAll("\\", "/"), field, message };
}

function formatAjvPath(error) {
  const suffix = error.params?.missingProperty ? `/${error.params.missingProperty}` : "";
  return `${error.instancePath || "/"}${suffix}`;
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function buildValidators(root) {
  const schemaDir = path.join(root, "schemas");
  const common = await loadJson(path.join(schemaDir, "common.schema.json"));
  const schemas = {};
  for (const [kind, filename] of Object.entries(SCHEMA_FILES)) {
    schemas[kind] = await loadJson(path.join(schemaDir, filename));
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  ajv.addSchema(common);
  for (const schema of Object.values(schemas)) ajv.addSchema(schema);

  return Object.fromEntries(
    Object.entries(schemas).map(([kind, schema]) => [kind, ajv.getSchema(schema.$id)]),
  );
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function sourceTextChecks(text, file) {
  const errors = [];
  if (text.includes("\r")) errors.push(issue(file, "/", "files must use LF line endings"));
  if (text.includes("\t")) errors.push(issue(file, "/", "tabs are not allowed in YAML or Markdown"));
  if (!text.endsWith("\n")) errors.push(issue(file, "/", "file must end with a newline"));
  return errors;
}

function parseYaml(text, file) {
  const errors = sourceTextChecks(text, file);
  if (/(^|\n)\s*<<\s*:/.test(text)) errors.push(issue(file, "/", "YAML merge keys are not allowed"));
  if (/(^|[\s[{,])&[A-Za-z0-9_-]+/.test(text) || /(^|[\s[{,])\*[A-Za-z0-9_-]+/.test(text)) {
    errors.push(issue(file, "/", "YAML anchors and aliases are not allowed"));
  }
  if (/(^|[\s[{,])![A-Za-z]/.test(text)) errors.push(issue(file, "/", "custom YAML tags are not allowed"));

  const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false });
  for (const parseError of document.errors) errors.push(issue(file, "/", parseError.message));
  let data;
  if (document.errors.length === 0) {
    data = document.toJS({ maxAliasCount: 0 });
    if (!data || Array.isArray(data) || typeof data !== "object") {
      errors.push(issue(file, "/", "document root must be a mapping"));
    }
  }
  return { data, errors };
}

function parseMarkdown(text, file) {
  const errors = sourceTextChecks(text, file);
  if (!text.startsWith("---\n")) {
    errors.push(issue(file, "/", "Markdown must begin with YAML front matter"));
    return { data: undefined, body: "", errors };
  }
  const closing = text.indexOf("\n---\n", 4);
  if (closing === -1) {
    errors.push(issue(file, "/", "front matter must end with a standalone --- line"));
    return { data: undefined, body: "", errors };
  }
  const frontMatter = `${text.slice(4, closing)}\n`;
  const parsed = parseYaml(frontMatter, file);
  return { data: parsed.data, body: text.slice(closing + 5), errors: [...errors, ...parsed.errors] };
}

function classify(relativeFile) {
  for (const definition of ENTITY_PATHS) {
    const match = relativeFile.match(definition.pattern);
    if (match) return { kind: definition.kind, match };
  }
  return undefined;
}

function validatePath(record) {
  const errors = [];
  const { file, kind, match, data } = record;
  if (!data) return errors;
  if (kind === "place" && (data.id !== match[1] || path.posix.basename(path.posix.dirname(file)) !== match[1])) {
    errors.push(issue(file, "/id", `place id must match directory ${match[1]}`));
  }
  if (kind === "narrative") {
    if (data.place_id !== match[1]) errors.push(issue(file, "/place_id", `place_id must match directory ${match[1]}`));
    if (data.locale !== match[2]) errors.push(issue(file, "/locale", `locale must match filename ${match[2]}.md`));
  }
  if (kind === "source" && data.id !== match[1]) errors.push(issue(file, "/id", `source id must match filename ${match[1]}`));
  if (kind === "practical") {
    if (data.place_id !== match[1]) errors.push(issue(file, "/place_id", `place_id must match directory ${match[1]}`));
    if (data.id !== match[2]) errors.push(issue(file, "/id", `practical id must match filename ${match[2]}`));
  }
  if (kind === "media" && data.id !== match[1]) errors.push(issue(file, "/id", `media id must match filename ${match[1]}`));
  if (kind === "news" && data.id !== match[1]) errors.push(issue(file, "/id", `news id must match filename ${match[1]}`));
  return errors;
}

function collectValues(value, key, at = "") {
  if (!value || typeof value !== "object") return [];
  const found = [];
  if (!Array.isArray(value) && Array.isArray(value[key])) found.push({ values: value[key], at: `${at}/${key}` });
  for (const [childKey, child] of Object.entries(value)) {
    found.push(...collectValues(child, key, `${at}/${childKey}`));
  }
  return found;
}

function approvedRoles(approvals) {
  return new Map(
    (approvals ?? [])
      .filter((approval) => approval.outcome === "approved")
      .map((approval) => [approval.role, approval]),
  );
}

function requiredRoles(record) {
  const data = record.data;
  if (!data || !PUBLIC_STATUSES.has(data.editorial_status)) return [];
  const roles = [];
  if (record.kind === "place") {
    roles.push(...PLACE_ROLES);
    if (data.location?.coordinates) roles.push("geographic-safety");
  }
  if (record.kind === "narrative") roles.push(...PLACE_ROLES, LOCALE_ROLE[data.locale]);
  if (record.kind === "source") roles.push("factual");
  if (record.kind === "practical") {
    roles.push("factual");
    if (["service-schedule", "official-visitor-instruction"].includes(data.kind)) roles.push("ecclesiastical");
    for (const entry of collectValues(data.value, "locales").flatMap((item) => item.values)) {
      if (entry?.locale && ["approved", "published"].includes(entry.translation_status)) roles.push(LOCALE_ROLE[entry.locale]);
    }
  }
  if (record.kind === "media") {
    const ownerApprovedOriginal =
      data.editorial_status === "approved" &&
      data.rights_basis === "project-original" &&
      (data.approvals ?? []).some(
        (approval) => approval.role === "project-owner" && approval.outcome === "approved",
      );
    if (!ownerApprovedOriginal) roles.push("media-rights");
    for (const [locale, localized] of Object.entries(data.localized_text ?? {})) {
      if (["approved", "published"].includes(localized.translation_status)) roles.push(LOCALE_ROLE[locale]);
    }
  }
  if (record.kind === "news") roles.push("factual", "sr-language");
  if (data.editorial_status === "published") roles.push("publishing");
  return [...new Set(roles.filter(Boolean))];
}

function validateApprovals(record, policy) {
  const errors = [];
  const approvals = record.data?.approvals ?? [];
  const approved = approvedRoles(approvals);
  for (const approval of approvals) {
    const assigned = approval.role === "project-owner"
      ? policy.project_owner_ids
      : policy.role_assignments?.[approval.role];
    if (!assigned?.includes(approval.reviewer_id)) {
      errors.push(issue(record.file, "/approvals", `${approval.reviewer_id} is not assigned to role ${approval.role}`));
    }
  }
  for (const role of requiredRoles(record)) {
    if (!approved.has(role)) errors.push(issue(record.file, "/approvals", `missing approved ${role} review`));
  }
  return errors;
}

function validateDates(record) {
  const errors = [];
  const { data, file } = record;
  if (!data) return errors;
  if (data.audit && data.audit.updated_at < data.audit.created_at) {
    errors.push(issue(file, "/audit/updated_at", "updated_at cannot precede created_at"));
  }
  if (data.valid_from && data.valid_until && data.valid_until < data.valid_from) {
    errors.push(issue(file, "/valid_until", "valid_until cannot precede valid_from"));
  }
  if (data.freshness_status === "stale" && ["show", "show-with-verification-date"].includes(data.display_policy)) {
    errors.push(issue(file, "/display_policy", "stale practical information must warn, hide, or withdraw"));
  }
  const sourceDate = data.publication_date;
  if (sourceDate?.start_year !== undefined && sourceDate?.end_year !== undefined && sourceDate.end_year < sourceDate.start_year) {
    errors.push(issue(file, "/publication_date/end_year", "end_year cannot precede start_year"));
  }
  if (sourceDate?.start_century !== undefined && sourceDate?.end_century !== undefined && sourceDate.end_century < sourceDate.start_century) {
    errors.push(issue(file, "/publication_date/end_century", "end_century cannot precede start_century"));
  }
  for (const [index, entry] of (data.value?.entries ?? []).entries()) {
    if (entry.valid_from && entry.valid_until && entry.valid_until < entry.valid_from) {
      errors.push(issue(file, `/value/entries/${index}/valid_until`, "valid_until cannot precede valid_from"));
    }
    if (entry.end_time && entry.end_time <= entry.start_time) {
      errors.push(issue(file, `/value/entries/${index}/end_time`, "end_time must be later than start_time"));
    }
  }
  return errors;
}

function containsPublished(value) {
  if (!value || typeof value !== "object") return false;
  if (value.editorial_status === "published" || value.translation_status === "published") return true;
  return Object.values(value).some(containsPublished);
}

function validateMarkdown(record) {
  const errors = [];
  const { data, body, file } = record;
  if (!data) return errors;
  if (/<\/?(?:script|iframe|object|embed|form|input|button|style|link|meta)\b/i.test(body) || /\son[a-z]+\s*=/i.test(body)) {
    errors.push(issue(file, "/body", "unsafe raw HTML is not allowed"));
  }
  if (/(?:javascript|data|vbscript):/i.test(body)) errors.push(issue(file, "/body", "unsafe URI protocol is not allowed"));

  const headings = [...body.matchAll(/^##\s+(.+)$/gm)];
  const headingKeys = [];
  for (const heading of headings) {
    const key = heading[1].match(/\s\{#([a-z0-9-]+)\}\s*$/)?.[1];
    if (!key) {
      if (PUBLIC_STATUSES.has(data.editorial_status)) errors.push(issue(file, "/body", "approved H2 headings require a stable {#section-key}"));
      continue;
    }
    if (!ALLOWED_SECTION_KEYS.has(key)) errors.push(issue(file, "/body", `unsupported section key ${key}`));
    if (headingKeys.includes(key)) errors.push(issue(file, "/body", `duplicate section key ${key}`));
    headingKeys.push(key);
  }
  if (PUBLIC_STATUSES.has(data.editorial_status)) {
    if (/\b(?:TBD|TODO|FIXME|placeholder|lorem ipsum|to be confirmed)\b/i.test(`${JSON.stringify(data)}\n${body}`)) {
      errors.push(issue(file, "/", "approved content cannot contain placeholder markers"));
    }
  }
  for (const key of Object.keys(data.section_sources ?? {})) {
    if (!headingKeys.includes(key)) errors.push(issue(file, `/section_sources/${key}`, "section source key has no matching H2 section"));
  }
  if (data.locale === "sr" && body.trim() && !/[\u0400-\u04ff]/u.test(body)) {
    errors.push(issue(file, "/body", "Serbian source narrative must contain Cyrillic text"));
  }
  const references = new Set([...body.matchAll(/\[\^([^\]]+)\](?!:)/g)].map((match) => match[1]));
  const definitions = new Set([...body.matchAll(/^\[\^([^\]]+)\]:/gm)].map((match) => match[1]));
  for (const id of references) if (!definitions.has(id)) errors.push(issue(file, "/body", `footnote ${id} has no definition`));
  for (const id of definitions) if (!references.has(id)) errors.push(issue(file, "/body", `footnote definition ${id} is unused`));
  return errors;
}

function isSafeNewsTargetUrl(value) {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/svetinje/") &&
    !/[\\\u0000-\u001f\u007f]/u.test(value)
  );
}

function validateNewsMarkdown(record) {
  const errors = [];
  const { data, body, file } = record;
  if (!data) return errors;
  if (/<\/?(?:script|iframe|object|embed|form|input|button|style|link|meta)\b/i.test(body) || /\son[a-z]+\s*=/i.test(body)) {
    errors.push(issue(file, "/body", "unsafe raw HTML is not allowed"));
  }
  if (/(?:javascript|data|vbscript):/i.test(body)) errors.push(issue(file, "/body", "unsafe URI protocol is not allowed"));

  const modes = [data.related_place_id, data.target_url, data.slug].filter((value) => typeof value === "string").length;
  if (modes !== 1) errors.push(issue(file, "/", "exactly one navigation strategy is required"));
  if (data.target_url !== undefined && !isSafeNewsTargetUrl(data.target_url)) {
    errors.push(issue(file, "/target_url", "target_url must be a safe same-site absolute path and cannot bypass place publication gating"));
  }
  if (data.slug !== undefined && !body.trim()) {
    errors.push(issue(file, "/body", "slug navigation requires a non-empty Markdown body"));
  }
  return errors;
}

function validateUniqueness(records) {
  const errors = [];
  const identifiers = new Map();
  const narratives = new Map();
  const slugs = new Map();
  for (const record of records) {
    const { data, kind, file } = record;
    if (!data) continue;
    if (["place", "source", "practical", "media", "news"].includes(kind) && data.id) {
      const previous = identifiers.get(data.id);
      if (previous) errors.push(issue(file, "/id", `duplicate entity id ${data.id}; first declared in ${previous}`));
      else identifiers.set(data.id, file);
    }
    if (kind === "narrative") {
      const key = `${data.place_id}:${data.locale}`;
      const previous = narratives.get(key);
      if (previous) errors.push(issue(file, "/locale", `duplicate narrative ${key}; first declared in ${previous}`));
      else narratives.set(key, file);
      if (data.slug && !["archived", "rejected"].includes(data.editorial_status)) {
        const slugKey = `${data.locale}:${data.slug}`;
        const slugPrevious = slugs.get(slugKey);
        if (slugPrevious) errors.push(issue(file, "/slug", `duplicate active ${data.locale} slug ${data.slug}; first declared in ${slugPrevious}`));
        else slugs.set(slugKey, file);
      }
    }
    if (kind === "news" && data.slug && !["archived", "rejected"].includes(data.editorial_status)) {
      const previous = slugs.get(`news:${data.slug}`);
      if (previous) errors.push(issue(file, "/slug", `duplicate active news slug ${data.slug}; first declared in ${previous}`));
      else slugs.set(`news:${data.slug}`, file);
    }
  }
  return errors;
}

function validateReferences(records) {
  const errors = [];
  const byKind = Object.fromEntries(["place", "source", "practical", "media", "news"].map((kind) => [kind, new Map()]));
  for (const record of records) {
    if (byKind[record.kind] && record.data?.id) byKind[record.kind].set(record.data.id, record);
  }
  const placeIds = byKind.place;
  const sourceIds = byKind.source;
  const mediaIds = byKind.media;

  for (const record of records) {
    const { data, file, kind } = record;
    if (!data) continue;
    if (["narrative", "practical"].includes(kind) && !placeIds.has(data.place_id)) {
      errors.push(issue(file, "/place_id", `unknown place id ${data.place_id}`));
    }
    for (const sourceList of [...collectValues(data, "source_ids"), ...collectValues(data, "caption_source_ids")]) {
      for (const id of sourceList.values) if (!sourceIds.has(id)) errors.push(issue(file, sourceList.at, `unknown source id ${id}`));
    }
    if (kind === "place") {
      if (data.browse_area_id !== undefined && !isPlaceAreaId(data.browse_area_id)) {
        errors.push(issue(file, "/browse_area_id", `unknown browse area id ${data.browse_area_id}`));
      }
      const related = data.relationships?.related_place_ids ?? [];
      for (const id of related) if (!placeIds.has(id)) errors.push(issue(file, "/relationships/related_place_ids", `unknown related place id ${id}`));
      for (const id of data.relationships?.media_ids ?? []) if (!mediaIds.has(id)) errors.push(issue(file, "/relationships/media_ids", `unknown media id ${id}`));
      if (data.parent_place_id?.value && !placeIds.has(data.parent_place_id.value)) {
        errors.push(issue(file, "/parent_place_id/value", `unknown parent place id ${data.parent_place_id.value}`));
      }
    }
    if (kind === "media") {
      for (const id of data.related_place_ids ?? []) if (!placeIds.has(id)) errors.push(issue(file, "/related_place_ids", `unknown related place id ${id}`));
    }
    if (kind === "news" && data.related_place_id && !placeIds.has(data.related_place_id)) {
      errors.push(issue(file, "/related_place_id", `unknown related place id ${data.related_place_id}`));
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, chain = []) {
    if (visiting.has(id)) {
      errors.push(issue(byKind.place.get(id)?.file ?? "content", "/parent_place_id", `parent-place cycle: ${[...chain, id].join(" -> ")}`));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const parent = byKind.place.get(id)?.data.parent_place_id?.value;
    if (parent && placeIds.has(parent)) visit(parent, [...chain, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of placeIds.keys()) visit(id);
  return errors;
}

function validatePolicyState(records, policy, policyFile) {
  const errors = [];
  if (policy.public_publication_locked) {
    for (const record of records) {
      if (containsPublished(record.data)) errors.push(issue(record.file, "/", "public publication is locked by validation/publication-policy.json"));
    }
  } else {
    for (const role of ["publishing", "factual", "ecclesiastical", "sr-language", "ru-language", "en-language", "media-rights"]) {
      if (!policy.role_assignments[role]?.length) errors.push(issue(policyFile, `/role_assignments/${role}`, "role must be assigned before the public lock is lifted"));
    }
  }
  return errors;
}

export async function validateRepositoryWithSummary(root) {
  const errors = [];
  const counts = { places: 0, narratives: 0, sources: 0, practical: 0, media: 0, news: 0 };
  let validators;
  try {
    validators = await buildValidators(root);
  } catch (error) {
    return { errors: [issue("schemas", "/", `cannot load schemas: ${error.message}`)], counts, publicationLocked: undefined };
  }

  const policyFile = "validation/publication-policy.json";
  let policy;
  try {
    policy = await loadJson(path.join(root, policyFile));
  } catch (error) {
    return { errors: [issue(policyFile, "/", `cannot read publication policy: ${error.message}`)], counts, publicationLocked: undefined };
  }
  if (!validators.policy(policy)) {
    for (const error of validators.policy.errors ?? []) errors.push(issue(policyFile, formatAjvPath(error), error.message));
  }

  const contentRoot = path.join(root, "content");
  let files;
  try {
    files = await walkFiles(contentRoot);
  } catch (error) {
    return { errors: [...errors, issue("content", "/", `cannot read content directory: ${error.message}`)], counts, publicationLocked: policy.public_publication_locked };
  }

  const records = [];
  for (const absoluteFile of files) {
    const file = path.relative(root, absoluteFile).replaceAll("\\", "/");
    if (file === "content/README.md") continue;
    const classification = classify(file);
    if (!classification) {
      errors.push(issue(file, "/", "file is not in an allowed content path"));
      continue;
    }
    counts[COUNT_KEY[classification.kind]] += 1;
    const text = await readFile(absoluteFile, "utf8");
    const parsed = ["narrative", "news"].includes(classification.kind) ? parseMarkdown(text, file) : parseYaml(text, file);
    errors.push(...parsed.errors);
    const record = { file, kind: classification.kind, match: classification.match, data: parsed.data, body: parsed.body ?? "" };
    records.push(record);
    if (record.data) {
      const validator = validators[record.kind];
      if (!validator(record.data)) {
        for (const error of validator.errors ?? []) errors.push(issue(file, formatAjvPath(error), error.message));
      }
      errors.push(...validatePath(record), ...validateDates(record));
      if (record.kind === "narrative") errors.push(...validateMarkdown(record));
      if (record.kind === "news") errors.push(...validateNewsMarkdown(record));
    }
  }

  if (policy) {
    for (const record of records) if (record.data) errors.push(...validateApprovals(record, policy));
    errors.push(...validatePolicyState(records, policy, policyFile));
  }
  errors.push(...validateUniqueness(records), ...validateReferences(records));
  return {
    errors: errors.sort((a, b) => a.file.localeCompare(b.file) || a.field.localeCompare(b.field) || a.message.localeCompare(b.message)),
    counts,
    publicationLocked: policy.public_publication_locked,
  };
}

export async function validateRepository(root) {
  return (await validateRepositoryWithSummary(root)).errors;
}

export function formatIssues(errors) {
  return errors.map((error) => `${error.file}${error.field === "/" ? "" : error.field}: ${error.message}`).join("\n");
}
