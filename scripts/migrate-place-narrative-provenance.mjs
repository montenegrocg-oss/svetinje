#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { migratePlaceNarrativeProvenance } from "./lib/place-narrative-provenance.mjs";

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await markdownFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files.sort();
}

const root = path.resolve(process.argv[2] ?? process.cwd());
const files = await markdownFiles(path.join(root, "content", "places"));
let migrated = 0;
for (const file of files) {
  const before = await readFile(file, "utf8");
  const result = migratePlaceNarrativeProvenance(before);
  if (!result.changed) continue;
  await writeFile(file, result.markdown, "utf8");
  migrated += 1;
}
console.log(`Migrated ${migrated} place narrative(s); all legacy source references were preserved.`);
