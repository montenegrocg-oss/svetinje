import type { APIRoute } from "astro";
import { loadFeastRegistry } from "../../lib/content/feast-registry.ts";
import { loadVisiblePlaces } from "../../lib/content/publication.ts";
import {
  patronalFeastDay,
  patronalFeastProjectionDates,
  selectVisibleFeastCatalogues,
  type PublicPatronalFeastDay,
} from "../../lib/public-feast-catalogues.ts";

export const prerender = true;

export async function getStaticPaths() {
  const [registry, places] = await Promise.all([loadFeastRegistry(), loadVisiblePlaces()]);
  const catalogues = selectVisibleFeastCatalogues(places);
  return patronalFeastProjectionDates().map((date) => ({
    params: { date },
    props: { projection: patronalFeastDay(registry, catalogues, date) },
  }));
}

export const GET: APIRoute = ({ props }) => new Response(`${JSON.stringify(props.projection as PublicPatronalFeastDay)}\n`, {
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  },
});
