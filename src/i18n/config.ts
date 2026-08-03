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
    available: false,
  },
  en: {
    htmlLang: "en",
    label: "English",
    prefix: "/en",
    available: false,
  },
} as const;

export type Locale = keyof typeof localeConfig;

export const routeConfig = {
  home: { sr: "/", ru: "/ru/", en: "/en/" },
  holyPlaces: { sr: "/svetinje/", ru: "/ru/svyatyni/", en: "/en/holy-places/" },
  about: { sr: "/o-projektu/", ru: "/ru/o-proekte/", en: "/en/about/" },
  sources: { sr: "/izvori/", ru: "/ru/istochniki/", en: "/en/sources/" },
} as const;

export type RouteKey = keyof typeof routeConfig;

export function routeFor(locale: Locale, route: RouteKey): string {
  return routeConfig[route][locale];
}
