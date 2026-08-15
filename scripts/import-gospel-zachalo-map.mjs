#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeHtmlEntities, parseCanonicalRange } from "./lib/calendar-import.mjs";

const BOOK_IDS = new Map([["Мф", "mt"], ["Мк", "mk"], ["Лк", "lk"], ["Ин", "jn"]]);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = argument("--input");
if (!input) throw new Error("Usage: node scripts/import-gospel-zachalo-map.mjs --input <zachalo-table.html>");
const corpus = JSON.parse(await readFile("content/scripture/sr-vuk-karadzic-1847/gospels.json", "utf8"));
const html = await readFile(path.resolve(input), "utf8");
const entries = [];
const rowPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>\s*(Мф|Мк|Лк|Ин)\.\s*зачало\s*(\d+)([АБ])?[\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*?chapter=([^&'"<>]+)[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/giu;

for (const match of html.matchAll(rowPattern)) {
  const book = BOOK_IDS.get(match[1]);
  const zachalo = Number(match[2]);
  const variant = match[3]?.toLocaleLowerCase("sr-Latn");
  const canonical = decodeURIComponent(decodeHtmlEntities(match[4])).replaceAll("–", "-");
  const usage = decodeHtmlEntities(match[5].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  entries.push({
    book,
    zachalo,
    ...(variant ? { variant } : {}),
    ranges: parseCanonicalRange(canonical, corpus, book),
    usage,
  });
}

if (entries.length < 350) throw new Error(`Zachalo table import is incomplete: found ${entries.length} entries`);
entries.sort((left, right) => left.book.localeCompare(right.book) || left.zachalo - right.zachalo || (left.variant ?? "").localeCompare(right.variant ?? ""));

for (const entry of entries) {
  if (!entry.variant) continue;
  const variants = entries.filter((candidate) => candidate.book === entry.book && candidate.zachalo === entry.zachalo);
  if (variants.length > 1) {
    entry.default_for_calendar = /(?:понедельник|вторник|среда|четверг|пятница|суббота)\s+\d+-[йя]/iu.test(entry.usage);
  }
}

for (const entry of entries) delete entry.usage;

const output = path.resolve("content/lectionary/gospel-zachalo-map.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schema_version: 1, entries }, null, 2)}\n`, "utf8");
console.log(`Imported ${entries.length} canonical Gospel zachalo range(s).`);
