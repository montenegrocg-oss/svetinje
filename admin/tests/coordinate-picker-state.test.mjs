import assert from "node:assert/strict";
import test from "node:test";
import { CoordinatePickerState, parseCoordinateInputs } from "../client/coordinate-picker-state.ts";

test("coordinate picker state covers existing, empty, map, drag, manual and clear transitions", () => {
  const existing = new CoordinatePickerState({ latitude: 42.381312, longitude: 18.709271 });
  assert.deepEqual(existing.pair, { latitude: 42.381312, longitude: 18.709271 });

  const empty = new CoordinatePickerState();
  assert.equal(empty.pair, undefined);
  assert.deepEqual(empty.setFromMap(19.1, 42.1), { latitude: 42.1, longitude: 19.1 });
  assert.deepEqual(empty.setFromMap(19.2, 42.2), { latitude: 42.2, longitude: 19.2 });
  assert.deepEqual(empty.setFromInputs("42.2706466", "19.1452535"), {
    kind: "valid", pair: { latitude: 42.2706466, longitude: 19.1452535 },
  });
  assert.deepEqual(empty.pair, { latitude: 42.2706466, longitude: 19.1452535 });
  empty.clear();
  assert.equal(empty.pair, undefined);
});

test("coordinate input validation rejects incomplete and out-of-range pairs", () => {
  assert.deepEqual(parseCoordinateInputs("", ""), { kind: "empty" });
  assert.deepEqual(parseCoordinateInputs("42.1", ""), { kind: "incomplete" });
  assert.deepEqual(parseCoordinateInputs("", "19.1"), { kind: "incomplete" });
  assert.deepEqual(parseCoordinateInputs("91", "19.1"), { kind: "invalid", field: "latitude" });
  assert.deepEqual(parseCoordinateInputs("42.1", "181"), { kind: "invalid", field: "longitude" });
});
