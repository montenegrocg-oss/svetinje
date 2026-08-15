import type { APIRoute } from "astro";
import { loadVisibleRoutes } from "../../../lib/content/routes.ts";
import { sanitizedGpxFromGeoJson } from "../../../lib/routes/gpx.ts";
export async function getStaticPaths() { return (await loadVisibleRoutes()).map((route) => ({ params: { slug: route.slug }, props: { route } })); }
export const GET: APIRoute = ({ props }) => new Response(sanitizedGpxFromGeoJson(props.route.name, props.route.track), { headers: { "content-type": "application/gpx+xml; charset=utf-8", "content-disposition": `attachment; filename="${props.route.slug}.gpx"` } });
