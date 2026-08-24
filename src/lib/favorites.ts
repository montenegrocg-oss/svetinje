export const FAVORITES_STORAGE_KEY = "svetinje:favorites:v1";
export const FAVORITES_CHANGE_EVENT = "svetinje:favoriteschange";

export interface FavoritesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface FavoritesChangeDetail {
  ids: string[];
}

interface SubscribeOptions {
  storage?: FavoritesStorage;
  target?: EventTarget;
}

function browserTarget(): (Window & typeof globalThis) | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function browserStorage(): FavoritesStorage | undefined {
  try {
    return browserTarget()?.localStorage;
  } catch {
    return undefined;
  }
}

export function normalizeFavoriteIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const id = candidate.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function parseFavoriteIds(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    return normalizeFavoriteIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

function readFavoriteIds(storage: FavoritesStorage | undefined): { ids: string[]; readable: boolean } {
  if (!storage) return { ids: [], readable: false };
  try {
    return { ids: parseFavoriteIds(storage.getItem(FAVORITES_STORAGE_KEY)), readable: true };
  } catch {
    return { ids: [], readable: false };
  }
}

export function getFavoriteIds(storage: FavoritesStorage | undefined = browserStorage()): string[] {
  return readFavoriteIds(storage).ids;
}

function favoritesChangeEvent(ids: string[]): Event {
  if (typeof CustomEvent === "function") {
    return new CustomEvent<FavoritesChangeDetail>(FAVORITES_CHANGE_EVENT, { detail: { ids } });
  }
  const event = new Event(FAVORITES_CHANGE_EVENT);
  Object.defineProperty(event, "detail", { value: { ids } satisfies FavoritesChangeDetail });
  return event;
}

function persistFavoriteIds(
  ids: unknown,
  storage: FavoritesStorage | undefined = browserStorage(),
  target: EventTarget | undefined = browserTarget(),
): string[] {
  const normalized = normalizeFavoriteIds(ids);
  if (!storage) return [];
  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    return getFavoriteIds(storage);
  }
  target?.dispatchEvent(favoritesChangeEvent(normalized));
  return normalized;
}

export function isFavorite(id: string, storage: FavoritesStorage | undefined = browserStorage()): boolean {
  const normalizedId = normalizeFavoriteIds([id])[0];
  return normalizedId ? getFavoriteIds(storage).includes(normalizedId) : false;
}

export function addFavorite(
  id: string,
  storage: FavoritesStorage | undefined = browserStorage(),
  target: EventTarget | undefined = browserTarget(),
): string[] {
  const normalizedId = normalizeFavoriteIds([id])[0];
  const currentRead = readFavoriteIds(storage);
  const current = currentRead.ids;
  if (!currentRead.readable) return current;
  if (!normalizedId || current.includes(normalizedId)) return current;
  return persistFavoriteIds([...current, normalizedId], storage, target);
}

export function removeFavorite(
  id: string,
  storage: FavoritesStorage | undefined = browserStorage(),
  target: EventTarget | undefined = browserTarget(),
): string[] {
  const normalizedId = normalizeFavoriteIds([id])[0];
  const currentRead = readFavoriteIds(storage);
  const current = currentRead.ids;
  if (!currentRead.readable) return current;
  if (!normalizedId || !current.includes(normalizedId)) return current;
  return persistFavoriteIds(current.filter((candidate) => candidate !== normalizedId), storage, target);
}

export function toggleFavorite(
  id: string,
  storage: FavoritesStorage | undefined = browserStorage(),
  target: EventTarget | undefined = browserTarget(),
): string[] {
  const normalizedId = normalizeFavoriteIds([id])[0];
  const currentRead = readFavoriteIds(storage);
  if (!normalizedId || !currentRead.readable) return currentRead.ids;
  return currentRead.ids.includes(normalizedId)
    ? persistFavoriteIds(currentRead.ids.filter((candidate) => candidate !== normalizedId), storage, target)
    : persistFavoriteIds([...currentRead.ids, normalizedId], storage, target);
}

export function getFavoriteCount(storage: FavoritesStorage | undefined = browserStorage()): number {
  return getFavoriteIds(storage).length;
}

export function subscribeFavorites(
  listener: (ids: string[]) => void,
  options: SubscribeOptions = {},
): () => void {
  const target = options.target ?? browserTarget();
  const storage = options.storage ?? browserStorage();
  if (!target) return () => undefined;

  const handleSameTab = (event: Event) => {
    const detail = (event as CustomEvent<FavoritesChangeDetail>).detail;
    listener(detail ? normalizeFavoriteIds(detail.ids) : getFavoriteIds(storage));
  };
  const handleStorage = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key !== FAVORITES_STORAGE_KEY && storageEvent.key !== null) return;
    listener(storageEvent.key === FAVORITES_STORAGE_KEY
      ? parseFavoriteIds(storageEvent.newValue)
      : getFavoriteIds(storage));
  };

  target.addEventListener(FAVORITES_CHANGE_EVENT, handleSameTab);
  target.addEventListener("storage", handleStorage);
  return () => {
    target.removeEventListener(FAVORITES_CHANGE_EVENT, handleSameTab);
    target.removeEventListener("storage", handleStorage);
  };
}
