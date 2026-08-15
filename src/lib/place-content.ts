const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);

export function getPlaceAboutLabel(placeType: string | undefined): string {
  if (placeType === "monastery") return "О манастиру";
  if (["church", "chapel", "cathedral"].includes(placeType ?? "")) return "О цркви";
  return "О светињи";
}

export function parseYoutubeVideoId(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || /[<>]/.test(value)) return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  let candidate: string | null | undefined;
  if (host === "youtu.be") {
    if (parts.length === 1) candidate = parts[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else if (parts.length === 2 && ["shorts", "embed"].includes(parts[0] ?? "")) candidate = parts[1];
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : undefined;
}

export function canonicalYoutubeUrl(value: unknown): string | undefined {
  const id = parseYoutubeVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : undefined;
}

export interface PlaceNarrativeBlock {
  kind: "heading" | "paragraph";
  text: string;
  id?: string;
}

export function parsePlaceNarrativeBlocks(body: string): PlaceNarrativeBlock[] {
  const blocks: PlaceNarrativeBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    const raw = paragraph.join(" ").trim();
    paragraph = [];
    if (!raw || /^\[\^[^\]]+\]:/.test(raw)) return;
    const text = raw.replace(/\[\^[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
  };
  for (const rawLine of body.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")) {
    const line = rawLine.trim();
    const heading = line.match(/^#{2,}\s+(.+?)(?:\s+\{#([a-z0-9-]+)\})?\s*$/);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[1]!.trim(), ...(heading[2] ? { id: heading[2] } : {}) });
    } else if (!line) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

export function normalizeUnifiedNarrativeBody(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  return normalized ? `${normalized}\n` : "";
}
