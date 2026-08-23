#!/usr/bin/env node

import { createServer } from "node:http";
import path from "node:path";
import { loadVerifiedCalendarDataset, seedVerifiedCalendar } from "../../../scripts/lib/verified-calendar-seed.mjs";
import { createCalendarApiHandler } from "./api.mjs";
import { createCalendarRepository } from "./calendar-repository.mjs";
import { readCalendarApiConfig } from "./config.mjs";
import { createCalendarPool } from "./database.mjs";
import { runCalendarMigrations } from "./migrations.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const config = readCalendarApiConfig();
const pool = createCalendarPool(config.databaseUrl);

if (config.bootstrap) {
  await runCalendarMigrations(pool);
  await seedVerifiedCalendar(pool, await loadVerifiedCalendarDataset(root));
}
await pool.query("SELECT 1");

const repository = createCalendarRepository(pool);
const server = createServer(createCalendarApiHandler({ repository }));
server.listen(config.port, config.host, () => {
  console.log(`Calendar API listening on ${config.host}:${config.port}`);
});

async function shutdown(signal) {
  console.log(`Calendar API received ${signal}`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
