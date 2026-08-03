# Svetinje.me Editorial Workflow

## Purpose

This workflow governs how research becomes published content. It separates factual verification, Serbian-language editing, translation, time-sensitive review, and publishing authority.

A file in the repository is not automatically verified or publishable. Status, sources, review records, and publication approval control eligibility.

## 1. Roles

Named people may hold more than one role during the prototype, but each role must be explicit in the review record.

### Researcher

Collects allowed sources, records provenance, identifies uncertainty, and prepares structured facts or draft prose. The researcher does not mark their own unsupported assumptions as verified.

### Serbian editor

Writes or edits the Serbian Cyrillic source content, applies house style, and preserves source meaning and uncertainty.

### Factual reviewer

Checks entity identity, claims, dates, geographic data, practical information, and source suitability. The factual reviewer may return, qualify, or reject a claim.

### Translator

Translates an approved Serbian source revision into Russian or English. The translator records the exact source revision and flags terminology or meaning questions.

### Language reviewer

Reviews Serbian style or a translation for accuracy, fluency, terminology, tone, and preservation of qualifiers. For Russian and English, this role does not substitute for factual review of new claims.

### Media-rights reviewer

Checks creator, copyright owner, permission or license, required credit, permitted uses, expiry, and withdrawal conditions.

### Publishing reviewer

Confirms that all required reviews are complete and authorizes production eligibility. This role checks status and completeness; it does not waive missing evidence.

### Project owner

Approves major policy, architecture, exceptional publication decisions, and unresolved disputes.

## 2. Editorial status model

Use the following lifecycle:

research → draft → fact_review → language_review → approved → published

Additional states:

- needs_reverification;
- disputed;
- archived;
- rejected.

### research

Working investigation. Never rendered.

### draft

Structured content or prose exists but is incomplete or not yet verified. Never treated as fact in public output.

### fact_review

A factual reviewer is actively checking claims and sources.

### language_review

Factual review is complete for the submitted revision. Language or translation quality is being reviewed.

### approved

All required reviews for the revision are complete. Eligible for a protected preview.

### published

A publishing reviewer has approved inclusion in production.

### needs_reverification

A previously accepted claim or field requires another check. The display consequence depends on sensitivity.

### disputed

Credible allowed sources or an authority conflict with the current record. Public wording requires a documented decision.

### archived

Retained for history but excluded from the active catalogue.

### rejected

Not suitable for publication. The rejection reason remains in the review history.

Status transitions must be intentional and attributable. A commit, file creation, or merge does not implicitly advance status.

## 3. Verification status is separate from editorial status

Editorial status describes workflow progress. Verification status describes evidence for a claim or field.

Allowed verification values:

- verified;
- requires_verification;
- disputed;
- unknown;
- not_applicable.

A draft may contain verified facts and unresolved fields. A published page must not expose required fields marked requires_verification or unknown. Disputed content needs approved qualified wording.

## 4. Translation status is separate

Allowed translation values:

- missing;
- draft;
- in_review;
- approved;
- published;
- outdated;
- archived.

A Serbian source revision may be published while a translation remains missing. A Russian or English page is generated only for approved or published translation content according to the build policy established later.

When the Serbian source changes materially, dependent translations become outdated until a translator or reviewer confirms that the change does not affect them.

## 5. Time-sensitive status is separate

Allowed freshness values:

- current;
- expiring;
- stale;
- withdrawn;
- unknown.

Freshness is determined from field-level verification and validity metadata, not from the page’s general modification date.

A published historical page may contain a stale schedule record. The schedule must be hidden, withdrawn, or clearly handled under an approved display policy; the entire historical page does not necessarily need to be unpublished.

## 6. New place workflow

No sample or fictional place should be created merely to test this process.

### Step 1: Establish identity

The researcher:

- checks that the place is not already represented under another name;
- assigns a proposed stable ID according to the future ID convention;
- identifies the place type;
- records alternate names only with context and sources;
- identifies any parent complex without assuming a relationship.

If identity is ambiguous, stop and request factual review before drafting.

### Step 2: Register sources

Create or reference source records before entering material claims. Record exact pages, sections, access dates, and source status.

Discovery-only links may remain in research notes but cannot support publication.

### Step 3: Enter language-neutral facts

Enter only values supported by sources. Missing information remains omitted or explicitly requires verification in non-public notes.

Coordinates, jurisdiction, dedication, contact details, and dates are separate claims. Do not derive one from another.

### Step 4: Draft Serbian Cyrillic content

The Serbian editor prepares prose that reflects the evidence, preserves uncertainty, and avoids sensationalism.

Source references should be attached at the section or claim level when a general bibliography would be ambiguous.

### Step 5: Factual review

The factual reviewer checks:

- identity and type;
- every material historical claim;
- name forms and date precision;
- geographic accuracy;
- ecclesiastical context;
- source authority;
- practical information and freshness;
- media facts and captions.

The reviewer records accepted, changed, removed, disputed, and unresolved items.

### Step 6: Serbian language review

The Serbian language reviewer checks:

- Cyrillic usage;
- terminology;
- grammar and clarity;
- respectful tone;
- preservation of qualifiers;
- consistency with house style.

New factual claims introduced during editing return to factual review.

### Step 7: Media-rights review

Before media becomes approved, confirm rights, credit, allowed use, alt text, caption facts, and external object key. Large originals remain outside Git.

### Step 8: Approval

The publishing reviewer confirms required fields, sources, reviews, rights, and statuses. Approval makes the revision eligible for protected preview.

### Step 9: Publication

Publication occurs through a reviewed merge and successful validation/build once implementation exists. Until then, published is an editorial designation only.

## 7. Translation workflow

### Step 1: Freeze the source revision

The translator records the commit or content revision of the approved Serbian source.

### Step 2: Draft translation

Translate meaning, certainty, tone, source references, headings, captions, metadata, and practical warnings. Do not add facts.

Terminology questions are recorded rather than guessed.

### Step 3: Reconcile factual differences

If the translator finds a factual problem, stop that section and open a correction against the Serbian source. Do not silently fix only one language.

### Step 4: Language review

A qualified Russian or English reviewer checks:

- accuracy against the Serbian source;
- fluency;
- Orthodox and historical terminology;
- proper names;
- preserved qualifications and uncertainty;
- localized metadata;
- captions and alt text.

### Step 5: Approve or return

The reviewer marks the translation approved, returns it to draft, or flags it as requiring factual review.

### Step 6: Publication

The localized page becomes eligible only when translation and publishing statuses permit it. Missing translations do not create fallback pages.

## 8. Handling Serbian source changes

Classify each approved Serbian change:

### Non-material

Typography or punctuation with no change in meaning. Translations may remain current after reviewer confirmation.

### Material

A name, date, fact, qualifier, source, paragraph meaning, practical instruction, or metadata meaning changes. Dependent translations become outdated until reviewed.

### Urgent correction

A safety, rights, contact, closure, schedule, or serious factual issue requires prompt action. Withdraw the affected field or page first when necessary, then complete the normal review trail.

The change record must identify affected locales.

## 9. Time-sensitive information workflow

For each time-sensitive field:

1. Identify an allowed current source.
2. Record the exact value without inference.
3. Record verified_at, verified_by, source_ids, and any valid_from or valid_until.
4. Assign current, expiring, stale, withdrawn, or unknown.
5. Apply the approved display policy.
6. Schedule or record the next review.
7. Re-check when the source changes, validity ends, or a correction is received.

Until concrete review intervals are approved:

- use source-provided validity dates;
- treat schedules, temporary closures, and event dates conservatively;
- do not assume unchanged means current;
- hide or qualify stale values rather than extending them without evidence.

A source URL that still resolves does not prove the information remains current.

## 10. Coordinate workflow

1. Collect allowed source evidence.
2. Compare records when identity or precision is uncertain.
3. Record WGS 84 latitude and longitude.
4. Record accuracy class and whether publication is safe.
5. Obtain factual review.
6. Generate map data later from the approved record.

Map clicks and geocoder results are suggestions until reviewed. Never change approximate coordinates to exact solely by adding decimal places.

## 11. Media workflow

1. Obtain the file through an authorized channel.
2. Record creator and copyright owner.
3. Record license or permission evidence.
4. Record allowed uses, required credit, and expiry.
5. Remove unnecessary public EXIF data where appropriate.
6. Store large originals outside Git.
7. Record the external object key and checksum.
8. Prepare localized alt text and captions.
9. Review caption facts and rights.
10. Approve derivatives for publication.

A rights objection triggers immediate review. Withdraw first when continued display may be unauthorized.

## 12. Pull request workflow

Each content pull request should:

- state its editorial purpose;
- list entities and locales affected;
- distinguish new facts, wording changes, translations, time-sensitive changes, and media changes;
- list sources added or changed;
- identify unresolved questions;
- identify required reviewers;
- avoid unrelated application or configuration changes;
- pass all available documentation and content checks.

Recommended review labels, when repository processes support them:

- content-draft;
- fact-review;
- sr-language-review;
- ru-language-review;
- en-language-review;
- media-rights-review;
- time-sensitive;
- disputed;
- correction;
- ready-to-publish.

Labels assist workflow but do not replace status fields or review records.

## 13. Commit discipline

- Keep one coherent editorial purpose per commit when practical.
- Use messages that identify the content or policy changed.
- Do not rewrite published history to conceal an error.
- Use a corrective commit with a clear explanation.
- Do not mix large binary media with content commits.
- Do not bypass required review because a change appears small when it affects dates, coordinates, schedules, contacts, rights, or historical claims.

## 14. Approval matrix

| Change | Minimum required review |
| --- | --- |
| New language-neutral fact | Factual reviewer |
| New Serbian narrative | Factual reviewer and Serbian language reviewer |
| Russian translation | Russian language reviewer; factual review if new claims appear |
| English translation | English language reviewer; factual review if new claims appear |
| Coordinate or accuracy change | Factual reviewer |
| Schedule, contact, or access change | Factual reviewer with current source |
| Historical dispute wording | Factual reviewer and project owner or delegated senior editor |
| New media | Media-rights reviewer; factual review for caption |
| SEO metadata | Locale language reviewer; factual review if claims differ from page |
| Publication status change | Publishing reviewer |
| Urgent withdrawal | Publishing reviewer or designated emergency owner, followed by recorded review |

Named individuals and whether self-review is permitted in the prototype remain owner decisions. Sensitive facts should not rely on self-approval when another qualified reviewer is available.

## 15. Corrections

Corrections may come from clergy, monastic communities, readers, researchers, rights holders, or internal review.

For each correction:

1. Record the report, date, affected entity, locale, and field.
2. Acknowledge receipt according to the future response policy.
3. Assess urgency and potential harm.
4. Withdraw unsafe, clearly wrong, or potentially unauthorized content when necessary.
5. Check allowed sources and seek appropriate authority clarification.
6. Update the Serbian source of truth first when the issue is factual.
7. Mark affected translations outdated.
8. Complete required reviews.
9. Publish a corrective commit.
10. Retain an audit trail without exposing private correspondent details.

Do not resolve an official correction by silently changing only display text.

## 16. Disputes and source conflicts

When sources conflict:

- preserve the conflicting source records;
- identify the exact claim in dispute;
- compare source authority and publication context;
- avoid definitive wording until resolved;
- use qualified public language only when approved;
- record the decision and reviewer;
- set a future re-review if appropriate.

The most recent source is not automatically the strongest, and the most detailed account is not automatically correct.

## 17. Periodic review

Before launch, establish review intervals by field type.

A review report should eventually identify:

- time-sensitive fields approaching expiry;
- stale or unknown practical information;
- unavailable or superseded sources;
- translations behind the Serbian revision;
- media rights nearing expiry;
- pages awaiting factual or language review;
- published pages with unresolved correction reports.

Historical content should also be reviewed when new authoritative research, an official correction, or a material source change appears.

## 18. Phase 0 items still requiring assignment

Before Phase 1 exit, name or approve:

- project owner or delegated publishing authority;
- factual reviewer;
- Serbian language reviewer;
- Russian language reviewer;
- English language reviewer;
- media-rights reviewer;
- emergency withdrawal authority;
- review intervals for time-sensitive fields;
- correction response targets;
- minimum publication requirements;
- policy for sensitive coordinates.

No role assignment should be invented in content files.
