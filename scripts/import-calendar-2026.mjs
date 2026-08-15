#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";
import { readZipEntries } from "./lib/zip-archive.mjs";
import {
  extractLiturgicalGospelReadings,
  gregorianDateKey,
  julianDateForGregorian,
  normalizedCalendarChecksum,
  selectPrimaryReading,
  titleAndCommemorations,
} from "./lib/calendar-import.mjs";
import { assembleReading } from "./lib/scripture-corpus.mjs";

const IMPORT_VERSION = "1";
const TARGET_YEAR = 2026;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function assertSafeTemporaryPath(directory) {
  const relative = path.relative(path.resolve(tmpdir()), path.resolve(directory));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe temporary import path: ${directory}`);
  }
}

async function loadOverrides() {
  try {
    const value = parseYaml(await readFile(`content/calendar/${TARGET_YEAR}/_reading-overrides.yaml`, "utf8"));
    return value?.overrides ?? {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function resolveReading(reading, date, index, mapping, overrides) {
  const override = overrides[date]?.find((entry) => entry.reading === index);
  const effectiveReading = {
    ...reading,
    ...(override?.book ? { book: override.book } : {}),
    ...(override?.zachalo ? { zachalo: override.zachalo } : {}),
    ...(override?.scope ? { scope: override.scope } : {}),
  };
  const candidates = mapping.entries.filter((entry) => entry.book === effectiveReading.book && entry.zachalo === effectiveReading.zachalo);
  if (candidates.length === 0) throw new Error(`${date} reading ${index}: unknown ${reading.book} zachalo ${reading.zachalo}`);
  const selected = override && Object.hasOwn(override, "variant")
    ? candidates.find((entry) => (entry.variant ?? null) === (override.variant ?? null))
    : candidates.length === 1
      ? candidates[0]
      : candidates.find((entry) => entry.default_for_calendar === true);
  if (!selected) {
    const variants = candidates.map((entry) => entry.variant ?? "unmarked").join(", ");
    throw new Error(`${date} reading ${index}: ambiguous ${reading.book} zachalo ${reading.zachalo} (${variants}); add an explicit override`);
  }
  return { ...effectiveReading, ranges: selected.ranges };
}

const input = argument("--input");
if (!input) throw new Error("Usage: node scripts/import-calendar-2026.mjs --input <calendar.xapk>");
const inputPath = path.resolve(input);
const [mapping, corpus, overrides] = await Promise.all([
  readFile("content/lectionary/gospel-zachalo-map.json", "utf8").then(JSON.parse),
  readFile("content/scripture/sr-vuk-karadzic-1847/gospels.json", "utf8").then(JSON.parse),
  loadOverrides(),
]);

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "svetinje-calendar-import-"));
assertSafeTemporaryPath(temporaryDirectory);
try {
  const xapk = readZipEntries(await readFile(inputPath));
  const apkBuffer = xapk.read("com.tipik.app.apk");
  const apkPath = path.join(temporaryDirectory, "com.tipik.app.apk");
  await writeFile(apkPath, apkBuffer);
  const apk = readZipEntries(apkBuffer);
  const calendarArchiveBuffer = apk.read("res/raw/data_data.zip");
  await writeFile(path.join(temporaryDirectory, "data_data.zip"), calendarArchiveBuffer);
  const calendarArchive = readZipEntries(calendarArchiveBuffer);

  const titles = JSON.parse(calendarArchive.read("generated/titles_combined.json").toString("utf8"));
  const titleByDate = new Map(titles.map((entry) => [gregorianDateKey(entry.date), entry.content]));
  const monthlyNames = calendarArchive.names.filter((name) => /^generated\/20(?:25|26|27)\/\d{2}\.json$/.test(name));
  const rawDays = new Map();
  for (const name of monthlyNames) {
    const monthly = JSON.parse(calendarArchive.read(name).toString("utf8"));
    for (const [sourceDate, record] of Object.entries(monthly)) {
      const date = gregorianDateKey(sourceDate);
      if (date.startsWith(`${TARGET_YEAR}-`)) rawDays.set(date, record);
    }
  }

  const dates = [...rawDays.keys()].sort();
  if (dates.length !== 365 || new Set(dates).size !== 365) {
    throw new Error(`Expected 365 unique Gregorian ${TARGET_YEAR} dates, found ${dates.length}`);
  }
  if (dates[0] !== `${TARGET_YEAR}-01-01` || dates.at(-1) !== `${TARGET_YEAR}-12-31`) {
    throw new Error(`Calendar boundary mismatch: ${dates[0]} to ${dates.at(-1)}`);
  }

  const days = [];
  for (const date of dates) {
    const raw = rawDays.get(date);
    const titleText = titleByDate.get(date);
    if (!titleText) throw new Error(`${date}: missing factual calendar title`);
    const { title, commemorations } = titleAndCommemorations(titleText);
    const extracted = extractLiturgicalGospelReadings(raw.html);
    const readings = extracted.map((reading, index) => resolveReading(reading, date, index, mapping, overrides));
    const primaryReading = selectPrimaryReading(readings);
    for (const reading of readings) assembleReading(corpus, reading);
    days.push({
      schema_version: 1,
      date,
      julian_date: julianDateForGregorian(date),
      title,
      commemorations,
      ...(primaryReading === undefined ? {} : { gospel: { primary_reading: primaryReading, readings } }),
    });
  }

  const outputDirectory = path.resolve(`content/calendar/${TARGET_YEAR}`);
  await mkdir(outputDirectory, { recursive: true });
  for (const day of days) {
    await writeFile(path.join(outputDirectory, `${day.date}.yaml`), stringifyYaml(day, { lineWidth: 0 }), "utf8");
  }
  const provenance = {
    schema_version: 1,
    calendar_input_identifier: "tipik-1.3.4-xapk",
    import_date: "2026-08-15",
    import_script_version: IMPORT_VERSION,
    scripture_translation_id: corpus.translation_id,
    scripture_licence: "public-domain",
    normalized_calendar_sha256: normalizedCalendarChecksum(days),
  };
  await writeFile(path.join(outputDirectory, "_provenance.yaml"), stringifyYaml(provenance, { lineWidth: 0 }), "utf8");
  console.log(`Imported ${days.length} calendar days with ${days.reduce((sum, day) => sum + (day.gospel?.readings.length ?? 0), 0)} Gospel reading(s).`);
} finally {
  assertSafeTemporaryPath(temporaryDirectory);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
