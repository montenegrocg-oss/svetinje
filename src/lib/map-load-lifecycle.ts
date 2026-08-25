export const MAP_LOAD_SOFT_TIMEOUT_MS = 10_000;

interface InitialMapConstructionOptions<MapInstance> {
  available: boolean;
  create: () => MapInstance;
  onFatal: () => void;
}

export function createInitialMap<MapInstance>(options: InitialMapConstructionOptions<MapInstance>) {
  if (!options.available) {
    options.onFatal();
    return undefined;
  }

  try {
    return options.create();
  } catch {
    options.onFatal();
    return undefined;
  }
}

interface InitialMapLoadSource {
  once(event: "load", listener: () => void): unknown;
  on(event: "error", listener: (event: InitialMapErrorEvent) => void): unknown;
  off(event: "load", listener: () => void): unknown;
  off(event: "error", listener: (event: InitialMapErrorEvent) => void): unknown;
}

export interface InitialMapErrorEvent {
  error?: {
    status?: unknown;
    url?: unknown;
  };
}

interface InitialMapLoadOptions {
  onSlow: () => void;
  onReady: () => void;
  onFatal: () => void;
  isFatalError: (event: InitialMapErrorEvent) => boolean;
  timeoutMs?: number;
  setTimer?: typeof globalThis.setTimeout;
  clearTimer?: typeof globalThis.clearTimeout;
}

export function watchInitialMapLoad(map: InitialMapLoadSource, options: InitialMapLoadOptions) {
  const setTimer = options.setTimer ?? globalThis.setTimeout;
  const clearTimer = options.clearTimer ?? globalThis.clearTimeout;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let loaded = false;
  let disposed = false;

  const clearSoftTimeout = () => {
    if (timer === undefined) return;
    clearTimer(timer);
    timer = undefined;
  };

  function handleLoad() {
    if (disposed || loaded) return;
    loaded = true;
    clearSoftTimeout();
    map.off("error", handleError);
    options.onReady();
  }

  function handleError(event: InitialMapErrorEvent) {
    if (disposed || loaded || !options.isFatalError(event)) return;
    disposed = true;
    clearSoftTimeout();
    map.off("load", handleLoad);
    map.off("error", handleError);
    options.onFatal();
  }

  map.on("error", handleError);
  map.once("load", handleLoad);
  if (!loaded) {
    timer = setTimer(() => {
      timer = undefined;
      if (!disposed && !loaded) options.onSlow();
    }, options.timeoutMs ?? MAP_LOAD_SOFT_TIMEOUT_MS);
  }

  return () => {
    if (disposed) return;
    disposed = true;
    clearSoftTimeout();
    map.off("load", handleLoad);
    map.off("error", handleError);
  };
}

export function isFatalInitialStyleError(event: InitialMapErrorEvent, styleUrl: string) {
  const { status, url } = event.error ?? {};
  return (status === 401 || status === 403 || status === 404) && url === styleUrl;
}
