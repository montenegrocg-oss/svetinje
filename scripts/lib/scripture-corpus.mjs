import { serbianLatinToCyrillic } from "./serbian-transliteration.mjs";

const BOOK_FILES = {
  mt: "70-MATsrp1865.usfm",
  mk: "71-MRKsrp1865.usfm",
  lk: "72-LUKsrp1865.usfm",
  jn: "73-JHNsrp1865.usfm",
};

function cleanUsfmText(value) {
  return value
    .replace(/\\f\s[\s\S]*?\\f\*/g, " ")
    .replace(/\\x\s[\s\S]*?\\x\*/g, " ")
    .replace(/\\(?:add|bd|bdit|em|it|nd|no|ord|pn|qt|sc|sup|wj)\*?/g, "")
    .replace(/\\[a-z0-9]+\*?(?:\s+)?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseUsfmGospel(usfm) {
  const chapters = {};
  let chapter;
  let verse;

  for (const rawLine of usfm.replaceAll("\r", "").split("\n")) {
    const chapterMatch = rawLine.match(/^\\c\s+(\d+)/);
    if (chapterMatch) {
      chapter = chapterMatch[1];
      chapters[chapter] ??= {};
      verse = undefined;
      continue;
    }
    const verseMatch = rawLine.match(/^\\v\s+(\d+[a-z]?(?:-\d+[a-z]?)?)\s+(.*)$/i);
    if (verseMatch && chapter) {
      verse = verseMatch[1];
      chapters[chapter][verse] = cleanUsfmText(verseMatch[2]);
      continue;
    }
    if (chapter && verse && rawLine && !rawLine.startsWith("\\")) {
      chapters[chapter][verse] = `${chapters[chapter][verse]} ${cleanUsfmText(rawLine)}`.trim();
    }
  }
  return chapters;
}

export function buildSerbianGospelCorpus(readEntry) {
  const books = {};
  for (const [book, filename] of Object.entries(BOOK_FILES)) {
    const source = readEntry(filename).toString("utf8");
    const parsed = parseUsfmGospel(source);
    books[book] = Object.fromEntries(
      Object.entries(parsed).map(([chapter, verses]) => [
        chapter,
        Object.fromEntries(Object.entries(verses).map(([number, text]) => [number, serbianLatinToCyrillic(text)])),
      ]),
    );
  }
  return {
    schema_version: 1,
    translation_id: "vuk-karadzic-1847",
    language: "sr-Cyrl",
    licence: "public-domain",
    books,
  };
}

export function chapterVerseCount(corpus, book, chapter) {
  const verses = corpus.books?.[book]?.[String(chapter)];
  if (!verses) throw new Error(`Missing ${book} chapter ${chapter} in Scripture corpus`);
  return Math.max(...Object.keys(verses).flatMap((key) => /^\d+$/.test(key) ? [Number(key)] : []));
}

export function versesForRange(corpus, book, range) {
  const chapter = corpus.books?.[book]?.[String(range.chapter)];
  if (!chapter) throw new Error(`Missing ${book} chapter ${range.chapter}`);
  const result = [];
  for (const spec of range.verses) {
    const [startText, endText = startText] = String(spec).split("-");
    const start = Number(startText);
    const end = Number(endText);
    for (let number = start; number <= end; number += 1) {
      const text = chapter[String(number)];
      if (typeof text !== "string") throw new Error(`Missing ${book} ${range.chapter}:${number}`);
      result.push({ chapter: range.chapter, verse: number, text });
    }
  }
  return result;
}

export function assembleReading(corpus, reading) {
  return reading.ranges.flatMap((range) => versesForRange(corpus, reading.book, range));
}
