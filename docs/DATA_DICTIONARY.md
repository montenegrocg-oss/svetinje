# Svetinje.me Proposed Content Schema Specification

- Status: Proposed for Phase 1
- Schema version: 1
- Date: 2026-08-03
- Scope: YAML and Markdown content design only
- Implementation status: Not implemented

## Purpose

This document converts the Phase 0 conceptual data dictionary into an implementable specification for future content files. It defines file locations, identities, field types, controlled values, cross-file references, validation behavior, and publication gates.

It does not create content records, application code, Astro configuration, or dependencies. No sample monastery, church, coordinate, schedule, contact, source, or historical claim is included.

The first research scope is the Metropolitanate of Montenegro and the Littoral. Scope does not prove jurisdiction, ownership, status, or any other fact for a specific place. Those relationships must be verified per place.

## 1. Normative language

The words must, must not, required, should, and may are normative within this proposed specification.

- Must and must not define validation or publication requirements.
- Required means a file cannot reach the specified editorial state without the field.
- Optional means the field may be absent.
- Unknown means the value is not known and must not be replaced with a placeholder.
- Not applicable means a field does not apply and should normally be absent.

Phase 1 implementation may add stricter validation, but must not weaken the accuracy, review, rights, or publication requirements without owner approval.

## 2. Approved design decisions

The schema implements these owner decisions:

- Serbian Cyrillic is the source and default language.
- Russian uses the /ru/ locale.
- English uses the /en/ locale.
- Technical entity IDs are immutable lowercase ASCII kebab-case.
- Content is stored in Git as YAML and Markdown.
- Large original media files are not stored in Git.
- No database, CMS, custom admin panel, or server-side rendering is used for the prototype.
- Maxim is project owner and initial publishing reviewer.
- Factual, ecclesiastical, Serbian-language, Russian-language, and English-language reviewers are TBD and required before relevant public publication.
- MapLibre is the future renderer; the tile provider is deferred.

## 3. Directory and filename structure

The future editorial root is content/ at repository root. It remains separate from application source code.

    content/
      places/
        {place-id}/
          place.yaml
          narratives/
            sr.md
            ru.md
            en.md
      sources/
        {source-id}.yaml
      practical/
        {place-id}/
          {practical-id}.yaml
      media/
        {media-id}.yaml

Only files that contain real, researched material should exist. Do not create empty locale files, empty practical files, placeholder sources, or fictional fixtures in the public content tree.

### 3.1 Place core

Path:

    content/places/{place-id}/place.yaml

Rules:

- Directory name must equal the id field.
- One place.yaml exists per stable place entity.
- The file contains language-neutral identity, classification, relationships, geographic facts, source references, workflow status, and approvals.
- It does not contain localized narrative prose or volatile practical values.

### 3.2 Localized narrative

Paths:

    content/places/{place-id}/narratives/sr.md
    content/places/{place-id}/narratives/ru.md
    content/places/{place-id}/narratives/en.md

Rules:

- The filename is exactly the locale key.
- sr.md is the Serbian Cyrillic source narrative.
- ru.md and en.md are translations tied to an approved Serbian revision.
- Missing translations are represented by missing files, not empty pages.
- Front matter contains structured metadata; the Markdown body contains localized prose and citations.
- A locale file is not publishable merely because it exists.

### 3.3 Source

Path:

    content/sources/{source-id}.yaml

Rules:

- Filename must equal the id field.
- One source file represents one identifiable publication, official page, archival item, or academic work.
- A source record may be referenced by many places and claims.
- A source URL alone is not an adequate source record.

### 3.4 Practical information

Path:

    content/practical/{place-id}/{practical-id}.yaml

Rules:

- The directory must reference an existing place ID.
- Filename must equal the id field.
- One file represents one independently reviewable volatile item.
- Visiting hours, contacts, access conditions, and temporary notices must not be embedded in historical narrative. The optional localized `service_schedule` front-matter field is the single exception for ordinary-text worship schedules displayed on place detail pages.
- Independent files allow withdrawal or re-verification without changing unrelated facts.

### 3.5 Media metadata

Path:

    content/media/{media-id}.yaml

Rules:

- Filename must equal the id field.
- The file contains metadata, rights, storage references, review status, and localized alt text or captions.
- Large binary originals and bulk derivatives must not exist in Git.
- An object key does not prove rights; rights fields and review are separately required.

## 4. Encoding and serialization rules

All YAML and Markdown files must:

- be UTF-8;
- use LF line endings;
- end with one newline;
- contain no tab indentation;
- contain no duplicate keys;
- use two-space YAML indentation;
- avoid YAML anchors, aliases, custom tags, and merge keys;
- use only the schema-defined keys;
- omit unknown values rather than use empty strings, null, zero, TBD, unknown text, or invented placeholders;
- use ISO 8601 calendar dates as YYYY-MM-DD;
- use UTC timestamps with Z when time is required;
- preserve Serbian Cyrillic as Unicode text.

YAML booleans must be true or false. Identifiers and controlled values must be quoted only when YAML parsing would otherwise be ambiguous; validation operates on parsed values, not formatting.

Markdown must have exactly one YAML front matter block at the beginning. A byte-order mark is not permitted.

## 5. Shared primitive types

### 5.1 EntityId

Pattern:

    ^[a-z0-9]+(?:-[a-z0-9]+)*$

Constraints:

- lowercase ASCII only;
- starts and ends with a letter or digit;
- single hyphens between segments;
- immutable after assignment;
- unique within its entity type;
- never reused after archival;
- contains no locale key as a naming suffix merely to represent translation;
- contains no unverified date, jurisdiction, rank, or status.

Entity IDs are approved after identity research. The owner-supplied prototype labels are not IDs.

### 5.2 Locale

Allowed values:

- sr
- ru
- en

### 5.3 UrlSlug

Proposed pattern:

    ^[a-z0-9]+(?:-[a-z0-9]+)*$

A slug is locale-specific, lowercase ASCII kebab-case, and language-approved. It is not the immutable entity ID. Detailed rules are in SLUG_AND_URL_POLICY.md.

### 5.4 SourceId, PlaceId, PracticalId, MediaId, ContributorId

Each is an EntityId interpreted in the appropriate namespace. Cross-namespace reuse is allowed technically but discouraged where it could confuse editors.

### 5.5 Date

Exact calendar date in YYYY-MM-DD. Do not use an exact date for a historical claim when the source supports only a year, century, range, or approximation.

### 5.6 Timestamp

UTC timestamp in ISO 8601 form ending in Z.

### 5.7 HistoricalDate

A discriminated structure for historical precision.

Required fields:

| Field | Type | Rule |
| --- | --- | --- |
| precision | enum | Determines which value fields are allowed |
| display_text_sr | Serbian Cyrillic text | Required when a machine value cannot express the source faithfully |
| source_ids | SourceId list | At least one |
| verification_status | VerificationStatus | Must reflect evidence |

Allowed precision values:

- exact_date;
- year;
- year_range;
- century;
- century_range;
- before;
- after;
- approximate;
- traditional_attribution;
- unknown.

Value fields are conditional:

- exact_date uses date;
- year uses year;
- year_range uses start_year and end_year;
- century uses century;
- century_range uses start_century and end_century;
- before and after use boundary_year when the source supports it;
- approximate uses the narrowest supported machine value plus display_text_sr;
- traditional_attribution requires display_text_sr;
- unknown has no machine value and is never a publishable claim by itself.

A validator must reject false precision, inverted ranges, and incompatible fields.

### 5.8 ReviewApproval

| Field | Type | Required |
| --- | --- | --- |
| role | ReviewRole | Yes |
| reviewer_id | ContributorId | Yes |
| outcome | approval enum | Yes |
| reviewed_at | Timestamp | Yes |
| reviewed_revision | 40-character Git commit SHA | Yes |
| scope | non-empty text | Yes |
| notes | non-empty text | No |

Allowed outcomes:

- approved;
- changes_requested;
- rejected;
- withdrawn.

Only approved satisfies a publication gate. A later material change invalidates an approval for the affected scope until reviewed again.

### 5.9 AuditBlock

| Field | Type | Required |
| --- | --- | --- |
| created_at | Timestamp | Yes |
| created_by | ContributorId | Yes |
| updated_at | Timestamp | Yes |
| updated_by | ContributorId | Yes |

updated_at must not precede created_at.

### 5.10 VerificationBlock

| Field | Type | Required |
| --- | --- | --- |
| status | VerificationStatus | Yes |
| source_ids | SourceId list | Required when verified or disputed |
| reviewed_by | ContributorId list | Required when verified or disputed |
| reviewed_at | Date | Required when verified or disputed |
| qualification | text | Required when disputed or approximate |
| valid_until | Date | No |

The reviewers listed here document factual checking. They do not replace ReviewApproval records required for publication.

## 6. Controlled values

### 6.1 EditorialStatus

- research
- draft
- fact-review
- ecclesiastical-review
- language-review
- approved
- published
- needs-reverification
- disputed
- archived
- rejected

Only published is eligible for public production. approved is eligible for protected preview after all required non-publishing reviews.

### 6.2 VerificationStatus

- verified
- requires-verification
- disputed
- unknown
- not-applicable

requires-verification and unknown are never publicly rendered as facts. disputed requires qualified wording and approval.

### 6.3 TranslationStatus

- source
- missing
- draft
- in-review
- approved
- published
- outdated
- archived

sr.md must use source. ru.md and en.md must not use source.

### 6.4 FreshnessStatus

- current
- expiring
- stale
- withdrawn
- unknown

### 6.5 PublicationSafety

- public
- generalize
- withhold
- review-required

### 6.6 ReviewRole

- project-owner
- publishing
- factual
- ecclesiastical
- sr-language
- ru-language
- en-language
- media-rights
- geographic-safety

### 6.7 PlaceType

Initial values:

- monastery
- church
- chapel
- cathedral
- skete
- hermitage
- holy-spring
- cave
- shrine
- other

other requires an explanatory note and factual and ecclesiastical review. No place type is assigned from the owner-supplied label alone.

### 6.8 CoordinateAccuracy

- exact-entrance
- complex-centroid
- approximate-area
- settlement-level
- withheld

### 6.9 SourceType

- official-church
- diocesan
- monastery
- official-publication
- academic
- archival
- government
- heritage-institution
- other-approved

other-approved requires an approval note from the project owner.

### 6.10 PracticalKind

- public-phone
- public-email
- official-website
- visiting-hours
- service-schedule
- seasonal-access
- temporary-closure
- road-access
- public-transport
- parking
- walking-access
- accessibility
- official-visitor-instruction
- other-approved

### 6.11 PracticalValueType

- contact
- url
- schedule
- localized-text

### 6.12 DisplayPolicy

- show
- show-with-verification-date
- show-with-warning
- hide-when-stale
- withdraw

### 6.13 MediaType

- image
- video
- audio
- panorama
- model
- other

### 6.14 RightsBasis

- project-original
- written-permission
- compatible-license
- public-domain-confirmed
- other-approved

## 7. Place core schema

File:

    content/places/{place-id}/place.yaml

### 7.1 Required top-level keys

| Key | Type | Required |
| --- | --- | --- |
| schema_version | integer literal 1 | Yes |
| id | PlaceId | Yes |
| editorial_status | EditorialStatus | Yes |
| place_type | fact block | Yes after identity research |
| parent_place_id | fact block | No |
| ecclesiastical | object | No, but required facts must be researched before publication |
| patronal_feast_ids | ordered FeastId list | No; one or more unique IDs when present |
| patronal_feasts | legacy list of `{ name }` objects | No; read/validation compatibility only |
| location | object | No |
| relationships | object | Yes; empty lists allowed only in research or draft |
| source_ids | SourceId list | Yes from fact-review onward |
| approvals | ReviewApproval list | Yes from approved onward |
| audit | AuditBlock | Yes |

No localized names, summaries, slugs, captions, schedules, contact values, or prose are allowed in place.yaml.

### 7.2 Generic fact block

Language-neutral factual fields use:

| Key | Type | Required |
| --- | --- | --- |
| value | field-specific type | Yes unless status is unknown |
| verification | VerificationBlock | Yes |

Unknown values should usually omit the entire optional fact. A required research target may temporarily use a block whose verification.status is requires-verification, but it cannot advance to approved or published.

### 7.3 place_type

- value must be PlaceType.
- verification must cite at least one allowed source when status is verified.
- a factual reviewer and ecclesiastical reviewer are both required before publication.

### 7.4 parent_place_id

- value must reference another place.
- self-reference is forbidden.
- the full graph must be acyclic.
- a parent relationship must be sourced and reviewed.
- absence does not mean no parent exists.

### 7.5 ecclesiastical object

Allowed keys:

| Key | Type | Meaning |
| --- | --- | --- |
| authority_id | fact block of EparchyId | Verified ecclesiastical authority relationship |
| jurisdiction | fact block of text or EntityId | Verified jurisdiction when appropriate |
| dedication_ids | fact block of EntityId list | Verified dedications or patrons |
| community_type | fact block of MonasticCommunity | Verified monastic community classification; monasteries only |
| associated_entity_ids | fact block of EntityId list | Saints, relics, feasts, or related entities |

EparchyId is controlled by `schemas/place.schema.json#/$defs/eparchyId`. It contains the four Serbian Orthodox eparchies whose territory includes Montenegro; Admin labels are Serbian Cyrillic titles from that same canonical registry. MonasticCommunity is optional and has two controlled values: male and female. It is valid only when place_type.value is monastery. Other optional ecclesiastical fields remain absent rather than free-form guessed values until their controlled registries are approved. Publication requires ecclesiastical review for every populated ecclesiastical field.

The Phase 1 project scope must not be copied automatically into authority_id or jurisdiction.

### 7.6 patronal feast registry and place references

`content/feasts/registry.yaml` is the canonical Feast registry. Every entry has an immutable `id`, required Serbian `name_sr`, and the exact `legacy_names` from which the registry was seeded. A `fixed` date stores only year-independent `month` and `day`; a `movable` date has no fixed month/day. Optional `calendar_bindings` are explicit year-specific civil dates and are intended for future verified movable-feast linkage. The registry never computes movable dates.

`patronal_feast_ids` is the canonical ordered list of unique FeastIds in a place record. Every ID must resolve in the Feast registry. Runtime resolution priority is canonical IDs, then legacy plural `patronal_feasts`, then legacy singular `patronal_feast`. Both legacy name shapes remain schema-valid temporarily so the existing Admin workflow can continue until its separate FeastId rollout; new canonical content paths use IDs.

### 7.7 location object

Allowed keys:

| Key | Type | Meaning |
| --- | --- | --- |
| country_code | fact block of two-letter code | Country |
| municipality_id | fact block of MunicipalityId | Controlled Montenegro municipality reference |
| municipality | fact block of text | Legacy municipality text, preserved during natural migration |
| settlement | fact block of text or future reference | Settlement |
| postal_address | fact block of structured address | Public verified address |
| coordinates | coordinate block | Geographic position |
| elevation_m | fact block of number | Verified elevation when useful |

MunicipalityId is controlled by `schemas/place.schema.json#/$defs/municipalityId`, which is the single registry for the 25 current municipalities of Montenegro and their Serbian Cyrillic Admin labels. New Admin writes use `municipality_id`. Existing `municipality` facts are not inferred, backfilled, synchronized, or removed automatically; an editor must make a verified selection before an ID is added.

Coordinate block:

| Key | Type | Required with public coordinates |
| --- | --- | --- |
| latitude | number from -90 through 90 | Yes |
| longitude | number from -180 through 180 | Yes |
| crs | literal EPSG:4326 | Yes |
| accuracy | CoordinateAccuracy | Yes |
| publication_safety | PublicationSafety | Yes |
| verification | VerificationBlock | Yes |

Latitude and longitude must be both present or both absent. Zero is a valid numeric value and must never be used as a placeholder. Decimal precision must not exceed evidence.

### 7.8 relationships object

Allowed keys:

- related_place_ids;
- route_ids;
- article_ids;
- media_ids.

All values are deduplicated EntityId lists. References must resolve. Relationships do not prove geography, ecclesiastical authority, or historical association without supporting claim references.

### 7.9 Place publication gate

place.yaml may use editorial_status published only when:

- id and path match;
- place_type is verified;
- every public fact is verified or approved as disputed;
- all source references resolve to active or explicitly accepted source records;
- no requires-verification or unknown fact is marked for display;
- required factual approval exists from an assigned factual reviewer;
- required ecclesiastical approval exists from an assigned ecclesiastical reviewer;
- Maxim has provided publishing approval;
- all approvals cover the current material revision;
- coordinates, if public, have publication_safety public or an approved generalized value;
- referenced media and practical records independently satisfy their gates.

Because factual and ecclesiastical reviewers are currently TBD, no place is eligible for public publication yet.

## 8. Localized narrative schema

File:

    content/places/{place-id}/narratives/{locale}.md

### 8.1 Front matter keys

| Key | Type | Required |
| --- | --- | --- |
| schema_version | integer literal 1 | Yes |
| place_id | PlaceId | Yes |
| locale | Locale | Yes |
| editorial_status | EditorialStatus | Yes |
| translation_status | TranslationStatus | Yes |
| slug | UrlSlug | Required from language-review onward |
| preferred_name | non-empty localized text | Required from fact-review onward |
| short_name | localized text | No |
| alternate_names | structured list | No |
| summary | localized text | Required from language-review onward |
| seo_title | localized text | Required from approved onward |
| seo_description | localized text | Required from approved onward |
| patronal_feasts | ordered list of non-empty localized strings | No; ru/en never fall back to Serbian values |
| service_schedule | non-empty localized multiline text | No; omitted when blank |
| source_revision | 40-character Git SHA | Required for ru and en |
| source_ids | SourceId list | Required for factual prose |
| section_sources | map | Required when factual sections exist |
| approvals | ReviewApproval list | Required from approved onward |
| audit | AuditBlock | Yes |

Serbian preferred_name, summary, and body must be Serbian Cyrillic except for proper names, abbreviations, quotations, or technical forms approved by the Serbian-language reviewer.

`service_schedule` stores optional locale-specific plain text, preserves meaningful line breaks, and is rendered only for the current visible locale. Serbian changes to `patronal_feasts` or `service_schedule` make existing Russian and English translations outdated without overwriting their localized values.

### 8.2 alternate_names item

| Key | Type | Required |
| --- | --- | --- |
| name | localized text | Yes |
| context | localized text | Yes |
| source_ids | SourceId list | Yes |
| verification_status | VerificationStatus | Yes |

An alternate name is not a replacement slug unless separately approved.

### 8.3 Section vocabulary

Permitted H2 section keys for the prototype:

- introduction
- history
- spiritual-significance
- architecture-and-art
- relics-icons-and-traditions
- practical-context
- accessibility-context

Visible translated headings may differ, but front matter section_sources uses these stable keys.

A Markdown file may omit unsupported sections. Empty sections and filler are forbidden.

### 8.4 section_sources

section_sources maps each present factual section key to a non-empty SourceId list.

For claims needing finer traceability, use Markdown footnote references whose labels are immutable lowercase ASCII kebab-case. Every cited source must also appear in source_ids. The Phase 1 validator must reject:

- an unknown section key;
- a factual section without sources;
- a footnote reference without a definition;
- a defined claim footnote that is never referenced;
- a source ID that does not resolve.

### 8.5 Serbian narrative gate

sr.md may use editorial_status published only when:

- locale is sr;
- translation_status is source;
- preferred_name and public prose passed factual review;
- ecclesiastical statements passed ecclesiastical review;
- Serbian Cyrillic passed an assigned sr-language reviewer;
- Maxim provided publishing approval;
- source IDs resolve;
- slug follows SLUG_AND_URL_POLICY.md and has Serbian-language approval;
- all approvals cover the current material revision.

The sr-language reviewer is currently TBD; public publication is blocked.

### 8.6 Russian and English narrative gates

ru.md or en.md may publish only when:

- the linked Serbian source revision is approved and still current;
- translation_status is published;
- all inherited factual and ecclesiastical approvals remain valid;
- the relevant ru-language or en-language reviewer approved the exact translation revision;
- Maxim provided publishing approval;
- localized slug and metadata are approved;
- no Serbian fallback prose is used.

Russian and English reviewers are currently TBD; public publication is blocked.

## 9. Source schema

File:

    content/sources/{source-id}.yaml

### 9.1 Keys

| Key | Type | Required |
| --- | --- | --- |
| schema_version | integer literal 1 | Yes |
| id | SourceId | Yes |
| editorial_status | EditorialStatus | Yes |
| source_type | SourceType | Yes |
| title | non-empty text | Yes |
| publisher | non-empty text | Yes |
| author | non-empty text | No |
| url | HTTPS URL | Conditional |
| bibliographic_reference | non-empty text | Conditional |
| publication_date | HistoricalDate | No |
| accessed_at | Date | Required with url |
| original_language | language tag | No |
| locator | non-empty text | No |
| status | SourceStatus | Yes |
| archive_url | HTTPS URL | No |
| copyright_notes | non-empty text | No |
| approval_note | non-empty text | Required for other-approved |
| audit | AuditBlock | Yes |

At least one of url or bibliographic_reference is required. title and publisher are always required. A source record must not contain copied protected content.

### 9.2 SourceStatus

- active
- unavailable
- superseded
- disputed
- withdrawn

Unavailable or superseded sources remain for provenance. Publication logic must not silently discard them. A newly disputed or withdrawn source triggers review of dependent claims.

### 9.3 Source validation

Reject:

- filename and id mismatch;
- unsupported source_type;
- non-HTTPS public URL without documented exception;
- url without accessed_at;
- other-approved without owner approval_note;
- title or publisher placeholders;
- duplicate records that identify the same source without a documented reason;
- discovery-only sources presented as final evidence.

## 10. Practical information schema

File:

    content/practical/{place-id}/{practical-id}.yaml

### 10.1 Common keys

| Key | Type | Required |
| --- | --- | --- |
| schema_version | integer literal 1 | Yes |
| id | PracticalId | Yes |
| place_id | PlaceId | Yes |
| editorial_status | EditorialStatus | Yes |
| kind | PracticalKind | Yes |
| value_type | PracticalValueType | Yes |
| value | discriminated value object | Yes |
| source_ids | SourceId list | Yes from fact-review onward |
| verification_status | VerificationStatus | Yes |
| freshness_status | FreshnessStatus | Yes |
| verified_at | Date | Required when verified |
| verified_by | ContributorId list | Required when verified |
| valid_from | Date | No |
| valid_until | Date | No |
| display_policy | DisplayPolicy | Yes |
| approvals | ReviewApproval list | Required from approved onward |
| audit | AuditBlock | Yes |

place_id must match the parent directory and resolve to a place.

### 10.2 Contact value

Used by public-phone and public-email.

Allowed keys:

- canonical_value;
- display_value;
- public_use_confirmed.

Email must parse as an email address. Phone canonical form should use E.164 when the source supports it. Do not fabricate a country code. public_use_confirmed must be true before publication.

### 10.3 URL value

Used by official-website.

Allowed keys:

- url;
- label_sr;
- label_ru;
- label_en.

url must use HTTPS unless an official site genuinely lacks HTTPS and the exception is approved. Translated labels require language review; absence of a translated label must not block the URL itself if the interface can supply a generic approved label.

### 10.4 Schedule value

Used by visiting-hours and service-schedule.

Allowed keys:

- timezone;
- entries;
- exceptions;
- localized_notes.

Each entry may contain:

- applies_on controlled day or date expression;
- start_time;
- end_time when supported;
- localized_label;
- valid_from;
- valid_until.

Schedule structure must reproduce the official source without inferring missing occurrences, seasons, feast exceptions, or calendar rules. If the source is too complex for faithful structure, use localized-text and require clear verification dates.

Concrete day-expression and liturgical-calendar vocabularies remain Phase 1 implementation decisions and must be approved before schedule records are created.

### 10.5 Localized text value

Used by access, transport, parking, accessibility, closures, and official visitor instructions.

Each locale entry contains:

- locale;
- text;
- translation_status;
- source_revision for ru or en;
- approvals.

Serbian text is required before translation. No locale may be synthesized automatically.

### 10.6 Practical publication gate

A practical record may publish only when:

- the place exists;
- value shape matches kind and value_type;
- source is current enough for the claim;
- verification_status is verified;
- freshness_status is current or expiring under an approved rule;
- verified_at, verified_by, and source_ids are present;
- factual reviewer approved;
- ecclesiastical reviewer approved service schedules or institution-specific religious instructions;
- relevant language reviewer approved public wording;
- Maxim provided publishing approval;
- display_policy is compatible with freshness.

stale, withdrawn, unknown, and requires-verification values cannot display as current. Schedules, temporary closures, and event-like information default to hide-when-stale.

No concrete review intervals are assumed in this specification; they must be approved before public launch.

## 11. Media metadata schema

File:

    content/media/{media-id}.yaml

### 11.1 Keys

| Key | Type | Required for publication |
| --- | --- | --- |
| schema_version | integer literal 1 | Yes |
| id | MediaId | Yes |
| editorial_status | EditorialStatus | Yes |
| media_type | MediaType | Yes |
| storage_provider | controlled non-empty text | Yes for external media |
| object_key | non-empty versioned text | Yes for external media |
| checksum_sha256 | 64-character lowercase hex | Yes |
| mime_type | valid MIME type | Yes |
| width | positive integer | Required for images and panoramas |
| height | positive integer | Required for images and panoramas |
| duration_seconds | positive number | Required for audio and video |
| creator | non-empty text | Yes |
| copyright_owner | non-empty text | Yes |
| rights_basis | RightsBasis | Yes |
| permission_reference | non-empty text | Conditional |
| license | non-empty text | Conditional |
| credit_line | non-empty text | Yes |
| allowed_uses | non-empty controlled list | Yes |
| rights_expires_at | Date | No |
| publication_safety | PublicationSafety | Yes |
| related_place_ids | PlaceId list | Yes for place media |
| focal_point | normalized x and y | No |
| localized_text | locale map | Yes |
| approvals | ReviewApproval list | Yes |
| audit | AuditBlock | Yes |

### 11.2 localized_text entry

| Key | Type | Required |
| --- | --- | --- |
| alt_text | localized text | Yes unless media is approved as decorative |
| caption | localized text | No |
| caption_source_ids | SourceId list | Required for factual caption |
| translation_status | TranslationStatus | Yes |
| approvals | ReviewApproval list | Yes before locale publication |

### 11.3 Rights conditions

- project-original requires documented creator and copyright owner;
- written-permission requires permission_reference;
- compatible-license requires license and attribution compliance;
- public-domain-confirmed requires evidence;
- other-approved requires owner approval.

A remote URL is not a permission reference. Media without complete rights metadata is not publishable.

### 11.4 Git boundary

The content tree may contain metadata only. Validation and repository checks must reject large binary media and known raw formats in content/. Exact byte thresholds and allowed small documentation assets are repository-policy decisions outside this schema.

## 12. Approvals and reviewer constraints

Approved contributor assignment:

| Contributor ID | Person | Roles |
| --- | --- | --- |
| maxim | Maxim | project-owner, publishing |

TBD required roles:

- factual;
- ecclesiastical;
- sr-language;
- ru-language;
- en-language.

Additional media-rights and geographic-safety assignments remain required when the content uses those scopes.

No record may claim a TBD reviewer approval. Maxim’s publishing approval confirms completion of required reviews; it does not replace factual, ecclesiastical, or language approval.

Detailed rules are in REVIEW_ROLES.md.

## 13. URL derivation

Public URLs derive only from an approved narrative slug:

- sr: /svetinje/{slug}/
- ru: /ru/svyatyni/{slug}/
- en: /en/holy-places/{slug}/

The place ID never appears by requirement and is not automatically used as the slug. A missing approved locale narrative produces no locale URL.

Detailed normalization, collision, and redirect behavior is in SLUG_AND_URL_POLICY.md.

## 14. Cross-file validation

A future validator must build an index of all files and reject:

- duplicate entity IDs within a type;
- filename or directory mismatch;
- unresolved references;
- locale filename and front matter mismatch;
- practical directory and place_id mismatch;
- a parent-place cycle;
- duplicate active slug within a locale and route namespace;
- repeated source IDs within a list;
- repeated relationship IDs;
- an approval by an unassigned role;
- an approval whose outcome is not approved when used for a gate;
- a published record missing required approvals;
- a published translation tied to a non-current Serbian source revision;
- media linked to a missing place;
- a narrative linked to a missing place;
- practical information linked to a missing place;
- source references to missing source records;
- a public source reference whose status is withdrawn without an approved exception;
- public facts marked unknown or requires-verification;
- stale practical information configured as show;
- a public coordinate marked withhold or review-required;
- any large original media under content/.

## 15. YAML validation rules

The YAML validator must:

1. Select schema by path.
2. Require schema_version 1.
3. Reject unknown top-level and nested keys.
4. Enforce primitive types and controlled enums.
5. Enforce EntityId and slug patterns.
6. Enforce filename and ID equality.
7. Enforce conditional required fields.
8. Reject empty strings and empty placeholder objects.
9. Reject duplicate list values where order does not intentionally carry meaning.
10. Normalize nothing silently.
11. Reject invalid or false-precision dates.
12. Require HTTPS URLs unless an explicit approved exception field exists.
13. Enforce review gates for approved and published states.
14. Enforce freshness and display-policy compatibility.
15. Report file path and field path for every error.

Warnings may identify approaching expiry, unavailable sources, or nonmaterial style issues. Warnings must not substitute for errors where publication safety is involved.

## 16. Markdown validation rules

The Markdown validator must:

1. Require exactly one YAML front matter block at the start.
2. Validate front matter against the narrative schema.
3. Require file locale to equal front matter locale.
4. Require place directory to equal place_id.
5. Require one H1 or generate it later from preferred_name; the implementation choice must be consistent.
6. Allow only approved H2 section keys in source form.
7. Reject empty headings and placeholder prose.
8. Require section_sources for every factual section.
9. Validate citation and footnote references.
10. Reject raw HTML by default; exceptions require an allowlist.
11. Reject executable script, iframe, object, embed, and inline event handlers.
12. Reject links with unsafe protocols.
13. Require descriptive link text.
14. Require image references to resolve to approved media IDs rather than arbitrary binaries.
15. Enforce Serbian Cyrillic expectations in sr.md, with allowlisted exceptions.
16. Require source_revision for ru.md and en.md.
17. Reject published translation_status when required language approval is missing.
18. reject machine-generated or placeholder markers in approved or published files.
19. Report line and field locations where possible.

Markdown formatting rules must not alter quoted source text or Serbian Cyrillic spelling automatically.

## 17. Editorial state transitions

Permitted normal transitions:

    research → draft
    draft → fact-review
    fact-review → ecclesiastical-review
    ecclesiastical-review → language-review
    language-review → approved
    approved → published

Permitted exceptional transitions:

- any non-archived state → needs-reverification;
- any reviewed state → disputed;
- any state → archived with reason;
- review state → draft when changes are requested;
- published → needs-reverification, disputed, or archived;
- any non-published state → rejected.

A validator may enforce state shape but Git review governs who authorizes a transition.

## 18. Publication eligibility summary

No content is currently eligible for public publication because the required factual, ecclesiastical, and language reviewers are TBD.

Research and draft records may be created in later Phase 1 work only when:

- they contain real research;
- uncertainty is explicit;
- no fictional values or placeholder facts are used;
- the file status prevents public output;
- restricted research material stays outside the public repository.

Maxim may approve planning, schema, and protected preview readiness. Maxim may mark publishing approval only after all other required role approvals exist.

## 19. Deferred schema items

The following remain deferred and must not be guessed:

- named factual, ecclesiastical, and language reviewers;
- exact review intervals for practical kinds;
- exact controlled registries for ecclesiastical authorities, saints, feasts, and dedications;
- liturgical schedule recurrence grammar;
- final media storage provider and object-key convention;
- map tile provider;
- policy for sensitive coordinates;
- minimum verified content required for launch;
- whether a dedicated review-record directory is later preferable to embedded approvals;
- exact Astro/Zod implementation.

## 20. Related documents

- PHASE_1_PLAN.md
- SLUG_AND_URL_POLICY.md
- REVIEW_ROLES.md
- CONTENT_GUIDE.md
- EDITORIAL_WORKFLOW.md
- TECHNICAL_ROADMAP.md
- decisions/0002-locale-url-structure.md
- decisions/0003-content-storage.md
- decisions/0004-map-architecture.md
