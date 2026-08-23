import type { APIRoute } from "astro";
import { loadCalendarDays } from "../../lib/calendar/content";

export const prerender = true;

export const GET: APIRoute = async () => {
  const days = await loadCalendarDays();
  return new Response(JSON.stringify({ year: 2026, time_zone: "Europe/Podgorica", days }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
