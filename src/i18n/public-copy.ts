import type { Locale, RouteKey } from "./config.ts";

export const publicCopy = {
  sr: {
    siteName: "Светиње.me", skip: "Пређи на главни садржај", menu: "Мени", openMenu: "Отвори главни мени",
    nav: { monasteries: "Манастири", maleMonasteries: "Мушки манастири", femaleMonasteries: "Женски манастири", churches: "Цркве", map: "Мапа", routes: "Руте", calendar: "Календар", news: "Новости", about: "О пројекту", sources: "Извори" },
    allMonasteries: "Сви манастири", catalogue: "Каталог", allAreas: "Све области", chooseArea: "Изаберите област",
    showMap: "Прикажи на карти", clear: "Очисти филтере", openPage: "Отвори страницу", page: "Страница", of: "од",
    footer: "Дигитални водич кроз православну баштину Црне Горе.", footerNav: "Навигација у подножју",
    unavailable: "Садржај се објављује након завршене провјере.", preparing: "Садржај је у припреми",
  },
  ru: {
    siteName: "Святыни.me", skip: "Перейти к основному содержанию", menu: "Меню", openMenu: "Открыть главное меню",
    nav: { monasteries: "Монастыри", maleMonasteries: "Мужские монастыри", femaleMonasteries: "Женские монастыри", churches: "Храмы", map: "Карта", routes: "Маршруты", calendar: "Календарь", news: "Новости", about: "О проекте", sources: "Источники" },
    allMonasteries: "Все монастыри", catalogue: "Каталог", allAreas: "Все регионы", chooseArea: "Выберите регион",
    showMap: "Показать на карте", clear: "Сбросить фильтры", openPage: "Открыть страницу", page: "Страница", of: "из",
    footer: "Цифровой путеводитель по православному наследию Черногории.", footerNav: "Навигация в подвале",
    unavailable: "Материал появится после редакционной проверки.", preparing: "Материал готовится",
  },
  en: {
    siteName: "Holy Places.me", skip: "Skip to main content", menu: "Menu", openMenu: "Open main menu",
    nav: { monasteries: "Monasteries", maleMonasteries: "Men's monasteries", femaleMonasteries: "Women's monasteries", churches: "Churches", map: "Map", routes: "Routes", calendar: "Calendar", news: "News", about: "About", sources: "Sources" },
    allMonasteries: "All monasteries", catalogue: "Catalogue", allAreas: "All regions", chooseArea: "Choose a region",
    showMap: "Show on map", clear: "Clear filters", openPage: "Open page", page: "Page", of: "of",
    footer: "A digital guide to the Orthodox heritage of Montenegro.", footerNav: "Footer navigation",
    unavailable: "Content is published after editorial review.", preparing: "Content is being prepared",
  },
} as const;

export type PublicCopy = (typeof publicCopy)[Locale];
export const navigationRouteKeys = ["monasteries", "churches", "map", "routes", "calendar", "news", "about"] as const satisfies readonly RouteKey[];

export const areaLabels: Record<Locale, Record<string, string>> = {
  sr: { "budva-pastrovici": "Будва и Паштровићи", "boka-kotorska": "Бока Которска", "cetinje-okolina": "Цетиње и околина", "podgorica-zeta": "Подгорица и Зета", "bar-crmnica-skadarsko-jezero": "Бар, Црмница и Скадарско језеро", "ostrog-sredisnja-crna-gora": "Острог и средишња Црна Гора", "sjever-crne-gore": "Сјевер Црне Горе" },
  ru: { "budva-pastrovici": "Будва и Паштровичи", "boka-kotorska": "Бока-Которская", "cetinje-okolina": "Цетине и окрестности", "podgorica-zeta": "Подгорица и Зета", "bar-crmnica-skadarsko-jezero": "Бар, Црмница и Скадарское озеро", "ostrog-sredisnja-crna-gora": "Острог и Центральная Черногория", "sjever-crne-gore": "Север Черногории" },
  en: { "budva-pastrovici": "Budva and Paštrovići", "boka-kotorska": "Bay of Kotor", "cetinje-okolina": "Cetinje and surroundings", "podgorica-zeta": "Podgorica and Zeta", "bar-crmnica-skadarsko-jezero": "Bar, Crmnica and Lake Skadar", "ostrog-sredisnja-crna-gora": "Ostrog and Central Montenegro", "sjever-crne-gore": "Northern Montenegro" },
};

export function localizedPlaceType(locale: Locale, value: string): string {
  const labels: Record<Locale, Record<string, string>> = {
    sr: { monastery: "Манастир", cathedral: "Саборни храм", church: "Храм", chapel: "Храм", other: "Свето мјесто" },
    ru: { monastery: "Монастырь", cathedral: "Собор", church: "Храм", chapel: "Часовня", other: "Святое место" },
    en: { monastery: "Monastery", cathedral: "Cathedral", church: "Church", chapel: "Chapel", other: "Holy place" },
  };
  return labels[locale][value] ?? labels[locale].other!;
}
