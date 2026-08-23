import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const VERIFIED_CALENDAR_DATASET = "data/calendar/2026-08-01_2026-12-31.json";

export const UPSERT_CALENDAR_DAY_SQL = `
INSERT INTO calendar_days (
  date,
  julian_date,
  weekday_sr,
  week_context_sr,
  commemoration_sr,
  source_emphasis,
  source_ref,
  verification_status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (date) DO UPDATE SET
  julian_date = EXCLUDED.julian_date,
  weekday_sr = EXCLUDED.weekday_sr,
  week_context_sr = EXCLUDED.week_context_sr,
  commemoration_sr = EXCLUDED.commemoration_sr,
  source_emphasis = EXCLUDED.source_emphasis,
  source_ref = EXCLUDED.source_ref,
  verification_status = EXCLUDED.verification_status,
  updated_at = CURRENT_TIMESTAMP`;

function nextDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function validateVerifiedCalendarDataset(dataset) {
  if (dataset?.schema_version !== 1 || !Array.isArray(dataset.days)) {
    throw new Error("Unsupported verified calendar dataset");
  }
  if (dataset.days.length !== 153) throw new Error(`Expected 153 days, found ${dataset.days.length}`);
  if (dataset.days[0]?.date !== "2026-08-01" || dataset.days.at(-1)?.date !== "2026-12-31") {
    throw new Error("Verified calendar dataset boundaries are invalid");
  }

  const fields = [
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
  const dates = new Set();
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
    if (index > 0 && day.date !== nextDate(dataset.days[index - 1].date)) {
      throw new Error(`${day.date}: civil dates are not continuous`);
    }
  }

  const commemorationSha256 = createHash("sha256")
    .update(JSON.stringify(dataset.days.map((day) => day.commemoration_sr)))
    .digest("hex");
  if (commemorationSha256 !== dataset.source?.commemoration_sha256) {
    throw new Error("Commemoration text or casing differs from the verified source checksum");
  }
  return dataset.days;
}

export async function loadVerifiedCalendarDataset(root = path.resolve(import.meta.dirname, "../..")) {
  const value = JSON.parse(await readFile(path.join(root, VERIFIED_CALENDAR_DATASET), "utf8"));
  validateVerifiedCalendarDataset(value);
  return value;
}

export async function seedVerifiedCalendar(database, dataset) {
  const days = validateVerifiedCalendarDataset(dataset);
  const client = typeof database.connect === "function" ? await database.connect() : database;
  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    for (const day of days) {
      await client.query(UPSERT_CALENDAR_DAY_SQL, [
        day.date,
        day.julian_date,
        day.weekday_sr,
        day.week_context_sr,
        day.commemoration_sr,
        day.source_emphasis,
        day.source_ref,
        day.verification_status,
      ]);
    }
    const count = await client.query(
      "SELECT COUNT(*)::integer AS count FROM calendar_days WHERE date >= $1 AND date <= $2",
      [days[0].date, days.at(-1).date],
    );
    if (count.rows[0]?.count !== days.length) {
      throw new Error(`Expected ${days.length} seeded rows, found ${count.rows[0]?.count ?? "unknown"}`);
    }
    await client.query("COMMIT");
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release?.();
  }
  return { processed: days.length, rows_in_range: days.length };
}
