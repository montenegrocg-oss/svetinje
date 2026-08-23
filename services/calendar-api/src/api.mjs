import { CALENDAR_TIME_ZONE } from "./config.mjs";

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(body);
}

export function isIsoCivilDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function podgoricaDateKey(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function createCalendarApiHandler({ repository, clock = () => new Date(), logger = console }) {
  return async function calendarApiHandler(request, response) {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      json(response, 405, { error: "method_not_allowed" });
      return;
    }

    const { pathname } = new URL(request.url, "http://calendar-api.local");
    try {
      if (pathname === "/health") {
        try {
          await repository.health();
          json(response, 200, { status: "ok" });
        } catch (error) {
          logger.error?.("Calendar API health check failed", error);
          json(response, 503, { status: "unavailable" });
        }
        return;
      }

      if (pathname === "/v1/today") {
        const date = podgoricaDateKey(clock());
        const day = await repository.day(date);
        json(response, day ? 200 : 404, day ?? { error: "calendar_day_not_found", date });
        return;
      }

      const dayMatch = /^\/v1\/day\/([^/]+)$/.exec(pathname);
      if (dayMatch) {
        const date = decodeURIComponent(dayMatch[1]);
        if (!isIsoCivilDate(date)) {
          json(response, 400, { error: "invalid_date" });
          return;
        }
        const day = await repository.day(date);
        json(response, day ? 200 : 404, day ?? { error: "calendar_day_not_found", date });
        return;
      }

      const monthMatch = /^\/v1\/month\/(\d{4})\/(\d{2})$/.exec(pathname);
      if (monthMatch) {
        const year = Number(monthMatch[1]);
        const month = Number(monthMatch[2]);
        if (year < 1 || month < 1 || month > 12) {
          json(response, 400, { error: "invalid_month" });
          return;
        }
        const days = await repository.month(year, month);
        json(response, 200, { year, month, days });
        return;
      }

      json(response, 404, { error: "not_found" });
    } catch (error) {
      logger.error?.("Calendar API request failed", error);
      json(response, 500, { error: "internal_error" });
    }
  };
}
