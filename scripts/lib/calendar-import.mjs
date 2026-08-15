import { createHash } from "node:crypto";
import { chapterVerseCount } from "./scripture-corpus.mjs";

const BOOK_NAMES = new Map([
  ["Матеју", "mt"], ["Матеу", "mt"], ["Марку", "mk"], ["Луки", "lk"], ["Јовану", "jn"],
]);

const HTML_ENTITIES = new Map([
  ["nbsp", " "], ["quot", '"'], ["amp", "&"], ["lt", "<"], ["gt", ">"], ["apos", "'"],
]);

export function decodeHtmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
    if (key.startsWith("#x")) return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
    return HTML_ENTITIES.get(key.toLowerCase()) ?? entity;
  });
}

export function normalizeWordHtmlText(html) {
  return decodeHtmlEntities(html)
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u00ad\u200b]/g, "")
    .replace(/\s+/g, " ")
    .replace(/([А-ЯЂЈЉЊЋЏ])\s+([а-яђјљњћџ]{2,})/gu, "$1$2")
    .replace(/\s+([,.:;)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();
}

export function cleanCalendarTitle(value) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s*[-–—]\s*(?:(?:њему|њој|њима)\s+(?:се\s+)?)?служб[\p{L}]*\s+пој[\p{L}]*[^.!?]*/giu, "")
    .replace(/\s*[-–—]\s*иако\s+се\s+помиње\s+у\s+Типику[^.!?]*/giu, "")
    .replace(/(?:^|[.!?]\s*)овог\s+м[јe]есеца[^.!?]*/giu, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function titleAndCommemorations(value) {
  const cleaned = cleanCalendarTitle(value);
  const parts = cleaned.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim().replace(/[.]$/, "")).filter(Boolean) ?? [];
  if (parts.length === 0) throw new Error("Calendar title is empty after deterministic cleaning");
  return { title: parts[0], commemorations: parts.slice(1) };
}

function scopeForLabel(label) {
  const normalized = label.toLocaleLowerCase("sr");
  if (/дана/u.test(normalized)) return "day";
  if (/недељ/u.test(normalized)) return "sunday";
  if (/празник/u.test(normalized)) return "feast";
  if (/свет|преподоб|мучен|апостол|отац|оцима|макавеј|стефан|василиј/u.test(normalized)) return "saint";
  return "unknown";
}

export function extractLiturgicalGospelReadings(html) {
  const text = normalizeWordHtmlText(html);
  const liturgyIndex = text.search(/На Литургији(?:\s*\/[^/]{1,100}\/)??\s*:/u);
  if (liturgyIndex < 0) return [];
  const liturgyText = text.slice(liturgyIndex, liturgyIndex + 8_000);
  const gospelMatch = liturgyText.match(/Јеванђеље\s*\(([^)]{1,600})\)\s*:?\s*([^.;]{1,240}(?:\.[^.;]{1,120})?)/u)
    ?? liturgyText.match(/Јеванђеље\s*-\s*((?:по\s+(?:Матеју|Марку|Луки|Јовану)[^.]{1,300}))\.\s*([^.;]{0,240})/u);
  if (!gospelMatch) return [];

  const specification = gospelMatch[1];
  const label = gospelMatch[2]
    .replace(/\s+(?:Причаст|Уместо|Поје)[\s\S]*$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.]$/, "");
  const readings = [];
  let activeBook;
  const tokenPattern = /(?:по\s+(Матеју|Матеу|Марку|Луки|Јовану)\s*,?\s*)?зач\s*\.\s*(\d+)/gu;
  for (const match of specification.matchAll(tokenPattern)) {
    if (match[1]) activeBook = BOOK_NAMES.get(match[1]);
    if (!activeBook) throw new Error(`Gospel zachalo ${match[2]} has no book context`);
    readings.push({ book: activeBook, zachalo: Number(match[2]) });
  }
  if (readings.length === 0) return [];

  const labelParts = label.split(/\s+и\s+/u).map((part) => part.trim()).filter(Boolean);
  return readings.map((reading, index) => {
    const readingLabel = labelParts.length === readings.length ? labelParts[index] : label;
    return { ...reading, scope: scopeForLabel(readingLabel), label: readingLabel };
  });
}

export function gregorianDateKey(input) {
  const match = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error(`Unsupported calendar date ${input}`);
  return `${match[3]}-${match[1]}-${match[2]}`;
}

export function julianDateForGregorian(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 13);
  return date.toISOString().slice(0, 10);
}

export function parseCanonicalRange(value, corpus, book) {
  const ranges = [];
  let activeChapter;
  for (const rawPart of value.replaceAll("–", "-").split(/[,;]/).map((part) => part.trim()).filter(Boolean)) {
    const crossChapter = rawPart.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
    const inheritedCrossChapter = rawPart.match(/^(\d+)-(\d+):(\d+)$/);
    if (crossChapter || (inheritedCrossChapter && activeChapter !== undefined)) {
      const startChapter = crossChapter ? Number(crossChapter[1]) : activeChapter;
      const startVerse = Number((crossChapter ?? inheritedCrossChapter)[crossChapter ? 2 : 1]);
      const endChapter = Number((crossChapter ?? inheritedCrossChapter)[crossChapter ? 3 : 2]);
      const endVerse = Number((crossChapter ?? inheritedCrossChapter)[crossChapter ? 4 : 3]);
      for (let chapter = startChapter; chapter <= endChapter; chapter += 1) {
        const start = chapter === startChapter ? startVerse : 1;
        const end = chapter === endChapter ? endVerse : chapterVerseCount(corpus, book, chapter);
        ranges.push({ chapter, verses: [start === end ? String(start) : `${start}-${end}`] });
      }
      activeChapter = endChapter;
      continue;
    }
    const withChapter = rawPart.match(/^(\d+):(\d+)(?:-(\d+))?$/);
    const inherited = rawPart.match(/^(\d+)(?:-(\d+))?$/);
    if (!withChapter && (!inherited || activeChapter === undefined)) throw new Error(`Unsupported canonical range ${value}`);
    const chapter = withChapter ? Number(withChapter[1]) : activeChapter;
    const start = Number((withChapter ?? inherited)[withChapter ? 2 : 1]);
    const end = Number((withChapter ?? inherited)[withChapter ? 3 : 2] ?? start);
    activeChapter = chapter;
    const previous = ranges.at(-1);
    const spec = start === end ? String(start) : `${start}-${end}`;
    if (previous?.chapter === chapter) previous.verses.push(spec);
    else ranges.push({ chapter, verses: [spec] });
  }
  return ranges;
}

export function selectPrimaryReading(readings) {
  for (const scope of ["day", "sunday", "feast"]) {
    const index = readings.findIndex((reading) => reading.scope === scope);
    if (index >= 0) return index;
  }
  return readings.length > 0 ? 0 : undefined;
}

export function normalizedCalendarChecksum(days) {
  return createHash("sha256").update(JSON.stringify(days)).digest("hex");
}
