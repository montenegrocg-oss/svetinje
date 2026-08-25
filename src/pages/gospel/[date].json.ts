import type { APIRoute } from "astro";
import { loadCalendarDays } from "../../lib/calendar/content.ts";
import {
  dailyGospelReadingsForDate,
  loadGospelReadingsDataset,
  type DailyGospelReading,
} from "../../lib/calendar/gospel-readings.ts";

export const prerender = true;

export async function getStaticPaths() {
  const [days, gospelDataset] = await Promise.all([loadCalendarDays(), loadGospelReadingsDataset()]);
  return days.map((day) => ({
    params: { date: day.date },
    props: { readings: dailyGospelReadingsForDate(gospelDataset, day.date) },
  }));
}

export const GET: APIRoute = ({ props }) => new Response(`${JSON.stringify({ readings: props.readings as DailyGospelReading[] })}\n`, {
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  },
});
