import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadExcludedNarrativeMarkers,
  loadPublishablePlaces,
} from "../src/lib/content/publication.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

test("research dossiers are excluded from production page data", async () => {
  const places = await loadPublishablePlaces(PROJECT_ROOT);
  assert.equal(places.some((place) => place.id === "podmaine"), false);
  assert.equal(places.some((place) => place.id === "saborni-hram-podgorica"), false);
  assert.equal(places.some((place) => place.id === "dajbabe"), false);
  assert.deepEqual(places, []);

  const excluded = await loadExcludedNarrativeMarkers(PROJECT_ROOT);
  assert.ok(excluded.some((marker) => marker.placeId === "podmaine"));
  assert.ok(excluded.some((marker) => marker.placeId === "saborni-hram-podgorica"));
  assert.ok(excluded.some((marker) => marker.placeId === "dajbabe"));
});

test("research status excludes Podmaine independently of the repository publication lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svetinje-publication-"));
  try {
    await mkdir(path.join(root, "content"), { recursive: true });
    await mkdir(path.join(root, "validation"), { recursive: true });
    await cp(path.join(PROJECT_ROOT, "content", "places"), path.join(root, "content", "places"), {
      recursive: true,
    });
    await cp(path.join(PROJECT_ROOT, "content", "sources"), path.join(root, "content", "sources"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "validation", "publication-policy.json"),
      JSON.stringify({
        public_publication_locked: false,
        role_assignments: {
          publishing: ["reviewer"],
          factual: ["reviewer"],
          ecclesiastical: ["reviewer"],
          "sr-language": ["reviewer"],
        },
      }),
      "utf8",
    );

    assert.deepEqual(await loadPublishablePlaces(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the map-first homepage contains no research dossier or fictional sacred-place examples", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = [
    "src/pages/index.astro",
    "src/components/MapExplorer.astro",
    "src/components/MapCanvas.astro",
    "src/components/ExplorerSidebar.astro",
    "src/components/EmptyCatalogueState.astro",
    "src/components/RecommendedPlaces.astro",
    "src/components/PopularRoutes.astro",
  ];
  const homepageSource = (await Promise.all(
    files.map((file) => readFile(path.join(PROJECT_ROOT, file), "utf8")),
  )).join("\n");

  assert.match(homepageSource, /Православна Црна Гора/);
  assert.match(homepageSource, /Каталог светиња је у припреми/);
  assert.match(homepageSource, /Поклоничке руте су у припреми/);
  assert.doesNotMatch(
    homepageSource,
    /Подмаине|podmaine|Острог|Морача|Савина|Пива|Цетињски манастир|Манастир [А-Ш]/iu,
  );
});
