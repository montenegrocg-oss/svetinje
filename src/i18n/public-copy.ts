import type { Locale, RouteKey } from "./config.ts";

export const publicCopy = {
  sr: {
    siteName: "Светиње.me", skip: "Пређи на главни садржај", menu: "Мени", openMenu: "Отвори главни мени",
    nav: { monasteries: "Манастири", maleMonasteries: "Мушки манастири", femaleMonasteries: "Женски манастири", churches: "Цркве", map: "Мапа", routes: "Руте", calendar: "Календар", news: "Новости", about: "О пројекту", sources: "Извори" },
    allMonasteries: "Сви манастири", catalogue: "Каталог", allAreas: "Све области", chooseArea: "Изаберите област",
    showMap: "Прикажи на карти", clear: "Очисти филтере", openPage: "Отвори страницу", page: "Страница", of: "од",
    footer: "Дигитални водич кроз православну баштину Црне Горе.", footerNav: "Навигација у подножју",
    unavailable: "Садржај се објављује након завршене провјере.", preparing: "Садржај је у припреми",
    homepage: {
      metadata: { title: "Светиње — Православна Црна Гора", description: "Дигитални водич кроз православне светиње, поклоничке руте и духовно насљеђе Црне Горе." },
      hero: { eyebrow: "Дигитални водич", title: "Православна Црна Гора", description: "Откријте манастире и храмове широм Црне Горе." },
      filters: { aria: "Филтери каталога", all: "Све", monasteries: "Манастири", churches: "Цркве", routes: "Поклоничке руте" },
      explorer: {
        aria: "Претрага и филтри каталога", searchLabel: "Претражите светиње", searchPlaceholder: "Претражите светиње…",
        filterSettingsLabel: "Подешавања филтера — ускоро", filterSettingsTitle: "Подешавања филтера су у припреми",
        areaPrefix: "Област", clearArea: "Уклони филтер области", noResultsEyebrow: "Претрага каталога",
        empty: { seal: "С", title: "Каталог светиња је у припреми.", body: "Провјерени записи ће се појавити овдје након завршене стручне и језичке провјере.", link: "Како садржај постаје јаван" },
        pagination: { top: "горња", bottom: "доња", aria: "Странице прегледа светиња — {position} навигација", previous: "Претходна страница", next: "Сљедећа страница" },
        status: { none: "Нема записа за изабрани филтер.", page: "Страница {current} од {total}.", one: "Приказан је један резултат. {page}", many: "Приказана су {shown} од {matched} резултата. {page}" },
        noResults: {
          monasteries: { title: "Нема манастира у овом приказу", body: "Тренутно нема манастира који одговарају изабраном филтеру и претрази." },
          churches: { title: "Нема храмова у овом приказу", body: "Тренутно нема храмова који одговарају изабраном филтеру и претрази." },
          routes: { title: "Поклоничке руте су у припреми", body: "Руте ће бити приказане након провјере свих укључених мјеста и практичних података." },
          all: { title: "Нема резултата", body: "Покушајте са другим називом или изаберите другу категорију." },
        },
      },
      recommended: { title: "Најпосјећеније светиње", showAll: "Прикажи све", aria: "Најпосјећеније светиње" },
      today: { label: "ДАНАС", calendar: "ПРАВОСЛАВНИ КАЛЕНДАР", calendarPreparing: "Календар је у припреми", openCalendar: "Отвори календар", gospel: "ИЗ ДАНАШЊЕГ ЈЕВАНЂЕЉА", readingMissing: "За овај дан литургијско јеванђељско читање није наведено.", read: "Прочитај читање", translationTitle: "Превод читања је у припреми", translationBody: "Календарска читања биће доступна након језичке и уредничке провјере." },
      routes: { title: "Популарне руте", showAll: "Прикажи све", preparingLabel: "У припреми", preparingTitle: "Поклоничке руте су у припреми.", preparingBody: "Путање ће бити приказане тек након провјере свих укључених мјеста и практичних података." },
      areas: { eyebrow: "ИСТРАЖИТЕ", title: "По областима", description: "Откријте манастире и храмове у различитим крајевима Црне Горе." },
      mapControls: { quickAria: "Брзи избор на карти", builder: "Изгради руту", builderNotice: "Функција планирања руте је у припреми.", controls: "Контроле карте", layers: "Слојеви", layersTitle: "Слојеви карте", layersBody: "Основни Outdoor приказ је активан. Избор додатних картографских слојева биће доступан у каснијој фази.", zoom: "Зумирање карте", zoomIn: "Увећај карту", zoomOut: "Умањи карту", reset: "Прикажи поново Црну Гору", help: "Како користити карту?", helpTitle: "Интерактивна основна карта", helpBody: "Карту можете помјерати и зумирати. Ознаке светиња и руте неће бити приказане док подаци не прођу уредничко одобрење." },
    },
  },
  ru: {
    siteName: "Святыни.me", skip: "Перейти к основному содержанию", menu: "Меню", openMenu: "Открыть главное меню",
    nav: { monasteries: "Монастыри", maleMonasteries: "Мужские монастыри", femaleMonasteries: "Женские монастыри", churches: "Храмы", map: "Карта", routes: "Маршруты", calendar: "Календарь", news: "Новости", about: "О проекте", sources: "Источники" },
    allMonasteries: "Все монастыри", catalogue: "Каталог", allAreas: "Все регионы", chooseArea: "Выберите регион",
    showMap: "Показать на карте", clear: "Сбросить фильтры", openPage: "Открыть страницу", page: "Страница", of: "из",
    footer: "Цифровой путеводитель по православному наследию Черногории.", footerNav: "Навигация в подвале",
    unavailable: "Материал появится после редакционной проверки.", preparing: "Материал готовится",
    homepage: {
      metadata: { title: "Святыни — Православная Черногория", description: "Цифровой путеводитель по православным святыням, паломническим маршрутам и духовному наследию Черногории." },
      hero: { eyebrow: "Цифровой путеводитель", title: "Православная Черногория", description: "Откройте монастыри и храмы Черногории." },
      filters: { aria: "Фильтры каталога", all: "Все", monasteries: "Монастыри", churches: "Храмы", routes: "Маршруты" },
      explorer: {
        aria: "Поиск и фильтры каталога", searchLabel: "Искать святыни", searchPlaceholder: "Поиск по святыням…",
        filterSettingsLabel: "Настройки фильтров — скоро", filterSettingsTitle: "Настройки фильтров готовятся",
        areaPrefix: "Регион", clearArea: "Убрать фильтр региона", noResultsEyebrow: "Поиск по каталогу",
        empty: { seal: "С", title: "Каталог святынь готовится.", body: "Проверенные материалы появятся здесь после редакционной и языковой проверки.", link: "Как публикуются материалы" },
        pagination: { top: "верхняя", bottom: "нижняя", aria: "Страницы списка святынь — {position} навигация", previous: "Предыдущая страница", next: "Следующая страница" },
        status: { none: "Для выбранного фильтра записей нет.", page: "Страница {current} из {total}.", one: "Показан один результат. {page}", many: "Показано {shown} из {matched} результатов. {page}" },
        noResults: {
          monasteries: { title: "Монастыри не найдены", body: "Нет монастырей, соответствующих выбранным фильтрам и поиску." },
          churches: { title: "Храмы не найдены", body: "Нет храмов, соответствующих выбранным фильтрам и поиску." },
          routes: { title: "Паломнические маршруты готовятся", body: "Маршруты появятся после проверки всех мест и практических данных." },
          all: { title: "Нет результатов", body: "Попробуйте другое название или выберите другую категорию." },
        },
      },
      recommended: { title: "Самые посещаемые святыни", showAll: "Показать все", aria: "Самые посещаемые святыни" },
      today: { label: "СЕГОДНЯ", calendar: "ПРАВОСЛАВНЫЙ КАЛЕНДАРЬ", calendarPreparing: "Календарь готовится", openCalendar: "Открыть календарь", gospel: "ЧТЕНИЯ НА СЕГОДНЯ", readingMissing: "Чтение на этот день пока не опубликовано.", read: "Прочитать", translationTitle: "Перевод чтений готовится", translationBody: "Переведённые календарные чтения появятся после языковой и редакционной проверки." },
      routes: { title: "Популярные маршруты", showAll: "Показать все", preparingLabel: "Готовится", preparingTitle: "Паломнические маршруты готовятся.", preparingBody: "Переводы маршрутов появятся после языковой и редакционной проверки." },
      areas: { eyebrow: "ИССЛЕДУЙТЕ", title: "По регионам", description: "Откройте монастыри и храмы в разных регионах Черногории." },
      mapControls: { quickAria: "Быстрый выбор на карте", builder: "Построить маршрут", builderNotice: "Планировщик маршрутов готовится.", controls: "Управление картой", layers: "Слои", layersTitle: "Слои карты", layersBody: "Активен базовый слой Outdoor. Дополнительные слои появятся позже.", zoom: "Масштаб карты", zoomIn: "Увеличить", zoomOut: "Уменьшить", reset: "Показать Черногорию", help: "Как пользоваться картой?", helpTitle: "Интерактивная карта", helpBody: "Карту можно перемещать и масштабировать. Откройте метку, чтобы перейти к святыне." },
    },
  },
  en: {
    siteName: "Holy Places.me", skip: "Skip to main content", menu: "Menu", openMenu: "Open main menu",
    nav: { monasteries: "Monasteries", maleMonasteries: "Men's monasteries", femaleMonasteries: "Women's monasteries", churches: "Churches", map: "Map", routes: "Routes", calendar: "Calendar", news: "News", about: "About", sources: "Sources" },
    allMonasteries: "All monasteries", catalogue: "Catalogue", allAreas: "All regions", chooseArea: "Choose a region",
    showMap: "Show on map", clear: "Clear filters", openPage: "Open page", page: "Page", of: "of",
    footer: "A digital guide to the Orthodox heritage of Montenegro.", footerNav: "Footer navigation",
    unavailable: "Content is published after editorial review.", preparing: "Content is being prepared",
    homepage: {
      metadata: { title: "Holy Places — Orthodox Montenegro", description: "A digital guide to Montenegro's Orthodox holy places, pilgrimage routes, and spiritual heritage." },
      hero: { eyebrow: "Digital guide", title: "Orthodox Montenegro", description: "Discover Montenegro's monasteries and churches." },
      filters: { aria: "Catalogue filters", all: "All", monasteries: "Monasteries", churches: "Churches", routes: "Routes" },
      explorer: {
        aria: "Catalogue search and filters", searchLabel: "Search holy places", searchPlaceholder: "Search holy places…",
        filterSettingsLabel: "Filter settings — coming soon", filterSettingsTitle: "Filter settings are being prepared",
        areaPrefix: "Region", clearArea: "Remove region filter", noResultsEyebrow: "Catalogue search",
        empty: { seal: "H", title: "The holy-place catalogue is being prepared.", body: "Verified entries will appear here after editorial and language review.", link: "How content is published" },
        pagination: { top: "top", bottom: "bottom", aria: "Holy-place result pages — {position} navigation", previous: "Previous page", next: "Next page" },
        status: { none: "There are no entries for the selected filter.", page: "Page {current} of {total}.", one: "One result is shown. {page}", many: "Showing {shown} of {matched} results. {page}" },
        noResults: {
          monasteries: { title: "No monasteries found", body: "No monasteries match the selected filters and search." },
          churches: { title: "No churches found", body: "No churches match the selected filters and search." },
          routes: { title: "Pilgrimage routes are being prepared", body: "Routes will appear after all places and practical details have been reviewed." },
          all: { title: "No results", body: "Try another name or choose a different category." },
        },
      },
      recommended: { title: "Most visited holy places", showAll: "View all", aria: "Most visited holy places" },
      today: { label: "TODAY", calendar: "ORTHODOX CALENDAR", calendarPreparing: "The calendar is being prepared", openCalendar: "Open calendar", gospel: "TODAY'S READINGS", readingMissing: "A reading has not yet been published for this day.", read: "Read the passage", translationTitle: "Translated readings are being prepared", translationBody: "Translated calendar readings will appear after language and editorial review." },
      routes: { title: "Popular routes", showAll: "View all", preparingLabel: "In preparation", preparingTitle: "Pilgrimage routes are being prepared.", preparingBody: "Translated routes will appear after language and editorial review." },
      areas: { eyebrow: "EXPLORE", title: "Browse by region", description: "Discover monasteries and churches across Montenegro's regions." },
      mapControls: { quickAria: "Quick map filters", builder: "Build a route", builderNotice: "Route planning is being prepared.", controls: "Map controls", layers: "Layers", layersTitle: "Map layers", layersBody: "The Outdoor base layer is active. Additional layers will be available later.", zoom: "Map zoom", zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Show Montenegro", help: "How to use the map", helpTitle: "Interactive map", helpBody: "Pan and zoom the map. Open a marker to visit the holy-place page." },
    },
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
