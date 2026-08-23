import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";
import { after, before, test } from "node:test";
import { newDb } from "pg-mem";
import { loadVerifiedCalendarDataset, seedVerifiedCalendar } from "../../../scripts/lib/verified-calendar-seed.mjs";
import { createCalendarApiHandler } from "../src/api.mjs";
import { createCalendarRepository } from "../src/calendar-repository.mjs";
import { runCalendarMigrations } from "../src/migrations.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
let pool;
let server;
let baseUrl;
let dataset;

before(async () => {
  const memory = newDb({ noAstCoverageCheck: true });
  const adapter = memory.adapters.createPg();
  pool = new adapter.Pool();
  dataset = await loadVerifiedCalendarDataset(ROOT);

  assert.deepEqual(await runCalendarMigrations(pool), { applied: ["001_create_calendar_days.sql"] });
  assert.deepEqual(await runCalendarMigrations(pool), { applied: [] });
  assert.deepEqual(await seedVerifiedCalendar(pool, dataset), { processed: 153, rows_in_range: 153 });
  assert.deepEqual(await seedVerifiedCalendar(pool, dataset), { processed: 153, rows_in_range: 153 });

  const repository = createCalendarRepository(pool);
  server = createServer(createCalendarApiHandler({
    repository,
    clock: () => new Date("2026-08-18T22:30:00Z"),
    logger: { error() {} },
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (pool) await pool.end();
});

async function request(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return { response, body: await response.json() };
}

test("migration and repeated seed leave exactly 153 unique verified rows", async () => {
  const result = await pool.query(
    "SELECT COUNT(*)::integer AS count, COUNT(DISTINCT date)::integer AS unique_count FROM calendar_days",
  );
  assert.deepEqual(result.rows[0], { count: 153, unique_count: 153 });
});

test("GET /health reports a working database", async () => {
  const { response, body } = await request("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: "ok" });
});

test("day API preserves exact stored casing and keeps source_ref private", async () => {
  const august19 = await request("/v1/day/2026-08-19");
  assert.equal(august19.response.status, 200);
  assert.equal(august19.body.commemoration_sr, "Преображење Господње");
  assert.equal(Object.hasOwn(august19.body, "source_ref"), false);

  const august20 = await request("/v1/day/2026-08-20");
  assert.equal(august20.response.status, 200);
  assert.equal(august20.body.commemoration_sr, "Свети преподобномученик Дометије; Преподобни Ор");
});

test("day API distinguishes invalid and missing dates", async () => {
  assert.equal((await request("/v1/day/2026-02-30")).response.status, 400);
  assert.equal((await request("/v1/day/2026-07-31")).response.status, 404);
});

test("month API returns canonical counts ordered by civil date", async () => {
  const counts = new Map([[8, 31], [9, 30], [10, 31], [11, 30], [12, 31]]);
  for (const [month, count] of counts) {
    const { response, body } = await request(`/v1/month/2026/${String(month).padStart(2, "0")}`);
    assert.equal(response.status, 200);
    assert.equal(body.days.length, count);
    assert.deepEqual(body.days.map((day) => day.date), [...body.days.map((day) => day.date)].sort());
  }
});

test("today API derives the civil day in Europe/Podgorica instead of UTC", async () => {
  const { response, body } = await request("/v1/today");
  assert.equal(response.status, 200);
  assert.equal(body.date, "2026-08-19");
});
