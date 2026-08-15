import type { APIRoute } from "astro";
import { loadVisibleRoutes } from "../../../lib/content/routes.ts";
export async function getStaticPaths() { return (await loadVisibleRoutes()).map((route) => ({ params: { slug: route.slug }, props: { route } })); }
export const GET: APIRoute = ({ props }) => new Response(`${JSON.stringify(props.route.track)}\n`, { headers: { "content-type": "application/geo+json; charset=utf-8", "cache-control": "public, max-age=3600" } });
