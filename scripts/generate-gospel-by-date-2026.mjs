import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PERIOD = Object.freeze({ start: "2026-08-01", end: "2026-12-31" });
export const EXPECTED_DATE_COUNT = 153;
export const EXPECTED_BINDING_COUNT = 360;
export const EXPECTED_INVENTORY_COUNT = 186;
export const HETZNER_API = "https://calendar-api.svetinje.me";
export const DEFAULT_OUTPUT = "data/gospel-readings/svetinje-gospel-by-date-2026.json";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`Missing ${label}`);
  return value;
}

function normalizeVerses(verses, label) {
  if (!Array.isArray(verses) || verses.length === 0) throw new Error(`Missing verses for ${label}`);
  return verses.map((verse) => ({
    chapter: verse.chapter,
    verse: verse.verse,
    text: requiredString(verse.text, `${label} verse text`),
  }));
}

function normalizeReading(reading, { binding = false } = {}) {
  const readingId = requiredString(binding ? reading.reading_id : reading.id, "reading_id");
  return {
    ...(binding ? { entry_id: requiredString(reading.entry_id, `${readingId} entry_id`) } : {}),
    reading_id: readingId,
    book: requiredString(reading.book, `${readingId} book`),
    zachalo: requiredString(String(reading.zachalo ?? ""), `${readingId} zachalo`),
    passage: requiredString(reading.passage, `${readingId} passage`),
    ...(binding ? {
      reading_type: requiredString(reading.reading_type, `${readingId} reading_type`),
      feast_or_reason: requiredString(reading.reason, `${readingId} reason`),
      conditional: reading.conditional === true,
      needs_review: reading.needs_review === true,
    } : {}),
    verses: normalizeVerses(reading.verses, readingId),
    text: requiredString(reading.text, `${readingId} text`),
  };
}

function readingContentKey(reading) {
  return JSON.stringify({
    reading_id: reading.reading_id,
    book: reading.book,
    zachalo: reading.zachalo,
    passage: reading.passage,
    verses: reading.verses,
    text: reading.text,
  });
}

function bindingDuplicateKey(date, reading) {
  return JSON.stringify({
    date,
    reading_id: reading.reading_id,
    book: reading.book,
    zachalo: reading.zachalo,
    passage: reading.passage,
    reading_type: reading.reading_type,
    feast_or_reason: reading.feast_or_reason,
    conditional: reading.conditional,
    needs_review: reading.needs_review,
    verses: reading.verses,
    text: reading.text,
  });
}

export function createGospelByDateDataset(input, canonicalDates, sourceHashes) {
  if (!Array.isArray(input?.dates)) throw new Error("Input Gospel dataset has no dates array");
  if (!Array.isArray(input?.inventory_without_date_in_period)) throw new Error("Input Gospel dataset has no unassigned inventory");
  const inputDates = input.dates.map((day) => requiredString(day.date, "date"));
  if (inputDates.length !== EXPECTED_DATE_COUNT || new Set(inputDates).size !== EXPECTED_DATE_COUNT) {
    throw new Error(`Expected ${EXPECTED_DATE_COUNT} unique input dates`);
  }
  const sortedInputDates = [...inputDates].sort();
  const sortedCanonicalDates = [...canonicalDates].sort();
  if (sortedCanonicalDates.length !== EXPECTED_DATE_COUNT || new Set(sortedCanonicalDates).size !== EXPECTED_DATE_COUNT) {
    throw new Error(`Hetzner did not return ${EXPECTED_DATE_COUNT} unique canonical dates`);
  }
  if (JSON.stringify(sortedInputDates) !== JSON.stringify(sortedCanonicalDates)) {
    const unknown = sortedInputDates.filter((date) => !sortedCanonicalDates.includes(date));
    throw new Error(`Input dates absent from Hetzner calendar: ${unknown.join(", ")}`);
  }

  const dates = {};
  const contentByReadingId = new Map();
  const idByBookZachalo = new Map();
  const duplicateKeys = new Map();
  let bindings = 0;
  for (const day of [...input.dates].sort((left, right) => left.date.localeCompare(right.date))) {
    const readings = day.readings.map((reading) => normalizeReading(reading, { binding: true }));
    bindings += readings.length;
    for (const reading of readings) {
      const contentKey = readingContentKey(reading);
      const previousContent = contentByReadingId.get(reading.reading_id);
      if (previousContent && previousContent !== contentKey) throw new Error(`Conflicting text or passage for ${reading.reading_id}`);
      contentByReadingId.set(reading.reading_id, contentKey);
      const stableKey = `${reading.book}\u001f${reading.zachalo}`;
      const previousId = idByBookZachalo.get(stableKey);
      if (previousId && previousId !== reading.reading_id) throw new Error(`Ambiguous stable ID for ${reading.book} ${reading.zachalo}`);
      idByBookZachalo.set(stableKey, reading.reading_id);
      const duplicateKey = bindingDuplicateKey(day.date, reading);
      duplicateKeys.set(duplicateKey, (duplicateKeys.get(duplicateKey) ?? 0) + 1);
    }
    dates[day.date] = { readings };
  }
  if (bindings !== EXPECTED_BINDING_COUNT) throw new Error(`Expected ${EXPECTED_BINDING_COUNT} bindings, found ${bindings}`);

  const unassignedReadings = input.inventory_without_date_in_period
    .map((reading) => normalizeReading(reading))
    .sort((left, right) => left.reading_id.localeCompare(right.reading_id));
  for (const reading of unassignedReadings) {
    if (contentByReadingId.has(reading.reading_id)) throw new Error(`Unassigned reading ${reading.reading_id} is already date-assigned`);
    contentByReadingId.set(reading.reading_id, readingContentKey(reading));
    const stableKey = `${reading.book}\u001f${reading.zachalo}`;
    const previousId = idByBookZachalo.get(stableKey);
    if (previousId && previousId !== reading.reading_id) throw new Error(`Ambiguous stable ID for ${reading.book} ${reading.zachalo}`);
    idByBookZachalo.set(stableKey, reading.reading_id);
  }
  if (contentByReadingId.size !== EXPECTED_INVENTORY_COUNT) {
    throw new Error(`Expected ${EXPECTED_INVENTORY_COUNT} unique Gospel readings, found ${contentByReadingId.size}`);
  }

  const exactDuplicateBindings = [...duplicateKeys.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const allBindings = Object.values(dates).flatMap((day) => day.readings);
  return {
    schema_version: "1.0",
    period: PERIOD,
    language: "sr-Cyrl",
    metadata: {
      canonical_date_existence: {
        provider: "Svetinje.me Calendar API on Hetzner",
        base_url: HETZNER_API,
        verified_dates: canonicalDates.length,
      },
      date_reading_bindings: {
        source: "user-provided fixed Gospel input dataset",
        file: "svetinje-gospel-calendar-2026-08-12.json",
        sha256: sourceHashes.gospelInput,
      },
      scripture_text: {
        source: "user-provided nzavet.pdf",
        sha256: requiredString(input.metadata?.source_files?.gospel_pdf?.sha256, "nzavet.pdf sha256"),
      },
      canonical_calendar: {
        modified: false,
        repository_dataset_sha256: sourceHashes.calendarDataset,
      },
      external_research_performed: false,
      counts: {
        dates: canonicalDates.length,
        bindings,
        dated_unique_reading_ids: contentByReadingId.size - unassignedReadings.length,
        unassigned_readings: unassignedReadings.length,
        total_reading_inventory: contentByReadingId.size,
        needs_review_bindings: allBindings.filter((reading) => reading.needs_review).length,
        conditional_bindings: allBindings.filter((reading) => reading.conditional).length,
        exact_duplicate_bindings: exactDuplicateBindings,
      },
    },
    dates,
    unassigned_readings: unassignedReadings,
  };
}

export function serializeDataset(dataset) {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

export async function fetchCanonicalDates(fetchImplementation = fetch) {
  const dates = [];
  for (const month of ["08", "09", "10", "11", "12"]) {
    const response = await fetchImplementation(`${HETZNER_API}/v1/month/2026/${month}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Hetzner Calendar API returned ${response.status} for 2026-${month}`);
    const payload = await response.json();
    if (!Array.isArray(payload.days)) throw new Error(`Hetzner Calendar API returned no days for 2026-${month}`);
    dates.push(...payload.days.map((day) => day.date));
  }
  return dates;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const inputPath = argumentValue("--input");
  if (!inputPath) throw new Error("Usage: node scripts/generate-gospel-by-date-2026.mjs --input <svetinje-gospel-calendar-2026-08-12.json> [--output <path>]");
  const outputPath = path.resolve(argumentValue("--output") ?? DEFAULT_OUTPUT);
  const calendarPath = path.resolve("data/calendar/2026-08-01_2026-12-31.json");
  const [inputBytes, calendarBytes, canonicalDates] = await Promise.all([
    readFile(path.resolve(inputPath)),
    readFile(calendarPath),
    fetchCanonicalDates(),
  ]);
  const dataset = createGospelByDateDataset(JSON.parse(inputBytes.toString("utf8")), canonicalDates, {
    gospelInput: sha256(inputBytes),
    calendarDataset: sha256(calendarBytes),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeDataset(dataset), "utf8");
  process.stdout.write(`${JSON.stringify(dataset.metadata.counts, null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
