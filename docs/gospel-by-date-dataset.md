# Gospel readings by date, August–December 2026

`data/gospel-readings/svetinje-gospel-by-date-2026.json` is a standalone production data artifact. It gives each of the 153 civil dates from 2026-08-01 through 2026-12-31 all Gospel bindings from the fixed user-provided `svetinje-gospel-calendar-2026-08-12.json`, in their original order and with full Serbian Cyrillic text extracted from the user-provided `nzavet.pdf`.

The current Svetinje.me Calendar API on Hetzner is used only to confirm that all 153 dates exist. It is not used to assign readings, and neither the canonical calendar nor its API/database schema is changed. Conditional and manual-review flags remain data, not selection logic; the dataset does not choose a primary reading.

The output contains 360 date bindings and retains eight source readings without a date under `unassigned_readings`. Generation is deterministic and performs no external Gospel research. The artifact has no runtime dependency on an importer, local paths, external calendar sites, or the Calendar API.

Regenerate with:

```text
node scripts/generate-gospel-by-date-2026.mjs --input <path-to-svetinje-gospel-calendar-2026-08-12.json>
```
