# Svetinje.me Technical Roadmap

Status: proposed architecture, not an implementation plan approval  
Repository: montenegrocg-oss/svetinje  
Primary domain: https://svetinje.me  
Secondary domain: https://svetinjecrnegore.me  
Prepared: 2026-08-03

## Purpose and constraints

This roadmap translates the requirements in AGENTS.md and docs/PROJECT_CHARTER.md into a technical direction. It does not authorize application development. Major architectural choices must be approved before implementation.

The platform must be:

- accurate and source-driven;
- respectful of Orthodox heritage and suitable for pilgrims;
- Serbian Cyrillic first, with Russian and English supported from the start;
- fast, mobile-first, accessible, and search-engine friendly;
- visually restrained, with premium, copyright-cleared photography;
- maintainable by a small team and able to grow without an early platform rewrite.

The architecture must never treat unverified information as publishable fact. Dates, coordinates, contacts, service schedules, visiting hours, and historical claims require explicit sources and verification metadata.

## Executive recommendation

Build Svetinje.me as a static-first content site with Astro and strict TypeScript. Keep reviewed editorial content in the Git repository as schema-validated Markdown and YAML. Generate nearly all public pages at build time, add client-side JavaScript only for the interactive map and narrowly scoped enhancements, and deploy through Cloudflare Pages from GitHub.

Use MapLibre GL JS as the map renderer, but keep the tile provider replaceable. Store master photography outside Git in Cloudflare R2 and deliver responsive derivatives through Cloudflare image transformations when the media library justifies it. Do not introduce a database, custom admin panel, or server-side rendering during the prototype unless a confirmed requirement cannot be met statically.

This approach minimizes cost and operational risk while preserving a clean path to a headless CMS, Cloudflare Workers, search indexing, audio, routes, 3D assets, and a mobile application later.

## 1. Recommended technology stack

| Layer | Recommendation | Reason |
| --- | --- | --- |
| Web framework | Astro, current stable release, pinned by lockfile | Designed for content-heavy sites, static by default, minimal browser JavaScript, built-in routing and internationalization support |
| Language | TypeScript in strict mode | Catches data and integration errors before deployment |
| Content model | Astro Content Collections with Zod schemas | Build-time validation, generated types, and a clear boundary between content and presentation |
| Content formats | YAML for structured records; Markdown or MDX for long-form localized prose | Human-readable diffs, editorial review in pull requests, and no database requirement |
| Styling | Semantic HTML, CSS custom properties, component-scoped CSS, and a small token-based design system | Supports a distinctive design without a heavy UI library or generic template appearance |
| Interactive map | MapLibre GL JS, loaded only on map views | Open-source, TypeScript-based, provider-independent renderer for vector tiles and GeoJSON |
| Geographic interchange | GeoJSON using WGS 84 coordinates | Standard, portable representation that can serve web maps, exports, and future mobile clients |
| Package manager | pnpm with a committed lockfile | Reproducible and space-efficient installations |
| Code quality | ESLint, Prettier, TypeScript checks, Markdown linting, and schema validation | Consistent contributions and early detection of invalid content |
| Automated testing | Vitest for pure logic, Playwright for critical user journeys, axe-based accessibility checks, and Lighthouse CI | Covers routing, locale switching, content rendering, accessibility, and performance |
| Hosting | Cloudflare Pages with GitHub integration | Atomic deployments, branch previews, CDN delivery, TLS, and simple static hosting |
| Media | Cloudflare R2 originals plus Cloudflare image transformations after the prototype | Separates large copyrighted assets from source control and supports responsive AVIF/WebP delivery |
| Analytics | Cloudflare Web Analytics initially, subject to privacy review | Lightweight launch measurement without making analytics part of core rendering |
| Error monitoring | Add only when client or Worker logic becomes material | A static prototype should not carry unnecessary runtime infrastructure |

Version policy:

- Use supported stable releases, not prereleases.
- Pin runtime and package manager versions.
- Commit the lockfile.
- Apply dependency updates in small pull requests with build, test, accessibility, and visual checks.
- Record irreversible platform choices as Architecture Decision Records under docs/decisions before implementation.

Quality targets:

- WCAG 2.2 AA.
- Good Core Web Vitals at the 75th percentile: LCP at or below 2.5 seconds, INP at or below 200 milliseconds, and CLS at or below 0.1.
- No JavaScript required for reading core content or navigating the catalogue.
- A functional low-bandwidth experience on mid-range mobile devices.
- All builds fail on invalid content, broken internal references, or missing required source metadata.

## 2. Website and repository architecture

### 2.1 Rendering model

Use static generation for:

- home and project pages;
- catalogue and filtered landing pages;
- individual monastery, church, and holy-place pages;
- history and guide articles;
- pilgrimage route pages;
- localized sitemaps, feeds, and metadata;
- the non-interactive map fallback and place lists.

Use browser JavaScript only for:

- MapLibre map interaction;
- optional client-side catalogue filtering;
- accessible menu enhancements where CSS and HTML are insufficient;
- future audio or virtual-tour controls.

Do not add server-side rendering during the first release. Introduce a Cloudflare Worker or Pages Function only for a concrete feature such as protected editorial previews, a contact form with abuse protection, or server-side search that cannot be delivered safely as static data.

### 2.2 Public information architecture

Recommended top-level sections:

- Home
- Holy places
  - Monasteries
  - Churches and chapels
  - Other holy places
- Map
- Pilgrimage routes and guides
- History and heritage
- Practical information
- About the project
- Sources and editorial policy
- Report a correction

Every place page should present, in a consistent order:

1. verified name and type;
2. concise introduction;
3. photographs with credits;
4. spiritual and historical context;
5. map and directions;
6. practical visiting information;
7. accessibility notes where verified;
8. sources and last verification date;
9. correction/reporting link.

Service schedules and opening information must be visually marked with the verification date. Stale or uncertain schedules must be withheld or clearly labeled as requiring confirmation.

### 2.3 Proposed repository layout

The implementation phase should evolve toward the following structure without removing the existing documentation:

- AGENTS.md — repository-wide instructions
- README.md — project overview and contributor entry point
- docs/
  - PROJECT_CHARTER.md
  - TECHNICAL_ROADMAP.md
  - CONTENT_GUIDE.md
  - EDITORIAL_WORKFLOW.md
  - DATA_DICTIONARY.md
  - decisions/ — Architecture Decision Records
- src/
  - components/ — small reusable presentational components
  - layouts/ — shared page shells and metadata handling
  - pages/ — locale-aware route templates
  - content/
    - places/ — language-neutral place records and localized narratives
    - routes/ — pilgrimage route records and narratives
    - articles/ — history, lives of saints, and guides
    - sources/ — normalized source registry
    - people/ — optional future registry for saints and historical figures
  - i18n/ — interface strings, locale configuration, and route-name mapping
  - lib/ — pure validation, content, geographic, and SEO helpers
  - styles/ — tokens, base styles, typography, and shared patterns
  - content.config.ts — content collection schemas
- public/
  - icons, manifests, and small immutable assets
  - robots and Cloudflare configuration files generated or maintained as appropriate
- scripts/
  - content validation, link checking, media-manifest validation, and data exports
- tests/
  - unit, content, accessibility, and end-to-end tests

The place identity and its localized narrative should be separate. A stable place ID must survive renaming, spelling changes, and slug changes. Presentation components must not contain factual content.

### 2.4 Architectural boundaries

- Content is authoritative only after editorial approval.
- Schemas define what is allowed to render; templates do not silently repair malformed content.
- Language-neutral facts are stored once. Localized prose and display labels are stored per locale.
- Source records are first-class data and can be reused by many claims or places.
- Media metadata is stored in Git; large original media files are not.
- Generated files are never edited by hand.
- No UI framework should be added unless repeated interactive requirements justify it.
- Search, CMS, database, and API layers remain optional adapters, not foundations of the first release.

## 3. Multilingual architecture

### 3.1 Locale model

Use three internal locale keys from the beginning:

| Internal key | Visible language | HTML language tag | Search alternate tag |
| --- | --- | --- | --- |
| sr | Serbian Cyrillic | sr-Cyrl-ME | sr-ME |
| ru | Russian | ru | ru |
| en | English | en | en |

Serbian Cyrillic is the default and source language. The architecture should permit additional locale definitions without changing place IDs or factual records.

Recommended URL behavior:

- Serbian default pages have no locale prefix.
- Russian pages use /ru/.
- English pages use /en/.
- Section paths may be localized, but each route must be generated from a stable route key.
- Slugs should be stable, human-readable ASCII transliterations for reliable sharing and tooling; visible titles remain in the correct script.
- The secondary domain permanently redirects to the matching canonical URL on svetinje.me.

Illustrative URL pattern:

- Serbian: /svetinje/manastir-ostrog/
- Russian: /ru/svyatyni/monastyr-ostrog/
- English: /en/holy-places/ostrog-monastery/

The exact public path vocabulary is a content and SEO decision that must be approved before implementation.

### 3.2 Separation of content types

Keep three layers distinct:

1. Language-neutral facts: place ID, type, coordinates, municipality, source links, media IDs, verification metadata.
2. Localized editorial content: name, summary, history, spiritual significance, practical notes, captions, alt text, and SEO fields.
3. Localized interface text: navigation, buttons, filters, form labels, errors, and accessibility labels.

Never duplicate coordinates, identifiers, or source records across translations. Every translation points to the same stable place ID.

### 3.3 Translation workflow

Each localized entry should carry:

- locale;
- translation status: missing, draft, review, approved, or published;
- translator or contributor;
- reviewer;
- source content revision;
- translated and reviewed dates;
- notes about terminology decisions.

A localized page is generated only when its translation is approved. Do not publish Serbian text under a Russian or English URL as a fallback. Missing translations should link to an available language rather than create thin or mislabeled pages.

Maintain a terminology glossary for ecclesiastical titles, saints, feast names, place types, and Montenegrin administrative names. Serbian Cyrillic is the reference terminology. Human review is required for all public translations; machine translation may assist drafting but must never publish automatically.

### 3.4 Locale routing and SEO behavior

Every published translation set must include:

- the correct HTML lang value;
- a self-referencing canonical URL;
- reciprocal alternate links for every available translation;
- an x-default alternate, normally the Serbian landing page;
- a visible, keyboard-accessible language switcher linking to the corresponding place, not merely the other language home page.

Do not redirect users solely by IP or browser language. A first-visit suggestion may be offered without replacing the crawlable URL or user choice.

## 4. Content storage and management

### 4.1 Initial source of truth

Use Git as the initial editorial source of truth:

- YAML for facts, source records, media manifests, and relationships.
- Markdown for localized long-form narratives.
- Pull requests for editorial review and audit history.
- Schema validation and link checking in continuous integration.
- CODEOWNERS or an equivalent review rule for sensitive content directories.
- Protected main branch with required checks and at least one qualified reviewer.

This is preferable to an early CMS because the initial content set is curated, accuracy-sensitive, and likely maintained by a small team. It also makes every factual change reviewable.

### 4.2 Editorial states

Recommended lifecycle:

- research — working notes, never rendered;
- draft — structured but incomplete;
- fact review — sources and claims checked;
- language review — Serbian style or translation checked;
- approved — eligible for preview;
- published — included in production;
- needs re-verification — still visible only when safe, with warnings for time-sensitive fields;
- archived — retained in history but not listed.

The build must include only published records. Research notes that cannot be published for copyright or privacy reasons should live in a protected research system, not the public repository.

### 4.3 Provenance and verification

Every source record should include:

- stable source ID;
- title;
- publisher or institution;
- source type: official church, diocesan, monastery, academic, archival, government, or other;
- URL or bibliographic reference;
- publication date when known;
- access date for online material;
- original language;
- relevant page or section;
- copyright or reuse notes;
- status: active, unavailable, superseded, or disputed.

Time-sensitive fields require their own verified-at, verified-by, source IDs, and optional valid-until values. A global page update date is not sufficient for schedules or contacts.

### 4.4 Media management

For the prototype, use only a small number of optimized, explicitly cleared images. As the library grows:

- store master files in a private or controlled Cloudflare R2 bucket;
- serve public derivatives through assets.svetinje.me or another custom domain;
- keep media metadata and object keys in Git;
- record creator, credit line, copyright owner, license, permission evidence, capture date when appropriate, focal point, and allowed uses;
- store localized alt text and captions separately from the binary;
- remove EXIF geolocation from public downloads unless intentional and safe;
- generate responsive AVIF and WebP derivatives while preserving a high-quality archival original;
- define cache purge behavior when a copyrighted asset is withdrawn.

Do not use the r2.dev development hostname for production media.

### 4.5 Future CMS decision

Evaluate a headless CMS only when non-technical editors cannot work effectively through Git pull requests. Any CMS must:

- preserve stable IDs and the documented schemas;
- support field-level multilingual content and editorial states;
- retain source and verification metadata;
- provide role-based approval and audit history;
- export content in a portable format;
- trigger preview builds without publishing directly;
- avoid locking media rights information inside opaque fields.

A CMS should become an adapter to the content model, not redefine it. A custom admin application is not justified before launch.

## 5. Data structure for monasteries, churches, and holy places

### 5.1 Core place record

A language-neutral place record should contain these groups:

Identity:

- id — immutable machine identifier;
- type — monastery, church, chapel, cathedral, skete, hermitage, holy spring, cave, shrine, or other approved category;
- status — editorial state;
- parent place ID — for a church or chapel within a monastery complex;
- alternate identifiers — optional identifiers from trusted external catalogues.

Ecclesiastical context:

- diocese ID;
- jurisdiction, only when verified;
- dedication or patron reference;
- monastic community type where relevant and appropriate;
- associated saints, relics, feasts, or traditions through referenced entities, not unstructured tags.

Location:

- country code, default ME;
- municipality;
- settlement;
- postal address if verified;
- latitude and longitude;
- coordinate accuracy: exact entrance, complex centroid, settlement-level, or approximate;
- elevation if verified and useful;
- directions reference and parking or access notes through localized practical content.

Relationships:

- parent complex;
- nearby places;
- pilgrimage route IDs;
- related articles;
- source IDs;
- media IDs.

Verification:

- created and updated timestamps;
- fact reviewer;
- reviewed-at date;
- next-review date;
- unresolved verification notes;
- publication readiness.

### 5.2 Localized place record

Each place and locale pair should include:

- place ID and locale;
- preferred display name;
- short name;
- alternate historical names with context;
- localized slug;
- one-sentence summary;
- introduction;
- history;
- spiritual significance;
- architecture and art, when sourced;
- relics, icons, or traditions, when sourced;
- practical visiting notes;
- accessibility notes;
- photo captions and alt text references;
- SEO title and description;
- translation and review metadata.

Do not force every place to populate every narrative section. An absent verified fact is better than filler.

### 5.3 Practical information

Store volatile practical facts separately from historical content:

- public phone, email, and official website;
- visiting hours;
- service schedule;
- seasonal exceptions;
- dress or conduct guidance when officially sourced;
- accessibility, road, public transport, parking, and walking information;
- last verification date;
- source IDs;
- valid-from and valid-until dates;
- display policy when stale.

Never infer a liturgical schedule from previous years. When information is stale, show a request to confirm with the official contact or hide the field.

### 5.4 Media record

Each media item should contain:

- media ID and R2 object key;
- media type;
- dimensions and aspect ratio;
- photographer or creator;
- copyright owner;
- license or written permission reference;
- required credit line;
- capture date when appropriate;
- related place IDs;
- focal point;
- publication status;
- localized alt text and captions;
- withdrawal or expiry information.

### 5.5 Source-to-claim traceability

For high-value historical claims, allow paragraph or section-level source references rather than only a generic page bibliography. The rendered page should show a readable sources section; the internal record should preserve enough detail for an editor to verify each claim.

### 5.6 Validation rules

Build-time validation should reject:

- duplicate IDs or locale slugs;
- invalid coordinates or coordinates outside expected bounds unless explicitly approved;
- published places without a Serbian Cyrillic name and minimum summary;
- published historical narratives without sources;
- media without rights and credit metadata;
- translated pages without an approved translation state;
- circular parent relationships;
- references to missing places, routes, sources, or media;
- time-sensitive facts without a verification date;
- SEO titles or descriptions outside agreed editorial limits.

## 6. Maps and geographic data

### 6.1 Coordinate standard

Store coordinates in WGS 84, EPSG:4326. In GeoJSON, order coordinates as longitude then latitude. Preserve an accuracy classification and source for every coordinate. Do not expose a falsely precise pin when only an approximate location is verified.

Coordinates should be verified against at least one authoritative source and, for important or ambiguous locations, a second source or direct field confirmation.

### 6.2 Map architecture

Use MapLibre GL JS as a replaceable presentation layer:

- build a generated GeoJSON feature collection from approved place records;
- load the map only when it enters the relevant page or when the user requests it;
- cluster markers at low zoom;
- use distinct, accessible symbols for place types;
- provide keyboard-operable controls and a synchronized HTML result list;
- ensure every place remains discoverable without the map;
- lazy-load map code, style, and tile requests;
- include visible attribution required by every data and tile provider.

The initial detail-page map can be non-interactive or click-to-load to protect performance and privacy. The main map page may provide filters for place type, municipality, accessibility, and verified route membership.

### 6.3 Basemap and tile strategy

MapLibre is a renderer, not a basemap license. Keep the style URL and tile provider in configuration.

Prototype recommendation:

- use a reputable hosted vector-tile provider with clear pricing, attribution, privacy, and production terms;
- restrict keys by domain;
- avoid demo styles and endpoints in production;
- document provider replacement steps.

Scale-up option:

- produce or procure a Montenegro-focused PMTiles or equivalent vector-tile archive;
- store it in R2 behind a custom domain and cache;
- maintain an update and attribution process;
- assess whether the operational burden is justified before self-hosting.

Do not use the community OpenStreetMap standard tile server as an assumed production backend. Its service is best-effort and governed by a usage policy. OpenStreetMap data attribution must remain visible.

### 6.4 Geocoding and directions

Geocoding should be an editorial import tool, not a runtime dependency. Editors must review and save the resulting coordinates with source metadata. Do not submit bulk requests to public community geocoders.

For directions, initially link to external navigation services using coordinates. Do not build routing infrastructure before pilgrimage routes and user needs are validated. Curated pilgrimage routes should be stored as GeoJSON LineString or MultiLineString geometry with distance, ascent, difficulty, surface, safety notes, and verification dates where available.

### 6.5 Privacy and safety

- Do not collect precise visitor location unless a feature genuinely requires it and the user consents.
- The browser geolocation control must be optional and explain its purpose.
- Avoid publishing sensitive coordinates when a church authority or conservation concern requires discretion.
- Do not embed third-party maps in a way that sends data before consent when a lower-impact alternative exists.
- Provide a process to report incorrect or unsafe geographic information.

## 7. SEO strategy

### 7.1 Technical SEO

Generate for every published page:

- unique localized title and meta description;
- absolute canonical URL;
- reciprocal language alternate links;
- Open Graph and social metadata;
- crawlable breadcrumb navigation;
- semantic headings and landmark structure;
- a localized XML sitemap containing canonical published URLs;
- robots.txt referencing the sitemap;
- descriptive image filenames, dimensions, alt text, and optional image sitemap data;
- a useful 404 page in every supported interface language.

Preview and pages.dev URLs must be noindex. The secondary domain should issue permanent redirects to the primary domain and must not serve duplicate pages.

### 7.2 Structured data

Use JSON-LD that accurately reflects visible content. Suitable schema.org concepts may include:

- WebSite and Organization for the project;
- WebPage, AboutPage, CollectionPage, and BreadcrumbList;
- Place with GeoCoordinates for sacred locations;
- Church for church entities where semantically correct;
- TouristAttraction only when the page and place genuinely fit that concept;
- ImageObject for licensed photography;
- Article for historical or guide content.

Do not use LocalBusiness merely to seek a rich result when the place is not represented as a business. Structured data must not include schedules, addresses, reviews, or claims absent from the visible verified page. Validate with Schema.org tools and Google Rich Results Test where applicable.

### 7.3 Content SEO

Create durable, source-backed content clusters rather than mass-generated pages:

- one canonical page per holy place;
- municipality and region catalogue pages;
- carefully researched pilgrimage routes;
- historical topics and lives of saints linked to relevant places;
- practical guides based on verified information;
- strong internal links between places, routes, people, sources, and articles.

Serbian Cyrillic content is primary. Russian and English pages should be genuine editorial translations, not keyword substitutions. Page titles should prioritize the recognized sacred-place name and Montenegro context without sensational wording.

### 7.4 Search operations

Before launch:

- verify svetinje.me and the secondary domain in Google Search Console and Bing Webmaster Tools;
- submit canonical sitemaps;
- test hreflang reciprocity, canonicals, redirects, structured data, and mobile rendering;
- establish a monthly review of coverage, Core Web Vitals, crawl errors, and search queries;
- track content corrections separately from traffic goals.

SEO success metrics should include indexed verified pages, correct language targeting, non-brand discovery, useful engagement, and correction turnaround—not only raw visits.

## 8. Cloudflare deployment

### 8.1 Initial deployment model

Recommended launch platform: Cloudflare Pages connected to the GitHub repository.

Production configuration:

- production branch: main;
- install command: pnpm install with a frozen lockfile;
- build command: pnpm build;
- output directory: dist;
- Node and pnpm versions pinned in repository configuration;
- production custom domain: svetinje.me;
- www hostname redirected to the canonical hostname selected by the owner;
- svetinjecrnegore.me permanently redirected path-for-path to svetinje.me;
- automatic preview deployments for pull requests and approved branches;
- Cloudflare Access protection for previews if unpublished material must remain private.

Static generation should not require secrets. Map or analytics public configuration may use environment variables, but sensitive keys must never be exposed in browser bundles.

### 8.2 CI and release gates

A pull request must pass:

- dependency installation from lockfile;
- formatting and linting;
- strict TypeScript checks;
- content schema and source validation;
- duplicate ID and slug checks;
- internal link checks;
- production build;
- unit and critical Playwright tests;
- automated accessibility checks;
- Lighthouse budgets on representative pages;
- optional visual snapshots for key layouts and scripts.

Production deployment occurs only from reviewed main. Enable branch protection and required checks. Keep Cloudflare rollback available, and document a release owner and incident procedure.

### 8.3 Caching and security

- Fingerprinted static assets: long-lived immutable browser caching.
- HTML: revalidate so content updates propagate promptly.
- Media: versioned object keys and explicit cache policies.
- Security headers: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and frame restrictions, tested before enforcement.
- HTTPS only with automatic TLS.
- No inline third-party scripts unless documented and allowed by policy.
- Preview deployments: noindex and, when needed, authenticated.
- Forms added later: Turnstile, rate limiting, validation, and abuse monitoring.

MapLibre worker and asset requirements must be accounted for in the Content Security Policy without opening broader script sources than necessary.

### 8.4 Media on R2

When R2 is introduced:

- keep the bucket private by default;
- publish through a controlled custom domain such as assets.svetinje.me;
- disable the r2.dev public endpoint in production;
- apply cache and CORS rules narrowly;
- use versioned keys instead of overwriting cached assets;
- purge cache when a legal or rights withdrawal requires immediate removal;
- back up original rights records independently from the delivery bucket.

### 8.5 Observability and operations

At launch, monitor:

- Pages build and deployment failures;
- uptime and certificate health;
- 404 and redirect patterns;
- Web Analytics and Core Web Vitals;
- broken external sources;
- stale practical-information dates;
- media errors and excessive asset sizes;
- correction requests and response time.

Add a runtime error service only if Workers or meaningful browser application logic is introduced.

## 9. Development phases from prototype to launch

No phase begins application coding until the roadmap and its major decisions are approved.

### Phase 0 — Governance and discovery

Deliverables:

- approve the technology, URL, content, map, and Cloudflare decisions;
- create Architecture Decision Records for the framework, locale URL policy, content model, map provider strategy, and media storage;
- define editorial roles and source acceptance criteria;
- define terminology and transliteration rules;
- prepare content, media-rights, and correction policies;
- identify 5–10 representative places for the prototype.

Exit criteria:

- owner approval of major architecture;
- named factual, language, and publishing reviewers;
- no unresolved ambiguity about canonical domains or Serbian URL behavior;
- representative content has credible sources and image permissions.

### Phase 1 — Content and data prototype

Deliverables:

- content schemas for places, translations, sources, media, and routes;
- a source registry and verification workflow;
- Serbian Cyrillic records for representative monasteries, churches, and other holy places;
- content validation, duplicate checks, and generated sample GeoJSON;
- wireframes and a design-token direction, without committing to decorative detail too early.

Exit criteria:

- every prototype claim is traceable to an accepted source;
- schemas handle different place types without placeholder fields;
- at least one nested complex, one uncertain coordinate, and one volatile schedule are tested;
- reviewers can understand Git diffs and approval states.

### Phase 2 — Static website prototype

Deliverables:

- accessible Astro page shell and Serbian default routes;
- home, catalogue, place detail, about, sources, and correction pages;
- responsive typography and image system;
- static or click-to-load detail map;
- initial Cloudflare Pages preview environment;
- automated build, schema, accessibility, and performance checks.

Exit criteria:

- representative pages work without client JavaScript;
- no invented or placeholder facts reach the public preview;
- WCAG 2.2 AA review passes for core journeys;
- performance budgets pass on mobile test profiles;
- the preview is protected if content permissions require it.

### Phase 3 — Multilingual and map beta

Deliverables:

- approved Russian and English translations for the representative set;
- locale-aware routing and language switcher;
- canonicals, reciprocal hreflang, localized sitemaps, and social metadata;
- MapLibre catalogue map with accessible list fallback and filters;
- production tile provider selected and attribution verified;
- translation status and terminology checks.

Exit criteria:

- no localized URL contains unreviewed fallback content;
- language switching preserves the current place where a translation exists;
- map data and HTML catalogue derive from the same approved records;
- SEO and structured-data validation pass for all three locales.

### Phase 4 — Content expansion and launch candidate

Deliverables:

- agreed minimum catalogue of verified places;
- curated pilgrimage routes and historical articles only where sources support them;
- full media-rights audit;
- R2 and image delivery if required by library size;
- correction workflow and stale-data reporting;
- cross-browser, device, accessibility, security, and editorial quality assurance;
- redirect plan for both domains and all changed preview slugs;
- backup, rollback, and incident runbooks.

Exit criteria:

- 100 percent of published pages meet minimum source requirements;
- all public images have documented permission and credit;
- no critical accessibility, security, broken-link, or data-validation defects;
- canonical, hreflang, robots, sitemap, and redirects are verified;
- editors approve the final Serbian, Russian, and English launch set.

### Phase 5 — Controlled launch

Deliverables:

- connect svetinje.me to production;
- activate path-preserving redirects from svetinjecrnegore.me and the selected www policy;
- submit sitemaps and verify search properties;
- monitor deployment, errors, performance, indexing, and correction channels;
- communicate the editorial policy and last-verification dates clearly.

Exit criteria:

- production health remains stable through the observation window;
- rollback has been tested;
- search engines can crawl only canonical production URLs;
- ownership exists for urgent corrections and rights requests.

### Phase 6 — Post-launch iteration

Prioritize evidence from users and editorial work:

1. improve content completeness and verification freshness;
2. refine catalogue search and filters;
3. add pilgrimage routes with validated safety and geographic data;
4. consider a CMS when editorial throughput demonstrates the need;
5. add Workers or a search service only when static search no longer performs adequately;
6. evaluate audio guides, virtual tours, 3D models, and a mobile application as separate products with their own rights, accessibility, storage, and maintenance plans.

Do not allow future features to weaken source traceability or make the public site dependent on proprietary content formats.

## Approval decisions required before implementation

The project owner should explicitly approve:

1. Astro static-first architecture.
2. Serbian unprefixed URLs and localized Russian/English prefixes.
3. Exact localized section paths and transliteration policy.
4. Git-based editorial workflow for the first release.
5. The initial map tile provider and its budget, terms, and attribution.
6. Cloudflare Pages as the initial host.
7. R2 and image transformations when the media library moves beyond the prototype.
8. Editorial roles, source policy, and stale practical-information policy.
9. Analytics and privacy policy.
10. The minimum verified catalogue and translation coverage required for launch.

## Principal risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Unverified facts or schedules | Field-level sources, verification dates, review gates, and automatic staleness checks |
| Translation drift | Stable place IDs, source revision tracking, glossary, and human review |
| Copyright violations | Rights metadata required by schema; controlled originals; withdrawal process |
| Duplicate multilingual indexing | Canonicals, reciprocal hreflang, localized sitemaps, noindex previews, permanent domain redirects |
| Map provider lock-in or outage | MapLibre abstraction, configurable style/tile source, accessible non-map catalogue |
| Performance loss from maps and photos | Static rendering, lazy map loading, responsive image derivatives, performance budgets |
| Early infrastructure complexity | No initial database, CMS, custom admin, or SSR without a demonstrated requirement |
| Sensitive or imprecise locations | Accuracy classifications, authority review, and the ability to publish approximate or withheld coordinates |
| Stale practical information | Validity metadata, scheduled review reports, visible verification dates, and safe hiding rules |
| Architectural drift | Decision records, protected main branch, documentation updates, and approval for major changes |

## Official technical references

- [Astro internationalization reference](https://docs.astro.build/en/reference/modules/astro-i18n/)
- [Astro configuration and i18n routing](https://docs.astro.build/en/reference/configuration-reference/)
- [Astro Content Collections](https://docs.astro.build/en/guides/content-collections/)
- [Astro Zod integration](https://docs.astro.build/en/reference/modules/astro-zod/)
- [Cloudflare Pages: Astro](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)
- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages preview deployments](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Cloudflare Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/)
- [Cloudflare R2 public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare Images overview](https://developers.cloudflare.com/images/get-started/introduction/)
- [MapLibre GL JS documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [Google guidance for localized page versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
