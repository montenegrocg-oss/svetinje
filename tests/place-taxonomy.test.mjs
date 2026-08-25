import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePlace } from "../admin/src/generated/canonical-validators.js";

const schema = JSON.parse(await readFile(new URL("../schemas/place.schema.json", import.meta.url), "utf8"));
const eparchies = schema.$defs.eparchyId.oneOf.map(({ const: id, title: labelSr }) => ({ id, labelSr }));
const municipalities = schema.$defs.municipalityId.oneOf.map(({ const: id, title: labelSr }) => ({ id, labelSr }));

const basePlace = () => ({
  schema_version: 1,
  id: "taxonomy-fixture",
  editorial_status: "research",
  relationships: {},
  approvals: [],
  audit: {
    created_at: "2026-08-25T00:00:00Z",
    created_by: "test",
    updated_at: "2026-08-25T00:00:00Z",
    updated_by: "test",
  },
});

test("canonical place taxonomy registries have exact unique inventories", () => {
  assert.equal(eparchies.length, 4);
  assert.equal(new Set(eparchies.map(({ id }) => id)).size, 4);
  assert.equal(new Set(eparchies.map(({ labelSr }) => labelSr)).size, 4);
  assert.deepEqual(eparchies.map(({ id }) => id), [
    "mitropolija-crnogorsko-primorska",
    "eparhija-budimljansko-niksicka",
    "eparhija-milesevska",
    "eparhija-zahumsko-hercegovacka-i-primorska",
  ]);

  assert.equal(municipalities.length, 25);
  assert.equal(new Set(municipalities.map(({ id }) => id)).size, 25);
  assert.equal(new Set(municipalities.map(({ labelSr }) => labelSr)).size, 25);
  for (const requiredId of ["podgorica", "cetinje", "budva", "niksic", "zeta", "tuzi"]) {
    assert.equal(municipalities.some(({ id }) => id === requiredId), true);
  }
  const collator = new Intl.Collator("sr");
  assert.deepEqual(
    municipalities.map(({ labelSr }) => labelSr),
    municipalities.map(({ labelSr }) => labelSr).toSorted(collator.compare),
  );
});

test("place schema accepts optional controlled taxonomy facts and legacy municipality", () => {
  for (const eparchyId of ["mitropolija-crnogorsko-primorska", "eparhija-budimljansko-niksicka"]) {
    const place = basePlace();
    place.ecclesiastical = { authority_id: { value: eparchyId, verification: { status: "requires-verification" } } };
    assert.equal(validatePlace(place), true);
  }
  for (const municipalityId of ["budva", "niksic"]) {
    const place = basePlace();
    place.location = { municipality_id: { value: municipalityId, verification: { status: "requires-verification" } } };
    assert.equal(validatePlace(place), true);
  }
  assert.equal(validatePlace(basePlace()), true);
  const legacy = basePlace();
  legacy.location = { municipality: { value: "Будва", verification: { status: "requires-verification" } } };
  assert.equal(validatePlace(legacy), true);
});

test("place schema rejects unknown and empty taxonomy IDs", () => {
  for (const authorityId of ["eparhija-nepostojeca", ""]) {
    const place = basePlace();
    place.ecclesiastical = { authority_id: { value: authorityId, verification: { status: "requires-verification" } } };
    assert.equal(validatePlace(place), false);
  }
  for (const municipalityId of ["unknown-municipality", ""]) {
    const place = basePlace();
    place.location = { municipality_id: { value: municipalityId, verification: { status: "requires-verification" } } };
    assert.equal(validatePlace(place), false);
  }
});
