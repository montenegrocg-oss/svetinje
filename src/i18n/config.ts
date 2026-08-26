export const localeConfig = {
  sr: {
    htmlLang: "sr-Cyrl-ME",
    label: "Српски",
    prefix: "",
    available: true,
  },
  ru: {
    htmlLang: "ru",
    label: "Русский",
    prefix: "/ru",
    available: true,
  },
  en: {
    htmlLang: "en",
    label: "English",
    prefix: "/en",
    available: true,
  },
} as const;

export type Locale = keyof typeof localeConfig;

export const routeConfig = {
  home: { sr: "/", ru: "/ru/", en: "/en/" },
  monasteries: { sr: "/manastiri/", ru: "/ru/monastyri/", en: "/en/monasteries/" },
  maleMonasteries: { sr: "/manastiri/muski/", ru: "/ru/monastyri/muzhskie/", en: "/en/monasteries/men/" },
  femaleMonasteries: { sr: "/manastiri/zenski/", ru: "/ru/monastyri/zhenskie/", en: "/en/monasteries/women/" },
  churches: { sr: "/crkve/", ru: "/ru/tserkvi/", en: "/en/churches/" },
  holyPlaces: { sr: "/svetinje/", ru: "/ru/svyatyni/", en: "/en/holy-places/" },
  map: { sr: "/mapa/", ru: "/ru/karta/", en: "/en/map/" },
  routes: { sr: "/rute/", ru: "/ru/marshruty/", en: "/en/routes/" },
  calendar: { sr: "/kalendar/", ru: "/ru/kalendar/", en: "/en/calendar/" },
  news: { sr: "/novosti/", ru: "/ru/novosti/", en: "/en/news/" },
  about: { sr: "/o-projektu/", ru: "/ru/o-proekte/", en: "/en/about/" },
  privacy: { sr: "/politika-privatnosti/", ru: "/ru/privacy/", en: "/en/privacy/" },
  cookies: { sr: "/kolacici-i-lokalno-skladistenje/", ru: "/ru/cookies/", en: "/en/cookies/" },
  sources: { sr: "/izvori/", ru: "/ru/istochniki/", en: "/en/sources/" },
  favorites: { sr: "/omiljeno/", ru: "/ru/izbrannoe/", en: "/en/favorites/" },
} as const;

export type RouteKey = keyof typeof routeConfig;

export const localizedStaticRouteKeys = [
  "home",
  "monasteries",
  "maleMonasteries",
  "femaleMonasteries",
  "churches",
  "map",
  "routes",
  "calendar",
  "news",
  "about",
  "privacy",
  "cookies",
  "favorites",
] as const satisfies readonly RouteKey[];

export type LocalizedStaticRouteKey = (typeof localizedStaticRouteKeys)[number];

const localizedStaticRouteKeySet = new Set<RouteKey>(localizedStaticRouteKeys);

export function staticLocaleLinksForRoute(route: RouteKey): Record<Locale, string> | undefined {
  if (!localizedStaticRouteKeySet.has(route)) return undefined;
  return { ...routeConfig[route] };
}

export function staticEquivalentForPath(path: string): Record<Locale, string> | undefined {
  const route = localizedStaticRouteKeys.find((key) => Object.values(routeConfig[key]).some((candidate) => candidate === path));
  return route ? staticLocaleLinksForRoute(route) : undefined;
}

export const placeDetailRoot = {
  sr: "/svetinje/",
  ru: "/ru/svyatyni/",
  en: "/en/holy-places/",
} as const satisfies Record<Locale, string>;

export function routeFor(locale: Locale, route: RouteKey): string {
  return routeConfig[route][locale];
}

export interface EquivalentPage {
  kind: "static" | "place";
  route?: RouteKey;
  slugs?: Partial<Record<Locale, string>>;
  availableLocales: readonly Locale[];
}

export function equivalentPageFor(locale: Locale, page: EquivalentPage): string | undefined {
  if (!page.availableLocales.includes(locale)) return undefined;
  if (page.kind === "static") return page.route ? routeFor(locale, page.route) : undefined;
  const slug = page.slugs?.[locale];
  return slug ? `${placeDetailRoot[locale]}${slug}/` : undefined;
}

export interface LocalizedSeoPage {
  locale: Locale;
  path: string;
  title: string;
  description: string;
}

export interface LocalizedSeoMetadata {
  htmlLang: string;
  title: string;
  description: string;
  canonical: string;
  alternates: Array<{ hreflang: string; href: string }>;
  xDefault?: string;
}

export function localizedSeoMetadata(
  origin: string,
  current: LocalizedSeoPage,
  availablePages: readonly LocalizedSeoPage[],
): LocalizedSeoMetadata {
  const pages = availablePages;
  const srPage = pages.find((page) => page.locale === "sr");
  return {
    htmlLang: localeConfig[current.locale].htmlLang,
    title: current.title,
    description: current.description,
    canonical: new URL(current.path, origin).href,
    alternates: pages.map((page) => ({
      hreflang: localeConfig[page.locale].htmlLang,
      href: new URL(page.path, origin).href,
    })),
    ...(srPage ? { xDefault: new URL(srPage.path, origin).href } : {}),
  };
}
