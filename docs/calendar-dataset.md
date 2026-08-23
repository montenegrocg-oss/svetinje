# Calendar dataset architecture

## Canonical source

`data/calendar/2026-08-01_2026-12-31.json` is the only active repository source of calendar facts for 1 August through 31 December 2026. It contains 153 user-verified, continuous civil dates. The same file supplies both the PostgreSQL seed projection and the Astro calendar loader.

The public `CalendarDay` projection preserves these source fields directly:

- `date`;
- `julian_date`;
- `weekday_sr`;
- `week_context_sr`;
- `commemoration_sr`;
- `source_emphasis`;
- `verification_status`.

`source_ref` remains in the canonical dataset for internal provenance but is removed from the frontend read model and public JSON/HTML.

## Verified range and missing state

The frontend generates calendar day routes only for the verified range. Dates before 2026-08-01 or after 2026-12-31 have no calendar record and must use the existing unavailable/pending behavior. There is no legacy factual fallback.

Daily Gospel data is intentionally absent from this dataset. Calendar pages and the homepage use their existing missing-reading state; they do not recover readings from retired files.

## Retired legacy inventory

Before the cutover, `content/calendar/2026/` contained 365 Tipik-derived day YAML files covering 2026-01-01 through 2026-12-31. The frontend loader, static day routes, homepage calendar payload, content validation, and build-output inventory all consumed that copy.

The 365 day files, `_provenance.yaml`, and the XAPK-specific `scripts/import-calendar-2026.mjs` importer were removed from the active tree. `_reading-overrides.yaml` remains only as an inactive Gospel-related artifact for a separate cleanup task; no current calendar loader or importer reads it.
