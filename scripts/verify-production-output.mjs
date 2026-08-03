#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadExcludedNarrativeMarkers } from "../src/lib/content/publication.ts";

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(full)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(full);
  }
  return files;
}

const root = process.cwd();
const files = await htmlFiles(path.join(root, "dist"));
const pages = await Promise.all(files.map(async (file) => ({ file, html: await readFile(file, "utf8") })));
const excluded = await loadExcludedNarrativeMarkers(root);
const leaks = [];

for (const marker of excluded) {
  const values = [marker.placeId, marker.slug, marker.preferredName].filter(
    (value) => typeof value === "string" && value.length >= 4,
  );
  for (const page of pages) {
    for (const value of values) {
      if (page.html.includes(value)) leaks.push(`${path.relative(root, page.file)} contains excluded marker ${value}`);
    }
  }
}

if (leaks.length > 0) {
  console.error("Production output contains non-publishable content:");
  console.error(leaks.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Production output check passed: ${files.length} HTML page(s), ${excluded.length} excluded narrative(s), 0 leaks.`);
}
