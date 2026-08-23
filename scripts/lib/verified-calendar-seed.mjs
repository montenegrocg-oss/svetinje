import {
  loadVerifiedCalendarDataset,
  validateVerifiedCalendarDataset,
} from "../../src/lib/calendar/verified-dataset.ts";

export {
  VERIFIED_CALENDAR_DATASET,
  loadVerifiedCalendarDataset,
  validateVerifiedCalendarDataset,
} from "../../src/lib/calendar/verified-dataset.ts";

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

export async function seedVerifiedCalendar(database, dataset) {
  const days = validateVerifiedCalendarDataset(dataset).days;
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
