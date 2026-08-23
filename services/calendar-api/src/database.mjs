import { Pool } from "pg";

export function createCalendarPool(databaseUrl) {
  return new Pool({ connectionString: databaseUrl });
}
