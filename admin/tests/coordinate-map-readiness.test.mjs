import assert from "node:assert/strict";
import test from "node:test";
import { hasLoadedBaseStyle, isFatalBaseStyleError } from "../client/coordinate-map-readiness.ts";

const mapState = ({ loaded = true, layers = [{}], sources = { base: {} } } = {}) => ({
  getStyle: () => ({ layers, sources }),
  isStyleLoaded: () => loaded,
});

test("coordinate map readiness requires a loaded non-empty base style", () => {
  assert.equal(hasLoadedBaseStyle(mapState()), true);
  assert.equal(hasLoadedBaseStyle(mapState({ loaded: false })), false);
  assert.equal(hasLoadedBaseStyle(mapState({ layers: [] })), false);
  assert.equal(hasLoadedBaseStyle(mapState({ sources: {} })), false);
});

test("only initial base-style failures are fatal resource errors", () => {
  assert.equal(isFatalBaseStyleError({ error: new Error("AJAXError: (403): https://api.maptiler.com/maps/custom/style.json?key=redacted") }), true);
  assert.equal(isFatalBaseStyleError(new Error("Failed to load map style")), true);
  assert.equal(isFatalBaseStyleError(new Error("Image sprite-icon could not be loaded")), false);
  assert.equal(isFatalBaseStyleError(new Error("Glyph range 0-255 temporarily unavailable")), false);
});
