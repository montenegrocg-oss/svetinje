# ADR 0005: Cloudflare deployment

- Status: Accepted
- Date: 2026-08-03
- Decision owner: Project owner
- Scope: Prototype hosting and future media delivery

## Context

The approved architecture produces a static site from Git. The project requires global delivery, HTTPS, preview deployments, straightforward rollback, and a path for large media that does not place originals in Git.

The prototype has no approved requirement for server-side rendering or a database.

## Decision

Use Cloudflare as the deployment platform.

For the prototype and initial public release:

- use Cloudflare Pages for the static site;
- connect deployment to the GitHub repository;
- deploy production only from the protected main branch;
- create preview deployments for reviewed branches or pull requests;
- serve the canonical production site from svetinje.me;
- redirect svetinjecrnegore.me permanently to the corresponding canonical path on svetinje.me;
- keep preview URLs out of search indexes;
- use Cloudflare rollback capability as part of the release procedure.

When large media storage is required, use Cloudflare R2 or another separately approved object store. Large originals remain outside Git. If R2 is used for public delivery, use a controlled custom domain rather than the development r2.dev endpoint.

This ADR does not authorize Cloudflare configuration changes or application deployment yet.

## Static deployment boundary

The production artifact is a deterministic static build. Cloudflare must not become the editorial source of truth.

The prototype will not use:

- Astro server-side rendering;
- Pages Functions for page rendering;
- Cloudflare Workers as a general application server;
- D1, KV, Durable Objects, or another runtime data store;
- a Cloudflare-hosted custom admin panel.

A narrow future function, such as secure form handling, requires a documented need, security review, and approval. It must not silently convert the site into a runtime-rendered application.

## Build and release principles

When implementation begins:

- pin runtime and package-manager versions;
- install from a committed lockfile;
- fail deployment when validation or tests fail;
- require review before merging to main;
- use one production artifact per commit;
- document build commands and output paths in the repository;
- retain a clear rollback target;
- separate production and preview configuration;
- keep secrets out of Git and browser bundles.

Exact build commands are deferred until application scaffolding is explicitly authorized.

## Domains and indexing

- svetinje.me is canonical.
- svetinjecrnegore.me redirects path for path where possible.
- The final www policy must be selected before launch and implemented consistently.
- Preview and Cloudflare platform hostnames must be noindex.
- Canonical metadata and redirects must agree.
- TLS is required on all public hostnames.

## Caching and security

The future deployment must define and test:

- short or revalidating cache behavior for HTML;
- long-lived immutable caching for fingerprinted assets;
- versioned media object keys;
- Content-Security-Policy;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- frame restrictions;
- HTTPS enforcement;
- provider-specific requirements for MapLibre workers and tiles.

Security headers must begin in a safe test or report-only mode where appropriate. They must not be weakened broadly to accommodate an undocumented third-party script.

## Media delivery

If R2 is adopted:

- keep originals private by default;
- store media metadata and rights records in Git;
- expose only approved derivatives or objects;
- deliver through a project-controlled custom domain;
- disable public development endpoints in production;
- configure cache and CORS narrowly;
- use versioned keys;
- document immediate withdrawal and cache-purge procedures;
- maintain an independent backup and rights record.

Cloudflare image transformations may be introduced after cost, quality, limits, and rights handling are reviewed.

## Observability

The initial operational checklist should cover:

- build and deployment failures;
- certificate and domain health;
- unexpected redirects and 404s;
- preview indexing;
- Core Web Vitals;
- media delivery failures;
- stale practical-information reports;
- correction and rights-withdrawal requests.

Runtime error monitoring is not required until meaningful runtime code exists.

## Rationale

Cloudflare Pages matches a static Git-based workflow and provides global delivery, branch previews, HTTPS, atomic deployments, and rollback without a separate origin server. R2 offers a future media boundary compatible with the prohibition on large originals in Git.

## Consequences

Positive consequences:

- no production server fleet is required;
- every deployment maps to reviewed Git history;
- previews can support editorial review;
- static assets are delivered near users;
- media can scale separately from source code.

Trade-offs:

- deployment configuration becomes a governed production asset;
- domain, cache, and security settings require documentation;
- preview access and indexing must be controlled;
- provider migration must be planned if Cloudflare is later replaced.

## Revisit triggers

A new or amended ADR is required for:

- server-side page rendering;
- a Worker-backed application feature;
- a runtime database or key-value store;
- moving production hosting away from Cloudflare;
- selecting a different object store;
- adding authenticated user accounts;
- a materially different domain strategy.

## Related documents

- 0001-astro-static-first.md
- 0003-content-storage.md
- ../TECHNICAL_ROADMAP.md
- ../EDITORIAL_WORKFLOW.md
