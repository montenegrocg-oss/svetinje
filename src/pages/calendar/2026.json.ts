import type { APIRoute } from "astro";
import { assembleReading, loadCalendarDays, loadScriptureCorpus, primaryReading, readingExcerpt, shortReadingReference } from "../../lib/calendar/content";

export const prerender = true;

export const GET: APIRoute = async () => {
  const [days, corpus] = await Promise.all([loadCalendarDays(), loadScriptureCorpus()]);
  const compact = days.map((day) => {
    const reading = primaryReading(day);
    const excerpt = reading ? readingExcerpt(assembleReading(corpus, reading)) : undefined;
    return {
      date: day.date,
      title: day.title,
      commemorations: day.commemorations.slice(0, 2),
      ...(reading ? { gospel: { reference: shortReadingReference(reading), excerpt } } : {}),
    };
  });
  return new Response(JSON.stringify({ year: 2026, time_zone: "Europe/Podgorica", days: compact }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
