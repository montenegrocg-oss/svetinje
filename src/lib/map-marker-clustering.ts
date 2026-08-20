export interface ProjectedMarker<T> {
  item: T;
  x: number;
  y: number;
}

export function clusterProjectedMarkers<T>(
  points: ProjectedMarker<T>[],
  radius: number,
): ProjectedMarker<T>[][] {
  const orderedPoints = [...points].sort((left, right) => (
    left.x - right.x || left.y - right.y
  ));
  const groups: ProjectedMarker<T>[][] = [];
  const assigned = new Set<number>();
  const radiusSquared = radius * radius;

  // Keep every group bounded to one stable anchor so neighbor chains cannot span the map.
  orderedPoints.forEach((anchor, anchorIndex) => {
    if (assigned.has(anchorIndex)) return;
    const group = orderedPoints.filter((candidate, candidateIndex) => {
      if (assigned.has(candidateIndex)) return false;
      const deltaX = anchor.x - candidate.x;
      const deltaY = anchor.y - candidate.y;
      if ((deltaX * deltaX) + (deltaY * deltaY) > radiusSquared) return false;
      assigned.add(candidateIndex);
      return true;
    });

    groups.push(group);
  });

  return groups;
}

export function getClusterExpansionZoom<T>(
  points: ProjectedMarker<T>[],
  currentZoom: number,
  maxClusterZoom: number,
  radius: number,
): number {
  const firstZoom = Math.min(maxClusterZoom, Math.floor(currentZoom) + 1);
  for (let zoom = firstZoom; zoom <= maxClusterZoom; zoom += 1) {
    const scale = 2 ** (zoom - currentZoom);
    const scaledPoints = points.map((point) => ({
      ...point,
      x: point.x * scale,
      y: point.y * scale,
    }));
    if (clusterProjectedMarkers(scaledPoints, radius).length > 1) return zoom;
  }
  return maxClusterZoom;
}
