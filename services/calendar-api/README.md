# Calendar API

Standalone read-only Node.js API backed by PostgreSQL. It does not replace the current Astro calendar runtime.

Endpoints: `GET /health`, `GET /v1/today`, `GET /v1/day/:date`, and `GET /v1/month/:year/:month`. Public calendar responses use snake_case fields and intentionally omit the internal `source_ref`.

## Local PostgreSQL and API

Copy `.env.example` to `.env`, replace the example password, then run from this directory:

```sh
docker compose up --build
```

The database uses the persistent `calendar-db` volume. With `CALENDAR_BOOTSTRAP=true`, API startup applies pending migrations and idempotently seeds the 153 verified days before listening on port 3001.

## Commands without Docker

Set `DATABASE_URL`, then run from the repository root:

```sh
pnpm --filter @svetinje/calendar-api migrate
pnpm --filter @svetinje/calendar-api seed
pnpm --filter @svetinje/calendar-api start
pnpm --filter @svetinje/calendar-api test
```

`bootstrap` runs migration and seed together. `HOST`, `PORT`, and optional `CALENDAR_BOOTSTRAP=true` configure the API process. The canonical API timezone is always `Europe/Podgorica`.
