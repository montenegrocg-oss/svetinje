import { parse } from "yaml";

function uniqueSourceIds(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim() || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function collectPlaceNarrativeSourceIds(frontMatter) {
  const sectionSourceIds = Object.values(frontMatter?.section_sources ?? {})
    .flatMap((sourceIds) => Array.isArray(sourceIds) ? sourceIds : []);
  return uniqueSourceIds([
    ...(Array.isArray(frontMatter?.source_ids) ? frontMatter.source_ids : []),
    ...sectionSourceIds,
  ]);
}

function frontMatterParts(markdown) {
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(markdown);
  if (!match) throw new Error("Place narrative must contain YAML front matter");
  return {
    opening: match[1],
    yaml: match[2],
    closing: match[3],
    body: markdown.slice(match[0].length),
  };
}

function topLevelSpan(lines, key) {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && !/^[A-Za-z_][A-Za-z0-9_-]*:/.test(lines[end])) end += 1;
  return { start, end };
}

export function migratePlaceNarrativeProvenance(markdown) {
  const parts = frontMatterParts(markdown);
  const frontMatter = parse(parts.yaml);
  if (!frontMatter?.section_sources) {
    return { changed: false, markdown, sourceIds: collectPlaceNarrativeSourceIds(frontMatter), body: parts.body };
  }

  const sourceIds = collectPlaceNarrativeSourceIds(frontMatter);
  const lineEnding = parts.yaml.includes("\r\n") ? "\r\n" : "\n";
  const lines = parts.yaml.split(/\r?\n/);
  const sourceSpan = topLevelSpan(lines, "source_ids");
  const sectionSpan = topLevelSpan(lines, "section_sources");
  if (!sectionSpan) throw new Error("section_sources metadata could not be located");

  const replacement = sourceIds.length > 0
    ? ["source_ids:", ...sourceIds.map((id) => `  - ${id}`)]
    : [];
  const nextLines = [];
  for (let index = 0; index < lines.length;) {
    if (sourceSpan && index === sourceSpan.start) {
      nextLines.push(...replacement);
      index = sourceSpan.end;
      continue;
    }
    if (index === sectionSpan.start) {
      if (!sourceSpan) nextLines.push(...replacement);
      index = sectionSpan.end;
      continue;
    }
    nextLines.push(lines[index]);
    index += 1;
  }

  const migrated = `${parts.opening}${nextLines.join(lineEnding)}${parts.closing}${parts.body}`;
  const migratedParts = frontMatterParts(migrated);
  const migratedFrontMatter = parse(migratedParts.yaml);
  const afterIds = collectPlaceNarrativeSourceIds(migratedFrontMatter);
  if (migratedFrontMatter.section_sources !== undefined) throw new Error("section_sources remained after migration");
  if (JSON.stringify(sourceIds) !== JSON.stringify(afterIds)) throw new Error("source provenance changed during migration");
  if (parts.body !== migratedParts.body) throw new Error("narrative body changed during provenance migration");
  return { changed: true, markdown: migrated, sourceIds, body: migratedParts.body };
}
