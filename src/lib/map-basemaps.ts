export const MAP_BASEMAPS = [
  { id: "default", mapId: "019fc7d8-717c-701d-9ca5-a53d9438d3ce", labelKey: "default" },
  { id: "topographic", mapId: "topo-v4", labelKey: "topographic" },
  { id: "satellite", mapId: "satellite-v4", labelKey: "satellite" },
] as const;

export type MapBasemapId = (typeof MAP_BASEMAPS)[number]["id"];
export type MapBasemapLabelKey = (typeof MAP_BASEMAPS)[number]["labelKey"];
export type MapLayout = "homepage" | "full";

export const DEFAULT_MAP_BASEMAP_ID: MapBasemapId = "default";

export const isMapBasemapId = (value: string): value is MapBasemapId => (
  MAP_BASEMAPS.some(({ id }) => id === value)
);

export const mapBasemapStyleUrl = (id: MapBasemapId, apiKey: string): string => {
  const basemap = MAP_BASEMAPS.find((candidate) => candidate.id === id);
  if (!basemap) throw new Error(`Unknown map basemap: ${id}`);
  return `https://api.maptiler.com/maps/${basemap.mapId}/style.json?key=${encodeURIComponent(apiKey)}`;
};

export const mapCooperativeGesturesForLayout = (
  layout: MapLayout,
  mobileTouch: boolean,
): boolean => layout === "homepage" && !mobileTouch;
