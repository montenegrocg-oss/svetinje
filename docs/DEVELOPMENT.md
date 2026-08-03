# Svetinje.me local development

## Scope

The Phase 2 website is a static Astro project. It reads editorial records from the existing root-level `content/` directory. Files under `src/` are presentation and build logic only; they are not an editorial source of truth.

No deployment, Cloudflare connection, map, analytics, runtime database, R2 integration, or server-side rendering is configured.

## Requirements

- Node.js 22.12 or newer; Node.js 24 is used in continuous integration.
- pnpm 11.9.0.

Install the exact locked dependency set:

    pnpm install --frozen-lockfile

## Development server

Start the local site:

    pnpm run dev

Astro prints the local URL, normally `http://localhost:4321/`. Development mode uses the same publication filter as production. Research and draft records are not previewed as public pages.

## Validation and tests

Run content validation only:

    pnpm run validate:content

Run all structural and publication-filter tests:

    pnpm test

Run strict Astro and TypeScript checks:

    pnpm run typecheck

Run the complete local quality gate:

    pnpm run check

## Production build and preview

Create the static production output:

    pnpm run build

The build script runs content validation before Astro starts, writes the static site to `dist/`, and then verifies that excluded narrative markers do not appear in generated HTML.

Preview the completed build locally:

    pnpm run preview

Use the URL printed by Astro. Preview serves `dist/`; it does not publish or deploy the site.

## Publication filtering

`src/lib/content/publication.ts` is the read-only boundary between editorial files and page templates. A Serbian place can reach templates only when all of these conditions are true:

1. `validation/publication-policy.json` has explicitly unlocked public publication.
2. The place and Serbian narrative both have `editorial_status: published`.
3. The Serbian narrative uses `translation_status: source` and has a slug, preferred name, and summary.
4. Place facts required for display are verified or contain a qualified disputed state.
5. Place approvals include assigned factual, ecclesiastical, and publishing reviewers.
6. Narrative approvals include assigned factual, ecclesiastical, Serbian-language, and publishing reviewers.
7. Every referenced source is active, published, and has assigned factual and publishing approvals.
8. The repository-wide schema and cross-reference validator passes before the build.

The filter is intentionally stricter than file presence. Research, draft, review, approved-preview, stale, withdrawn, unresolved, or otherwise incomplete records return no public page data.

Russian `/ru/` and English `/en/` prefixes and route vocabulary are defined in `src/i18n/config.ts`, but no localized pages are generated until reviewed translations exist.
