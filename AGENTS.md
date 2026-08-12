# AGENTS.md — Svetinje.me Project Instructions

## Project identity

This repository contains the source materials and future codebase for:

**Svetinje.me**

A multilingual digital Orthodox guide to monasteries, churches and holy places of Montenegro.

The project goal is to create a high-quality digital platform for pilgrims, visitors and researchers interested in Orthodox heritage of Montenegro.

---

# General rules

## Accuracy first

All information must be verified.

Allowed sources:

- official church websites;
- diocesan websites;
- monastery websites;
- official publications;
- historical and academic sources.

Never invent:

- facts;
- dates;
- locations;
- schedules;
- contacts;
- historical information.

If information is uncertain, clearly mark it as requiring verification.

---

# Language rules

Primary language:

- Serbian Cyrillic.

Additional languages:

- Russian;
- English.

The architecture must support multilingual content from the beginning.

---

# Content rules

Content should be:

- respectful;
- historically accurate;
- suitable for Orthodox pilgrims;
- written in a clear and modern style.

Avoid:

- sensationalism;
- tourist-style exaggerations;
- unverified legends presented as facts.

---

# Development rules

Before creating code:

1. Understand the existing project structure.
2. Do not remove existing files without permission.
3. Explain major architectural decisions.
4. Keep code clean and maintainable.

---

# Website principles

The future website must be:

- fast;
- mobile friendly;
- SEO optimized;
- accessible;
- visually elegant.

---

# Design direction

The visual style should combine:

- Orthodox tradition;
- Montenegro cultural heritage;
- modern minimalism;
- premium photography.

Avoid:

- excessive decoration;
- generic templates;
- artificial-looking design.

---

# Data structure

Information about monasteries, churches and holy places should be prepared as structured data.

Each location should support:

- name;
- description;
- history;
- location;
- coordinates;
- photographs;
- sources;
- languages;
- practical information.

---

# Images and media

Images must respect copyright.

Prefer:

- original photography;
- authorized materials;
- properly attributed sources.

---

# Domain

Main domain:

svetinje.me

Secondary domain:

svetinjecrnegore.me

---

# Long-term vision

Possible future features:

- interactive map;
- pilgrimage routes;
- 3D models;
- virtual tours;
- audio guides;
- mobile application.

---

# Codex instructions

When working on this project:

- ask before making major architectural changes;
- explain what was changed;
- keep documentation updated;
- prioritize correctness and safety, while using the smallest validation tier appropriate to the task.

---

# Codex task and validation tiers

Validation effort must be proportional to the task.

Do not apply the maximum validation workflow to every change.

When the user or task prompt specifies a task type, follow that tier.

If no task type is specified, infer the smallest appropriate tier from the requested change.

If a task unexpectedly expands into a higher tier, do not silently begin a broad refactor. Stop and report why the task needs escalation before continuing.

## A / FAST_UI

Use for:

- CSS-only changes;
- spacing;
- sizing;
- colors;
- typography;
- border radius;
- simple responsive layout adjustments;
- small visual changes that do not alter application behavior or data flow.

Execution:

- inspect only directly relevant files;
- prefer the smallest possible patch;
- do not perform a broad architecture review;
- do not refactor unrelated code;
- visually verify one representative desktop viewport and one mobile viewport;
- add intermediate viewport checks only if a responsive issue is found;
- run focused tests if an existing test directly covers the changed behavior;
- run `pnpm run check` once after the final patch when source code or tests changed;
- do not run production and editorial-preview builds unless the change affects routing, publication behavior, output generation, or a build-sensitive shared component.

Typical target duration:

5–15 minutes.

## B / UI_BEHAVIOR

Use for:

- new ordinary UI pages;
- filters;
- search behavior;
- pagination;
- interactive controls;
- state changes;
- map/card interaction;
- reuse or extension of existing components without changing publication architecture.

Execution:

- inspect only the components and utilities directly involved;
- reuse existing architecture rather than creating a parallel implementation;
- run focused tests while implementing;
- run `pnpm run check` once after the final patch;
- run only the build mode required by the change;
- if the task adds or changes a static route, shared publication-aware loader usage, or output expectations, run both production and editorial-preview builds;
- visually verify one desktop and one mobile viewport;
- use an intermediate viewport only when the layout is breakpoint-sensitive;
- do not repeatedly rerun the full validation suite unless a failure requires another fix.

Typical target duration:

15–35 minutes.

## C / ARCHITECTURE

Use for:

- publication policy;
- production/editorial-preview separation;
- schemas;
- loaders;
- content visibility;
- MapLibre lifecycle or shared map architecture;
- Cloudflare workflows;
- security-sensitive behavior;
- shared data models;
- major refactors;
- changes that can cause research-content leaks.

Execution:

- inspect the relevant architecture before editing;
- preserve publication safeguards;
- run focused tests during implementation;
- run full `pnpm run check`;
- run production build;
- run `EDITORIAL_PREVIEW=true pnpm run build`;
- verify production research leaks remain zero;
- verify editorial preview remains `noindex`;
- perform responsive/browser verification when UI is affected.

Typical target duration:

30–90 minutes.

## D / CONTENT

Use for:

- adding or editing a place;
- narratives;
- sources;
- coordinates;
- photographs/media records;
- ordinary editorial metadata.

Execution:

- inspect the relevant content record and schema only;
- never invent missing facts;
- run content validation;
- run only tests directly related to the affected content;
- run the build mode required to verify the content;
- use both production and preview builds only when publication visibility or leak protection could be affected;
- do not perform a full visual audit unless the content change alters layout or media presentation.

Typical target duration:

10–25 minutes.

## General execution efficiency rules

For all tiers:

- read `AGENTS.md` first;
- run `git status` before editing;
- preserve all existing user changes;
- do not run `pnpm install` unless dependencies changed, the environment is missing dependencies, or the lockfile must be verified;
- do not repeat expensive checks that already passed unless subsequent code changes could invalidate them;
- prefer focused searches and directly relevant files over repository-wide exploration;
- prefer the smallest correct patch;
- do not clean up unrelated code during a focused task;
- do not add tests for every content record; test behavior and architecture;
- do not perform browser checks at many viewport sizes unless the task specifically concerns responsive behavior;
- do not turn a focused task into a general refactor.

If implementation reveals an unexpected issue that would substantially expand scope, stop and report:

1. what was discovered;
2. why the current tier is insufficient;
3. which higher tier is required;
4. what additional work would be needed.

Do this before starting the expanded work.

## Validation completion rule

Validation should be performed after the implementation has stabilized.

Prefer:

focused implementation checks
→ final `pnpm run check` if required by the tier
→ required build(s)
→ visual verification if required

Do not repeatedly cycle through the entire validation stack after every small edit.

## Time escalation rule

The duration targets above are guidance, not hard deadlines.

However, for A, B, or D tasks, if the task appears likely to take more than roughly twice the normal target duration because of unexpected complexity, stop and explain the cause before continuing into a substantially larger scope.
