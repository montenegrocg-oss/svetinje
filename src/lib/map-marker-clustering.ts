export interface ProjectedMarker<T> {
  item: T;
  x: number;
  y: number;
}

export function clusterProjectedMarkers<T>(
  points: ProjectedMarker<T>[],
  radius: number,
): ProjectedMarker<T>[][] {
  const groups: ProjectedMarker<T>[][] = [];
  const visited = new Set<number>();
  const radiusSquared = radius * radius;

  points.forEach((_, index) => {
    if (visited.has(index)) return;
    const group: ProjectedMarker<T>[] = [];
    const pending = [index];
    visited.add(index);

    while (pending.length > 0) {
      const currentIndex = pending.pop();
      if (currentIndex === undefined) continue;
      const current = points[currentIndex];
      if (!current) continue;
      group.push(current);

      points.forEach((candidate, candidateIndex) => {
        if (visited.has(candidateIndex)) return;
        const deltaX = current.x - candidate.x;
        const deltaY = current.y - candidate.y;
        if ((deltaX * deltaX) + (deltaY * deltaY) > radiusSquared) return;
        visited.add(candidateIndex);
        pending.push(candidateIndex);
      });
    }

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
