# Svetinje.me Phase 1 Plan

- Status: Proposed
- Date: 2026-08-03
- Phase: Content schema and research preparation
- Application code: Out of scope
- Public publication: Locked pending reviewer assignments

## 1. Objective

Phase 1 establishes an implementable content schema and a controlled research process for an initial representative set of sacred places within the project’s first content scope: the Metropolitanate of Montenegro and the Littoral.

This planning document does not assert that a specific prototype place has a particular jurisdiction, official name, type, date, location, contact, schedule, or history. Every such item must be researched and verified.

## 2. Owner decisions incorporated

- Project owner: Maxim.
- Initial publishing reviewer: Maxim.
- Factual reviewer: TBD.
- Ecclesiastical reviewer: TBD.
- Serbian-language reviewer: TBD.
- Russian-language reviewer: TBD.
- English-language reviewer: TBD.
- Serbian Cyrillic: source and default language.
- Technical entity IDs: immutable lowercase ASCII kebab-case.
- Serbian route: /svetinje/{serbian-approved-slug}/.
- Russian route: /ru/svyatyni/{russian-approved-slug}/.
- English route: /en/holy-places/{english-approved-slug}/.
- Map renderer: MapLibre.
- Tile provider: deferred.
- Editorial storage: Git-based YAML and Markdown.
- Large original media: outside Git.
- Database, CMS, custom admin, SSR, and application scaffolding: excluded from the prototype planning stage.

## 3. Phase 1 deliverables

This commit delivers the planning layer:

1. Proposed implementable schema specification in DATA_DICTIONARY.md.
2. Exact future directory and filename structure.
3. YAML and Markdown validation rules.
4. Slug and URL policy.
5. Review-role assignments, gaps, and publication gates.
6. Research checklist for every owner-supplied prototype label.
7. Phase 1 work sequence and exit criteria.

Later Phase 1 work requires separate authorization before creating real content records or code.

## 4. Explicit non-goals

Do not during this planning stage:

- install Astro or any package;
- create package.json, dependency files, src/, or public/;
- create application or validation code;
- create content/ directories or records;
- assign place entity IDs;
- assign public slugs;
- create sources without actual research;
- enter factual data for prototype places;
- infer ecclesiastical authority from phase scope;
- select a tile provider;
- add large media to Git;
- publish any place page.

## 5. Future content structure

When real content entry is separately authorized:

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

Rules are normative in DATA_DICTIONARY.md.

## 6. Workstreams

### Workstream A: Reviewer readiness

Owner: Maxim.

Tasks:

- identify factual reviewer;
- identify ecclesiastical reviewer;
- identify Serbian-language reviewer;
- identify Russian-language reviewer;
- identify English-language reviewer;
- identify media-rights reviewer before media publication;
- define geographic-safety escalation;
- record approved contributor IDs and scopes;
- keep public publication locked until minimum assignments exist.

Deliverable:

- approved reviewer roster or documented continuing blockers.

### Workstream B: Schema review

Tasks:

- review every field and controlled value in DATA_DICTIONARY.md;
- confirm the root content/ structure;
- confirm entity ID allocation procedure;
- confirm whether embedded approvals remain acceptable;
- confirm historical-date representation;
- confirm practical schedule representation before any schedule entry;
- confirm validation severity: error versus warning;
- confirm no internal-sensitive notes can enter public files.

Deliverable:

- schema version 1 approval for content entry.

### Workstream C: Slug and terminology rules

Tasks:

- approve Serbian ASCII transliteration;
- approve Russian ASCII transliteration;
- approve English place-type naming;
- approve reserved route segments;
- define house style for proper names;
- define terminology glossary ownership;
- confirm redirect registry design before first public slug changes.

Deliverable:

- approved slug rules without assigning real place slugs prematurely.

### Workstream D: Source methodology

Tasks:

- define how official web pages, publications, archive items, and academic works receive source IDs;
- define duplicate-source detection;
- define offline bibliographic requirements;
- define source snapshot or archive policy without copying restricted content;
- define handling for unavailable, superseded, disputed, and withdrawn sources;
- define claim-to-source citation conventions.

Deliverable:

- source-entry procedure accepted by factual reviewer.

### Workstream E: Prototype research dossiers

For each owner-supplied working label:

- complete identity research;
- register allowed sources;
- determine whether a distinct place entity exists;
- propose an entity ID only after identity review;
- research Serbian preferred name and alternate-name context;
- research place type;
- verify relationship to the Phase 1 ecclesiastical scope;
- research location and coordinate accuracy;
- research historical chronology without false precision;
- research ecclesiastical context;
- research practical information separately;
- identify rights-cleared media possibilities;
- identify unresolved questions and disputes;
- prepare Serbian draft only after evidence is organized;
- do not publish until all specialist roles are assigned.

Deliverable:

- one non-public, source-backed research dossier per verified entity.

No dossier or record is created by this planning commit.

## 7. Standard research checklist

Use checklist codes consistently.

### Identity and scope

- R01 — Confirm the working label refers to a distinct real place.
- R02 — Find an allowed source for the preferred Serbian Cyrillic name.
- R03 — Record sourced alternate names and their context; do not treat them as synonyms automatically.
- R04 — Verify place type.
- R05 — Verify the place’s relationship to the Metropolitanate of Montenegro and the Littoral; do not infer it from the Phase 1 scope.

### Sources and history

- R06 — Register every allowed source with title, publisher, type, URL or bibliography, locator, date, and access date.
- R07 — Separate documented history from tradition, legend, and unresolved claims.
- R08 — Preserve date precision exactly as supported.
- R09 — Identify conflicting sources and mark disputed claims.
- R10 — Map every material draft section to source IDs.

### Ecclesiastical review

- R11 — Verify ecclesiastical terminology, authority, jurisdiction, dedication, community, saints, relics, feasts, and traditions only where relevant and sourced.
- R12 — Flag every ecclesiastical statement for the future ecclesiastical reviewer.

### Geography

- R13 — Verify country, municipality, settlement, and address independently where used.
- R14 — Verify coordinates, WGS 84 order, accuracy class, and publication safety.
- R15 — Do not use map pins or geocoders as sole evidence.
- R16 — Separate directions, parking, walking, accessibility, and route safety into their own claims.

### Practical information

- R17 — Find a current allowed source for every proposed contact.
- R18 — Find a current allowed source for visiting hours or service schedules.
- R19 — Record verified_at, valid_from, valid_until, freshness, and stale display policy.
- R20 — Omit any volatile value that cannot be verified.

### Media and rights

- R21 — Identify potential media without downloading or committing unapproved originals.
- R22 — Record creator, owner, rights basis, permission, credit, and allowed use.
- R23 — Prepare Serbian alt text and caption only after the image and caption facts are approved.
- R24 — Keep large originals outside Git.

### Language and publication

- R25 — Draft Serbian Cyrillic first.
- R26 — Obtain factual, ecclesiastical, and Serbian-language review before Serbian approval.
- R27 — Tie Russian and English translations to an approved Serbian revision.
- R28 — Obtain locale reviewer approval for translation, slug, and metadata.
- R29 — Obtain Maxim’s publishing approval only after every specialist gate.
- R30 — Confirm unresolved fields are omitted or safely marked in non-public research.

## 8. Prototype research register

The labels below were supplied by the owner. They are not verified public names, technical IDs, slugs, or factual records.

| Working label | Checklist | Current planning state |
| --- | --- | --- |
| Manastir Ostrog | R01–R30 | Not started |
| Cetinje Monastery | R01–R30 | Not started |
| Manastir Podmaine | R01–R30 | Not started |
| Manastir Stanjevići | R01–R30 | Not started |
| Manastir Praskvica | R01–R30 | Not started |
| Manastir Rustovo | R01–R30 | Not started |
| Manastir Reževići | R01–R30 | Not started |
| Manastir Gradište | R01–R30 | Not started |
| Manastir Miholjska Prevlaka | R01–R30 | Not started |
| Manastir Savina | R01–R30 | Not started |

## 9. Per-place research sheets

Each subsection is a planning checklist only. No box is pre-checked.

### Manastir Ostrog

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Cetinje Monastery

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Podmaine

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Stanjevići

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Praskvica

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Rustovo

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Reževići

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Gradište

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Miholjska Prevlaka

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

### Manastir Savina

- [ ] R01–R05 identity and scope complete.
- [ ] R06–R10 sources and history complete.
- [ ] R11–R12 ecclesiastical review package complete.
- [ ] R13–R16 geography complete.
- [ ] R17–R20 practical information complete.
- [ ] R21–R24 media and rights complete.
- [ ] R25–R30 language and publication preparation complete.
- [ ] Technical entity ID proposed only after identity review.
- [ ] Locale slugs proposed only after language review.

## 10. Proposed Phase 1 sequence

### Gate 1: Planning approval

- Approve this plan.
- Approve DATA_DICTIONARY.md as schema version 1 direction.
- Approve SLUG_AND_URL_POLICY.md.
- Approve REVIEW_ROLES.md.

### Gate 2: Reviewer assignment

- Assign factual reviewer.
- Assign ecclesiastical reviewer.
- Assign Serbian-language reviewer.
- Assign Russian-language reviewer before Russian approval.
- Assign English-language reviewer before English approval.
- Assign media-rights reviewer before media approval.

### Gate 3: Schema implementation authorization

Only after separate owner authorization:

- create content/ directories;
- implement schemas and validation;
- add documentation-only schema tests that do not invent sacred-place facts;
- define contributor registry.

No Astro installation or application code is implied by this gate.

### Gate 4: Research authorization

Only after separate owner authorization:

- research one prototype label at a time;
- create real source records;
- create research or draft place records;
- keep all public publication gates locked;
- review the workflow before expanding to all ten.

### Gate 5: Prototype content review

- complete source-backed Serbian drafts;
- complete factual and ecclesiastical review;
- complete Serbian-language review;
- evaluate translation readiness;
- evaluate media rights;
- do not publish until Maxim approves after all gates.

## 11. Phase 1 exit criteria

Phase 1 is complete when:

- schema version 1 is approved and implementable;
- directory and filename policy is approved;
- validation requirements are unambiguous;
- technical ID allocation procedure is approved;
- slug and transliteration policies are approved;
- factual, ecclesiastical, and Serbian-language reviewers are assigned;
- Russian and English reviewer requirements are recorded, with assignments required before those locales publish;
- source methodology is approved;
- time-sensitive review policy is approved;
- each prototype place has a source-backed research dossier;
- no fictional data is present;
- representative draft records pass validation;
- public publication remains a deliberate separate decision.

The current planning commit satisfies only the documentation portion of these exit criteria.

## 12. Risks

| Risk | Control |
| --- | --- |
| Owner label treated as verified name | Label is explicitly non-factual until R01–R03 |
| Scope treated as jurisdiction fact | R05 requires independent verification |
| Placeholder records become public | Missing files preferred; publication gates enforced |
| Maxim unintentionally replaces specialist review | REVIEW_ROLES.md forbids substitution |
| Translation drifts from Serbian | source_revision required |
| Stale schedule or contact persists | Separate practical records and freshness gates |
| Slug asserts an unverified name | Slug assigned only after identity and language review |
| Media enters Git without rights | Metadata gate and external-original rule |
| Tile provider selected prematurely | Explicitly deferred |
| Schema implementation becomes application work | Separate authorization gate |

## 13. Related documents

- DATA_DICTIONARY.md
- SLUG_AND_URL_POLICY.md
- REVIEW_ROLES.md
- CONTENT_GUIDE.md
- EDITORIAL_WORKFLOW.md
- TECHNICAL_ROADMAP.md
