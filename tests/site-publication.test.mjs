import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stringify } from "yaml";
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

test("a reviewed published place can be selected without a source registry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "svetinje-unsourced-publication-"));
  try {
    await mkdir(path.join(root, "content", "places", "neutral-place", "narratives"), { recursive: true });
    await mkdir(path.join(root, "validation"), { recursive: true });
    const approval = (role) => ({ role, reviewer_id: "reviewer", outcome: "approved" });
    await writeFile(path.join(root, "content", "places", "neutral-place", "place.yaml"), stringify({
      id: "neutral-place",
      editorial_status: "published",
      place_type: { value: "monastery", verification: { status: "verified" } },
      ecclesiastical: {
        authority_id: { value: "mitropolija-crnogorsko-primorska", verification: { status: "verified" } },
        community_type: { value: "male", verification: { status: "verified" } },
      },
      location: {
        municipality_id: { value: "budva", verification: { status: "verified" } },
        municipality: { value: "Будва", verification: { status: "verified" } },
      },
      relationships: {},
      audit: { created_at: "2026-08-04T00:00:00Z", updated_at: "2026-08-22T00:00:00Z" },
      approvals: [approval("factual"), approval("ecclesiastical"), approval("publishing")],
    }), "utf8");
    const narrative = {
      place_id: "neutral-place", locale: "sr", editorial_status: "published", translation_status: "source",
      slug: "neutral-place", preferred_name: "Неутрално мјесто", summary: "Неутрални опис.",
      approvals: [approval("factual"), approval("ecclesiastical"), approval("sr-language"), approval("publishing")],
    };
    await writeFile(path.join(root, "content", "places", "neutral-place", "narratives", "sr.md"), `---\n${stringify(narrative)}---\n`, "utf8");
    await writeFile(path.join(root, "validation", "publication-policy.json"), JSON.stringify({
      public_publication_locked: false,
      role_assignments: { publishing: ["reviewer"], factual: ["reviewer"], ecclesiastical: ["reviewer"], "sr-language": ["reviewer"] },
    }), "utf8");
    const places = await loadPublishablePlaces(root);
    assert.deepEqual(places.map(({ id }) => id), ["neutral-place"]);
    assert.equal(places[0].monasticCommunity, "male");
    assert.equal(places[0].eparchyId, "mitropolija-crnogorsko-primorska");
    assert.equal(places[0].municipalityId, "budva");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the map-first homepage contains no research dossier or fictional sacred-place examples", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = [
    "src/pages/index.astro",
    "src/components/HomePage.astro",
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
  const copySource = await readFile(path.join(PROJECT_ROOT, "src/i18n/public-copy.ts"), "utf8");

  assert.match(copySource, /Православна Црна Гора/);
  assert.match(copySource, /Каталог светиња је у припреми/);
  assert.match(copySource, /Поклоничке руте су у припреми/);
  assert.doesNotMatch(
    homepageSource,
    /Подмаине|podmaine|Острог|Морача|Савина|Пива|Цетињски манастир|Манастир [А-Ш]/iu,
  );
});
