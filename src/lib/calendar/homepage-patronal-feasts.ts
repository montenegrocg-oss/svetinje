import type {
  PublicPatronalFeastDay,
  PublicPatronalFeastPlace,
} from "../public-feast-catalogues.ts";

export const HOMEPAGE_UPCOMING_PLACE_LIMIT = 3;

export interface HomepageUpcomingFeastGroup {
  id: string;
  name: string;
  href: string;
  places: PublicPatronalFeastPlace[];
  totalPlaces: number;
  allPlacesHref?: string;
}

export interface HomepageUpcomingFeasts {
  date: string;
  dateLabel: string;
  calendarHref?: string;
  feasts: HomepageUpcomingFeastGroup[];
}

export function homepageUpcomingFeasts(
  payload: PublicPatronalFeastDay,
): HomepageUpcomingFeasts | undefined {
  const upcoming = payload.upcoming;
  if (!upcoming || upcoming.feasts.length === 0) return undefined;

  return {
    date: upcoming.date,
    dateLabel: upcoming.dateLabel,
    ...(upcoming.calendarHref ? { calendarHref: upcoming.calendarHref } : {}),
    feasts: upcoming.feasts.map((feast) => ({
      id: feast.id,
      name: feast.name,
      href: feast.href,
      places: feast.places.slice(0, HOMEPAGE_UPCOMING_PLACE_LIMIT),
      totalPlaces: feast.places.length,
      ...(feast.places.length > HOMEPAGE_UPCOMING_PLACE_LIMIT ? { allPlacesHref: feast.href } : {}),
    })),
  };
}
