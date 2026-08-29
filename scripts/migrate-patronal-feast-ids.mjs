#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const REGISTRY_FILE = path.join(ROOT, "content", "feasts", "registry.yaml");
const REPORT_FILE = path.join(ROOT, "data", "migrations", "feast-registry-foundation.json");

const manualReview = {
  multiple_explicit_dates: ["sveti-prvomucenik-arhidjakon-stefan"],
  undated: [
    "trojicindan",
    "pedesetnica",
    "sveta-matrona-moskovska",
    "silazak-svetog-duha-na-apostole-pedesetnica",
    "vaskrsenje-hristovo",
  ],
  movable_without_year_binding: ["cvijeti"],
  near_duplicate_groups_not_merged: [
    ["mala-gospojina", "rodjenje-presvete-bogorodice"],
    ["uspenije-presvete-bogorodice-velika-gospojina", "velika-gospojina"],
    ["trojicindan", "pedesetnica", "silazak-svetog-duha-na-apostole-pedesetnica"],
    ["sv-vasilije-ostroski-cudotvorac", "sveti-vasilije-ostroski-cudotvorac"],
  ],
};

const registry = parse(await readFile(REGISTRY_FILE, "utf8"));
const byLegacyName = new Map();
const byId = new Map(registry.feasts.map((feast) => [feast.id, feast]));
for (const feast of registry.feasts) {
  for (const name of feast.legacy_names) {
    if (byLegacyName.has(name)) throw new Error(`Duplicate legacy feast name: ${name}`);
    byLegacyName.set(name, feast.id);
  }
}

if (WRITE) {
  const mappings = [];
  const placeDirectories = (await readdir(path.join(ROOT, "content", "places"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const placeId of placeDirectories) {
    const file = path.join(ROOT, "content", "places", placeId, "place.yaml");
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const place = parse(text);
    let legacyValues = Array.isArray(place.patronal_feasts)
      ? place.patronal_feasts.map((entry) => entry.name)
      : place.patronal_feast
        ? [place.patronal_feast.name]
        : [];
    const existingIds = Array.isArray(place.patronal_feast_ids) ? place.patronal_feast_ids : [];
    if (legacyValues.length === 0 && existingIds.length === 0) continue;
    if (legacyValues.length === 0) {
      legacyValues = existingIds.map((id) => {
        const feast = byId.get(id);
        if (!feast || feast.legacy_names.length !== 1) throw new Error(`${placeId} canonical ID cannot be traced to one legacy value: ${id}`);
        return feast.legacy_names[0];
      });
    }
    const feastIds = legacyValues.map((name) => {
      const id = byLegacyName.get(name);
      if (!id) throw new Error(`${placeId} has unmapped legacy feast value: ${name}`);
      return id;
    });
    if (new Set(feastIds).size !== feastIds.length) throw new Error(`${placeId} would receive duplicate feast IDs`);

    if (existingIds.length > 0) {
      if (JSON.stringify(existingIds) !== JSON.stringify(feastIds)) throw new Error(`${placeId} existing canonical IDs do not match legacy provenance`);
    } else {
      const plural = /^patronal_feasts:\n((?:  - name: [^\n]+\n)+)/mu;
      const singular = /^patronal_feast:\n  name: [^\n]+\n/mu;
      const replacement = `patronal_feast_ids:\n${feastIds.map((id) => `  - ${id}\n`).join("")}`;
      let migrated;
      if (plural.test(text)) migrated = text.replace(plural, replacement);
      else if (singular.test(text)) migrated = text.replace(singular, replacement);
      else throw new Error(`${placeId} legacy feast YAML shape is unsupported`);
      await writeFile(file, migrated, "utf8");
    }
    mappings.push({ place_id: placeId, legacy_values: legacyValues, feast_ids: feastIds });
  }

  const legacyInventory = registry.feasts.flatMap((feast) => feast.legacy_names.map((legacyName) => ({
    legacy_name: legacyName,
    feast_id: feast.id,
    place_ids: mappings.filter((mapping) => mapping.legacy_values.includes(legacyName)).map((mapping) => mapping.place_id),
  })));
  const report = {
    schema_version: 1,
    source: "current user-owned content/places/*/place.yaml",
    external_sources_used: false,
    counts: {
      place_records_migrated: mappings.length,
      legacy_values_migrated: mappings.reduce((sum, mapping) => sum + mapping.legacy_values.length, 0),
      unique_legacy_values: legacyInventory.length,
      feast_ids_created: registry.feasts.length,
    },
    mappings,
    legacy_inventory: legacyInventory,
    manual_review: manualReview,
  };
  await mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Migrated ${mappings.length} place records and ${report.counts.legacy_values_migrated} legacy values.`);
} else {
  const report = JSON.parse(await readFile(REPORT_FILE, "utf8"));
  for (const mapping of report.mappings) {
    const place = parse(await readFile(path.join(ROOT, "content", "places", mapping.place_id, "place.yaml"), "utf8"));
    if (JSON.stringify(place.patronal_feast_ids) !== JSON.stringify(mapping.feast_ids)) throw new Error(`${mapping.place_id} does not match migration report`);
    if (place.patronal_feast !== undefined || place.patronal_feasts !== undefined) throw new Error(`${mapping.place_id} still contains migrated legacy feast fields`);
  }
  const reportedNames = new Set(report.legacy_inventory.map((entry) => entry.legacy_name));
  if (reportedNames.size !== byLegacyName.size || [...byLegacyName.keys()].some((name) => !reportedNames.has(name))) {
    throw new Error("Migration report does not preserve the complete legacy inventory");
  }
  console.log(`Verified ${report.mappings.length} migrated place records and ${reportedNames.size} preserved legacy values.`);
}
