import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRoute, deleteRoute, getEditableRoute, removeRouteTrack, updateRoute, updateRoutePreview, uploadRouteGpx } from "../src/route-service.ts";
import { editRoutePage } from "../src/ui.ts";

const root = new URL("../../", import.meta.url);
const filesForFixture = [
  "schemas/common.schema.json", "schemas/route.schema.json", "schemas/route-narrative.schema.json",
  "validation/editorial-preview.json", "validation/editorial-preview-routes.json",
  "content/places/manastir-svetog-sergija-radonjeskog/place.yaml", "content/places/manastir-svetog-sergija-radonjeskog/narratives/sr.md",
  "content/places/crkva-svete-trojice-na-rumiji/place.yaml", "content/places/crkva-svete-trojice-na-rumiji/narratives/sr.md",
  "content/routes/manastir-sergija-rumija/route.yaml", "content/routes/manastir-sergija-rumija/narratives/sr.md", "content/routes/manastir-sergija-rumija/track.geojson",
];
const env = { GITHUB_EDITORIAL_BRANCH: "feature/test-route" };
const session = { subject: "test", actor: "test-editor", developmentBypass: true };

class MemoryRepository {
  constructor(files) { this.files = new Map(files); this.sequence = 1; this.headSha = "a".repeat(40); this.commits = []; }
  tree() { let index = 1; return [...this.files.keys()].sort().map((path) => ({ path, mode: "100644", type: "blob", sha: (index++).toString(16).padStart(40, "0") })); }
  async readBranchState() { return { headSha: this.headSha, treeSha: "b".repeat(40) }; }
  async readTree() { return this.tree(); }
  async readBlob(sha) { const entry = this.tree().find((item) => item.sha === sha); return this.files.get(entry.path); }
  async readBlobs(shas) { const tree = this.tree(); return new Map(shas.map((sha) => { const entry = tree.find((item) => item.sha === sha); return [sha, this.files.get(entry.path)]; })); }
  async commitFilesAtomic(input) {
    if (input.expectedHeadSha !== this.headSha) throw new Error("unexpected test conflict");
    for (const file of input.files) { if (file.delete) this.files.delete(file.path); else this.files.set(file.path, file.content); }
    this.headSha = (++this.sequence).toString(16).padStart(40, "0"); this.commits.push(input); return { commitSha: this.headSha, branch: input.branch };
  }
}

const repository = async () => new MemoryRepository(await Promise.all(filesForFixture.map(async (file) => [file, await readFile(new URL(`../../${file}`, import.meta.url), "utf8")])));
const gpx = () => readFile(new URL("../../tests/fixtures/manastir-sergija-rumija.gpx", import.meta.url), "utf8");
const routeBody = (record, overrides = {}) => ({
  expectedHeadSha: record.state.headSha, preferredName: record.route.name, shortName: record.route.shortName, slug: record.route.slug,
  direction: record.route.direction, startPlaceId: record.route.startPlaceId, endPlaceId: record.route.endPlaceId, summary: record.route.summary,
  difficulty: record.route.difficulty, waterStatus: record.route.waterStatus, waterNote: record.route.waterNote ?? "", estimatedDurationMinutes: record.route.metrics.estimated_duration_minutes ?? "",
  surface: record.route.surface, recommendedSeasons: record.route.recommendedSeasons, featured: record.route.featured, featuredOrder: record.route.featuredOrder,
  startAccessNote: record.route.practical.startAccessNote ?? "", parkingStatus: record.route.practical.parkingStatus, parkingNote: record.route.practical.parkingNote ?? "",
  trailMarkingStatus: record.route.practical.trailMarkingStatus, trailMarkingNote: record.route.practical.trailMarkingNote ?? "",
  difficultSectionsStatus: record.route.practical.difficultSectionsStatus, difficultSectionsNote: record.route.practical.difficultSectionsNote ?? "",
  footwearRecommendation: record.route.practical.footwearRecommendation ?? "", mobileSignalStatus: record.route.practical.mobileSignalStatus,
  mobileSignalNote: record.route.practical.mobileSignalNote ?? "", weatherNote: record.route.practical.weatherNote ?? "", lastVerifiedAt: record.route.practical.lastVerifiedAt ?? "",
  sections: record.route.sections, ...overrides,
});

test("route editor updates canonical files once and preserves no-op semantics", async () => {
  const repo = await repository(); const record = await getEditableRoute(repo, env, "manastir-sergija-rumija");
  const body = routeBody(record);
  const noOp = await updateRoute(repo, env, session, record.route.id, body); assert.equal(noOp.unchanged, true); assert.equal(repo.commits.length, 0);
  const changed = await updateRoute(repo, env, session, record.route.id, { ...body, shortName: "Сергије → Румија" });
  assert.equal(changed.unchanged, false); assert.equal(repo.commits.length, 1); assert.deepEqual(repo.commits[0].files.map((file) => file.path), ["content/routes/manastir-sergija-rumija/route.yaml", "content/routes/manastir-sergija-rumija/narratives/sr.md"]);
  assert.match(repo.files.get("content/routes/manastir-sergija-rumija/narratives/sr.md"), /short_name: Сергије → Румија/);
});

test("route practical planning fields round-trip and remain no-op when unchanged", async () => {
  const repo = await repository(); const record = await getEditableRoute(repo, env, "manastir-sergija-rumija");
  const changed = await updateRoute(repo, env, session, record.route.id, routeBody(record, {
    startAccessNote: "Приступ полазишту се провјерава.", parkingStatus: "limited", parkingNote: "Ограничен простор.",
    trailMarkingStatus: "partially-marked", difficultSectionsStatus: "present", difficultSectionsNote: "Потребан је опрез.",
    footwearRecommendation: "Планинарске ципеле.", mobileSignalStatus: "variable", weatherNote: "Изложено вјетру.", lastVerifiedAt: "2026-08-15",
  }));
  assert.equal(changed.unchanged, false); assert.equal(repo.commits.length, 1);
  const yaml = repo.files.get("content/routes/manastir-sergija-rumija/route.yaml");
  assert.match(yaml, /practical:\n/); assert.match(yaml, /parking:\n\s+status: limited/); assert.match(yaml, /last_verified_at: 2026-08-15/);
  const updated = await getEditableRoute(repo, env, record.route.id);
  assert.equal(updated.route.practical.trailMarkingStatus, "partially-marked"); assert.equal(updated.route.practical.mobileSignalStatus, "variable");
  const noOp = await updateRoute(repo, env, session, record.route.id, routeBody(updated));
  assert.equal(noOp.unchanged, true); assert.equal(repo.commits.length, 1);
});

test("route practical editor exposes the canonical planning fields", async () => {
  const repo = await repository(); const record = await getEditableRoute(repo, env, "manastir-sergija-rumija");
  const html = await editRoutePage(session, record, record.route).text();
  for (const field of ["startAccessNote", "parkingStatus", "trailMarkingStatus", "difficultSectionsStatus", "footwearRecommendation", "mobileSignalStatus", "weatherNote", "lastVerifiedAt"]) {
    assert.match(html, new RegExp(`name="${field}"`));
  }
  assert.match(html, /Приступ полазишту/); assert.match(html, /Последња провјера руте/);
});

test("generic route lifecycle creates, uploads, previews, removes track, and deletes atomically", async () => {
  const repo = await repository(); let state = await repo.readBranchState();
  const created = await createRoute(repo, env, session, { expectedHeadSha: state.headSha, id: "test-route", slug: "test-route", preferredName: "Тест рута", shortName: "Тест", startPlaceId: "manastir-svetog-sergija-radonjeskog", endPlaceId: "crkva-svete-trojice-na-rumiji" });
  assert.equal(repo.commits.at(-1).files.length, 2); state = await repo.readBranchState();
  const uploaded = await uploadRouteGpx(repo, env, session, "test-route", state.headSha, await gpx()); assert.equal(uploaded.metrics.distance_m, 2693); assert.equal(repo.commits.at(-1).files.length, 2);
  state = await repo.readBranchState(); const noOp = await uploadRouteGpx(repo, env, session, "test-route", state.headSha, await gpx()); assert.equal(noOp.unchanged, true);
  const preview = await updateRoutePreview(repo, env, "test-route", { expectedHeadSha: state.headSha, enabled: true }); assert.equal(preview.inPreview, true); assert.match(repo.files.get("validation/editorial-preview-routes.json"), /test-route/);
  state = await repo.readBranchState(); const removed = await removeRouteTrack(repo, env, session, "test-route", { expectedHeadSha: state.headSha }); assert.equal(removed.unchanged, false); assert.equal(repo.files.has("content/routes/test-route/track.geojson"), false);
  state = await repo.readBranchState(); await deleteRoute(repo, env, "test-route", { expectedHeadSha: state.headSha, confirmed: true, confirmationId: "test-route" });
  assert.equal([...repo.files.keys()].some((path) => path.includes("content/routes/test-route/")), false); assert.doesNotMatch(repo.files.get("validation/editorial-preview-routes.json"), /test-route/); assert.equal(created.routeId, "test-route");
});

test("route operations reject stale HEAD, distant endpoints, and inexact deletion confirmation", async () => {
  const repo = await repository();
  await assert.rejects(() => updateRoute(repo, env, session, "manastir-sergija-rumija", { expectedHeadSha: "f".repeat(40) }), (error) => error.code === "git_conflict");
  await assert.rejects(() => deleteRoute(repo, env, "manastir-sergija-rumija", { expectedHeadSha: repo.headSha, confirmed: true, confirmationId: "wrong" }), (error) => error.code === "invalid_form_data");
  const farGpx = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="40" lon="18"/><trkpt lat="40.1" lon="18.1"/></trkseg></trk></gpx>`;
  await assert.rejects(() => uploadRouteGpx(repo, env, session, "manastir-sergija-rumija", repo.headSha, farGpx), (error) => error.code === "invalid_form_data");
});
