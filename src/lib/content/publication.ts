import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

type ReviewRole = "publishing" | "factual" | "ecclesiastical" | "sr-language";

interface Approval {
  role: string;
  reviewer_id: string;
  outcome: string;
}

interface PublicationPolicy {
  public_publication_locked: boolean;
  role_assignments: Record<string, string[]>;
}

interface PlaceRecord {
  id: string;
  editorial_status: string;
  place_type?: {
    value?: string;
    verification?: { status?: string; qualification?: string };
  };
  source_ids: string[];
  approvals: Approval[];
  [key: string]: unknown;
}

interface NarrativeRecord {
  place_id: string;
  locale: string;
  editorial_status: string;
  translation_status: string;
  slug?: string;
  preferred_name?: string;
  summary?: string;
  source_ids: string[];
  approvals: Approval[];
}

interface SourceRecord {
  id: string;
  editorial_status: string;
  status: string;
  approvals: Approval[];
}

export interface PublishablePlace {
  id: string;
  slug: string;
  name: string;
  summary: string;
  placeType: string;
}

export interface ExcludedNarrativeMarker {
  placeId: string;
  slug?: string;
  preferredName?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

async function readYamlObject(file: string): Promise<Record<string, unknown>> {
  return parseYamlObject(await readFile(file, "utf8"), file);
}

async function readNarrative(file: string): Promise<NarrativeRecord> {
  const text = await readFile(file, "utf8");
  if (!text.startsWith("---\n")) throw new Error(`${file} has no front matter`);
  const closing = text.indexOf("\n---\n", 4);
  if (closing === -1) throw new Error(`${file} has unclosed front matter`);
  return parseYamlObject(`${text.slice(4, closing)}\n`, file) as unknown as NarrativeRecord;
}

async function filesIn(directory: string, predicate: (file: string) => boolean): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isObject(error) && error.code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesIn(full, predicate)));
    else if (entry.isFile() && predicate(full)) files.push(full);
  }
  return files;
}

function assignedApproval(
  approvals: Approval[],
  role: ReviewRole,
  policy: PublicationPolicy,
): boolean {
  const assigned = policy.role_assignments[role] ?? [];
  return approvals.some(
    (approval) =>
      approval.role === role &&
      approval.outcome === "approved" &&
      assigned.includes(approval.reviewer_id),
  );
}

function hasRequiredApprovals(
  approvals: Approval[],
  roles: ReviewRole[],
  policy: PublicationPolicy,
): boolean {
  return roles.every((role) => assignedApproval(approvals, role, policy));
}

function factsArePublishable(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(factsArePublishable);
  if (!isObject(value)) return true;

  if ("verification" in value) {
    const verification = value.verification;
    if (!isObject(verification)) return false;
    if (verification.status === "verified") {
      // Continue through the object so nested values cannot bypass checks.
    } else if (verification.status === "disputed" && typeof verification.qualification === "string") {
      // Qualified disputes still require the record-level factual and ecclesiastical gates.
    } else {
      return false;
    }
  }

  return Object.values(value).every(factsArePublishable);
}

async function loadPolicy(root: string): Promise<PublicationPolicy> {
  return (await readYamlObject(path.join(root, "validation", "publication-policy.json"))) as unknown as PublicationPolicy;
}

async function loadRecords(root: string): Promise<{
  places: PlaceRecord[];
  narratives: NarrativeRecord[];
  sources: SourceRecord[];
}> {
  const contentRoot = path.join(root, "content");
  const [placeFiles, narrativeFiles, sourceFiles] = await Promise.all([
    filesIn(path.join(contentRoot, "places"), (file) => path.basename(file) === "place.yaml"),
    filesIn(path.join(contentRoot, "places"), (file) => file.endsWith(`${path.sep}narratives${path.sep}sr.md`)),
    filesIn(path.join(contentRoot, "sources"), (file) => file.endsWith(".yaml")),
  ]);

  const [places, narratives, sources] = await Promise.all([
    Promise.all(placeFiles.map(async (file) => (await readYamlObject(file)) as unknown as PlaceRecord)),
    Promise.all(narrativeFiles.map(readNarrative)),
    Promise.all(sourceFiles.map(async (file) => (await readYamlObject(file)) as unknown as SourceRecord)),
  ]);
  return { places, narratives, sources };
}

export async function loadPublishablePlaces(root = process.cwd()): Promise<PublishablePlace[]> {
  const policy = await loadPolicy(root);
  if (policy.public_publication_locked) return [];

  const { places, narratives, sources } = await loadRecords(root);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const narrativeByPlace = new Map(
    narratives
      .filter((narrative) => narrative.locale === "sr")
      .map((narrative) => [narrative.place_id, narrative]),
  );

  const sourcesArePublishable = (ids: string[]): boolean =>
    ids.length > 0 &&
    ids.every((id) => {
      const source = sourceById.get(id);
      return Boolean(
        source &&
          source.editorial_status === "published" &&
          source.status === "active" &&
          hasRequiredApprovals(source.approvals, ["factual", "publishing"], policy),
      );
    });

  return places.flatMap((place) => {
    const narrative = narrativeByPlace.get(place.id);
    if (
      place.editorial_status !== "published" ||
      !narrative ||
      narrative.editorial_status !== "published" ||
      narrative.translation_status !== "source" ||
      typeof narrative.slug !== "string" ||
      typeof narrative.preferred_name !== "string" ||
      typeof narrative.summary !== "string" ||
      typeof place.place_type?.value !== "string" ||
      place.place_type.verification?.status !== "verified" ||
      !factsArePublishable(place) ||
      !hasRequiredApprovals(place.approvals, ["factual", "ecclesiastical", "publishing"], policy) ||
      !hasRequiredApprovals(
        narrative.approvals,
        ["factual", "ecclesiastical", "sr-language", "publishing"],
        policy,
      ) ||
      !sourcesArePublishable([...new Set([...place.source_ids, ...narrative.source_ids])])
    ) {
      return [];
    }

    return [{
      id: place.id,
      slug: narrative.slug,
      name: narrative.preferred_name,
      summary: narrative.summary,
      placeType: place.place_type.value,
    }];
  });
}

export async function loadExcludedNarrativeMarkers(
  root = process.cwd(),
): Promise<ExcludedNarrativeMarker[]> {
  const publicIds = new Set((await loadPublishablePlaces(root)).map((place) => place.id));
  const narrativeFiles = await filesIn(
    path.join(root, "content", "places"),
    (file) => file.endsWith(`${path.sep}narratives${path.sep}sr.md`),
  );
  const narratives = await Promise.all(narrativeFiles.map(readNarrative));
  return narratives
    .filter((narrative) => !publicIds.has(narrative.place_id))
    .map((narrative) => ({
      placeId: narrative.place_id,
      ...(narrative.slug ? { slug: narrative.slug } : {}),
      ...(narrative.preferred_name ? { preferredName: narrative.preferred_name } : {}),
    }));
}
