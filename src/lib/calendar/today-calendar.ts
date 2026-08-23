import type { CalendarDay } from "./content.ts";

export const CALENDAR_TIME_ZONE = "Europe/Podgorica";

export function podgoricaDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function todayCalendarDay(days: CalendarDay[], now: Date): CalendarDay | undefined {
  return days.find((day) => day.date === podgoricaDateKey(now));
}

export function createTodayCalendarModel(days: CalendarDay[], now: Date) {
  const day = todayCalendarDay(days, now);
  if (!day) return undefined;
  return { day };
}
