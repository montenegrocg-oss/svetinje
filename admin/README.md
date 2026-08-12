# Svetinje.me editorial admin — Phase 1

This directory is an independently deployable Cloudflare Worker intended for `admin.svetinje.me`. It is not a public `/admin/` route and does not participate in the root Astro build.

## Architecture

- Cloudflare Access protects the hostname. The Worker independently validates `Cf-Access-Jwt-Assertion` against the team JWKS, issuer and application audience.
- Admin HTML is `noindex`, non-cacheable, frame-denied and protected by a restrictive same-origin Content Security Policy; write requests also require a same-origin `Origin` header.
- A server-side GitHub App installation token provides narrow repository access. No GitHub credential or Access assertion reaches browser JavaScript.
- Git remains the only content database. Reads come from `GITHUB_EDITORIAL_BRANCH`; writes use Git blobs/tree/commit/ref APIs.
- The canonical `schemas/place.schema.json`, repository content tree and `validation/editorial-preview.json` are read from the same branch.
- Scaffold validation and serialization are shared with `scripts/new-place.mjs` through `scripts/lib/place-scaffold.mjs`.

## Required configuration

Set these as Worker variables or secrets; never commit their values:

- `CLOUDFLARE_ACCESS_TEAM_DOMAIN` — full Access team origin, for example `https://example.cloudflareaccess.com`.
- `CLOUDFLARE_ACCESS_AUD` — Access application AUD tag.
- `GITHUB_APP_ID`
- `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY` — Worker secret containing the PEM private key.
- `GITHUB_OWNER=montenegrocg-oss`
- `GITHUB_REPO=svetinje`
- `GITHUB_EDITORIAL_BRANCH` — mandatory non-`main` editorial branch.
- `ENVIRONMENT=production` in deployed environments.

Minimum GitHub App repository permission: **Contents: Read and write** for `montenegrocg-oss/svetinje`. No pull request, administration, workflow, issue or deployment permission is required for Phase 1.

## Authentication and local development

Production always requires a cryptographically valid Access JWT. A local-only bypass exists only when both conditions hold:

1. `ENVIRONMENT` is not `production`;
2. `DEV_AUTH_BYPASS=true`.

`DEV_AUTH_EMAIL` may identify the local actor. `DEV_AUTH_BYPASS` is ignored in production, so accidentally setting it on a deployed production Worker cannot bypass Access validation.

Install from the repository root with `pnpm install`, then run:

```sh
pnpm --dir admin test
pnpm --dir admin typecheck
pnpm --dir admin build
```

`wrangler dev --config admin/wrangler.jsonc` may be used after providing local variables outside Git. Do not put real credentials in `.dev.vars` in this repository.

## Write safety

- Missing, blank or `main` editorial branches fail closed.
- Creation refuses duplicate IDs and unsafe IDs/slugs.
- One save creates exactly `place.yaml` and Serbian `sr.md` as research records.
- The preview allowlist is never changed.
- The branch HEAD is read before work, checked again before the ref update, and used as the sole commit parent.
- Ref updates explicitly use `force: false`; concurrent movement returns a conflict.
- No merge or automatic publication exists.

## Phase 1 features

- authenticated dashboard with repository-derived counts;
- searchable place inventory;
- read-only structured place summary;
- minimal Serbian name/ID/slug/type creation form;
- one atomic research-scaffold commit to the configured editorial branch;
- JSON endpoints: `GET /api/session`, `GET /api/places`, `GET /api/places/:id`, `POST /api/places`.

## Deferred

Editing existing records, narratives, sources, media, practical information, approvals, preview promotion, pull requests, merge/release controls, audit history UI and deployment automation are intentionally deferred to later phases.
