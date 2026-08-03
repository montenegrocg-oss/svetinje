# ADR 0001: Astro static-first architecture

- Status: Accepted
- Date: 2026-08-03
- Decision owner: Project owner
- Scope: Prototype and initial public release

## Context

Svetinje.me is a multilingual, content-led guide whose core value is accurate, source-backed information about Orthodox monasteries, churches, and holy places in Montenegro. The prototype must be fast, accessible, easy to review, inexpensive to operate, and capable of serving content even when browser JavaScript is unavailable.

The approved roadmap recommends a static-first architecture. The prototype has no approved requirement for authenticated users, personalized pages, live transactions, a database, a content-management system, a custom administration panel, or request-time rendering.

## Decision

Use Astro as the web framework and generate the public site statically.

Use strict TypeScript for future application code, configuration, content integrations, and validation. Use Astro Content Collections with explicit schemas when implementation begins.

The prototype will:

- pre-render all core public pages during the build;
- deliver readable content and navigation without client-side JavaScript;
- use browser JavaScript only for narrowly scoped enhancements, primarily the interactive map;
- validate structured content before a production build can succeed;
- use supported stable dependency versions pinned by a lockfile.

The prototype will not use:

- server-side rendering;
- a runtime application server;
- a database;
- a headless CMS;
- a custom admin panel;
- a general-purpose client-side application framework unless a later, approved requirement demonstrates the need.

This ADR records an architectural decision only. It does not authorize creation of application code or dependencies.

## Rationale

Static generation aligns with the project’s dominant workload: reviewed content changes less frequently than it is read. It reduces runtime failure modes, limits the security surface, improves cacheability, supports strong performance on mobile networks, and makes preview output reproducible from a Git commit.

Astro supports content-focused sites while allowing isolated interactive components when necessary. Strict TypeScript and schema validation reduce the risk that malformed or incomplete content reaches production.

## Consequences

Positive consequences:

- core pages can be served directly from Cloudflare’s edge;
- the public site remains useful without client-side JavaScript;
- builds create an auditable snapshot of content and templates;
- infrastructure and maintenance remain modest during the prototype;
- a future API or CMS can be introduced as an adapter rather than a foundation.

Trade-offs:

- a content change requires a build and deployment;
- truly dynamic features will require a separate approved design;
- editors initially work through Git rather than a browser-based CMS;
- preview and validation quality become important parts of the editorial workflow.

## Guardrails

- Templates must not invent, infer, or silently repair missing facts.
- A failed content validation must fail the build.
- Interactive components must have accessible, non-interactive alternatives where the same information is essential.
- Client-side JavaScript must be justified by user value and performance impact.
- A request for SSR, a database, or a CMS requires a new ADR and explicit owner approval.
- Core content must not depend on a third-party script at read time.

## Alternatives considered

### Server-rendered Astro

Rejected for the prototype because no request-time rendering requirement has been approved. It would add runtime operations and failure modes without clear value.

### Single-page application

Rejected because catalogue and editorial pages must remain crawlable, fast, accessible, and readable without a large JavaScript runtime.

### Traditional database-backed CMS

Rejected for the prototype because it would introduce schema, hosting, security, migration, and editorial-system complexity before the content process is proven.

### Hand-authored static HTML

Rejected as the long-term direction because shared templates, multilingual routing, validation, and structured data require a maintainable build system.

## Revisit triggers

Reconsider this decision only when an approved requirement cannot reasonably be met through static generation, such as:

- authenticated editorial previews that cannot be handled by deployment controls;
- user-specific data;
- server-side search at a scale unsuitable for a static index;
- secure form processing;
- frequently changing external data with a required freshness guarantee.

Any reconsideration must preserve the accuracy, accessibility, multilingual, and performance requirements in AGENTS.md.

## Related documents

- ../TECHNICAL_ROADMAP.md
- ../PROJECT_CHARTER.md
- 0003-content-storage.md
- 0005-cloudflare-deployment.md
