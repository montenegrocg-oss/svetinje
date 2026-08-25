import { stringify } from "yaml";

const ENTITY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertSafeEntitySegment(value, label, maxLength) {
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    value.includes("..") ||
    value.includes("/") ||
    value.includes("\\") ||
    !ENTITY_ID_PATTERN.test(value)
  ) {
    throw new Error(`${label} must be lowercase ASCII kebab-case with no paths, spaces, uppercase letters, or punctuation`);
  }
}

export function validatePlaceScaffoldInput({ id, placeType, name, slug = id, supportedPlaceTypes, requireName = false }) {
  assertSafeEntitySegment(id, "Place ID", 100);
  assertSafeEntitySegment(slug, "Slug", 80);
  if ((requireName || name !== undefined) && (typeof name !== "string" || name.trim().length === 0)) {
    throw new Error("Preferred name must not be empty");
  }
  if (!Array.isArray(supportedPlaceTypes) || !supportedPlaceTypes.includes(placeType)) {
    throw new Error(`Unsupported place type: ${placeType}. Allowed values: ${supportedPlaceTypes.join(", ")}`);
  }
  return { id, placeType, name: name?.trim(), slug };
}

export function serializeResearchPlaceScaffold({
  id,
  placeType,
  name,
  slug = id,
  supportedPlaceTypes,
  eparchyId,
  municipalityId,
  actor = "maxim",
  now = new Date(),
  requireName = false,
}) {
  const input = validatePlaceScaffoldInput({ id, placeType, name, slug, supportedPlaceTypes, requireName });
  if (eparchyId !== undefined) assertSafeEntitySegment(eparchyId, "Eparchy ID", 100);
  if (municipalityId !== undefined) assertSafeEntitySegment(municipalityId, "Municipality ID", 100);
  assertSafeEntitySegment(actor, "Audit actor", 100);
  if (!(now instanceof Date) || Number.isNaN(now.valueOf())) throw new Error("Audit timestamp must be a valid date");

  const timestamp = now.toISOString();
  const audit = {
    created_at: timestamp,
    created_by: actor,
    updated_at: timestamp,
    updated_by: actor,
  };
  const placeRecord = {
    schema_version: 1,
    id: input.id,
    editorial_status: "research",
    place_type: {
      value: input.placeType,
      verification: { status: "requires-verification" },
    },
    ...(eparchyId === undefined ? {} : {
      ecclesiastical: {
        authority_id: {
          value: eparchyId,
          verification: { status: "requires-verification" },
        },
      },
    }),
    ...(municipalityId === undefined ? {} : {
      location: {
        municipality_id: {
          value: municipalityId,
          verification: { status: "requires-verification" },
        },
      },
    }),
    relationships: {},
    approvals: [],
    audit,
  };
  const narrativeFrontMatter = {
    schema_version: 1,
    place_id: input.id,
    locale: "sr",
    editorial_status: "research",
    translation_status: "source",
    slug: input.slug,
    ...(input.name === undefined ? {} : { preferred_name: input.name }),
    approvals: [],
    audit,
  };
  const narrative = `---\n${stringify(narrativeFrontMatter)}---\n\n<!--\nДодајте summary и канонске одјељке прије додавања овог мјеста у\nvalidation/editorial-preview.json.\n-->\n`;

  return {
    id: input.id,
    slug: input.slug,
    placeType: input.placeType,
    preferredName: input.name,
    files: [
      { path: `content/places/${input.id}/place.yaml`, content: stringify(placeRecord) },
      { path: `content/places/${input.id}/narratives/sr.md`, content: narrative },
    ],
  };
}
