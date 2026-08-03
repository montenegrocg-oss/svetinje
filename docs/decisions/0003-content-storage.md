# ADR 0003: Git-based content storage

- Status: Accepted
- Date: 2026-08-03
- Decision owner: Project owner
- Scope: Prototype editorial content and metadata

## Context

Svetinje.me requires traceable, carefully reviewed information. Factual records, translations, sources, verification dates, and media rights must be reviewable together. The initial team and editorial volume do not yet justify a database, CMS, or custom administration application.

Large original media files must not be stored in Git.

## Decision

Use Git as the source of truth for prototype content.

Use:

- YAML for language-neutral facts, source records, relationships, practical-information records, and media metadata;
- Markdown for long-form localized prose;
- small front matter blocks only for metadata needed to connect prose to stable entities and editorial status;
- pull requests for review and approval;
- explicit schemas and validation when implementation begins;
- immutable stable IDs to join records.

Keep these concerns separate:

1. Language-neutral facts.
2. Localized editorial content.
3. Localized interface text.
4. Sources and claim references.
5. Time-sensitive practical information.
6. Media metadata and rights.
7. Large binary media stored outside Git.

No database, CMS, custom admin panel, or server-side editorial API will be used for the prototype.

## Source-of-truth rules

A fact is not publishable merely because it exists in Git. Publication depends on editorial status, source references, and required reviews.

A translation is not verified factual content on its own. It must point to an approved Serbian source revision and receive language review.

Time-sensitive information is not evergreen content. It must carry field-level verification metadata and a policy for expiry or re-verification.

Media metadata may be stored in Git, but large original images, video, audio, 3D models, and virtual-tour assets must be stored in an approved external object store. Git records the asset key, rights, credit, and publication status.

## Proposed content units

The future content structure should support:

- one core record per place;
- one localized narrative per place and locale;
- reusable source records;
- reusable media records;
- separate practical-information records for volatile facts;
- route records with separate localized narratives;
- claim-level or section-level source references where needed.

Exact paths and schemas will be implemented in Phase 1 and must conform to docs/DATA_DICTIONARY.md.

## Rationale

Git provides an audit trail, reviewable diffs, rollback, branching, and a direct connection between content and the build that publishes it. YAML and Markdown remain portable and readable without a proprietary system.

Separating structured facts from localized prose reduces translation drift and prevents coordinates, source identifiers, or time-sensitive details from being copied inconsistently across languages.

## Consequences

Positive consequences:

- every approved change is attributable to a commit and review;
- content can be validated before publication;
- the repository remains portable;
- translation and factual review can be separated;
- no database backup or migration process is required for the prototype.

Trade-offs:

- Git is less familiar to some editors;
- merge conflicts require process discipline;
- media upload is a separate workflow;
- content previews require build integration;
- editorial scale may eventually justify a CMS.

## Media boundary

Permitted in Git:

- textual media metadata;
- rights and attribution records;
- object keys and checksums;
- small project-owned icons or documentation illustrations when appropriate;
- small optimized prototype assets only after rights review and explicit approval.

Not permitted in Git:

- large original photographs;
- raw camera files;
- large video or audio;
- 3D source files;
- bulk photo archives;
- binaries without documented rights.

The roadmap recommends Cloudflare R2 when object storage is introduced. That operational choice is recorded in ADR 0005.

## Guardrails

- Do not create sample content that could be mistaken for a real sacred place.
- Do not use placeholders for dates, coordinates, schedules, or contacts in publishable records.
- Do not publish content with unresolved required source references.
- Do not store research notes containing restricted or copyrighted material in the public repository.
- Do not overwrite stable IDs when names or slugs change.
- Do not edit generated files as editorial sources.
- Do not treat a machine translation as publishable without human review.

## Revisit triggers

Evaluate a headless CMS only when documented editorial needs show that Git is a material barrier. Any future CMS must preserve:

- stable IDs;
- schema validation;
- multilingual field separation;
- approval states;
- source and verification metadata;
- audit history;
- portable export;
- media rights metadata.

Adopting a CMS, database, or custom admin requires a new ADR and explicit approval.

## Related documents

- ../CONTENT_GUIDE.md
- ../EDITORIAL_WORKFLOW.md
- ../DATA_DICTIONARY.md
- 0001-astro-static-first.md
- 0005-cloudflare-deployment.md
