# Svetinje.me Review Roles and Publication Authority

- Status: Approved owner assignments plus required TBD roles
- Date: 2026-08-03
- Scope: Phase 1 research, schema work, previews, and future publication

## 1. Confirmed assignments

| Contributor ID | Person | Confirmed roles |
| --- | --- | --- |
| maxim | Maxim | Project owner; initial publishing reviewer |

Maxim may:

- approve project scope, policy, schemas, and architecture;
- approve Phase 1 plans;
- decide whether required reviews are complete;
- authorize protected preview eligibility after required specialist reviews;
- issue the final publishing approval after all other gates pass;
- order urgent withdrawal of unsafe, incorrect, or potentially unauthorized material.

Maxim’s publishing role does not replace specialist review.

## 2. Required roles still TBD

The owner requires these additional roles before relevant public publication:

- factual reviewer;
- ecclesiastical reviewer;
- Serbian-language reviewer;
- Russian-language reviewer;
- English-language reviewer.

These roles must be assigned to real, approved people. No content file, pull request, or approval record may use a fictional name, generic placeholder identity, or Maxim as an inferred substitute.

Additional roles may be assigned when needed:

- media-rights reviewer;
- geographic-safety reviewer;
- researcher;
- Serbian editor;
- Russian translator;
- English translator.

A person may hold more than one specialist role only with explicit owner approval. The review record must list every role separately.

## 3. Contributor identity

Technical contributor IDs use immutable lowercase ASCII kebab-case.

Confirmed ID:

- maxim

Future IDs are assigned only when a real person accepts a role and Maxim approves the identifier. The public repository must not expose private email addresses, phone numbers, or other unnecessary personal data.

## 4. Role definitions

### Project owner

Owns project direction and exceptional decisions. Approves role assignments, schema policy, publication policy, disputes requiring escalation, and major changes.

### Publishing reviewer

Checks that all required approvals apply to the exact material revision. Confirms that sources resolve, translations are current, practical information is fresh enough, media rights are complete, and status is eligible.

The publishing reviewer does not independently verify every historical or ecclesiastical claim and cannot waive missing specialist approval.

### Factual reviewer

Checks:

- entity identity;
- place type;
- names and alternate-name context;
- historical dates and precision;
- geographic facts;
- relationships;
- source suitability;
- practical facts;
- consistency between structured records and public prose.

The factual reviewer marks unsupported claims requires-verification, disputed, or removed. This role is required for every public place and factual narrative.

### Ecclesiastical reviewer

Checks:

- ecclesiastical terminology;
- authority and jurisdiction claims;
- dedication or patron claims;
- references to clergy, monastic communities, saints, relics, feasts, worship, and traditions;
- liturgical or institution-specific instructions;
- respectful and accurate context.

This role is required for every public place page because the project concerns Orthodox sacred heritage. It is also required for service schedules and ecclesiastical claims.

### Serbian-language reviewer

Checks the Serbian Cyrillic source:

- standard Cyrillic;
- grammar and clarity;
- terminology;
- proper-name treatment;
- respectful tone;
- qualifiers and uncertainty;
- Serbian slug;
- Serbian metadata.

This reviewer is required before any Serbian place page publishes.

### Russian-language reviewer

Checks the Russian translation against the approved Serbian revision:

- completeness and accuracy;
- Orthodox terminology;
- names and transliteration;
- preserved uncertainty;
- Russian slug;
- Russian metadata;
- no unsupported additions.

Required before a Russian page publishes.

### English-language reviewer

Checks the English translation against the approved Serbian revision:

- completeness and accuracy;
- Orthodox and historical terminology;
- names and naming conventions;
- preserved uncertainty;
- English slug;
- English metadata;
- no unsupported additions.

Required before an English page publishes.

### Media-rights reviewer

Checks creator, owner, license or permission, allowed uses, credit, expiry, object provenance, and withdrawal requirements. Required before any media item publishes unless Maxim explicitly assigns the role and records the decision.

### Geographic-safety reviewer

Checks whether coordinate precision and route or access information are safe and appropriate to publish. Required when publication_safety is not clearly public or when a location is sensitive.

## 5. Minimum approval sets

### Serbian place page

Required:

1. Factual approval.
2. Ecclesiastical approval.
3. Serbian-language approval.
4. Publishing approval by Maxim.
5. Media-rights approval for each displayed media item.
6. Geographic-safety approval when the coordinate policy requires it.

Until roles 1 through 3 are assigned, no Serbian place page can publish.

### Russian place page

Required:

1. The linked Serbian source revision has valid factual and ecclesiastical approval.
2. Russian-language approval for the translation.
3. Publishing approval by Maxim.
4. Media-rights approval for displayed media.
5. Geographic-safety approval when required.

Serbian-language approval remains required for the source revision on which the Russian translation depends.

### English place page

Required:

1. The linked Serbian source revision has valid factual and ecclesiastical approval.
2. English-language approval for the translation.
3. Publishing approval by Maxim.
4. Media-rights approval for displayed media.
5. Geographic-safety approval when required.

Serbian-language approval remains required for the source revision on which the English translation depends.

### Practical information

Required:

- factual approval;
- current allowed source;
- freshness metadata;
- relevant language approval for public wording;
- ecclesiastical approval for service schedules or institution-specific religious instructions;
- Maxim’s publishing approval.

### Media

Required:

- media-rights approval;
- factual approval for a factual caption;
- relevant language approval for alt text and caption;
- Maxim’s publishing approval when attached to public content.

## 6. Research and draft permissions

Researchers and editors may prepare research or draft content before all specialist roles are assigned.

Such material must:

- remain research or draft;
- contain no invented values;
- identify unresolved fields;
- cite allowed sources when claims are entered;
- remain excluded from public output;
- avoid restricted, private, or copyrighted research material in the public repository.

Maxim may approve the planning structure and internal protected preview, but not bypass the public publication gates.

## 7. Separation of reviews

Factual, ecclesiastical, language, rights, and publishing reviews answer different questions.

- Factual approval does not prove ecclesiastical terminology is correct.
- Ecclesiastical approval does not prove a coordinate is accurate.
- Language approval does not verify a newly introduced fact.
- Publishing approval does not replace any specialist review.
- A translation review does not repair an unapproved Serbian source.
- A GitHub approval without a stated role and scope does not satisfy the content schema.

When one person holds multiple approved roles, create separate approval records with separate scopes.

## 8. Review scope and revision

Every approval record must identify:

- role;
- reviewer ID;
- exact reviewed Git revision;
- outcome;
- timestamp;
- scope;
- optional notes.

A material change invalidates approvals covering that material.

Material changes include:

- name or slug;
- date or historical claim;
- place type;
- ecclesiastical relationship;
- coordinate or accuracy;
- schedule, contact, or access value;
- source or qualification;
- translated meaning;
- caption fact;
- rights or credit;
- SEO claim.

Typography-only changes may retain approvals only when the responsible language reviewer confirms they are non-material.

## 9. Approval outcomes

Allowed outcomes:

- approved;
- changes-requested;
- rejected;
- withdrawn.

Only approved satisfies a gate. withdrawn invalidates the previous approval. An approval may be replaced by a later approval for a newer revision.

## 10. Status authority

| Transition | Required authority |
| --- | --- |
| research to draft | Researcher or editor |
| draft to fact-review | Researcher or editor |
| fact-review to ecclesiastical-review | Factual reviewer approval |
| ecclesiastical-review to language-review | Ecclesiastical reviewer approval |
| language-review to approved | Relevant language reviewer approval |
| approved to published | Maxim after all gates |
| any state to needs-reverification | Any qualified reviewer; Maxim confirms display action |
| any reviewed state to disputed | Factual or ecclesiastical reviewer |
| any state to archived | Maxim |
| urgent public withdrawal | Maxim; specialist follow-up required |

The schema status uses hyphenated controlled values. Human-readable workflow labels may use spaces.

## 11. Self-review policy

Current policy:

- Maxim may publish only after required specialist approvals.
- Maxim does not automatically hold factual, ecclesiastical, or language-review authority.
- An author or translator should not be the sole reviewer of their own work.
- Any exception requires an explicit owner decision recorded before the approval.

This preserves independent review while the reviewer roster is being established.

## 12. Disputes

When reviewers disagree:

1. Keep the content out of published status.
2. Record the exact disputed field or claim.
3. Preserve all allowed sources.
4. Request clarification or a stronger source.
5. Use qualified wording only if factual and ecclesiastical reviewers approve it.
6. Escalate unresolved policy decisions to Maxim.
7. Record the final decision and affected revision.

Maxim decides publication policy but must not convert an unsupported claim into a verified fact.

## 13. Urgent withdrawal

Maxim may immediately withdraw:

- a serious factual error;
- an unsafe coordinate or access claim;
- stale schedule or closure information that could mislead visitors;
- unauthorized media;
- a privacy issue;
- an official correction requiring investigation.

Withdrawal is protective, not a final factual judgment. Normal specialist review follows before restoration.

## 14. Role-assignment checklist

Before assigning a TBD reviewer:

- confirm the person’s identity;
- confirm the role and subject competence;
- confirm accepted locales;
- assign immutable contributor ID;
- define whether public attribution is allowed;
- define review scope;
- record owner approval;
- confirm availability and backup procedure;
- ensure the person understands AGENTS.md, CONTENT_GUIDE.md, and EDITORIAL_WORKFLOW.md.

## 15. Phase 1 publication lock

Phase 1 begins with a publication lock.

The lock remains until Maxim records assignments for:

- factual reviewer;
- ecclesiastical reviewer;
- Serbian-language reviewer.

Russian publication additionally remains locked until a Russian-language reviewer is assigned. English publication additionally remains locked until an English-language reviewer is assigned.

Schema and planning work may proceed. Real research and draft records may proceed only in later explicitly authorized work. Public publication may not proceed.

## 16. Related documents

- DATA_DICTIONARY.md
- PHASE_1_PLAN.md
- SLUG_AND_URL_POLICY.md
- CONTENT_GUIDE.md
- EDITORIAL_WORKFLOW.md
