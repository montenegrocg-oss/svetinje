import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  feastIdFromSerbianName,
  parseFeastRegistry,
  prepareFeastMutation,
} from "../src/feast-registry.ts";
import {
  feastClientId,
  feastDisplayLabel,
  filterFeasts,
} from "../client/feast-selector.ts";

const rawRegistry = await readFile(new URL("../../content/feasts/registry.yaml", import.meta.url), "utf8");
const SHA = "f".repeat(40);
const snapshot = parseFeastRegistry(rawRegistry, SHA);

test("runtime registry exposes the current 39 entries and Serbian display labels", () => {
  assert.equal(snapshot.registry.feasts.length, 39);
  const nikoljdan = snapshot.registry.feasts.find(({ id }) => id === "nikoljdan");
  const cvijeti = snapshot.registry.feasts.find(({ id }) => id === "cvijeti");
  const undated = snapshot.registry.feasts.find(({ id }) => id === "trojicindan");
  assert.equal(feastDisplayLabel(nikoljdan), "Никољдан — 19. децембар");
  assert.equal(feastDisplayLabel(cvijeti), "Улазак Господа Исуса Христа у Јерусалим - Цвети — покретни празник");
  assert.equal(feastDisplayLabel(undated), "Тројичиндан — датум није унесен");
});

test("selector search matches Cyrillic, Latin ASCII, legacy names, and IDs", () => {
  assert.deepEqual(filterFeasts(snapshot.registry.feasts, "Никољдан").map(({ id }) => id), ["nikoljdan"]);
  assert.deepEqual(filterFeasts(snapshot.registry.feasts, "Nikoljdan").map(({ id }) => id), ["nikoljdan"]);
  assert.deepEqual(filterFeasts(snapshot.registry.feasts, "Djurdjevdan").map(({ id }) => id), ["djurdjevdan"]);
  assert.deepEqual(filterFeasts(snapshot.registry.feasts, "19 decembar").map(({ id }) => id), ["nikoljdan"]);
});

test("Serbian feast IDs are deterministic and shared by client and server", () => {
  assert.equal(feastIdFromSerbianName("Свети Лука"), "sveti-luka");
  assert.equal(feastClientId("Свети Лука"), "sveti-luka");
  assert.equal(feastClientId("Ђурђевдан"), "djurdjevdan");
});

test("fixed, movable, and undated staged feasts validate and serialize together", () => {
  const staged = [
    { id: "sveti-luka", nameSr: "Свети Лука", dateKind: "fixed", month: 10, day: 31 },
    { id: "pokretni-sabor-novi", nameSr: "Покретни Сабор Нови", dateKind: "movable" },
    { id: "sabor-bez-datuma", nameSr: "Сабор Без Датума", dateKind: "undated" },
  ];
  const result = prepareFeastMutation(snapshot, staged.map(({ id }) => id), staged, SHA);
  assert.equal(result.additions.length, 3);
  assert.deepEqual(result.additions.map(({ date }) => date), [
    { kind: "fixed", month: 10, day: 31 },
    { kind: "movable" },
    undefined,
  ]);
  assert.equal(parseFeastRegistry(result.registryYaml, SHA).registry.feasts.length, 42);
});

test("invalid dates, duplicate names, duplicate IDs, and duplicate selections fail closed", () => {
  assert.throws(
    () => prepareFeastMutation(snapshot, ["nepostojeci-datum"], [{ id: "nepostojeci-datum", nameSr: "Непостојећи Датум", dateKind: "fixed", month: 4, day: 31 }], SHA),
    (error) => error.code === "invalid_form_data" && /Дан није важећи/u.test(error.fields["stagedFeasts.0.date"]),
  );
  assert.throws(
    () => prepareFeastMutation(snapshot, ["nikoljdan"], [{ id: "nikoljdan", nameSr: "Никољдан", dateKind: "undated" }], SHA),
    (error) => error.code === "invalid_form_data" && /већ постоји/u.test(error.fields["stagedFeasts.0.nameSr"]),
  );
  assert.throws(
    () => prepareFeastMutation(snapshot, ["nikoljdan", "nikoljdan"], [], SHA),
    (error) => error.code === "invalid_form_data" && /два пута/u.test(error.fields.patronalFeastIds),
  );
  assert.throws(
    () => prepareFeastMutation(snapshot, [], [], "0".repeat(40)),
    (error) => error.code === "git_conflict",
  );
});

test("near duplicate creation requires explicit confirmation", () => {
  const staged = { id: "sveti-sava-novi", nameSr: "Свети Сава Нови", dateKind: "undated" };
  assert.throws(
    () => prepareFeastMutation(snapshot, [staged.id], [staged], SHA),
    (error) => error.code === "invalid_form_data" && /Можда већ постоји/u.test(error.fields["stagedFeasts.0.nearDuplicateConfirmed"]),
  );
  assert.equal(prepareFeastMutation(snapshot, [staged.id], [{ ...staged, nearDuplicateConfirmed: true }], SHA).additions.length, 1);
});

test("cancelled staging is a no-op and writes no registry content", () => {
  const result = prepareFeastMutation(snapshot, [], [], SHA);
  assert.equal(result.registryYaml, undefined);
  assert.deepEqual(result.ids, []);
  assert.deepEqual(result.additions, []);
});
