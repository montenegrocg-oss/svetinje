import { parse, stringify } from "yaml";
import { normalizeCatalogueSearchText } from "../../src/lib/catalogue-search.ts";
import { AdminError, internalFailure } from "./errors.ts";
import { validateFeastRegistry } from "./generated/canonical-validators.js";

export type FeastDate =
  | { kind: "fixed"; month: number; day: number }
  | { kind: "movable" };

export interface FeastRecord {
  id: string;
  name_sr: string;
  legacy_names: string[];
  date?: FeastDate;
  calendar_bindings?: string[];
}

export interface FeastRegistry {
  schema_version: 1;
  feasts: FeastRecord[];
}

export interface FeastRegistrySnapshot {
  blobSha: string;
  rawYaml: string;
  registry: FeastRegistry;
}

export interface StagedFeastInput {
  id?: unknown;
  nameSr?: unknown;
  dateKind?: unknown;
  month?: unknown;
  day?: unknown;
  nearDuplicateConfirmed?: unknown;
}

const ENTITY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const MONTH_NAMES = ["", "јануар", "фебруар", "март", "април", "мај", "јун", "јул", "август", "септембар", "октобар", "новембар", "децембар"];

export function feastIdFromSerbianName(value: string): string {
  return normalizeCatalogueSearchText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export const normalizeFeastIdentity = (value: string): string => normalizeCatalogueSearchText(value)
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

function identityDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function nearDuplicateFeasts(name: string, feasts: readonly FeastRecord[]): FeastRecord[] {
  const key = normalizeFeastIdentity(name);
  if (key.length < 4) return [];
  return feasts.filter((feast) => {
    const candidate = normalizeFeastIdentity(feast.name_sr);
    const limit = Math.max(2, Math.floor(Math.max(key.length, candidate.length) * 0.18));
    return candidate !== key && (identityDistance(key, candidate) <= limit || candidate.includes(key) || key.includes(candidate));
  });
}

function civilDateIsValid(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

function canonicalValidationErrors(registry: FeastRegistry): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!validateFeastRegistry(registry)) {
    for (const error of validateFeastRegistry.errors ?? []) {
      errors[`registry${error.instancePath || "/"}`] = error.message ?? "Регистар слава није важећи.";
    }
    return errors;
  }
  const ids = new Set<string>();
  const identities = new Map<string, string>();
  for (const [index, feast] of registry.feasts.entries()) {
    if (ids.has(feast.id)) errors[`registry.feasts.${index}.id`] = "ID славе већ постоји.";
    ids.add(feast.id);
    for (const [field, value] of [["name_sr", feast.name_sr], ...feast.legacy_names.map((name) => ["legacy_names", name])] as const) {
      const identity = normalizeFeastIdentity(value);
      const previous = identities.get(identity);
      if (previous && previous !== feast.id) errors[`registry.feasts.${index}.${field}`] = "Назив славе већ постоји.";
      else identities.set(identity, feast.id);
    }
    if (feast.date?.kind === "fixed" && !civilDateIsValid(feast.date.month, feast.date.day)) {
      errors[`registry.feasts.${index}.date`] = "Дан није важећи за изабрани мјесец.";
    }
  }
  return errors;
}

export function parseFeastRegistry(rawYaml: string, blobSha: string): FeastRegistrySnapshot {
  let value: unknown;
  try {
    value = parse(rawYaml);
  } catch {
    throw internalFailure("catalog_yaml_parse_failed");
  }
  const registry = value as FeastRegistry;
  const errors = canonicalValidationErrors(registry);
  if (Object.keys(errors).length > 0) throw internalFailure("catalog_tree_processing_failed");
  return { blobSha, rawYaml, registry };
}

export function resolvePatronalFeastIds(place: Record<string, any>, registry: FeastRegistry): string[] {
  const knownIds = new Set(registry.feasts.map((feast) => feast.id));
  if (Array.isArray(place.patronal_feast_ids)) {
    const ids = place.patronal_feast_ids.filter((value: unknown): value is string => typeof value === "string");
    if (ids.length !== place.patronal_feast_ids.length || new Set(ids).size !== ids.length || ids.some((id) => !knownIds.has(id))) {
      throw internalFailure("catalog_tree_processing_failed");
    }
    return ids;
  }
  const legacy = Array.isArray(place.patronal_feasts)
    ? place.patronal_feasts
    : place.patronal_feast
      ? [place.patronal_feast]
      : [];
  const byIdentity = new Map<string, string | undefined>();
  for (const feast of registry.feasts) {
    for (const name of [feast.name_sr, ...feast.legacy_names]) {
      const key = normalizeFeastIdentity(name);
      const previous = byIdentity.get(key);
      byIdentity.set(key, previous && previous !== feast.id ? undefined : feast.id);
    }
  }
  const resolved = legacy.map((entry: any) => {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    const id = name ? byIdentity.get(normalizeFeastIdentity(name)) : undefined;
    if (!id) throw new AdminError("invalid_form_data", 409, "Legacy patronal feast cannot be resolved", {
      patronalFeastIds: `Слава „${name || "—"}“ није једнозначно повезана са регистром.`,
    });
    return id;
  });
  if (new Set(resolved).size !== resolved.length) throw internalFailure("catalog_tree_processing_failed");
  return resolved;
}

export function prepareFeastMutation(
  snapshot: FeastRegistrySnapshot,
  selectedValue: unknown,
  stagedValue: unknown,
  expectedRegistryBlobSha: unknown,
): { ids: string[]; registry: FeastRegistry; registryYaml?: string; additions: FeastRecord[] } {
  if (typeof expectedRegistryBlobSha !== "string" || expectedRegistryBlobSha !== snapshot.blobSha) {
    throw new AdminError("git_conflict", 409, "Feast registry changed after the form was opened", {
      feastRegistry: "Регистар слава је промијењен. Освјежите страницу и поновите чување.",
    });
  }
  const errors: Record<string, string> = {};
  const selected = Array.isArray(selectedValue) ? selectedValue : [];
  const ids = selected.flatMap((value, index) => {
    if (typeof value !== "string" || !ENTITY_ID.test(value)) {
      errors[`patronalFeastIds.${index}`] = "ID славе није важећи.";
      return [];
    }
    return [value];
  });
  if (new Set(ids).size !== ids.length) errors.patronalFeastIds = "Иста слава не може бити изабрана два пута.";
  const staged = Array.isArray(stagedValue) ? stagedValue : [];
  const additions: FeastRecord[] = [];
  const working: FeastRegistry = structuredClone(snapshot.registry);
  const identityOwner = new Map<string, FeastRecord>();
  const idOwner = new Map(working.feasts.map((feast) => [feast.id, feast]));
  for (const feast of working.feasts) for (const name of [feast.name_sr, ...feast.legacy_names]) identityOwner.set(normalizeFeastIdentity(name), feast);

  for (const [index, raw] of staged.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors[`stagedFeasts.${index}`] = "Нова слава није важећа.";
      continue;
    }
    const input = raw as StagedFeastInput;
    const nameSr = text(input.nameSr);
    const generatedId = feastIdFromSerbianName(nameSr);
    const suppliedId = text(input.id);
    const dateKind = text(input.dateKind);
    if (!nameSr) errors[`stagedFeasts.${index}.nameSr`] = "Назив славе је обавезан.";
    if (!generatedId || !ENTITY_ID.test(generatedId) || suppliedId !== generatedId) errors[`stagedFeasts.${index}.id`] = "ID славе није детерминистички изведен из назива.";
    const existingIdentity = identityOwner.get(normalizeFeastIdentity(nameSr));
    if (existingIdentity) errors[`stagedFeasts.${index}.nameSr`] = `Ова слава већ постоји: ${existingIdentity.name_sr}.`;
    const existingId = idOwner.get(generatedId);
    if (existingId) errors[`stagedFeasts.${index}.id`] = `ID већ припада слави „${existingId.name_sr}“.`;
    const nearDuplicates = nearDuplicateFeasts(nameSr, working.feasts);
    if (nearDuplicates.length > 0 && input.nearDuplicateConfirmed !== true) {
      errors[`stagedFeasts.${index}.nearDuplicateConfirmed`] = `Можда већ постоји слична слава: ${nearDuplicates.map((feast) => feast.name_sr).join(", ")}.`;
    }
    let date: FeastDate | undefined;
    if (dateKind === "fixed") {
      const month = Number(input.month);
      const day = Number(input.day);
      if (!civilDateIsValid(month, day)) errors[`stagedFeasts.${index}.date`] = "Дан није важећи за изабрани мјесец.";
      else date = { kind: "fixed", month, day };
    } else if (dateKind === "movable") {
      date = { kind: "movable" };
      if (input.month !== undefined || input.day !== undefined) errors[`stagedFeasts.${index}.date`] = "Покретни празник нема фиксни дан и мјесец.";
    } else if (dateKind === "undated") {
      if (input.month !== undefined || input.day !== undefined) errors[`stagedFeasts.${index}.date`] = "За славу без датума не чувају се дан и мјесец.";
    } else {
      errors[`stagedFeasts.${index}.dateKind`] = "Тип датума није важећи.";
    }
    if (!errors[`stagedFeasts.${index}.nameSr`] && !errors[`stagedFeasts.${index}.id`] && !errors[`stagedFeasts.${index}.date`] && !errors[`stagedFeasts.${index}.dateKind`] && !errors[`stagedFeasts.${index}.nearDuplicateConfirmed`]) {
      const legacyName = date?.kind === "fixed" ? `${nameSr} ${date.day}. ${MONTH_NAMES[date.month]}` : nameSr;
      const feast: FeastRecord = { id: generatedId, name_sr: nameSr, legacy_names: [legacyName], ...(date ? { date } : {}) };
      additions.push(feast);
      working.feasts.push(feast);
      idOwner.set(feast.id, feast);
      identityOwner.set(normalizeFeastIdentity(feast.name_sr), feast);
    }
  }

  const availableIds = new Set(working.feasts.map((feast) => feast.id));
  for (const [index, id] of ids.entries()) if (!availableIds.has(id)) errors[`patronalFeastIds.${index}`] = "Изабрана слава није у регистру.";
  Object.assign(errors, canonicalValidationErrors(working));
  if (Object.keys(errors).length > 0) throw new AdminError("invalid_form_data", 400, "Feast selection is invalid", errors);
  if (additions.some((entry) => !ids.includes(entry.id))) {
    throw new AdminError("invalid_form_data", 400, "Staged feast is not assigned to the place", {
      stagedFeasts: "Нова слава мора бити изабрана на објекту који се чува.",
    });
  }
  const registryYaml = additions.length > 0
    ? `${snapshot.rawYaml.trimEnd()}\n${stringify({ feasts: additions }, { lineWidth: 0 }).replace(/^feasts:\n/, "").trimEnd()}\n`
    : undefined;
  if (registryYaml) parseFeastRegistry(registryYaml, snapshot.blobSha);
  return { ids, registry: working, ...(registryYaml ? { registryYaml } : {}), additions };
}
