const PUBLIC_COLUMNS = `
  date,
  julian_date,
  weekday_sr,
  week_context_sr,
  commemoration_sr,
  source_emphasis,
  verification_status`;

function isoDate(value) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  throw new Error("Database returned an unsupported date value");
}

export function toPublicCalendarDay(row) {
  return {
    date: isoDate(row.date),
    julian_date: isoDate(row.julian_date),
    weekday_sr: row.weekday_sr,
    week_context_sr: row.week_context_sr,
    commemoration_sr: row.commemoration_sr,
    source_emphasis: row.source_emphasis,
    verification_status: row.verification_status,
  };
}

export function createCalendarRepository(database) {
  return {
    async health() {
      await database.query("SELECT 1");
    },

    async day(date) {
      const result = await database.query(
        `SELECT ${PUBLIC_COLUMNS} FROM calendar_days WHERE date = $1`,
        [date],
      );
      return result.rows[0] ? toPublicCalendarDay(result.rows[0]) : undefined;
    },

    async month(year, month) {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
      const result = await database.query(
        `SELECT ${PUBLIC_COLUMNS} FROM calendar_days WHERE date >= $1 AND date < $2 ORDER BY date ASC`,
        [start, end],
      );
      return result.rows.map(toPublicCalendarDay);
    },
  };
}
