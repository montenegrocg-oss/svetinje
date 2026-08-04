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
  const holyPlaces = pages.find((page) => page.relative === "sveta-mjesta/index.html");
  const podmaine = pages.find((page) => page.relative === "svetinje/manastir-podmaine/index.html");
  const cathedral = pages.find((page) => page.relative === "svetinje/saborni-hram-hristovog-vaskrsenja-podgorica/index.html");
  const dajbabe = pages.find((page) => page.relative === "svetinje/manastir-dajbabe/index.html");
  const barCathedral = pages.find((page) => page.relative === "svetinje/saborni-hram-svetog-jovana-vladimira-bar/index.html");
  if (files.length !== 11) failures.push("editorial preview must generate exactly 11 HTML pages");
  if (!homepage || !catalogue || !monasteries || !churches || !holyPlaces || !podmaine || !cathedral || !dajbabe || !barCathedral) failures.push("editorial preview must generate the homepage, catalogue, category pages, and all allowlisted detail pages");
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
  if (!homepage?.html.includes('"latitude":42.40364') || !homepage.html.includes('"longitude":19.23226')) {
    failures.push("homepage is missing the allowlisted Dajbabe marker coordinates");
  }
  if (!homepage?.html.includes('"latitude":42.10145') || !homepage.html.includes('"longitude":19.09394')) {
    failures.push("homepage is missing the allowlisted Bar cathedral marker coordinates");
  }
  if ((homepage?.html.match(/"placeType":"monastery"/g) ?? []).length !== 2 || (homepage?.html.match(/"placeType":"cathedral"/g) ?? []).length !== 2) {
    failures.push("homepage marker data must contain two monasteries and two cathedral markers");
  }
  if ((homepage?.html.match(/data-place-card=/g) ?? []).length !== 4) {
    failures.push("homepage preview must contain exactly four place cards");
  }
  if ((homepage?.html.match(/data-recommended-place=/g) ?? []).length !== 2) {
    failures.push("homepage preview must contain exactly two recommended place cards");
  }
  if ((homepage?.html.match(/data-testid="recommended-placeholder"/g) ?? []).length !== 3) {
    failures.push("homepage preview must retain exactly three neutral recommendation placeholders");
  }
  if (
    !homepage?.html.includes('data-recommended-place="saborni-hram-podgorica"') ||
    !homepage.html.includes('href="/svetinje/saborni-hram-hristovog-vaskrsenja-podgorica/"') ||
    !homepage.html.includes('data-recommended-place="dajbabe"') ||
    !homepage.html.includes('href="/svetinje/manastir-dajbabe/"') ||
    homepage.html.includes('data-recommended-place="podmaine"') ||
    homepage.html.includes('data-recommended-place="saborni-hram-bar"')
  ) {
    failures.push("homepage recommendations must contain the Podgorica cathedral and Dajbabe, never Podmaine or the Bar cathedral");
  }
  const previewImages = {
    podmaine: "/images/places/manastir_podmaine.jpg",
    dajbabe: "/images/places/manastir_dajbabe.jpg",
    podgorica: "/images/places/saborni_hram_podgorica.jpg",
    bar: "/images/places/saborni_hram_bar.jpg",
  };
  if (![previewImages.podmaine, previewImages.dajbabe, previewImages.podgorica, previewImages.bar].every((image) => homepage?.html.includes(image) && catalogue?.html.includes(image))) {
    failures.push("homepage and general catalogue must include each matching preview image");
  }
  if (![previewImages.podmaine, previewImages.dajbabe].every((image) => monasteries?.html.includes(image)) || [previewImages.podgorica, previewImages.bar].some((image) => monasteries?.html.includes(image))) {
    failures.push("the monasteries catalogue must include only the two monastery images");
  }
  if (![previewImages.podgorica, previewImages.bar].every((image) => churches?.html.includes(image)) || [previewImages.podmaine, previewImages.dajbabe].some((image) => churches?.html.includes(image))) {
    failures.push("the churches catalogue must include only the two cathedral images");
  }
  const recommendationHasImage = (id, image) => new RegExp(`data-recommended-place="${id}"[\\s\\S]*?src="${image}"`).test(homepage?.html ?? "");
  if (!recommendationHasImage("saborni-hram-podgorica", previewImages.podgorica) || !recommendationHasImage("dajbabe", previewImages.dajbabe)) {
    failures.push("homepage recommendations must render the matching Podgorica cathedral and Dajbabe images");
  }
  if ((homepage?.html.match(/"category":"monasteries"/g) ?? []).length !== 2 || (homepage?.html.match(/data-place-category="monasteries"/g) ?? []).length !== 2 || (homepage?.html.match(/"category":"churches"/g) ?? []).length !== 2 || (homepage?.html.match(/data-place-category="churches"/g) ?? []).length !== 2) {
    failures.push("homepage preview must provide the shared monastery and church categories to markers and cards");
  }
  if (
    !homepage?.html.includes("Манастир Подмаине") ||
    !homepage.html.includes("Манастир Дајбабе") ||
    !homepage.html.includes("Саборни храм Христовог Васкрсења") ||
    !homepage.html.includes("Саборни храм Светог Јована Владимира") ||
    !catalogue?.html.includes("Манастир Подмаине") ||
    !catalogue.html.includes("Манастир Дајбабе") ||
    !catalogue.html.includes("Саборни храм Христовог Васкрсења") ||
    !catalogue.html.includes("Саборни храм Светог Јована Владимира")
  ) {
    failures.push("all preview cards are required on the homepage and catalogue");
  }
  if (!monasteries?.html.includes("Манастир Подмаине") || !monasteries.html.includes("Манастир Дајбабе") || monasteries.html.includes("Саборни храм Христовог Васкрсења") || monasteries.html.includes("Саборни храм Светог Јована Владимира")) {
    failures.push("the monasteries catalogue must contain Podmaine and Dajbabe only");
  }
  if ((monasteries?.html.match(/data-place-card=/g) ?? []).length !== 2) {
    failures.push("the monasteries catalogue must contain exactly two preview cards");
  }
  if (!churches?.html.includes("Саборни храм Христовог Васкрсења") || !churches.html.includes("Саборни храм Светог Јована Владимира") || churches.html.includes("Манастир Подмаине") || churches.html.includes("Манастир Дајбабе")) {
    failures.push("the churches catalogue must contain both cathedrals only");
  }
  if ((churches?.html.match(/data-place-card=/g) ?? []).length !== 2) {
    failures.push("the churches catalogue must contain exactly two preview cards");
  }
  if ((catalogue?.html.match(/data-place-card=/g) ?? []).length !== 4) {
    failures.push("the general catalogue must contain exactly four preview cards");
  }
  if ((holyPlaces?.html.match(/data-place-card=/g) ?? []).length !== 0 || !holyPlaces?.html.includes("Још нема светих мјеста спремних за јавно објављивање.")) {
    failures.push("the holy-places catalogue must retain its protected empty state");
  }
  if (!monasteries?.html.includes('href="/manastiri/" aria-current="page"') || monasteries.html.includes('href="/crkve/" aria-current="page"')) {
    failures.push("the monasteries page must activate only its navigation link");
  }
  if (!churches?.html.includes('href="/crkve/" aria-current="page"') || churches.html.includes('href="/manastiri/" aria-current="page"')) {
    failures.push("the churches page must activate only its navigation link");
  }
  if (!holyPlaces?.html.includes('href="/sveta-mjesta/" aria-current="page"') || holyPlaces.html.includes('href="/manastiri/" aria-current="page"') || holyPlaces.html.includes('href="/crkve/" aria-current="page"')) {
    failures.push("the holy-places page must activate only its navigation link");
  }
  if (!podmaine?.html.includes("Радни приказ") || !podmaine.html.includes("Ауторска фотографија биће додата")) {
    failures.push("Podmaine detail page is missing its preview or honest media notice");
  }
  if (!cathedral?.html.includes("Положај храма") || !cathedral.html.includes("Координате означавају центар храмовног комплекса, а не тачан главни улаз.")) {
    failures.push("cathedral detail page is missing its approved location wording");
  }
  if (!dajbabe?.html.includes("Радни приказ") || !dajbabe.html.includes("Ауторска фотографија биће додата")) {
    failures.push("Dajbabe detail page is missing its preview or honest media notice");
  }
  if (!barCathedral?.html.includes("Положај храма") || !barCathedral.html.includes("Координате на мапи означавају радни центар храмовног комплекса") || !barCathedral.html.includes("Ауторска фотографија биће додата")) {
    failures.push("Bar cathedral detail page is missing its preview, location, or honest media notice");
  }
  for (const page of pages) {
    if (/rating|>\s*Оцјена\s*</i.test(page.html) || /033\/459-084|manastirmaine@gmail\.com/i.test(page.html)) {
      failures.push(`${page.relative} contains prohibited practical or commercial preview data`);
    }
  }
} else {
  if (files.length !== 7) failures.push("production must generate exactly 7 HTML pages");
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
  if (pages.some((page) => ["svetinje/manastir-podmaine/index.html", "svetinje/saborni-hram-hristovog-vaskrsenja-podgorica/index.html", "svetinje/manastir-dajbabe/index.html", "svetinje/saborni-hram-svetog-jovana-vladimira-bar/index.html"].includes(page.relative))) {
    failures.push("production generated an editorial-preview route");
  }
  const homepage = pages.find((page) => page.relative === "index.html");
  if ((homepage?.html.match(/data-recommended-place=/g) ?? []).length !== 0 || (homepage?.html.match(/data-testid="recommended-placeholder"/g) ?? []).length !== 5) {
    failures.push("production recommendations must retain five neutral placeholders and no research records");
  }
  for (const image of [
    "/images/places/manastir_podmaine.jpg",
    "/images/places/manastir_dajbabe.jpg",
    "/images/places/saborni_hram_podgorica.jpg",
    "/images/places/saborni_hram_bar.jpg",
  ]) {
    if (pages.some((page) => page.html.includes(image))) failures.push(`production contains excluded research image ${image}`);
  }
  for (const value of ["saborni-hram-bar", "saborni-hram-svetog-jovana-vladimira-bar", "Саборни храм Светог Јована Владимира", "42.10145", "19.09394"]) {
    if (pages.some((page) => page.html.includes(value))) failures.push(`production contains excluded Bar cathedral value ${value}`);
  }
  const monasteries = pages.find((page) => page.relative === "manastiri/index.html");
  const churches = pages.find((page) => page.relative === "crkve/index.html");
  const holyPlaces = pages.find((page) => page.relative === "sveta-mjesta/index.html");
  if (!monasteries?.html.includes("Још нема манастира спремних за јавно објављивање.")) {
    failures.push("production monasteries page is missing its protected empty state");
  }
  if (!churches?.html.includes("Још нема храмова спремних за јавно објављивање.")) {
    failures.push("production churches page is missing its protected empty state");
  }
  if (!holyPlaces?.html.includes("Још нема светих мјеста спремних за јавно објављивање.") || (holyPlaces.html.match(/data-place-card=/g) ?? []).length !== 0) {
    failures.push("production holy-places page is missing its protected empty state");
  }
}

if (failures.length > 0) {
  console.error(`${editorialPreview ? "Editorial preview" : "Production"} output validation failed:`);
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else if (editorialPreview) {
  console.log("Editorial preview output check passed: " + files.length + " HTML page(s), 4 allowlisted places, noindex enforced.");
} else {
  const excluded = await loadExcludedNarrativeMarkers(root);
  console.log(`Production output check passed: ${files.length} HTML page(s), ${excluded.length} excluded narrative(s), 0 leaks.`);
}
