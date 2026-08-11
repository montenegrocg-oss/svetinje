export const PLACE_AREAS = [
  { id: "budva-pastrovici", label: "Будва и Паштровићи" },
  { id: "boka-kotorska", label: "Бока Которска" },
  { id: "cetinje-okolina", label: "Цетиње и околина" },
  { id: "podgorica-zeta", label: "Подгорица и Зета" },
  { id: "bar-crmnica-skadarsko-jezero", label: "Бар, Црмница и Скадарско језеро" },
  { id: "ostrog-sredisnja-crna-gora", label: "Острог и средишња Црна Гора" },
  { id: "sjever-crne-gore", label: "Сјевер Црне Горе" },
] as const;

export type PlaceAreaId = (typeof PLACE_AREAS)[number]["id"];

const placeAreaById = new Map(PLACE_AREAS.map((area) => [area.id, area]));

export function getPlaceArea(value: unknown): (typeof PLACE_AREAS)[number] | undefined {
  return typeof value === "string" ? placeAreaById.get(value as PlaceAreaId) : undefined;
}

export function isPlaceAreaId(value: unknown): value is PlaceAreaId {
  return getPlaceArea(value) !== undefined;
}
