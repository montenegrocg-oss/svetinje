import type { VisibleRoute } from "./content/routes.ts";

export interface MapEditorialRoute {
  id: string;
  title: string;
  routeType: VisibleRoute["routeType"];
  trackUrl: string;
  detailUrl: string;
  metrics: {
    distanceM: number;
    ascentM?: number;
    durationMinutes?: number;
  };
  difficulty: VisibleRoute["difficulty"];
}

export type MapEditorialRouteFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  { id: string }
>;

export const EDITORIAL_ROUTE_SOURCE_ID = "editorial-walking-routes";
export const EDITORIAL_ROUTE_LAYER_IDS = [
  "editorial-walking-routes-casing",
  "editorial-walking-routes-line",
  "editorial-walking-routes-hit",
] as const;

interface EditorialRouteLayerMap {
  getSource(id: string): unknown;
  addSource(id: string, source: { type: "geojson"; data: MapEditorialRouteFeatureCollection }): unknown;
  getLayer(id: string): unknown;
  addLayer(layer: {
    id: string;
    type: "line";
    source: string;
    layout: Record<string, unknown>;
    paint: Record<string, unknown>;
  }): unknown;
  setLayoutProperty(id: string, name: "visibility", value: "visible" | "none"): unknown;
}

const routeLayers = [
  {
    id: EDITORIAL_ROUTE_LAYER_IDS[0],
    paint: {
      "line-color": "#0a2944",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 4.5, 13, 7],
      "line-opacity": 0.72,
    },
  },
  {
    id: EDITORIAL_ROUTE_LAYER_IDS[1],
    paint: {
      "line-color": "#d0ab61",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 2.4, 13, 4],
      "line-opacity": 0.96,
    },
  },
  {
    id: EDITORIAL_ROUTE_LAYER_IDS[2],
    paint: { "line-color": "#d0ab61", "line-width": 18, "line-opacity": 0.01 },
  },
] as const;

export const ensureEditorialRouteLayers = (
  map: EditorialRouteLayerMap,
  data: MapEditorialRouteFeatureCollection,
  visible: boolean,
) => {
  if (!map.getSource(EDITORIAL_ROUTE_SOURCE_ID)) {
    map.addSource(EDITORIAL_ROUTE_SOURCE_ID, { type: "geojson", data });
  }

  routeLayers.forEach(({ id, paint }) => {
    if (map.getLayer(id)) return;
    map.addLayer({
      id,
      type: "line",
      source: EDITORIAL_ROUTE_SOURCE_ID,
      layout: {
        visibility: visible ? "visible" : "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint,
    });
  });
};

export const setEditorialRouteLayersVisibility = (
  map: EditorialRouteLayerMap,
  visible: boolean,
) => {
  EDITORIAL_ROUTE_LAYER_IDS.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
  });
};

export const mapEditorialRoutes = (routes: readonly VisibleRoute[]): MapEditorialRoute[] => routes.map((route) => ({
  id: route.id,
  title: route.shortName,
  routeType: route.routeType,
  trackUrl: route.trackUrl,
  detailUrl: `/rute/${route.slug}/`,
  metrics: {
    distanceM: route.metrics.distance_m!,
    ...(route.metrics.ascent_m === undefined ? {} : { ascentM: route.metrics.ascent_m }),
    ...((route.metrics.estimated_duration_minutes ?? route.metrics.recorded_duration_minutes) === undefined
      ? {}
      : { durationMinutes: route.metrics.estimated_duration_minutes ?? route.metrics.recorded_duration_minutes }),
  },
  difficulty: route.difficulty,
}));
