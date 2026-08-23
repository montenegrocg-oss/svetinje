import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MIGRATIONS_DIRECTORY = path.resolve(import.meta.dirname, "../migrations");

const CREATE_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS calendar_schema_migrations (
  name text PRIMARY KEY,
  checksum text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export async function runCalendarMigrations(database, directory = DEFAULT_MIGRATIONS_DIRECTORY) {
  const client = typeof database.connect === "function" ? await database.connect() : database;
  let transactionStarted = false;
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query(CREATE_MIGRATIONS_TABLE_SQL);
    const appliedResult = await client.query("SELECT name, checksum FROM calendar_schema_migrations");
    const applied = new Map(appliedResult.rows.map((row) => [row.name, row.checksum]));
    const newlyApplied = [];

    for (const name of names) {
      const sql = await readFile(path.join(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO calendar_schema_migrations (name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      newlyApplied.push(name);
    }

    await client.query("COMMIT");
    transactionStarted = false;
    return { applied: newlyApplied };
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release?.();
  }
}
