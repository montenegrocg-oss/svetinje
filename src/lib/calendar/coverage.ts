export const VERIFIED_CALENDAR_START = "2026-08-01";
export const VERIFIED_CALENDAR_END = "2026-12-31";

export function isVerifiedCalendarDate(date: string): boolean {
  return date >= VERIFIED_CALENDAR_START && date <= VERIFIED_CALENDAR_END;
}
