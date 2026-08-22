import assert from "node:assert/strict";
import test from "node:test";
import { loadAdminRepository } from "../src/repository-content.ts";

const REPRESENTATIVE_PLACE_COUNT = 60;

class BatchRepository {
  constructor() {
    this.blobs = new Map();
    this.tree = [];
    this.externalReads = 0;
    this.batchReads = 0;
    this.individualBlobReads = 0;
    this.largestBatch = 0;
    this.nextSha = 1;

    this.add("schemas/place.schema.json", JSON.stringify({
      $defs: {
        placeType: { enum: ["monastery", "church"] },
        monasticCommunity: { enum: ["male", "female"] },
        coordinateAccuracy: { enum: ["complex-centroid"] },
      },
    }));
    this.add("schemas/narrative.schema.json", JSON.stringify({
      $defs: { sectionKey: { enum: ["introduction", "history"] } },
    }));
    this.add("schemas/common.schema.json", JSON.stringify({
      $defs: {
        publicationSafety: { enum: ["public", "review-required"] },
        verificationStatus: { enum: ["verified", "requires-verification"] },
      },
    }));
    this.add("schemas/media.schema.json", JSON.stringify({ $id: "https://svetinje.me/schemas/media.schema.json" }));
    this.add("validation/editorial-preview.json", JSON.stringify({ place_ids: [] }));

    for (let index = 0; index < REPRESENTATIVE_PLACE_COUNT; index += 1) {
      const id = `batch-place-${String(index).padStart(2, "0")}`;
      this.add(`content/places/${id}/place.yaml`, [
        "schema_version: 1",
        `id: ${id}`,
        "editorial_status: research",
        "place_type:",
        "  value: monastery",
        "source_ids: []",
        "",
      ].join("\n"));
      this.add(`content/places/${id}/narratives/sr.md`, [
        "---",
        `place_id: ${id}`,
        `slug: ${id}`,
        `preferred_name: Технички запис ${index}`,
        "source_ids: []",
        "---",
        "",
      ].join("\n"));
    }
  }

  add(path, content) {
    const sha = this.nextSha.toString(16).padStart(40, "0");
    this.nextSha += 1;
    this.tree.push({ path, mode: "100644", type: "blob", sha });
    this.blobs.set(sha, content);
  }

  async readBranchState() {
    this.externalReads += 1;
    return { headSha: "a".repeat(40), treeSha: "b".repeat(40) };
  }

  async readTree() {
    this.externalReads += 1;
    return this.tree;
  }

  async readBlobs(shas) {
    this.externalReads += 1;
    this.batchReads += 1;
    this.largestBatch = Math.max(this.largestBatch, shas.length);
    return new Map(shas.map((sha) => [sha, this.blobs.get(sha)]));
  }

  async readBlob() {
    this.individualBlobReads += 1;
    assert.fail("Catalogue loading must not fall back to one GitHub request per blob");
  }

  async commitFilesAtomic() {
    assert.fail("Read-only catalogue loading must not write");
  }
}

test("representative catalogue loading stays batched and far below 50 repository reads", async () => {
  const repository = new BatchRepository();
  const snapshot = await loadAdminRepository(repository, "feature/podmaine-pilot");

  assert.equal(snapshot.places.length, REPRESENTATIVE_PLACE_COUNT);
  assert.equal(repository.individualBlobReads, 0);
  assert.equal(repository.batchReads, 2);
  assert.ok(repository.largestBatch > REPRESENTATIVE_PLACE_COUNT);
  assert.equal(repository.externalReads, 4);
  assert.ok(repository.externalReads < 50);
});
