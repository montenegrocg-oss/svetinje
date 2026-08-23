#!/usr/bin/env node

import path from "node:path";
import { loadVerifiedCalendarDataset, seedVerifiedCalendar } from "../../../scripts/lib/verified-calendar-seed.mjs";
import { readCalendarApiConfig } from "./config.mjs";
import { createCalendarPool } from "./database.mjs";
import { runCalendarMigrations } from "./migrations.mjs";

const command = process.argv[2];
if (!new Set(["migrate", "seed", "bootstrap"]).has(command)) {
  throw new Error("Usage: node src/cli.mjs <migrate|seed|bootstrap>");
}

const root = path.resolve(import.meta.dirname, "../../..");
const config = readCalendarApiConfig();
const pool = createCalendarPool(config.databaseUrl);
try {
  if (command === "migrate" || command === "bootstrap") {
    const result = await runCalendarMigrations(pool);
    console.log(`Calendar migrations applied: ${result.applied.length}`);
  }
  if (command === "seed" || command === "bootstrap") {
    const dataset = await loadVerifiedCalendarDataset(root);
    const result = await seedVerifiedCalendar(pool, dataset);
    console.log(`Calendar rows seeded: ${result.rows_in_range}`);
  }
} finally {
  await pool.end();
}
