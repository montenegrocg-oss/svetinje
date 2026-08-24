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
