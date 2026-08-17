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

---

# Current implementation safeguards

Parallel work must preserve the current implemented architecture. In particular:

- the Orthodox calendar is implemented under `content/calendar/2026/YYYY-MM-DD.yaml`, is exposed at `/kalendar/`, and is loaded through `TodayCalendarService`;
- Serbian Gospel text uses the `vuk-karadzic-1847` translation identifier;
- place media use the established R2 media architecture;
- editorial visibility distinguishes `Нацрт` from `Објављено`;
- place prose uses the unified place narrative and its provenance model;
- the admin coordinate editor uses its existing coordinate map, while technical coordinate fields remain hidden from the ordinary editor UI;
- the route platform is implemented and must remain compatible with shared map and publication behavior;
- production publication safeguards must continue to prevent research or draft content from leaking into public output.

Do not replace these systems with older proposed architecture or documentation assumptions.

---

# Parallel Codex work

The project deliberately uses several parallel Codex chats and worktrees. Each active worktree has a primary responsibility and must stay within its assigned scope.

### UI tasks — Worktree A

Primary responsibility:

- public presentation;
- layout;
- responsive behavior;
- typography;
- reusable public UI components;
- public place, route, and homepage visual polish;
- CSS;
- accessibility of public UI.

Typical ownership:

- `src/styles/`;
- public UI portions of `src/components/`;
- public page layout in `src/pages/`.

Do not change the map engine, calendar data, or admin backend unless the task explicitly requires it.

### Map tasks — Worktree B

Primary responsibility:

- MapLibre;
- MapTiler;
- public map interactions;
- marker behavior;
- clustering;
- bounds;
- map controls;
- admin coordinate picker;
- route map rendering;
- map-specific browser diagnostics.

Typical ownership:

- map-related `src/components/`;
- `src/lib/map*`;
- `src/lib/*marker*`;
- map-related portions of the admin client and UI;
- map-specific tests.

Do not perform unrelated UI redesign or calendar/content migration.

### Calendar — Worktree C

Primary responsibility:

- Orthodox calendar;
- `TodayCalendarService`;
- feast and calendar identifiers;
- Gospel readings;
- `/kalendar/`;
- homepage `ДАНАС`;
- yearly calendar imports;
- calendar validation.

Typical ownership:

- `content/calendar/`;
- `content/scripture/`;
- `content/lectionary/`;
- calendar schemas, importers, services, pages, and tests.

The calendar is already implemented. Preserve `content/calendar/2026/YYYY-MM-DD.yaml`, `TodayCalendarService`, and the `vuk-karadzic-1847` Gospel translation identifier. Do not change public map internals or unrelated place admin.

### Content research

Primary responsibility is research only unless the current task explicitly authorizes a content mutation.

Tasks:

- gather authoritative sources;
- compare conflicting facts;
- prepare verified information;
- identify uncertainty;
- suggest canonical content changes.

By default:

- no application code changes;
- no production publication;
- no automatic bulk editing;
- no map architecture changes.

### Bulk content / import

Primary responsibility:

- reviewed structured place content;
- approved mass migrations;
- canonical content normalization;
- import scripts;
- media/content relationships when explicitly included.

Avoid modifying shared application architecture. Schema changes require explicit coordination because they can affect every worktree.

### Project setup / AGENTS.md

Primary responsibility:

- `AGENTS.md`;
- repository-level Codex instructions;
- project workflow conventions;
- carefully scoped repository configuration tasks.

This worktree must remain low-churn. Do not perform feature development here unless explicitly assigned.

### PR / Release review

Primary responsibility is independent review. The default mode is read-only.

Review:

- accumulated branch changes;
- regressions;
- publication safety;
- security;
- accessibility;
- map behavior;
- generated output;
- release readiness.

This is the preferred chat for reviewing completed UI A, Map B, Calendar C, and Bulk Content branches before integration. It may compare branch diffs and identify conflicting shared files, incompatible assumptions, schema conflicts, regressions, publication leaks, and duplicate implementations.

Do not modify code or merge merely because review is green unless explicitly instructed.

### Connect to GitHub

`Connect to GitHub` is a historical setup chat. It is not part of the active parallel development worktree model and must not receive new implementation tasks. Do not treat old instructions from that chat as current worktree ownership.

Route current work to one of:

- UI tasks — Worktree A;
- Map tasks — Worktree B;
- Calendar — Worktree C;
- Content research;
- Bulk content / import;
- Project setup / `AGENTS.md`;
- PR / Release review.

## Integration branch

The current project integration branch is:

`feature/podmaine-pilot`

Treat it as the shared integration target. Multiple worktrees must never actively write directly to the same branch at the same time.

Each active implementation worktree should use a dedicated task/worktree branch based on the latest integration HEAD. Suggested naming conventions are:

- `worktree/ui-a`;
- `worktree/map-b`;
- `worktree/calendar-c`;
- `worktree/content-research`;
- `worktree/bulk-content`;
- `worktree/project-setup`.

These are conventions, not instructions to create every branch or worktree automatically.

## Worktree isolation

Each active Codex chat/worktree owns:

- its working directory;
- its assigned branch;
- its task scope.

Never:

- check out another active worktree's branch;
- commit to another active worktree's branch;
- reset another worktree;
- modify another worktree's uncommitted files;
- force-push another branch;
- delete another worktree branch.

A worktree must not assume it owns changes visible in another worktree.

## Task start protocol

Every implementation task begins by:

1. running `git status --short`;
2. recording the current branch;
3. recording the current HEAD;
4. running `git fetch origin`;
5. identifying the intended base/integration SHA;
6. checking whether the task overlaps files owned by another active worktree.

Do not automatically switch branches unless the task explicitly authorizes it. If the current worktree is on the wrong branch, stop and report it.

## Base SHA awareness

At task start, record the integration/base SHA, for example:

`origin/feature/podmaine-pilot @ <sha>`

The integration branch may advance while another worktree is running. Never assume that the remote branch remained unchanged.

## Parallel push rule

When implementation is complete, push only the assigned worktree branch.

Do not:

- push directly to another worktree's branch;
- force-push;
- rewrite shared history.

If the remote assigned branch advanced:

1. fetch;
2. inspect the remote changes;
3. rebase or integrate safely within the assigned branch;
4. rerun affected checks;
5. push normally.

## Integration of parallel work

Do not automatically merge worktree branches into `feature/podmaine-pilot` unless the current task explicitly requests integration.

Normal sequence:

worktree branch
→ checks
→ push
→ optional PR/review
→ integration/release step

Prefer the PR / Release review chat for reviewing several completed worktree branches before integration.

## Editorial fast path — `worktree/editorial-copy`

`worktree/editorial-copy` may directly fast-forward `origin/feature/podmaine-pilot` only for low-risk editorial-copy changes. This is a narrow exception to the normal integration workflow and does not require a separate PR / Release review when every condition below is met.

The fast path is allowed only for visible prose or copy, headings, labels, static page text, page titles or meta descriptions, and mailto or internal textual links.

It must not change:

- CSS, layout, or responsive behavior;
- JavaScript or TypeScript application logic, component behavior, Map, Calendar, Admin, or Routes;
- schemas, `content/places/**`, canonical research records, visibility/publication registries, or validation policies;
- test infrastructure, GitHub workflows, `package.json`, `pnpm-lock.yaml`, `.gitattributes`, or `AGENTS.md` after this policy task.

Before every fast-path task, run:

1. `git status --short`;
2. `git branch --show-current`;
3. `git fetch origin`;
4. `git rev-parse HEAD`;
5. `git rev-parse origin/feature/podmaine-pilot`.

The assigned branch must be `worktree/editorial-copy`. Before editing, it must be synchronized with the current integration HEAD using only:

`git merge --ff-only origin/feature/podmaine-pilot`

If the branch has diverged or has its own unfinished commits and this fast-forward is unavailable, the fast path is forbidden. Stop and use the normal review workflow.

After the copy change, run:

1. `git diff --name-status`;
2. `git diff`;
3. `pnpm run check`.

All checks must be green. Before a direct push, run `git fetch origin` again and compare the task's expected integration parent with `origin/feature/podmaine-pilot`. If integration advanced after the task began, do not push, rebase, or merge automatically: stop and report the changed SHA. This protects independently created admin commits.

Only if the remote integration HEAD is unchanged, push by ordinary fast-forward:

`git push origin HEAD:feature/podmaine-pilot`

Never use `--force` or `--force-with-lease`. After a successful integration push, also update `origin/worktree/editorial-copy` with an ordinary push.

If Git rejects a push, a conflict or non-fast-forward appears, or checks fail, stop without bypassing the protection. The fast path never deploys.

If a task touches design, layout, interactive behavior, a data model, canonical content, map/calendar/admin, build or deployment infrastructure, or multiple worktree domains, use the normal workflow instead:

assigned worktree
→ commit/push own branch
→ PR / Release review
→ integration

When in doubt, use the normal review workflow.

## Cross-worktree overlap

If the current task requires files actively owned by another worktree, do not silently edit them. First report:

- the exact files;
- why they are needed;
- which subsystem currently owns them;
- whether the change can be avoided or deferred.

Typical overlaps include:

- a UI task changing `MapCanvas.astro` — likely Map Worktree ownership;
- a Calendar task changing the global public layout solely for styling — potential UI Worktree ownership;
- a Map task changing the canonical place schema — potential Bulk Content or admin architecture ownership.

Prefer a clean handoff over an avoidable merge conflict.

## Shared and high-conflict files

The following kinds of files are shared or especially conflict-prone:

- `AGENTS.md`;
- package manifests and lockfiles;
- global CSS;
- root build configuration;
- publication policy;
- common schemas;
- shared content loaders;
- the main admin router or service;
- shared GitHub Actions workflows.

Modify them only when required and keep changes minimal. If two active worktrees need the same shared file, coordinate explicitly.

## Schema changes

Schemas are cross-cutting. No worktree may casually change a shared schema merely to simplify a local feature.

Before changing a schema:

- identify every consumer;
- identify the admin, public, import, and validation impact;
- identify which parallel worktrees may be affected.

Schema migrations are normally class C or D tasks.

## Test fixtures and mutable editorial content

Never use mutable real editorial records as permanent fixtures for missing or optional states.

Do not assume a named real object will permanently:

- lack coordinates;
- lack media;
- lack practical data;
- lack highlights;
- contain placeholder text;
- remain unpublished;
- have a fixed number of photographs.

Use:

- synthetic fixtures;
- in-memory clones;
- controlled temporary fixtures.

Assertions about a real object are allowed only when the test intentionally validates that object's canonical data.

Tests must not encode temporary editorial inventory assumptions. Avoid fixed assertions such as:

- an exact number of photographs on a mutable real place;
- an exact missing-coordinate status;
- an optional route field always being undefined;
- a specific placeholder-slot count.

Prefer derived inventory or synthetic fixtures.

## Content commits during parallel work

Content editors and admin tools may create Git commits while feature worktrees are running. A long-running Codex task must expect `origin/feature/podmaine-pilot` to advance.

Do not treat ordinary admin-generated content commits as corruption. Before final integration, fetch and inspect them. Never overwrite them.

## Admin-generated commits

The private `svetinje-admin` GitHub App can create commits independently of Codex. Typical commits include:

- place edits;
- narrative edits;
- photo relationships;
- route edits;
- visibility changes.

Parallel Codex work must preserve these commits. If a push is rejected because the integration branch advanced, do not force-push. Fetch and integrate safely.

## Project setup scope

`Project setup / AGENTS.md` must remain a low-churn work area used only for:

- repository agent rules;
- worktree coordination;
- project workflow instructions;
- narrowly scoped root configuration.

Do not use it as a general feature-development chat.
