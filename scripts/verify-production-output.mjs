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
const editorialPreview = process.env.EDITORIAL_PREVIEW === "true";
const files = await htmlFiles(path.join(root, "dist"));
const pages = await Promise.all(files.map(async (file) => ({
  file,
  relative: path.relative(path.join(root, "dist"), file).replaceAll("\\", "/"),
  html: await readFile(file, "utf8"),
})));
const failures = [];

if (editorialPreview) {
  const homepage = pages.find((page) => page.relative === "index.html");
  const catalogue = pages.find((page) => page.relative === "svetinje/index.html");
  const podmaine = pages.find((page) => page.relative === "svetinje/manastir-podmaine/index.html");
  const cathedral = pages.find((page) => page.relative === "svetinje/saborni-hram-hristovog-vaskrsenja-podgorica/index.html");
  if (!homepage || !catalogue || !podmaine || !cathedral) failures.push("editorial preview must generate the homepage, catalogue, and both allowlisted detail pages");
  for (const page of pages) {
    if (!page.html.includes('<meta name="robots" content="noindex,nofollow,noarchive">')) {
      failures.push(`${page.relative} is missing editorial-preview noindex metadata`);
    }
  }
  if (!homepage?.html.includes('"latitude":42.29799') || !homepage.html.includes('"longitude":18.84452')) {
    failures.push("homepage is missing the allowlisted Podmaine marker coordinates");
  }
  if ((homepage?.html.match(/"placeType":"monastery"/g) ?? []).length !== 1 || homepage?.html.includes('"placeType":"cathedral"')) {
    failures.push("homepage marker data must contain only the allowlisted Podmaine monastery marker");
  }
  if (!homepage?.html.includes('"category":"monasteries"') || !homepage.html.includes('data-place-category="monasteries"')) {
    failures.push("homepage preview must provide the shared monastery category to its marker and card");
  }
  if (
    !homepage?.html.includes("Манастир Подмаине") ||
    !homepage.html.includes("Саборни храм Христовог Васкрсења") ||
    !catalogue?.html.includes("Манастир Подмаине") ||
    !catalogue.html.includes("Саборни храм Христовог Васкрсења")
  ) {
    failures.push("both preview cards are required on the homepage and catalogue");
  }
  if (!podmaine?.html.includes("Радни приказ") || !podmaine.html.includes("Ауторска фотографија биће додата")) {
    failures.push("Podmaine detail page is missing its preview or honest media notice");
  }
  if (!cathedral?.html.includes("Тачна локација на мапи биће додата након географске провјере.")) {
    failures.push("cathedral detail page must disclose its missing geographic verification");
  }
  for (const page of pages) {
    if (/rating|>\s*Оцјена\s*</i.test(page.html) || /радно вријеме|033\/459-084|manastirmaine@gmail\.com/i.test(page.html)) {
      failures.push(`${page.relative} contains prohibited practical or commercial preview data`);
    }
  }
} else {
  const excluded = await loadExcludedNarrativeMarkers(root);
  for (const marker of excluded) {
    const values = [marker.placeId, marker.slug, marker.preferredName].filter(
      (value) => typeof value === "string" && value.length >= 4,
    );
    for (const page of pages) {
      for (const value of values) {
        if (page.html.includes(value)) failures.push(`${page.relative} contains excluded marker ${value}`);
      }
    }
  }
  if (pages.some((page) => ["svetinje/manastir-podmaine/index.html", "svetinje/saborni-hram-hristovog-vaskrsenja-podgorica/index.html"].includes(page.relative))) {
    failures.push("production generated an editorial-preview route");
  }
}

if (failures.length > 0) {
  console.error(`${editorialPreview ? "Editorial preview" : "Production"} output validation failed:`);
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else if (editorialPreview) {
  console.log("Editorial preview output check passed: " + files.length + " HTML page(s), 2 allowlisted places, noindex enforced.");
} else {
  const excluded = await loadExcludedNarrativeMarkers(root);
  console.log(`Production output check passed: ${files.length} HTML page(s), ${excluded.length} excluded narrative(s), 0 leaks.`);
}
