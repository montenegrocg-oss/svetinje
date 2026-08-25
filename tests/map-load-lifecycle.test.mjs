import assert from "node:assert/strict";
import test from "node:test";
import {
  createInitialMap,
  isFatalInitialStyleError,
  MAP_LOAD_SOFT_TIMEOUT_MS,
  watchInitialMapLoad,
} from "../src/lib/map-load-lifecycle.ts";

const STYLE_URL = "https://api.maptiler.com/maps/test/style.json?key=test";

class FakeTimers {
  now = 0;
  nextId = 1;
  pending = new Map();

  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.pending.set(id, { callback, at: this.now + delay });
    return id;
  };

  clearTimeout = (id) => {
    this.pending.delete(id);
  };

  advanceBy(delay) {
    this.now += delay;
    const ready = [...this.pending.entries()]
      .filter(([, timer]) => timer.at <= this.now)
      .sort((left, right) => left[1].at - right[1].at);
    ready.forEach(([id, timer]) => {
      if (!this.pending.delete(id)) return;
      timer.callback();
    });
  }
}

class MockMapLibreMap {
  listeners = new Map();
  removed = false;

  once(event, listener) {
    this.listeners.set(event, listener);
  }

  on(event, listener) {
    this.listeners.set(event, listener);
  }

  off(event, listener) {
    if (this.listeners.get(event) === listener) this.listeners.delete(event);
  }

  emit(event, payload) {
    const listener = this.listeners.get(event);
    if (!listener) return;
    if (event === "load") this.listeners.delete(event);
    listener(payload);
  }

  remove() {
    this.removed = true;
  }
}

function createHarness() {
  const map = new MockMapLibreMap();
  const timers = new FakeTimers();
  const events = [];
  const dispose = watchInitialMapLoad(map, {
    onSlow: () => events.push("slow"),
    onReady: () => events.push("ready"),
    onFatal: () => events.push("fatal"),
    isFatalError: (event) => isFatalInitialStyleError(event, STYLE_URL),
    setTimer: timers.setTimeout,
    clearTimer: timers.clearTimeout,
  });
  return { map, timers, events, dispose };
}

test("an unavailable map enters fatal fallback without constructing MapLibre", () => {
  let constructionCount = 0;
  let fallbackCount = 0;

  const map = createInitialMap({
    available: false,
    create: () => {
      constructionCount += 1;
      return new MockMapLibreMap();
    },
    onFatal: () => {
      fallbackCount += 1;
    },
  });

  assert.equal(map, undefined);
  assert.equal(constructionCount, 0);
  assert.equal(fallbackCount, 1);
});

test("a mocked MapLibre constructor failure enters fatal fallback", () => {
  const constructorError = new Error("WebGL unavailable");
  let fallbackCount = 0;

  const map = createInitialMap({
    available: true,
    create: () => {
      throw constructorError;
    },
    onFatal: () => {
      fallbackCount += 1;
    },
  });

  assert.equal(map, undefined);
  assert.equal(fallbackCount, 1);
});

test("the soft timeout reports a slow map without removing its MapLibre instance", () => {
  const { map, timers, events } = createHarness();

  timers.advanceBy(MAP_LOAD_SOFT_TIMEOUT_MS);

  assert.deepEqual(events, ["slow"]);
  assert.equal(map.removed, false);
  assert.equal(map.listeners.has("load"), true);
});

test("a late MapLibre load recovers after the soft timeout", () => {
  const { map, timers, events } = createHarness();

  timers.advanceBy(MAP_LOAD_SOFT_TIMEOUT_MS);
  map.emit("load");

  assert.deepEqual(events, ["slow", "ready"]);
  assert.equal(map.removed, false);
  assert.equal(timers.pending.size, 0);
});

test("a normal MapLibre load cancels the pending soft timeout", () => {
  const { map, timers, events } = createHarness();

  map.emit("load");
  timers.advanceBy(MAP_LOAD_SOFT_TIMEOUT_MS);

  assert.deepEqual(events, ["ready"]);
  assert.equal(timers.pending.size, 0);
});

test("a transient MapLibre resource error does not trigger fallback or dispose the watcher", () => {
  const { map, timers, events } = createHarness();

  map.emit("error", { error: { status: 403, url: "https://api.maptiler.com/tiles/1/2/3.pbf" } });
  timers.advanceBy(MAP_LOAD_SOFT_TIMEOUT_MS);
  map.emit("load");

  assert.deepEqual(events, ["slow", "ready"]);
  assert.equal(map.removed, false);
});

test("an authorization failure for the initial style is fatal and clears recovery work", () => {
  const { map, timers, events } = createHarness();

  map.emit("error", { error: { status: 403, url: STYLE_URL } });
  timers.advanceBy(MAP_LOAD_SOFT_TIMEOUT_MS);
  map.emit("load");

  assert.deepEqual(events, ["fatal"]);
  assert.equal(timers.pending.size, 0);
  assert.equal(map.listeners.has("load"), false);
  assert.equal(map.listeners.has("error"), false);
});

test("disposing the initial-load watcher clears its timer and load listener", () => {
  const { map, timers, events, dispose } = createHarness();

  dispose();
  timers.advanceBy(MAP_LOAD_SOFT_TIMEOUT_MS);
  map.emit("load");

  assert.deepEqual(events, []);
  assert.equal(timers.pending.size, 0);
  assert.equal(map.listeners.has("load"), false);
  assert.equal(map.listeners.has("error"), false);
});
