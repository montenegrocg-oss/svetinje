const SYNTHETIC_REFERENCE_MARKERS = [
  /Дјелимично активан/i,
];

const LEGACY_REFERENCE_FINGERPRINT = [
  /180\s*m/i,
  /08:00/i,
  /16:00/i,
  /18:00/i,
  /Црква Св\. Тројице/i,
];

export function containsUnsupportedReferenceScreenshotContent(html) {
  if (SYNTHETIC_REFERENCE_MARKERS.some((marker) => marker.test(html))) return true;
  return LEGACY_REFERENCE_FINGERPRINT.every((marker) => marker.test(html));
}
