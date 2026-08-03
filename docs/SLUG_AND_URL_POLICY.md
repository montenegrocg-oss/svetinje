# Svetinje.me Slug and URL Policy

- Status: Proposed for Phase 1
- Date: 2026-08-03
- Applies to: Place detail pages
- Content language authority: Assigned reviewer for each locale

## 1. Approved public route structure

The owner approved these canonical place routes:

| Locale | Canonical pattern |
| --- | --- |
| Serbian Cyrillic | /svetinje/{serbian-approved-slug}/ |
| Russian | /ru/svyatyni/{russian-approved-slug}/ |
| English | /en/holy-places/{english-approved-slug}/ |

Rules:

- Serbian has no locale prefix.
- Russian uses /ru/.
- English uses /en/.
- All canonical place URLs end with a trailing slash.
- svetinje.me is the canonical domain.
- The same place has one canonical URL per published locale.
- A locale URL exists only when the corresponding narrative is eligible for publication.

This policy does not assign slugs to any prototype place.

## 2. Entity ID versus slug

A technical entity ID and a public slug are different.

Entity ID:

- immutable;
- language-independent;
- lowercase ASCII kebab-case;
- assigned after identity review;
- used for file paths and cross-file references;
- never changed because a public name changes.

Slug:

- locale-specific;
- language-reviewed;
- lowercase ASCII kebab-case under this proposed policy;
- used only in the public URL;
- may change through a controlled redirect process;
- must not be generated automatically from the entity ID.

A place can have one entity ID and up to three current place slugs, one per locale.

## 3. Slug syntax

Proposed required pattern:

    ^[a-z0-9]+(?:-[a-z0-9]+)*$

A slug must:

- use lowercase ASCII letters, digits, and single hyphens;
- start and end with a letter or digit;
- avoid consecutive hyphens;
- contain no spaces, underscores, punctuation, diacritics, Cyrillic characters, percent encoding, query strings, or fragments;
- be between 2 and 80 characters;
- be unique within its locale’s place-route namespace;
- be linguistically approved rather than mechanically accepted.

ASCII slugs support stable copying, analytics, redirects, and tooling while visible names remain Serbian Cyrillic, Russian Cyrillic, or English.

## 4. Serbian slug approval

The Serbian visible name remains Cyrillic. The URL slug is an approved ASCII transliteration or concise approved Serbian route form.

The Serbian-language reviewer must approve:

- transliteration;
- word order;
- whether the place type belongs in the slug;
- treatment of diacritics and digraphs;
- ambiguity with another place;
- consistency with the future Serbian terminology guide.

No automated transliteration result is publishable without review. The exact transliteration table remains to be approved by the Serbian-language reviewer and Maxim before place slugs are assigned.

## 5. Russian slug approval

Russian public copy remains Russian. The Russian URL slug is an approved ASCII transliteration or concise Russian route form.

The Russian-language reviewer must approve:

- transliteration system;
- word order;
- treatment of Russian place-type words;
- ambiguity;
- consistency across the catalogue.

Do not copy the Serbian slug into Russian merely because the place identity is the same.

## 6. English slug approval

The English-language reviewer approves an English slug based on the reviewed English name and catalogue terminology.

The English slug must:

- use natural English ordering;
- avoid unsupported claims or marketing terms;
- remain concise;
- distinguish collisions without inventing facts;
- remain consistent with English catalogue naming.

Do not translate a place name unless the reviewed English editorial policy supports that form.

## 7. Reserved route segments

These segments are reserved at the relevant route level and must not be used as a place slug:

- ru
- en
- svetinje
- svyatyni
- holy-places
- mapa
- map
- rute
- routes
- istorija
- history
- o-projektu
- about
- izvori
- sources
- pretraga
- search
- api
- assets
- admin
- sitemap
- robots

The final reserved list must be synchronized with the approved site information architecture before implementation. A validator should reject exact reserved values.

## 8. Collision policy

Slug uniqueness is scoped by locale route:

- Serbian under /svetinje/;
- Russian under /ru/svyatyni/;
- English under /en/holy-places/.

When two places would receive the same slug:

1. Do not alter either entity ID.
2. Confirm they are distinct entities.
3. Use a concise, verified disambiguator.
4. Obtain factual and locale-language review for the disambiguator.
5. Record the reason in the pull request.
6. Do not use an unverified municipality, date, rank, jurisdiction, or geographic label merely to force uniqueness.

A numeric suffix is a last resort and requires owner approval.

## 9. Slug lifecycle

### Before first publication

A draft slug may change without redirect only if it has never appeared on an externally shared preview or production URL. Review history remains in Git.

### After public publication

A slug change requires:

- reason for change;
- old canonical path;
- new canonical path;
- locale-language approval;
- factual review if the name meaning changes;
- Maxim’s publishing approval;
- a permanent path-preserving redirect;
- updated canonical and alternate-language metadata;
- updated sitemap and internal links;
- a check for redirect loops and chains.

Old slugs are never reassigned to a different entity.

### Redirect registry

When implementation is authorized, maintain a version-controlled redirect registry. It should record locale, entity ID, old path, new path, reason, approval, and effective date.

Do not create the registry or redirect configuration during this documentation-only phase.

## 10. Canonical and alternate-language rules

Each published localized page must:

- self-canonicalize to its svetinje.me URL;
- reference all published locale equivalents;
- include itself in the alternate set;
- use the approved Serbian equivalent as x-default when appropriate;
- omit unpublished locale equivalents;
- keep the language switcher tied to the same entity ID.

Do not canonicalize Russian or English content to Serbian when a genuine approved translation exists.

## 11. Normalization

Canonical output uses:

- HTTPS;
- lowercase host;
- no www unless the owner later selects it as canonical;
- exactly one trailing slash;
- no duplicate slash;
- no index.html;
- no tracking parameters in canonical metadata;
- lowercase ASCII slug.

Requests that differ only by safe normalization should redirect once to the canonical path. Redirect behavior is implemented later on Cloudflare.

## 12. Validation rules

A future validator must reject:

- a slug that violates syntax or length;
- a duplicate active slug within a locale namespace;
- a reserved slug;
- a Serbian slug without sr-language approval at publication;
- a Russian slug without ru-language approval at publication;
- an English slug without en-language approval at publication;
- a slug attached to the wrong locale file;
- a published locale with no slug;
- a slug change that drops a previously published path without redirect metadata;
- a place path generated from an entity ID without an explicit approved slug;
- automatic fallback from another locale.

## 13. Prototype-place rule

The ten owner-supplied labels in PHASE_1_PLAN.md are research identifiers only.

During this planning commit:

- no technical entity IDs are assigned;
- no Serbian, Russian, or English slugs are assigned;
- no canonical place URLs are created;
- no spelling or transliteration is asserted as official.

Each identifier and slug is assigned later, after identity research and required review.

## 14. Open decisions

Before the first place slug is approved:

- approve Serbian ASCII transliteration rules;
- approve Russian ASCII transliteration rules;
- approve English place-type naming;
- confirm the full reserved segment list;
- confirm the canonical www policy;
- define redirect-registry filename and schema.

## 15. Related documents

- DATA_DICTIONARY.md
- PHASE_1_PLAN.md
- REVIEW_ROLES.md
- decisions/0002-locale-url-structure.md
