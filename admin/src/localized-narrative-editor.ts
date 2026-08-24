import { normalizeUnifiedNarrativeBody } from "../../src/lib/place-content.ts";
import { CANONICAL_SCHEMA_FINGERPRINT, validateNarrative } from "./generated/canonical-validators.js";
import { AdminError, internalFailure } from "./errors.ts";
import type { EditablePlaceRecord, NarrativeLocale } from "./repository-content.ts";
import { parseNarrative, serializeNarrative } from "./repository-content.ts";
import { fingerprintCanonicalSchemas } from "./schema-fingerprint.ts";

export interface UpdateLocalizedNarrativeBody {
  expectedHeadSha?: unknown;
  preferredName?: unknown;
  shortName?: unknown;
  slug?: unknown;
  summary?: unknown;
  patronalFeasts?: unknown;
  serviceSchedule?: unknown;
  narrativeBody?: unknown;
}

const editableLocales = new Set<NarrativeLocale>(["ru", "en"]);
const text = (value: unknown) => typeof value === "string" ? value.trim() : undefined;
const normalizedBody = (value: unknown) => typeof value === "string"
  ? normalizeUnifiedNarrativeBody(value)
  : undefined;
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonical(entry)]));
};
const same = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const normalizedOptionalText = (value: unknown): string | undefined => typeof value === "string"
  ? value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim() || undefined
  : undefined;

function optionalTextList(value: unknown, field: string, errors: Record<string, string>): string[] {
  if (!Array.isArray(value)) {
    errors[field] = "Поље мора бити листа.";
    return [];
  }
  return value.flatMap((entry, index) => {
    if (typeof entry !== "string") {
      errors[`${field}.${index}`] = "Вриједност мора бити текст.";
      return [];
    }
    const normalized = entry.trim();
    return normalized ? [normalized] : [];
  });
}

function assertSafeMarkdown(body: string): void {
  if (/<\/?(?:script|iframe|object|embed|form|input|button|style|link|meta)\b/i.test(body) || /\son[a-z]+\s*=/i.test(body) || /(?:javascript|data|vbscript):/i.test(body)) {
    throw new AdminError("invalid_form_data", 400, "Translation contains unsafe HTML or URI", { narrativeBody: "Текст није безбједан." });
  }
}

export function assertEditableNarrativeLocale(locale: string): asserts locale is "ru" | "en" {
  if (!editableLocales.has(locale as NarrativeLocale)) {
    throw new AdminError("not_found", 404, "Translation locale is not supported");
  }
}

export async function updateLocalizedNarrative(
  record: EditablePlaceRecord,
  locale: "ru" | "en",
  body: UpdateLocalizedNarrativeBody,
  actor: string,
  now: Date,
): Promise<{ content: string; unchanged: boolean }> {
  const original = record.rawNarratives[locale];
  const errors: Record<string, string> = {};
  const slug = text(body.slug);
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Slug мора бити lowercase ASCII kebab-case.";
  const narrativeBody = normalizedBody(body.narrativeBody);
  const patronalFeasts = optionalTextList(body.patronalFeasts ?? original?.patronal_feasts ?? [], "patronalFeasts", errors);
  const serviceSchedule = body.serviceSchedule === undefined
    ? normalizedOptionalText(original?.service_schedule)
    : normalizedOptionalText(body.serviceSchedule);
  if (narrativeBody === undefined) errors.narrativeBody = "Текст превода мора бити текстуално поље.";
  if (Object.keys(errors).length > 0) throw new AdminError("invalid_form_data", 400, "Translation update is invalid", errors);
  assertSafeMarkdown(narrativeBody ?? "");

  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const narrative = original ? structuredClone(original) : {
    schema_version: 1,
    place_id: record.place.id,
    locale,
    editorial_status: "research",
    translation_status: "draft",
    source_revision: record.state.headSha,
    approvals: [],
    audit: { created_at: timestamp, created_by: actor, updated_at: timestamp, updated_by: actor },
  };
  const assign = (key: string, value: string | undefined) => value ? narrative[key] = value : delete narrative[key];
  assign("preferred_name", text(body.preferredName));
  assign("short_name", text(body.shortName));
  assign("slug", slug);
  assign("summary", text(body.summary));
  if (patronalFeasts.length > 0) narrative.patronal_feasts = patronalFeasts; else delete narrative.patronal_feasts;
  assign("service_schedule", serviceSchedule);

  const originalBody = normalizedBody(record.narrativeBodies[locale] ?? "") ?? "";
  const comparableOriginal = original ? structuredClone(original) : undefined;
  if (comparableOriginal && typeof comparableOriginal.service_schedule === "string") {
    comparableOriginal.service_schedule = normalizedOptionalText(comparableOriginal.service_schedule);
  }
  const unchanged = Boolean(comparableOriginal) && same(narrative, comparableOriginal) && narrativeBody === originalBody;
  if (unchanged) return { content: serializeNarrative(narrative, narrativeBody ?? ""), unchanged: true };

  if (original) {
    if (!["draft", "outdated", "archived"].includes(original.translation_status)) narrative.translation_status = "draft";
    if (original.translation_status !== "outdated" && original.translation_status !== "archived") narrative.source_revision = record.state.headSha;
  }
  narrative.audit = { ...narrative.audit, updated_at: timestamp, updated_by: actor };
  const content = serializeNarrative(narrative, narrativeBody ?? "");
  if (!parseNarrative(content).frontMatter) throw new AdminError("invalid_form_data", 400, "Serialized translation is invalid");
  const fingerprint = await fingerprintCanonicalSchemas(record.schemas);
  if (fingerprint !== CANONICAL_SCHEMA_FINGERPRINT) throw internalFailure("canonical_schema_fingerprint_mismatch");
  if (!validateNarrative(narrative)) {
    const schemaErrors = Object.fromEntries((validateNarrative.errors ?? []).map((error) => [`narrative${error.instancePath || "/"}`, error.message ?? "Није важеће."]));
    throw new AdminError("invalid_form_data", 400, "Canonical translation validation failed", schemaErrors);
  }
  return { content, unchanged: false };
}

export function markLocalizedNarrativeOutdated(
  record: EditablePlaceRecord,
  locale: "ru" | "en",
  actor: string,
  now: Date,
): string | undefined {
  const original = record.rawNarratives[locale];
  if (!original || ["missing", "outdated", "archived"].includes(original.translation_status)) return undefined;
  const narrative = structuredClone(original);
  narrative.translation_status = "outdated";
  narrative.audit = {
    ...narrative.audit,
    updated_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    updated_by: actor,
  };
  return serializeNarrative(narrative, record.narrativeBodies[locale] ?? "");
}
