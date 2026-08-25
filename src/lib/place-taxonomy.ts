import placeSchema from "../../schemas/place.schema.json" with { type: "json" };

export interface PlaceTaxonomyOption {
  id: string;
  labelSr: string;
}

function taxonomyOptions(value: unknown, label: string): readonly PlaceTaxonomyOption[] {
  if (!Array.isArray(value)) throw new Error(`Cannot read ${label} from canonical place schema`);
  const options = value.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof (entry as { const?: unknown }).const !== "string" || typeof (entry as { title?: unknown }).title !== "string") {
      throw new Error(`Cannot read ${label} from canonical place schema`);
    }
    return { id: (entry as { const: string }).const, labelSr: (entry as { title: string }).title };
  });
  if (new Set(options.map(({ id }) => id)).size !== options.length) throw new Error(`Canonical ${label} contain duplicate IDs`);
  return options;
}

export const PLACE_EPARCHIES = taxonomyOptions(placeSchema.$defs.eparchyId.oneOf, "eparchies");
export const PLACE_MUNICIPALITIES = taxonomyOptions(placeSchema.$defs.municipalityId.oneOf, "municipalities");

const eparchyIds = new Set(PLACE_EPARCHIES.map(({ id }) => id));
const municipalityIds = new Set(PLACE_MUNICIPALITIES.map(({ id }) => id));

export function isPlaceEparchyId(value: unknown): value is string {
  return typeof value === "string" && eparchyIds.has(value);
}

export function isPlaceMunicipalityId(value: unknown): value is string {
  return typeof value === "string" && municipalityIds.has(value);
}
