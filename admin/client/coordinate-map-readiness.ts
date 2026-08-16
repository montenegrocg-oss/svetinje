type StyleSnapshot = {
  layers?: readonly unknown[];
  sources?: Record<string, unknown>;
};

type StyleReadableMap = {
  getStyle(): StyleSnapshot;
  isStyleLoaded(): boolean | void;
};

const errorText = (value: unknown): string => {
  if (value instanceof Error) return `${value.message}\n${value.stack ?? ""}`;
  if (!value || typeof value !== "object") return String(value ?? "");
  const candidate = value as { error?: unknown; message?: unknown; url?: unknown };
  return [candidate.message, candidate.url, candidate.error === value ? "" : errorText(candidate.error)]
    .filter(Boolean)
    .join("\n");
};

export const hasLoadedBaseStyle = (map: StyleReadableMap): boolean => {
  try {
    const style = map.getStyle();
    return Boolean(map.isStyleLoaded())
      && Array.isArray(style.layers)
      && style.layers.length > 0
      && Boolean(style.sources)
      && Object.keys(style.sources ?? {}).length > 0;
  } catch {
    return false;
  }
};

export const isFatalBaseStyleError = (event: unknown): boolean => {
  const text = errorText(event);
  return /\/maps\/[^/]+\/style\.json(?:\?|$)/i.test(text)
    || /(?:failed|unable) to load (?:the )?(?:map )?style/i.test(text);
};
