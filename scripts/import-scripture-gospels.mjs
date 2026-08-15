#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readZipEntries } from "./lib/zip-archive.mjs";
import { buildSerbianGospelCorpus } from "./lib/scripture-corpus.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = argument("--input");
if (!input) throw new Error("Usage: node scripts/import-scripture-gospels.mjs --input <srp1865_usfm.zip>");

const archive = readZipEntries(await readFile(path.resolve(input)));
const corpus = buildSerbianGospelCorpus((name) => archive.read(name));
const output = path.resolve("content/scripture/sr-vuk-karadzic-1847/gospels.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
console.log(`Imported four public-domain Gospels (${corpus.translation_id}).`);
