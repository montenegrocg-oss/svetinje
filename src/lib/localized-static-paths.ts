import { loadLocalizedVisiblePlaces } from "./content/localized-publication";

const staticSegments = {
  ru: { monasteries: "monastyri", maleMonasteries: "monastyri/muzhskie", femaleMonasteries: "monastyri/zhenskie", churches: "tserkvi", map: "karta", routes: "marshruty", calendar: "kalendar", news: "novosti", about: "o-proekte" },
  en: { monasteries: "monasteries", maleMonasteries: "monasteries/men", femaleMonasteries: "monasteries/women", churches: "churches", map: "map", routes: "routes", calendar: "calendar", news: "news", about: "about" },
} as const;

export async function localizedStaticPaths(locale: "ru" | "en") {
  const places = await loadLocalizedVisiblePlaces(locale);
  const staticPaths = Object.entries(staticSegments[locale]).map(([page, path]) => ({ params: { path }, props: { locale, page } }));
  const placePrefix = locale === "ru" ? "svyatyni" : "holy-places";
  return [...staticPaths, ...places.map((place) => ({ params: { path: `${placePrefix}/${place.slug}` }, props: { locale, page: "place", place } }))];
}
