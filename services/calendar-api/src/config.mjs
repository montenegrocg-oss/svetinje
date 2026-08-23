export const CALENDAR_TIME_ZONE = "Europe/Podgorica";

export function readCalendarApiConfig(environment = process.env) {
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const port = Number(environment.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be an integer from 1 to 65535");
  return {
    databaseUrl: environment.DATABASE_URL,
    host: environment.HOST ?? "0.0.0.0",
    port,
    bootstrap: environment.CALENDAR_BOOTSTRAP === "true",
  };
}
