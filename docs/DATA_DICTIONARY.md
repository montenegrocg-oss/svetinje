# Svetinje.me Data Dictionary

## Purpose

This document defines the conceptual data model for future YAML and Markdown content. It is documentation, not an implementation schema. No sample sacred-place records or fictional values are included intentionally.

The model separates:

- stable identity;
- language-neutral facts;
- localized prose;
- source provenance;
- verification state;
- translation state;
- time-sensitive practical information;
- geographic accuracy;
- media rights;
- publication state.

Phase 1 will translate this dictionary into explicit content schemas after approval.

## 1. General conventions

### Stable IDs

Each entity has an immutable ID.

An ID:

- is unique within its entity type;
- uses lowercase ASCII characters, digits, and hyphens;
- does not encode a locale;
- does not change when a public name or slug changes;
- is never reused after archival.

An ID should not assert an uncertain fact. If identity is unresolved, do not create a publishable entity.

### Required, optional, unknown, and not applicable

- Required means the record cannot reach its target publication state without the field.
- Optional means the field may be omitted.
- Unknown means the value is not known and must not be guessed.
- Not applicable means the field does not apply to the entity.

Prefer omission plus editorial status over empty strings, placeholder text, zero coordinates, or invented values.

### Dates and times

Use ISO 8601 representations in structured data:

- calendar date: YYYY-MM-DD;
- timestamp: UTC timestamp with Z;
- year only or approximate historical date: use a dedicated historical-date representation rather than inventing a complete date.

Historical precision and uncertainty must be stored explicitly. Do not turn a century or approximate period into an exact date.

### Locales

Approved locale keys:

| Key | Language | Role |
| --- | --- | --- |
| sr | Serbian Cyrillic | Primary source and default public locale |
| ru | Russian | Translation locale under /ru/ |
| en | English | Translation locale under /en/ |

The Serbian HTML language value is sr-Cyrl-ME. Public alternate-language metadata uses the search-compatible values approved in ADR 0002.

### References

Relationships use stable IDs, not copied display names. A missing referenced entity is a validation error when the relationship is required for publication.

### Audit fields

Every editorial entity should support:

- created_at;
- created_by;
- updated_at;
- updated_by.

Reviewable entities additionally support reviewer and review-date fields appropriate to their status.

Personal data in contributor fields must be limited to approved public or internal identifiers. Do not expose private contact details.

## 2. Shared status enumerations

### editorial_status

| Value | Meaning | Public eligibility |
| --- | --- | --- |
| research | Investigation only | Never |
| draft | Incomplete or unreviewed | Never |
| fact_review | Under factual review | Never |
| language_review | Under language review | Never |
| approved | Required reviews complete | Protected preview only by default |
| published | Publishing approval complete | Yes |
| needs_reverification | Previously reviewed, another check required | Conditional by field risk |
| disputed | Credible conflict is unresolved | Conditional with approved wording |
| archived | Retained but inactive | No |
| rejected | Not accepted for publication | No |

### verification_status

| Value | Meaning |
| --- | --- |
| verified | Supported by allowed source and factual review |
| requires_verification | Evidence is incomplete |
| disputed | Credible allowed sources conflict |
| unknown | No acceptable value is known |
| not_applicable | Field does not apply |

### translation_status

| Value | Meaning | Public eligibility |
| --- | --- | --- |
| missing | No translation exists | No |
| draft | Translation is incomplete | No |
| in_review | Language review in progress | No |
| approved | Review complete | Preview |
| published | Publishing approval complete | Yes |
| outdated | Serbian source changed materially | No until reviewed |
| archived | Translation retired | No |

### freshness_status

| Value | Meaning |
| --- | --- |
| current | Verified within its approved validity rule |
| expiring | Approaching known validity end |
| stale | Validity ended or review is overdue |
| withdrawn | Explicitly removed from display |
| unknown | Freshness cannot be established |

### source_status

| Value | Meaning |
| --- | --- |
| active | Available and usable |
| unavailable | Temporarily or permanently inaccessible |
| superseded | Replaced by a newer authoritative source |
| disputed | Source reliability or interpretation is challenged |
| withdrawn | Publisher or rights holder withdrew it |

### publication_safety

| Value | Meaning |
| --- | --- |
| public | May be published when other reviews pass |
| generalize | Publish only reduced precision or detail |
| withhold | Do not publish the value |
| review_required | Safety decision is pending |

## 3. Entity: place

The place entity stores stable, language-neutral identity and facts.

### Identity fields

| Field | Type | Required for publication | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Immutable place identifier |
| place_type | enum | Yes | Approved category |
| editorial_status | enum | Yes | Workflow state for the core record |
| parent_place_id | place ID | No | Parent complex or institution when verified |
| alternate_external_ids | list of external references | No | IDs from approved catalogues with source context |
| created_at | timestamp | Yes | Record creation time |
| created_by | contributor ID | Yes | Record creator |
| updated_at | timestamp | Yes | Last structured-record change |
| updated_by | contributor ID | Yes | Last editor |

### place_type

Initial controlled values:

- monastery;
- church;
- chapel;
- cathedral;
- skete;
- hermitage;
- holy_spring;
- cave;
- shrine;
- other.

Use other only with an explanatory classification note and review. Do not choose a type from appearance or tourism listings alone.

### Ecclesiastical fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| diocese_id | referenced entity ID | No | Diocese supported by an approved source |
| jurisdiction | verified text or reference | No | Jurisdiction when appropriate and sourced |
| dedication_refs | list of referenced entity IDs or controlled records | No | Dedication or patron references |
| community_type | controlled value | No | Monastic community classification when relevant and verified |
| associated_entity_ids | list | No | Saints, relics, feasts, or related entities |
| ecclesiastical_source_ids | source ID list | Conditional | Evidence for populated ecclesiastical fields |
| ecclesiastical_verification | verification block | Conditional | Review state for populated fields |

Do not use free-form tags as a substitute for reviewed relationships.

### Relationship fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| related_place_ids | place ID list | No | Editorially approved relationships |
| route_ids | route ID list | No | Routes containing or referring to the place |
| article_ids | article ID list | No | Related history or guide articles |
| source_ids | source ID list | Yes for published factual content | Sources supporting core facts |
| media_ids | media ID list | No | Approved related media |
| unresolved_notes | internal text | No | Non-public verification questions |

A nearby relationship must not be inferred from name or municipality alone. Geographic proximity can be generated later from coordinates, while editorially related remains a separate concept.

## 4. Entity: place_translation

The place_translation entity stores locale-specific public wording. It does not own coordinates, contact facts, or source identity.

| Field | Type | Required for localized publication | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Translation record identifier |
| place_id | place ID | Yes | Linked core place |
| locale | locale enum | Yes | sr, ru, or en |
| translation_status | enum | Yes | Locale workflow state |
| source_revision | commit or content revision | Yes for ru and en | Approved Serbian revision translated |
| preferred_name | text | Yes | Primary display name |
| short_name | text | No | Short display form |
| alternate_names | structured list | No | Historical or common names with context and sources |
| slug | text | Yes | Reviewed locale-specific public slug |
| summary | text | Yes | Concise sourced description |
| introduction | Markdown | No | Introductory narrative |
| history | Markdown | No | Historical narrative |
| spiritual_significance | Markdown | No | Sourced spiritual context |
| architecture_and_art | Markdown | No | Sourced description |
| relics_icons_traditions | Markdown | No | Sourced and carefully qualified content |
| practical_notes | Markdown | No | Localized non-volatile guidance |
| accessibility_notes | Markdown | No | Localized verified accessibility wording |
| seo_title | text | Yes | Accurate localized title |
| seo_description | text | Yes | Accurate localized description |
| section_source_refs | map of section to source IDs | Conditional | Traceability for narrative sections |
| translator_id | contributor ID | Required for ru and en | Translator |
| translated_at | date | Required for ru and en | Translation date |
| language_reviewer_id | contributor ID | Yes | Locale reviewer |
| language_reviewed_at | date | Yes | Review date |
| factual_reviewer_id | contributor ID | Yes for Serbian source | Reviewer of factual content |
| factual_reviewed_at | date | Yes for Serbian source | Factual review date |

File presence must not substitute for translation_status.

## 5. Entity: source

A source is reusable evidence, not merely a URL.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Immutable source identifier |
| title | text | Yes | Source title |
| publisher | text | Yes | Responsible institution or publisher |
| author | text | No | Author when known and relevant |
| source_type | enum | Yes | Controlled source category |
| url | URL | Conditional | Online location |
| bibliographic_reference | text | Conditional | Complete offline reference |
| publication_date | historical/date value | No | Date at supported precision |
| accessed_at | date | Required for online source | Last editorial access |
| original_locale | locale or language tag | No | Original language |
| locator | text | Conditional | Page, chapter, section, or paragraph |
| status | source_status | Yes | Availability or reliability state |
| copyright_notes | text | No | Reuse limitations |
| archive_reference | text | No | Approved archived-copy reference |
| notes | internal text | No | Editorial context, not public fact |

At least one of url or bibliographic_reference is required. A URL alone is not adequate when title and publisher are unknown.

### source_type

Initial values:

- official_church;
- diocesan;
- monastery;
- official_publication;
- academic;
- archival;
- government;
- heritage_institution;
- other_approved.

other_approved requires a documented approval note. Discovery-only sources are not registered as supporting evidence unless policy later permits them.

## 6. Entity: claim_reference

A claim_reference connects a specific claim or content section to evidence.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Reference identifier |
| entity_id | stable ID | Yes | Place, translation, route, article, or practical record |
| field_or_section | controlled path | Yes | Exact supported field or section |
| source_ids | source ID list | Yes | Supporting sources |
| locator_notes | text | No | More precise location in sources |
| verification_status | enum | Yes | Evidence state |
| factual_reviewer_id | contributor ID | Required when verified | Reviewer |
| reviewed_at | date | Required when verified | Review date |
| qualification | text | No | Approximation, dispute, or scope |
| internal_notes | text | No | Non-public review notes |

This entity may be implemented as embedded structured metadata rather than a separate file. The traceability requirement remains the same.

## 7. Entity: geographic_location

Geographic data is language-neutral.

| Field | Type | Required for map publication | Meaning |
| --- | --- | --- | --- |
| place_id | place ID | Yes | Linked place |
| country_code | ISO country code | Yes | ME unless a future approved scope expands |
| municipality | referenced or verified text | No | Municipality supported by source |
| settlement | verified text | No | Settlement supported by source |
| postal_address | structured text | No | Public address if verified |
| latitude | decimal | Conditional | WGS 84 latitude |
| longitude | decimal | Conditional | WGS 84 longitude |
| coordinate_reference_system | fixed value | Required with coordinates | EPSG:4326 |
| coordinate_accuracy | enum | Required with coordinates | Precision and intended display |
| coordinate_source_ids | source ID list | Required with coordinates | Evidence |
| verified_at | date | Required with coordinates | Review date |
| verified_by | contributor ID | Required with coordinates | Factual reviewer |
| publication_safety | enum | Required with coordinates | Public, generalize, withhold, or review |
| elevation_m | number | No | Elevation only when verified and useful |
| notes | internal text | No | Ambiguity or field-check notes |

### coordinate_accuracy

- exact_entrance;
- complex_centroid;
- approximate_area;
- settlement_level;
- withheld.

Latitude and longitude are both present or both absent. Zero is not a missing-value marker. More decimal places do not constitute stronger accuracy.

## 8. Entity: practical_information

This entity groups volatile visitor information separately from historical prose.

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Practical record ID |
| place_id | place ID | Yes | Linked place |
| field_type | enum | Yes | Type of practical information |
| value | structured value or localized reference | Yes | Exact reviewed value |
| locale | locale | Conditional | Required when wording is localized |
| source_ids | source ID list | Yes | Current evidence |
| verification_status | enum | Yes | Evidence state |
| freshness_status | enum | Yes | Currentness state |
| verified_at | date | Yes | Verification date |
| verified_by | contributor ID | Yes | Reviewer |
| valid_from | date | No | Start of stated validity |
| valid_until | date | No | End of stated validity |
| display_policy | enum | Yes | Show, warn, hide, or withdraw |
| editorial_status | enum | Yes | Workflow state |
| notes | internal text | No | Review notes |

### practical field types

Initial categories:

- public_phone;
- public_email;
- official_website;
- visiting_hours;
- service_schedule;
- seasonal_access;
- temporary_closure;
- road_access;
- public_transport;
- parking;
- walking_access;
- accessibility;
- official_visitor_instruction;
- other_approved.

No default values are permitted.

### display_policy

- show;
- show_with_verification_date;
- show_with_warning;
- hide_when_stale;
- withdrawn.

Schedules, temporary closures, and event-like information should normally use hide_when_stale unless a later policy explicitly approves another behavior.

## 9. Entity: media

Media metadata is stored in Git. Large originals are not.

| Field | Type | Required for publication | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Media identifier |
| media_type | enum | Yes | Image, video, audio, model, panorama, or other |
| storage_provider | controlled text | Yes for external media | Approved object store |
| object_key | text | Yes for external media | Versioned storage key |
| checksum | text | Yes | Integrity identifier |
| mime_type | text | Yes | Media type |
| width | integer | Required for images | Pixel width |
| height | integer | Required for images | Pixel height |
| duration | duration | Required for audio/video | Media duration |
| creator | text | Yes | Photographer or creator |
| copyright_owner | text | Yes | Rights owner |
| rights_basis | enum | Yes | Original, permission, or compatible license |
| permission_reference | text | Conditional | Evidence of permission |
| license | text | Conditional | License name and version |
| credit_line | text | Yes | Required public credit |
| allowed_uses | list | Yes | Approved uses |
| expires_at | date | No | Rights expiry |
| withdrawal_status | enum | Yes | Active, review, or withdrawn |
| related_entity_ids | list | Yes | Places, routes, or articles |
| focal_point | structured coordinate | No | Crop guidance |
| publication_status | editorial status | Yes | Media workflow state |
| publication_safety | enum | Yes | Public or restricted handling |
| created_at | timestamp | Yes | Metadata creation |
| updated_at | timestamp | Yes | Metadata update |

### Localized media text

Store separately per locale:

- media_id;
- locale;
- alt_text;
- caption;
- caption_source_refs;
- language reviewer;
- review date;
- translation status.

Alt text and caption are different fields. A caption may contain facts and therefore may require sources.

### rights_basis

- project_original;
- written_permission;
- compatible_license;
- public_domain_confirmed;
- other_approved.

A web page containing an image is not evidence of reuse permission.

## 10. Entity: route

Routes are future content but need a compatible conceptual model.

### Route core

| Field | Type | Required for publication | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Route identity |
| route_type | enum | Yes | Editorial route category |
| editorial_status | enum | Yes | Core workflow |
| place_ids | ordered place ID list | Yes | Approved stops |
| geometry | GeoJSON reference | Conditional | Reviewed LineString or MultiLineString |
| distance | measured value | No | Only when sourced or measured under approved method |
| ascent | measured value | No | Only when sourced or measured |
| difficulty | controlled value | No | Requires approved methodology |
| surface | controlled values | No | Requires evidence |
| safety_status | verification block | Conditional | Review and date |
| accessibility_status | verification block | Conditional | Review and date |
| source_ids | source ID list | Yes | Evidence |
| verified_at | date | Yes | Route review |
| verified_by | contributor ID | Yes | Factual reviewer |

No route should promise safety or accessibility without a defined, dated assessment method.

### Route translation

Supports:

- route_id;
- locale;
- localized name;
- slug;
- summary;
- narrative;
- directions;
- safety wording;
- practical notes;
- SEO metadata;
- source revision;
- translator;
- language reviewer;
- translation status.

## 11. Entity: article

Articles support history, lives of saints, guides, and project information.

| Field | Type | Required for publication | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Article identity |
| article_type | enum | Yes | History, saint, guide, policy, or approved type |
| locale | locale | Yes | Article language |
| source_revision | revision | Required for translation | Serbian source revision |
| title | text | Yes | Reviewed title |
| slug | text | Yes | Locale route slug |
| summary | text | Yes | Reviewed summary |
| body | Markdown | Yes | Main content |
| related_place_ids | place ID list | No | Related places |
| related_route_ids | route ID list | No | Related routes |
| section_source_refs | mapping | Yes for factual articles | Sources |
| editorial_status | enum | Yes | Workflow state |
| translation_status | enum | Conditional | Translation workflow |
| factual_review | review block | Yes for factual content | Reviewer and date |
| language_review | review block | Yes | Reviewer and date |
| seo_title | text | Yes | Accurate localized metadata |
| seo_description | text | Yes | Accurate localized metadata |

A policy or about page may have different source requirements from a historical article, but its publication and language review remain explicit.

## 12. Entity: contributor and review record

Contributor identities support accountability without exposing private data.

### contributor

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Internal contributor identifier |
| display_name | text | Yes | Approved name |
| roles | controlled list | Yes | Authorized editorial roles |
| locales | locale list | No | Language competencies |
| active | boolean | Yes | Current assignment |
| public_profile | boolean | Yes | Whether public attribution is permitted |

### review_record

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| id | stable ID | Yes | Review identifier |
| entity_id | stable ID | Yes | Reviewed entity |
| entity_revision | revision | Yes | Exact reviewed revision |
| review_type | enum | Yes | Fact, language, rights, publication, safety |
| reviewer_id | contributor ID | Yes | Reviewer |
| outcome | enum | Yes | Approved, changes requested, rejected, or withdrawn |
| reviewed_at | timestamp | Yes | Review time |
| notes | internal text | No | Rationale or required changes |

Role assignments must be real and approved. Do not create fictional contributors.

## 13. File and content separation

The approved conceptual separation is:

- YAML: place core, sources, practical information, geographic facts, media metadata, route core, relationships, and review metadata.
- Markdown: localized long-form prose.
- Markdown front matter: stable link to entity, locale, revision, status, slug, review references, and section source mapping.
- External object storage: large original and derivative media.
- Generated output: GeoJSON, sitemaps, search index, and other build artifacts.

Generated output is never the editorial source of truth.

Exact directories and filenames are deferred to Phase 1. Existing documentation must not be reorganized merely to match this conceptual model.

## 14. Validation requirements for Phase 1

Future schemas should reject:

- duplicate IDs;
- duplicate active slugs within a locale and route scope;
- invalid locale values;
- invalid status transitions where enforceable;
- references to missing entities;
- a parent cycle;
- partial coordinate pairs;
- coordinates without source, accuracy, review, or safety;
- published Serbian content without required factual and language review;
- published Russian or English content without source revision and language review;
- time-sensitive values without verified_at, verified_by, source_ids, and freshness status;
- stale values configured to display as current;
- historical claims without required source references;
- media without rights basis, owner, credit, and approved use;
- large binary media placed in content directories;
- published SEO metadata that is missing or not localized;
- an approved or published translation marked outdated.

## 15. Publication eligibility rules

A place page may publish only when:

- the core place is eligible;
- the Serbian translation record is published;
- required sources exist and are usable;
- required factual and Serbian language reviews exist for the exact revision;
- media included on the page is rights-approved;
- coordinates displayed on the page are approved for publication;
- time-sensitive fields follow their freshness and display policy;
- unresolved required claims are removed, qualified, or approved as disputed.

A Russian or English equivalent additionally requires:

- approved or published translation status according to the final build rule;
- an exact Serbian source revision;
- locale language review;
- no material source change left unresolved.

A page may publish without optional facts. It must not publish invented replacements for them.

## 16. Open schema decisions for Phase 1

The following remain to be finalized before implementation:

- exact file and directory layout;
- exact stable-ID prefixes, if any;
- slug and transliteration rules;
- historical-date representation;
- controlled vocabularies for dioceses, dedications, saints, feast names, route types, difficulty, and accessibility;
- minimum required place-page fields;
- review interval rules by practical field type;
- whether claim references are embedded or separate records;
- how internal-only notes are kept out of the public repository or build;
- exact media derivative and object-key conventions;
- final validation behavior for disputed content;
- named contributors and reviewer authority.

No implementation should resolve these open questions through undocumented assumptions.
