import assert from "node:assert/strict";
import test from "node:test";

import { getMapPopupPanOffset } from "../src/lib/map-popup-positioning.ts";

const safeRect = { top: 180, right: 378, bottom: 832, left: 12 };

test("mobile popup is panned below the safe top edge", () => {
  assert.deepEqual(
    getMapPopupPanOffset({ top: 140, right: 330, bottom: 333, left: 99 }, safeRect),
    [0, -40],
  );
});

test("mobile popup is panned inside bottom and horizontal safe edges", () => {
  assert.deepEqual(
    getMapPopupPanOffset({ top: 650, right: 410, bottom: 860, left: 170 }, safeRect),
    [32, 28],
  );
  assert.deepEqual(
    getMapPopupPanOffset({ top: 300, right: 240, bottom: 500, left: -8 }, safeRect),
    [-20, 0],
  );
});

test("mobile popup already inside the safe area does not move the map", () => {
  assert.deepEqual(
    getMapPopupPanOffset({ top: 220, right: 330, bottom: 420, left: 80 }, safeRect),
    [0, 0],
  );
});
