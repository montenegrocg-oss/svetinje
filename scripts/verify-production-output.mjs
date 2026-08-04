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
  const monasteries = pages.find((page) => page.relative === "manastiri/index.html");
  const churches = pages.find((page) => page.relative === "crkve/index.html");
  const podmaine = pages.find((page) => page.relative === "svetinje/manastir-podmaine/index.html");
  const cathedral = pages.find((page) => page.relative === "svetinje/saborni-hram-hristovog-vaskrsenja-podgorica/index.html");
  if (!homepage || !catalogue || !monasteries || !churches || !podmaine || !cathedral) failures.push("editorial preview must generate the homepage, catalogue, category pages, and both allowlisted detail pages");
  for (const page of pages) {
    if (!page.html.includes('<meta name="robots" content="noindex,nofollow,noarchive">')) {
      failures.push(`${page.relative} is missing editorial-preview noindex metadata`);
    }
  }
  if (!homepage?.html.includes('"latitude":42.29799') || !homepage.html.includes('"longitude":18.84452')) {
    failures.push("homepage is missing the allowlisted Podmaine marker coordinates");
  }
  if (!homepage?.html.includes('"latitude":42.44572787124205') || !homepage.html.includes('"longitude":19.248255050565547')) {
    failures.push("homepage is missing the allowlisted cathedral marker coordinates");
  }
  if ((homepage?.html.match(/"placeType":"monastery"/g) ?? []).length !== 1 || (homepage?.html.match(/"placeType":"cathedral"/g) ?? []).length !== 1) {
    failures.push("homepage marker data must contain exactly one monastery and one cathedral marker");
  }
  if (!homepage?.html.includes('"category":"monasteries"') || !homepage.html.includes('data-place-category="monasteries"') || !homepage.html.includes('"category":"churches"') || !homepage.html.includes('data-place-category="churches"')) {
    failures.push("homepage preview must provide the shared monastery and church categories to markers and cards");
  }
  if (
    !homepage?.html.includes("Манастир Подмаине") ||
    !homepage.html.includes("Саборни храм Христовог Васкрсења") ||
    !catalogue?.html.includes("Манастир Подмаине") ||
    !catalogue.html.includes("Саборни храм Христовог Васкрсења")
  ) {
    failures.push("both preview cards are required on the homepage and catalogue");
  }
  if (!monasteries?.html.includes("Манастир Подмаине") || monasteries.html.includes("Саборни храм Христовог Васкрсења")) {
    failures.push("the monasteries catalogue must contain Podmaine only");
  }
  if (!churches?.html.includes("Саборни храм Христовог Васкрсења") || churches.html.includes("Манастир Подмаине")) {
    failures.push("the churches catalogue must contain the cathedral only");
  }
  if (!monasteries?.html.includes('href="/manastiri/" aria-current="page"') || monasteries.html.includes('href="/crkve/" aria-current="page"')) {
    failures.push("the monasteries page must activate only its navigation link");
  }
  if (!churches?.html.includes('href="/crkve/" aria-current="page"') || churches.html.includes('href="/manastiri/" aria-current="page"')) {
    failures.push("the churches page must activate only its navigation link");
  }
  if (!podmaine?.html.includes("Радни приказ") || !podmaine.html.includes("Ауторска фотографија биће додата")) {
    failures.push("Podmaine detail page is missing its preview or honest media notice");
  }
  if (!cathedral?.html.includes("Положај храма") || !cathedral.html.includes("Координате означавају центар храмовног комплекса, а не тачан главни улаз.")) {
    failures.push("cathedral detail page is missing its approved location wording");
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
  const monasteries = pages.find((page) => page.relative === "manastiri/index.html");
  const churches = pages.find((page) => page.relative === "crkve/index.html");
  if (!monasteries?.html.includes("Још нема манастира спремних за јавно објављивање.")) {
    failures.push("production monasteries page is missing its protected empty state");
  }
  if (!churches?.html.includes("Још нема храмова спремних за јавно објављивање.")) {
    failures.push("production churches page is missing its protected empty state");
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
