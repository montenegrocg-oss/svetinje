import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadCalendarDays } from "../src/lib/calendar/content.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

test("gallery output is derived only from zero, one, or many real media items", async () => {
  const [gallery, verifier] = await Promise.all([
    source("src/components/place-detail/PlaceDetailGallery.astro"),
    source("scripts/verify-production-output.mjs"),
  ]);

  assert.match(gallery, /primaryImage && <section class="place-detail-gallery"/);
  assert.match(gallery, /secondaryImages\.map/);
  assert.match(gallery, /data-gallery-count=\{place\.galleryImages\.length\}/);
  assert.doesNotMatch(gallery, /placeholderSlots|data-gallery-slot|place-detail-gallery__placeholder|Фото у припреми/);
  assert.match(verifier, /place\.galleryImages\.length === 0 && gallery/);
  assert.match(verifier, /exactly \$\{place\.galleryImages\.length\} real media item/);
});

test("route backlinks render only loader-supplied publication-visible routes", async () => {
  const [backlinks, detailRoute, routeLoader, verifier] = await Promise.all([
    source("src/components/routes/PlaceRouteBacklinks.astro"),
    source("src/pages/svetinje/[slug].astro"),
    source("src/lib/content/routes.ts"),
    source("scripts/verify-production-output.mjs"),
  ]);

  assert.match(detailRoute, /loadVisibleRoutes\(\)/);
  assert.match(detailRoute, /routesForPlace\(routes, place\.id\)/);
  assert.match(routeLoader, /isEditorialPreviewBuild/);
  assert.match(routeLoader, /if \(!preview && policy\.public_publication_locked\) return \[\]/);
  assert.match(backlinks, /from\.length > 0/);
  assert.match(backlinks, /to\.length > 0/);
  assert.doesNotMatch(backlinks, /from\.length === 0|copy\.empty|place-routes-title/);
  assert.match(verifier, /renders an empty pilgrimage-route section/);
  assert.match(verifier, /missing a publication-visible linked route/);
});

test("non-functional place CTAs are absent while Favorites remains active", async () => {
  const [hero, copy] = await Promise.all([
    source("src/components/place-detail/PlaceDetailHero.astro"),
    source("src/i18n/public-copy.ts"),
  ]);

  for (const removed of ["Планирај посјету", "Изгради руту", "Plan a visit", "Build a route", "Запланировать посещение", "Построить маршрут"]) {
    assert.doesNotMatch(`${hero}\n${copy}`, new RegExp(removed));
  }
  assert.doesNotMatch(hero, /data-place-detail-action|place-profile-action-status/);
  assert.match(hero, /data-favorite-toggle/);
  assert.match(hero, /toggleFavorite/);
  assert.match(hero, /subscribeFavorites/);
});

test("YouTube is click-to-load with no initial iframe or resource hint", async () => {
  const [gallery, layout] = await Promise.all([
    source("src/components/place-detail/PlaceDetailGallery.astro"),
    source("src/layouts/BaseLayout.astro"),
  ]);

  assert.doesNotMatch(gallery, /<iframe\b/);
  assert.match(gallery, /<button type="button" data-youtube-load/);
  assert.match(gallery, /button\.addEventListener\("click"/);
  assert.match(gallery, /document\.createElement\("iframe"\)/);
  assert.match(gallery, /youtube-nocookie\.com\/embed/);
  assert.match(gallery, /iframe\.title = title/);
  assert.doesNotMatch(`${gallery}\n${layout}`, /rel="(?:preconnect|prefetch|dns-prefetch)"[^>]*(?:youtube|ytimg)/i);
  assert.doesNotMatch(gallery, /localStorage|sessionStorage|document\.cookie/);
});

test("privacy and storage copy describe conditional YouTube loading in every locale", async () => {
  const legal = await source("src/i18n/legal-copy.ts");

  for (const phrase of [
    "Веза се успоставља тек када корисник изричито изабере",
    "Соединение устанавливается только после явного выбора пользователем",
    "The connection is established only after the user explicitly selects",
  ]) assert.match(legal, new RegExp(phrase));
  assert.match(legal, /YouTube\/Google/);
  assert.match(legal, /не памти у колачићу, localStorage-у или sessionStorage-у/);
  assert.match(legal, /не сохраняется в cookie, localStorage или sessionStorage/);
  assert.match(legal, /not remembered in a cookie, localStorage, or sessionStorage/);
  assert.match(legal, /info@svetinje\.me/);
});

test("calendar copy is honest while canonical coverage remains exactly 153 days", async () => {
  const [copy, days, policy] = await Promise.all([
    source("src/i18n/public-copy.ts"),
    loadCalendarDays(ROOT),
    source("validation/publication-policy.json").then(JSON.parse),
  ]);

  assert.match(copy, /Православни календар — август–децембар 2026\./);
  assert.match(copy, /Православный календарь — август–декабрь 2026/);
  assert.match(copy, /Orthodox calendar — August–December 2026/);
  assert.equal(days.length, 153);
  assert.equal(days[0]?.date, "2026-08-01");
  assert.equal(days.at(-1)?.date, "2026-12-31");
  assert.equal(days.some((day) => day.date < "2026-08-01" || day.date > "2026-12-31"), false);
  assert.equal(policy.public_publication_locked, true);
});
