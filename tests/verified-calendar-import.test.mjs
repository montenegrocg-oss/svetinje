import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  loadVerifiedCalendarDataset,
  seedVerifiedCalendar,
  UPSERT_CALENDAR_DAY_SQL,
  validateVerifiedCalendarDataset,
} from "../scripts/lib/verified-calendar-seed.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

test("verified August-December dataset is complete, continuous, and source-backed", async () => {
  const dataset = await loadVerifiedCalendarDataset(ROOT);
  const days = validateVerifiedCalendarDataset(dataset);

  assert.equal(days.length, 153);
  assert.equal(days[0].date, "2026-08-01");
  assert.equal(days.at(-1).date, "2026-12-31");
  assert.equal(new Set(days.map((day) => day.date)).size, 153);
  assert.equal(dataset.source.record_count, 153);
  assert.equal(dataset.source.source_registry.length, 10);
  assert.ok(days.every((day) => day.julian_date));
  assert.ok(days.every((day) => day.verification_status === "verified"));
  assert.ok(days.every((day) => day.source_ref));
});

test("verified commemoration text keeps source casing and abbreviations exactly", async () => {
  const dataset = await loadVerifiedCalendarDataset(ROOT);
  const byDate = new Map(dataset.days.map((day) => [day.date, day]));

  assert.equal(byDate.get("2026-08-14").commemoration_sr, "АВГУСТ – Изношење Часног Крста (Почетак поста)");
  assert.equal(byDate.get("2026-08-19").commemoration_sr, "Преображење Господње");
  assert.equal(byDate.get("2026-09-13").commemoration_sr, "Полагање појаса Пресвете Богородице; Св. муч. Јасеновачки");
  assert.equal(byDate.get("2026-12-08").commemoration_sr, "Св. свештеномуч. Климент Римски; Св. Петар Александ.");
  assert.equal(byDate.get("2026-12-14").commemoration_sr, "ДЕЦЕМБАР – Св. пророк Наум; Св. Филарет Милостиви");
});

test("PostgreSQL seed is deterministic and idempotent by civil date", async () => {
  const dataset = await loadVerifiedCalendarDataset(ROOT);
  const stored = new Map();
  const client = {
    async query(sql, values) {
      if (sql === UPSERT_CALENDAR_DAY_SQL) stored.set(values[0], values);
      if (sql.startsWith("SELECT COUNT(*)")) return { rows: [{ count: stored.size }] };
      return { rowCount: 0 };
    },
  };

  assert.deepEqual(await seedVerifiedCalendar(client, dataset), { processed: 153, rows_in_range: 153 });
  assert.deepEqual(await seedVerifiedCalendar(client, dataset), { processed: 153, rows_in_range: 153 });
  assert.equal(stored.size, 153);
  assert.equal(stored.get("2026-08-14")[4], "АВГУСТ – Изношење Часног Крста (Почетак поста)");
  assert.match(UPSERT_CALENDAR_DAY_SQL, /ON CONFLICT \(date\) DO UPDATE/);
});
