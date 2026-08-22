import { loadLocalizedVisiblePlaces } from "./content/localized-publication";
import { localeConfig, localizedStaticRouteKeys, routeFor } from "../i18n/config";

export async function localizedStaticPaths(locale: "ru" | "en") {
  const places = await loadLocalizedVisiblePlaces(locale);
  const prefix = `${localeConfig[locale].prefix}/`;
  const staticPaths = localizedStaticRouteKeys
    .filter((page) => page !== "home")
    .map((page) => ({
      params: { path: routeFor(locale, page).slice(prefix.length).replace(/\/$/, "") },
      props: { locale, page },
    }));
  const placePrefix = locale === "ru" ? "svyatyni" : "holy-places";
  return [...staticPaths, ...places.map((place) => ({ params: { path: `${placePrefix}/${place.slug}` }, props: { locale, page: "place", place } }))];
}
