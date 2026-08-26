import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  routeConfig,
  staticEquivalentForPath,
  staticLocaleLinksForRoute,
} from "../src/i18n/config.ts";
import { legalCopy } from "../src/i18n/legal-copy.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const source = (file) => readFile(path.join(ROOT, file), "utf8");

async function sourceFiles(directory) {
  const entries = await readdir(path.join(ROOT, directory), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test("privacy and storage routes exist with symmetric locale equivalents", async () => {
  assert.deepEqual(routeConfig.privacy, {
    sr: "/politika-privatnosti/",
    ru: "/ru/privacy/",
    en: "/en/privacy/",
  });
  assert.deepEqual(routeConfig.cookies, {
    sr: "/kolacici-i-lokalno-skladistenje/",
    ru: "/ru/cookies/",
    en: "/en/cookies/",
  });
  assert.deepEqual(staticLocaleLinksForRoute("privacy"), routeConfig.privacy);
  assert.deepEqual(staticLocaleLinksForRoute("cookies"), routeConfig.cookies);
  for (const route of [routeConfig.privacy, routeConfig.cookies]) {
    for (const pagePath of Object.values(route)) assert.deepEqual(staticEquivalentForPath(pagePath), route);
  }

  const [srPrivacy, srStorage, localizedPaths, localizedPage] = await Promise.all([
    source("src/pages/politika-privatnosti/index.astro"),
    source("src/pages/kolacici-i-lokalno-skladistenje/index.astro"),
    source("src/lib/localized-static-paths.ts"),
    source("src/components/LocalizedPublicPage.astro"),
  ]);
  assert.match(srPrivacy, /<LegalPage locale="sr" kind="privacy" \/>/);
  assert.match(srStorage, /<LegalPage locale="sr" kind="storage" \/>/);
  assert.match(localizedPaths, /localizedStaticRouteKeys/);
  assert.match(localizedPage, /page === "privacy" && <LegalPage locale=\{locale\} kind="privacy" \/>/);
  assert.match(localizedPage, /page === "cookies" && <LegalPage locale=\{locale\} kind="storage" \/>/);
});

test("legal pages use shared metadata, canonical routes, and language parity", async () => {
  const [page, layout, metadata] = await Promise.all([
    source("src/components/LegalPage.astro"),
    source("src/layouts/BaseLayout.astro"),
    source("src/components/PageMetadata.astro"),
  ]);
  assert.match(page, /canonicalPath=\{routeFor\(locale, route\)\}/);
  assert.match(page, /locale=\{locale\}/);
  assert.match(layout, /staticEquivalentForPath\(canonicalPath\)/);
  assert.match(metadata, /rel="canonical"/);
  assert.match(metadata, /hreflang/);
  assert.match(metadata, /x-default/);
  for (const locale of ["sr", "ru", "en"]) {
    assert.ok(legalCopy[locale].privacy.title);
    assert.ok(legalCopy[locale].storage.title);
    assert.equal(legalCopy[locale].privacy.sections.length, legalCopy.sr.privacy.sections.length);
    assert.equal(legalCopy[locale].storage.rows.length, 3);
  }
});

test("footer exposes both legal pages in all locales without removing existing links", async () => {
  const footer = await source("src/components/Footer.astro");
  assert.match(footer, /routeFor\(locale, "about"\)/);
  assert.match(footer, /routeFor\(locale, "sources"\)/);
  assert.match(footer, /routeFor\(locale, "privacy"\)/);
  assert.match(footer, /routeFor\(locale, "cookies"\)/);
  assert.equal(legalCopy.sr.footer.privacy, "Политика приватности");
  assert.equal(legalCopy.sr.footer.storage, "Колачићи и локално складиштење");
  assert.equal(legalCopy.ru.footer.privacy, "Политика конфиденциальности");
  assert.equal(legalCopy.ru.footer.storage, "Cookies и локальное хранилище");
  assert.equal(legalCopy.en.footer.privacy, "Privacy Policy");
  assert.equal(legalCopy.en.footer.storage, "Cookies & Local Storage");
});

test("disclosures match audited storage and provider behavior", async () => {
  for (const locale of ["sr", "ru", "en"]) {
    const copy = JSON.stringify(legalCopy[locale]);
    assert.match(copy, /svetinje:favorites:v1/);
    assert.match(copy, /Cloudflare/);
    assert.match(copy, /MapTiler/);
    assert.match(copy, /_cfuvid/);
    assert.match(copy, /localStorage/);
    assert.match(copy, /info@svetinje\.me/);
    assert.doesNotMatch(copy, /\b_ga\b|\b_gid\b|\b_fbp\b|cookie_consent/i);
    assert.doesNotMatch(copy, /we collect no data|не собираем никаких данных|не прикупљамо никакве податке/i);
  }

  const page = await source("src/components/LegalPage.astro");
  assert.match(page, /<table class="legal-storage-table">/);
  assert.match(page, /data-label=\{storageCopy\.headers/);
  assert.doesNotMatch(page, /MapCanvas|youtube-nocookie|localStorage\.setItem/);
});

test("legal work introduces no consent state or optional tracker scripts", async () => {
  const files = await sourceFiles("src");
  const combined = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(combined, /googletagmanager|google-analytics|\bgtag\s*\(|connect\.facebook|Meta Pixel|clarity\.ms|hotjar/i);
  assert.doesNotMatch(combined, /svetinje:consent|cookie[_-]?consent|privacy[_-]?preferences/i);
  assert.doesNotMatch(combined, /Accept all|Reject all|Прихвати све|Одбиј све|Принять все|Отклонить все/);
});
