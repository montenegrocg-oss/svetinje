import type { Locale } from "./config.ts";
import { routeFor } from "./config.ts";
import { PLACE_EPARCHIES, PLACE_MUNICIPALITIES, type PlaceTaxonomyOption } from "../lib/place-taxonomy.ts";

type TaxonomyKind = "eparchy" | "municipality";

const eparchyLabels: Record<Locale, Record<string, string>> = {
  sr: Object.fromEntries(PLACE_EPARCHIES.map(({ id, labelSr }) => [id, labelSr])),
  ru: {
    "mitropolija-crnogorsko-primorska": "Черногорско-Приморская митрополия",
    "eparhija-budimljansko-niksicka": "Будимлянско-Никшичская епархия",
    "eparhija-milesevska": "Милешевская епархия",
    "eparhija-zahumsko-hercegovacka-i-primorska": "Захумско-Герцеговинская и Приморская епархия",
  },
  en: {
    "mitropolija-crnogorsko-primorska": "Metropolitanate of Montenegro and the Littoral",
    "eparhija-budimljansko-niksicka": "Eparchy of Budimlja and Nikšić",
    "eparhija-milesevska": "Eparchy of Mileševa",
    "eparhija-zahumsko-hercegovacka-i-primorska": "Eparchy of Zahumlje, Herzegovina and the Littoral",
  },
};

const municipalityLabels: Record<Locale, Record<string, string>> = {
  sr: Object.fromEntries(PLACE_MUNICIPALITIES.map(({ id, labelSr }) => [id, labelSr])),
  ru: {
    andrijevica: "Андриевица", bar: "Бар", berane: "Беране", "bijelo-polje": "Биело-Поле", budva: "Будва",
    gusinje: "Гусинье", danilovgrad: "Даниловград", zabljak: "Жабляк", zeta: "Зета", kolasin: "Колашин",
    kotor: "Котор", mojkovac: "Мойковац", niksic: "Никшич", petnjica: "Петница", plav: "Плав", pluzine: "Плужине",
    pljevlja: "Плевля", podgorica: "Подгорица", rozaje: "Рожае", tivat: "Тиват", tuzi: "Тузи", ulcinj: "Улцинь",
    "herceg-novi": "Херцег-Нови", cetinje: "Цетине", savnik: "Шавник",
  },
  en: {
    andrijevica: "Andrijevica", bar: "Bar", berane: "Berane", "bijelo-polje": "Bijelo Polje", budva: "Budva",
    gusinje: "Gusinje", danilovgrad: "Danilovgrad", zabljak: "Žabljak", zeta: "Zeta", kolasin: "Kolašin",
    kotor: "Kotor", mojkovac: "Mojkovac", niksic: "Nikšić", petnjica: "Petnjica", plav: "Plav", pluzine: "Plužine",
    pljevlja: "Pljevlja", podgorica: "Podgorica", rozaje: "Rožaje", tivat: "Tivat", tuzi: "Tuzi", ulcinj: "Ulcinj",
    "herceg-novi": "Herceg Novi", cetinje: "Cetinje", savnik: "Šavnik",
  },
};

function localizedOptions(options: readonly PlaceTaxonomyOption[], labels: Record<string, string>, name: string) {
  return options.map(({ id }) => {
    const label = labels[id];
    if (!label) throw new Error(`Missing public ${name} label for ${id}`);
    return { id, label };
  });
}

export function eparchyOptionsFor(locale: Locale) {
  return localizedOptions(PLACE_EPARCHIES, eparchyLabels[locale], `${locale} eparchy`);
}

export function municipalityOptionsFor(locale: Locale) {
  return localizedOptions(PLACE_MUNICIPALITIES, municipalityLabels[locale], `${locale} municipality`);
}

export function placeTaxonomyLabel(locale: Locale, kind: TaxonomyKind, id: string): string | undefined {
  return (kind === "eparchy" ? eparchyLabels : municipalityLabels)[locale][id];
}

export function placeTaxonomyCatalogueHref(locale: Locale, category: string | null | undefined, kind: TaxonomyKind, id: string): string | undefined {
  if (category !== "monasteries" && category !== "churches") return undefined;
  const params = new URLSearchParams({ [kind]: id });
  return `${routeFor(locale, category)}?${params}`;
}
