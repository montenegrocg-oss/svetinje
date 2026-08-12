#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertSafeEntitySegment, serializeResearchPlaceScaffold } from "./lib/place-scaffold.mjs";

function parseArguments(args) {
  const [id, placeType, ...options] = args;
  if (!id) throw new Error("Missing place ID. Usage: pnpm new:place <id> <place-type> [--name <name>] [--slug <slug>]");
  if (!placeType) throw new Error("Missing place type. Usage: pnpm new:place <id> <place-type> [--name <name>] [--slug <slug>]");

  const parsed = { id, placeType };
  for (let index = 0; index < options.length; index += 1) {
    const flag = options[index];
    if (flag !== "--name" && flag !== "--slug") throw new Error(`Unknown option: ${flag}`);
    const value = options[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    const key = flag === "--name" ? "name" : "slug";
    if (parsed[key] !== undefined) throw new Error(`${flag} may be specified only once`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

async function supportedPlaceTypes(root) {
  const schemaFile = path.join(root, "schemas", "place.schema.json");
  const schema = JSON.parse(await readFile(schemaFile, "utf8"));
  const values = schema?.$defs?.placeType?.enum;
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    throw new Error(`Cannot read supported place types from ${schemaFile}`);
  }
  return values;
}

export async function createPlaceScaffold({
  root = process.cwd(),
  id,
  placeType,
  name,
  slug = id,
  now = new Date(),
}) {
  const allowedTypes = await supportedPlaceTypes(root);
  const scaffold = serializeResearchPlaceScaffold({
    id,
    placeType,
    name,
    slug,
    supportedPlaceTypes: allowedTypes,
    actor: "maxim",
    now,
  });
  assertSafeEntitySegment(id, "Place ID", 100);

  const placesRoot = path.resolve(root, "content", "places");
  const target = path.resolve(placesRoot, id);
  const relativeTarget = path.relative(placesRoot, target);
  if (!relativeTarget || relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    throw new Error("Refusing to create a place outside content/places");
  }

  await mkdir(placesRoot, { recursive: true });
  try {
    await mkdir(target);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`Place directory already exists: content/places/${id}`);
    throw error;
  }

  try {
    const narrativesDirectory = path.join(target, "narratives");
    await mkdir(narrativesDirectory);
    const placeFile = scaffold.files.find((file) => file.path.endsWith("/place.yaml"));
    const narrativeFile = scaffold.files.find((file) => file.path.endsWith("/narratives/sr.md"));
    await writeFile(path.join(target, "place.yaml"), placeFile.content, { encoding: "utf8", flag: "wx" });
    await writeFile(path.join(narrativesDirectory, "sr.md"), narrativeFile.content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }

  return {
    directory: target,
    files: [path.join(target, "place.yaml"), path.join(target, "narratives", "sr.md")],
  };
}

export async function runNewPlaceCli(args = process.argv.slice(2), root = process.cwd()) {
  const parsed = parseArguments(args);
  const result = await createPlaceScaffold({ root, ...parsed });
  console.log(`Created research scaffold: ${path.relative(root, result.directory).replaceAll("\\", "/")}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  runNewPlaceCli().catch((error) => {
    console.error(`Cannot create place scaffold: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
