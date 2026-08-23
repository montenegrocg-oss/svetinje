import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

const root = process.cwd();
const placesRoot = path.join(root, "content", "places");
const locales = ["sr", "ru", "en"];
const placeIds = (await readdir(placesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const counts = Object.fromEntries(locales.map((locale) => [locale, new Map()]));
for (const placeId of placeIds) {
  for (const locale of locales) {
    const file = path.join(placesRoot, placeId, "narratives", `${locale}.md`);
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        counts[locale].set("missing", (counts[locale].get("missing") ?? 0) + 1);
        continue;
      }
      throw error;
    }
    const closing = text.indexOf("\n---\n", 4);
    if (!text.startsWith("---\n") || closing === -1) throw new Error(`${file} has invalid front matter`);
    const document = parseDocument(text.slice(4, closing), { uniqueKeys: true, prettyErrors: false });
    if (document.errors.length > 0) throw new Error(`${file}: ${document.errors[0].message}`);
    const frontMatter = document.toJS({ maxAliasCount: 0 });
    if (frontMatter.place_id !== placeId || frontMatter.locale !== locale) {
      throw new Error(`${file} identity does not match its path`);
    }
    const status = frontMatter.translation_status ?? "unspecified";
    counts[locale].set(status, (counts[locale].get(status) ?? 0) + 1);
  }
}

console.log(`Places: ${placeIds.length}`);
console.log(`SR source: ${counts.sr.get("source") ?? 0}`);
for (const locale of ["ru", "en"]) {
  for (const status of ["missing", "draft", "in-review", "approved", "published", "outdated", "archived"]) {
    console.log(`${locale.toUpperCase()} ${status}: ${counts[locale].get(status) ?? 0}`);
  }
}
