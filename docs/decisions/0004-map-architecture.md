# ADR 0004: Map architecture

- Status: Accepted
- Date: 2026-08-03
- Decision owner: Project owner
- Scope: Prototype map presentation and geographic data

## Context

Maps are important for pilgrims and visitors, but map rendering, geographic accuracy, provider terms, attribution, performance, privacy, and accessibility are separate concerns. The project must not be locked to one tile provider or present approximate coordinates as exact.

No production tile provider has yet been approved.

## Decision

Use MapLibre GL JS as the interactive map renderer.

Keep the tile source, style URL, attribution, API key configuration, and provider-specific behavior behind a replaceable configuration boundary.

Store approved geographic facts independently from the map renderer:

- coordinates use WGS 84, EPSG:4326;
- GeoJSON uses longitude, latitude order;
- every coordinate has a source and accuracy classification;
- the generated map dataset contains only content eligible for publication;
- HTML catalogue and map features derive from the same approved place records.

Map interaction is an enhancement. Every place must remain discoverable and usable through semantic HTML lists and links without the interactive map.

## Data and rendering boundaries

The geographic source of truth is structured project content, not a marker placed manually in a map component.

MapLibre is responsible for presentation only. It does not determine:

- whether a place is real;
- the accuracy of a coordinate;
- a place name;
- a route’s safety;
- a service schedule;
- provider licensing;
- whether sensitive coordinates may be published.

Generated GeoJSON is a build artifact and must not become the editorial source.

## Coordinate accuracy

Use an explicit accuracy value such as:

- exact entrance;
- complex centroid;
- approximate area;
- settlement level;
- withheld.

An accuracy label describes confidence and intended display. It must not be upgraded without evidence. If only an approximate position is verified, the interface must not imply entrance-level precision.

Sensitive coordinates may be withheld or generalized after appropriate review.

## Tile-provider policy

For the prototype:

- select a production-capable hosted vector-tile provider only after reviewing terms, privacy, pricing, attribution, key restrictions, availability, and expected traffic;
- keep provider credentials outside committed content;
- restrict browser-exposed keys by approved domains where the provider supports it;
- avoid demo tiles and demo style endpoints in production;
- preserve visible attribution;
- document how to replace the provider.

The community OpenStreetMap standard tile service is not the default production backend. OpenStreetMap-derived data must be attributed according to applicable terms.

A future self-hosted vector archive, including PMTiles or an equivalent format, may be considered if traffic, cost, offline requirements, or control justify the operational work.

## Interaction, performance, and accessibility

- Lazy-load interactive map resources.
- A detail page may use a static or click-to-load map before loading the full renderer.
- The main map must have a synchronized, keyboard-accessible result list.
- Marker meaning must not rely on color alone.
- Controls require accessible names and usable focus order.
- The map must not block access to place details.
- Geolocation must be optional and require an explicit user action.
- Essential content must not exist only inside a popup.

## Editorial geocoding

Geocoding is a research aid, not an authoritative source by itself. An editor must review a suggested result, record the accepted coordinate and accuracy, cite an allowed source, and route the change through factual review.

Bulk use of public community geocoders is not approved. Runtime geocoding is not part of the prototype.

## Privacy and safety

- Do not request visitor location on page load.
- Do not store precise visitor location for the prototype.
- Do not publish a sensitive location merely because it appears in external map data.
- External navigation links must use approved coordinates.
- Route safety or accessibility statements require their own verification and dates.

## Rationale

MapLibre provides a capable, open-source renderer while allowing the project to change basemap suppliers. A separate geographic data model protects accuracy and portability. A non-map catalogue ensures accessibility, crawlability, resilience, and a useful experience on low-powered devices.

## Consequences

Positive consequences:

- provider replacement does not require rewriting content;
- geographic data can support maps, exports, and future mobile use;
- accessibility is designed into the information architecture;
- map JavaScript does not burden every page.

Trade-offs:

- a tile provider still must be selected and governed;
- attribution and key configuration require operational review;
- coordinate verification adds editorial work;
- advanced routing and offline maps remain out of scope.

## Revisit triggers

A new or amended ADR is required for:

- selecting the production tile provider;
- self-hosting vector tiles;
- offline map downloads;
- turn-by-turn routing;
- storing user location;
- route safety guarantees;
- 3D terrain or building layers with material performance or licensing impact.

## Related documents

- ../DATA_DICTIONARY.md
- ../CONTENT_GUIDE.md
- ../EDITORIAL_WORKFLOW.md
- ../TECHNICAL_ROADMAP.md
