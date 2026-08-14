# Svetinje.me editorial admin — Phase 2

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
- `PUBLIC_MAPTILER_KEY` — public browser key used only by the isolated editorial coordinate picker.
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

## Phase 2 features

- authenticated dashboard with repository-derived counts;
- searchable place inventory;
- read-only structured place summary with a link to the editor;
- minimal Serbian name/ID/slug/type creation form;
- one atomic research-scaffold commit to the configured editorial branch;
- existing-place editor for Serbian identity and catalogue metadata, canonical place type, shared browse area, ecclesiastical jurisdiction and structured location;
- MapLibre coordinate picker bundled as a same-origin admin asset, with click/tap placement, draggable refinement, manual numeric inputs and point clearing;
- Serbian narrative editor that retains canonical section IDs, order, source relationships and untouched Markdown blocks while allowing supported sections and paragraphs to be edited;
- compact read-only source references and editorial-preview membership display;
- JSON endpoints: `GET /api/session`, `GET /api/places`, `GET /api/places/:id`, `POST /api/places`, `PATCH /api/places/:id`, and `DELETE /api/places/:id`.

## Existing-place saves

`PATCH /api/places/:id` requires the branch HEAD supplied as `expectedHeadSha`. The server reloads the canonical YAML and Serbian Markdown, validates the submitted fields and canonical schemas, changes only the supported values, and writes both files in one Git commit. The preview allowlist is not part of that commit.

Unchanged facts retain their verification metadata exactly. A materially changed structured fact is reset to `requires-verification` without carrying stale field-level evidence. Creation audit metadata is preserved; update time and actor come from the authenticated session.

The branch HEAD is checked before the commit and again by the non-force ref update. If it has moved, the API returns HTTP 409 and the editor keeps the local form values so the operator can review and reload instead of overwriting another change.

## Permanent deletion of working records

Hard deletion is available only for non-public working statuses: `research`, `draft`, `fact-review`, `ecclesiastical-review`, `language-review`, `needs-reverification`, `disputed`, and `rejected`. Records marked `approved` or `published` are blocked and require a future archival workflow instead.

The operator must type the exact immutable place ID in the destructive dialog. The request also carries the current branch HEAD, and deletion fails with a conflict if the editorial branch has moved. External structured references from another place, route, news item, or entity block deletion.

One atomic Git commit removes every blob below the place and practical-information directories, removes preview membership when present, deletes media metadata owned exclusively by the place, and detaches shared media without deleting it. Source records remain independent and are never removed automatically. Exclusive R2 objects are deleted only after the Git commit succeeds; an R2 cleanup failure is reported as a safe warning and never rolls Git back. The Git commit remains in repository history so an operator can restore deleted content manually through Git when necessary.

## Deferred

Full source creation/editing, media and photo upload, practical-information editing, approvals/review workflow, editorial-preview promotion, production publication, pull requests, merge/release controls, audit-history UI and deployment automation remain deferred to later phases.
