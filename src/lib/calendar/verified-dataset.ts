import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const VERIFIED_CALENDAR_DATASET = "data/calendar/2026-08-01_2026-12-31.json";
export const VERIFIED_CALENDAR_START = "2026-08-01";
export const VERIFIED_CALENDAR_END = "2026-12-31";

export interface CalendarDay {
  date: string;
  julian_date: string;
  weekday_sr: string;
  week_context_sr: string;
  commemoration_sr: string;
  source_emphasis: string;
  verification_status: "verified";
}

export interface VerifiedCalendarDay extends CalendarDay {
  source_ref: string;
}

export interface VerifiedCalendarDataset {
  schema_version: 1;
  source: {
    record_count: number;
    commemoration_sha256: string;
    source_registry: Array<{ source_ref: string }>;
  };
  days: VerifiedCalendarDay[];
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function expectedRecordCount(): number {
  return Math.round((Date.parse(`${VERIFIED_CALENDAR_END}T00:00:00Z`) - Date.parse(`${VERIFIED_CALENDAR_START}T00:00:00Z`)) / 86_400_000) + 1;
}

export function validateVerifiedCalendarDataset(value: unknown): VerifiedCalendarDataset {
  const dataset = value as VerifiedCalendarDataset;
  if (dataset?.schema_version !== 1 || !Array.isArray(dataset.days)) {
    throw new Error("Unsupported verified calendar dataset");
  }
  const expectedCount = expectedRecordCount();
  if (dataset.days.length !== expectedCount) throw new Error(`Expected ${expectedCount} days, found ${dataset.days.length}`);
  if (dataset.source?.record_count !== expectedCount) throw new Error("Verified calendar source record count is invalid");
  if (dataset.days[0]?.date !== VERIFIED_CALENDAR_START || dataset.days.at(-1)?.date !== VERIFIED_CALENDAR_END) {
    throw new Error("Verified calendar dataset boundaries are invalid");
  }

  const fields: Array<keyof VerifiedCalendarDay> = [
    "date",
    "julian_date",
    "weekday_sr",
    "week_context_sr",
    "commemoration_sr",
    "source_emphasis",
    "source_ref",
    "verification_status",
  ];
  const sourceRefs = new Set(dataset.source?.source_registry?.map((source) => source.source_ref) ?? []);
  const dates = new Set<string>();
  for (const [index, day] of dataset.days.entries()) {
    for (const field of fields) {
      if (typeof day[field] !== "string" || day[field].length === 0) {
        throw new Error(`${day.date ?? `row ${index + 1}`}: missing ${field}`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !/^\d{4}-\d{2}-\d{2}$/.test(day.julian_date)) {
      throw new Error(`${day.date}: invalid date format`);
    }
    if (day.verification_status !== "verified") throw new Error(`${day.date}: record is not verified`);
    if (!sourceRefs.has(day.source_ref)) throw new Error(`${day.date}: unknown source_ref ${day.source_ref}`);
    if (dates.has(day.date)) throw new Error(`${day.date}: duplicate civil date`);
    dates.add(day.date);
    if (index > 0 && day.date !== nextDate(dataset.days[index - 1]!.date)) {
      throw new Error(`${day.date}: civil dates are not continuous`);
    }
  }

  const commemorationSha256 = createHash("sha256")
    .update(JSON.stringify(dataset.days.map((day) => day.commemoration_sr)))
    .digest("hex");
  if (commemorationSha256 !== dataset.source?.commemoration_sha256) {
    throw new Error("Commemoration text or casing differs from the verified source checksum");
  }
  return dataset;
}

export async function loadVerifiedCalendarDataset(root = process.cwd()): Promise<VerifiedCalendarDataset> {
  const value = JSON.parse(await readFile(path.join(root, VERIFIED_CALENDAR_DATASET), "utf8"));
  return validateVerifiedCalendarDataset(value);
}

export function publicCalendarDays(dataset: VerifiedCalendarDataset): CalendarDay[] {
  return dataset.days.map(({ source_ref: _sourceRef, ...day }) => day);
}
