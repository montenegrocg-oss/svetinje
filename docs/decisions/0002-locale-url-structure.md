# ADR 0002: Locale and URL structure

- Status: Accepted
- Date: 2026-08-03
- Decision owner: Project owner
- Scope: All public routes

## Context

Svetinje.me must support Serbian Cyrillic, Russian, and English from the beginning. Serbian Cyrillic is the primary and source language. URLs must be stable, crawlable, understandable, and able to connect translations of the same underlying place without duplicating language-neutral facts.

The project also has a primary domain, svetinje.me, and a secondary domain, svetinjecrnegore.me.

## Decision

Use these locale rules:

- Serbian Cyrillic is the default language and has no locale prefix.
- Russian pages are under /ru/.
- English pages are under /en/.
- Internal locale keys are sr, ru, and en.
- The HTML language value for Serbian content is sr-Cyrl-ME.
- Russian and English use appropriate language values beginning with ru and en.
- The primary canonical domain is svetinje.me.
- The secondary domain must redirect permanently, path for path where possible, to svetinje.me.

Every content entity has a stable, language-independent ID. Each approved translation has its own localized route metadata and points to the same entity ID.

A localized page is generated only when that locale’s content is approved for publication. Serbian content must not be copied into a Russian or English URL as a silent fallback.

## Canonical and alternate behavior

Each published page must have:

- one self-referencing canonical URL on svetinje.me;
- alternate-language references for every published equivalent;
- a self-reference in the alternate set;
- an x-default reference chosen consistently, normally the Serbian equivalent or Serbian landing page;
- a visible language switcher that links to the equivalent entity when available.

When an equivalent translation does not exist, the language switcher may explain that the translation is unavailable and offer an appropriate language landing page. It must not create an empty, duplicate, or mislabeled localized page.

Automated IP-based redirects are not permitted. Browser-language detection may support a non-blocking suggestion, but the user’s explicit selection and the requested URL take precedence.

## Route identity

Stable entity IDs are not public copy and must not depend on a translated name. Public slugs may change only through a reviewed change that includes redirect planning.

Route generation must distinguish:

- stable route keys used by the application;
- localized section labels shown to users;
- localized or transliterated public slugs;
- entity IDs used to join facts and translations.

The exact Serbian, Russian, and English names for catalogue sections, and the exact transliteration and slug policy, remain a separate editorial decision. This ADR approves prefixes and identity rules, not final vocabulary.

## Rationale

An unprefixed primary language gives Serbian Cyrillic the canonical position required by the charter. Explicit /ru/ and /en/ paths make language variants independently crawlable and shareable. Stable entity IDs allow translations and URLs to evolve without duplicating coordinates, source records, media rights, or other language-neutral facts.

Explicit URLs and reciprocal alternates provide clearer behavior for users and search engines than automatic content negotiation.

## Consequences

Positive consequences:

- Serbian content has concise canonical URLs;
- translations are clearly separated;
- each locale can use reviewed terminology and metadata;
- language switching can preserve the current content entity;
- future languages can be added without changing existing entity IDs.

Trade-offs:

- route mapping requires deliberate multilingual maintenance;
- slug changes require redirects;
- incomplete translation coverage must be represented honestly;
- localized section vocabulary and transliteration require editorial governance.

## Guardrails

- Do not publish a locale unless its content status permits publication.
- Do not infer translation completeness from file presence alone.
- Do not duplicate language-neutral facts in translation files.
- Do not use one canonical URL across different language pages.
- Do not canonicalize Russian or English pages to Serbian when they contain approved translations.
- Do not vary page language by IP while keeping the same URL.
- Do not change an established slug without a redirect plan.

## Revisit triggers

A new ADR is required for:

- a change to the default language;
- adding a Serbian locale prefix;
- changing /ru/ or /en/;
- adopting language subdomains;
- finalizing a materially different slug strategy;
- adding regional variants that need separate public URLs.

## Related documents

- ../CONTENT_GUIDE.md
- ../EDITORIAL_WORKFLOW.md
- ../DATA_DICTIONARY.md
- ../TECHNICAL_ROADMAP.md
