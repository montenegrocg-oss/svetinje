import { categoryForPlaceType, type PlaceCategory } from "./place-filters.ts";

export interface MarkerAsset {
  src: string;
  width: number;
  height: number;
}

export const MARKER_ASSETS: Readonly<Record<PlaceCategory, MarkerAsset>> = Object.freeze({
  monasteries: { src: "/images/map/pin-monastery.png", width: 354, height: 473 },
  churches: { src: "/images/map/pin-church.png", width: 354, height: 480 },
  "holy-places": { src: "/images/map/pin-holy-place.png", width: 352, height: 497 },
});

export function resolveMarkerAsset(placeType: string): MarkerAsset | undefined {
  const category = categoryForPlaceType(placeType);
  return category ? MARKER_ASSETS[category] : undefined;
}
