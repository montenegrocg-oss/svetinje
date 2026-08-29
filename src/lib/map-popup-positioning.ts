export interface MapPopupRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type MapPopupPanOffset = [x: number, y: number];

export const getMapPopupPanOffset = (
  popupRect: MapPopupRect,
  safeRect: MapPopupRect,
): MapPopupPanOffset => {
  let x = 0;
  let y = 0;

  if (popupRect.left < safeRect.left) x = popupRect.left - safeRect.left;
  else if (popupRect.right > safeRect.right) x = popupRect.right - safeRect.right;

  if (popupRect.top < safeRect.top) y = popupRect.top - safeRect.top;
  else if (popupRect.bottom > safeRect.bottom) y = popupRect.bottom - safeRect.bottom;

  return [x, y];
};
