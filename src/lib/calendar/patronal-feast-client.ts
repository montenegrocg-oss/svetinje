import type {
  PublicPatronalFeastDay,
  PublicPatronalFeastGroup,
  UpcomingPatronalFeasts,
} from "../public-feast-catalogues.ts";
import { homepageUpcomingFeasts } from "./homepage-patronal-feasts.ts";
import { podgoricaDateKey } from "./today-calendar.ts";

const patronalFeastDayRequests = new Map<string, Promise<PublicPatronalFeastDay>>();

export function loadPublicPatronalFeastDay(date: string): Promise<PublicPatronalFeastDay> {
  const cached = patronalFeastDayRequests.get(date);
  if (cached) return cached;
  const request = fetch(`/feast-days/${date}.json`).then((response) => {
    if (!response.ok) throw new Error("patronal feasts unavailable");
    return response.json() as Promise<PublicPatronalFeastDay>;
  });
  patronalFeastDayRequests.set(date, request);
  return request;
}

export function activeHomepagePatronalFeastDate(
  root: Pick<HTMLElement, "dataset">,
  now = new Date(),
  search = window.location.search,
): string {
  const dateKey = podgoricaDateKey(now);
  const previewDate = new URLSearchParams(search).get("calendar-date");
  return root.dataset.previewTodayOverride === "true" && /^2026-\d{2}-\d{2}$/u.test(previewDate ?? "")
    ? previewDate!
    : dateKey;
}

interface PatronalFeastSection {
  title: string;
  variant: "today" | "upcoming";
  feasts: readonly PublicPatronalFeastGroup[];
  upcoming?: UpcomingPatronalFeasts;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function feastGroup(group: PublicPatronalFeastGroup, headingTag: "h3" | "h4"): HTMLElement {
  const article = element("article", "patronal-feasts__group");
  article.dataset.patronalFeastId = group.id;
  const heading = element(headingTag);
  const feastLink = Object.assign(element("a"), { href: group.href, textContent: group.name });
  const arrow = Object.assign(element("span"), { textContent: " →" });
  arrow.setAttribute("aria-hidden", "true");
  feastLink.append(arrow);
  heading.append(feastLink);
  const list = element("ul");
  group.places.forEach((place) => {
    const item = element("li");
    item.dataset.patronalFeastPlace = place.id;
    item.append(Object.assign(element("a"), { href: place.href, textContent: place.name }));
    if (place.meta) item.append(Object.assign(element("span"), { textContent: place.meta }));
    list.append(item);
  });
  article.append(heading, list);
  return article;
}

function feastSection(model: PatronalFeastSection, target: string): HTMLElement | undefined {
  if (model.feasts.length === 0) return undefined;
  const section = element("section", `patronal-feasts patronal-feasts--${model.variant}`);
  section.dataset.patronalFeasts = model.variant;
  section.dataset.patronalFeastsTarget = target;
  const titleId = `patronal-feasts-${model.variant}-${target}`;
  section.setAttribute("aria-labelledby", titleId);
  const title = Object.assign(element(model.variant === "today" ? "h3" : "h2", "patronal-feasts__title"), {
    id: titleId,
    textContent: model.title,
  });
  section.append(title);

  if (model.upcoming) {
    const date = element("p", "patronal-feasts__date");
    const time = Object.assign(element("time"), { dateTime: model.upcoming.date, textContent: model.upcoming.dateLabel });
    if (model.upcoming.calendarHref) {
      const link = Object.assign(element("a"), { href: model.upcoming.calendarHref });
      const arrow = Object.assign(element("span"), { textContent: " →" });
      arrow.setAttribute("aria-hidden", "true");
      link.append(time, arrow);
      date.append(link);
    } else {
      date.append(time);
    }
    section.append(date);
  }

  const groups = element("div", "patronal-feasts__groups");
  model.feasts.forEach((group) => groups.append(feastGroup(group, model.variant === "today" ? "h4" : "h3")));
  section.append(groups);
  return section;
}

export function replacePatronalFeasts(
  anchor: HTMLTemplateElement,
  model: PatronalFeastSection,
): void {
  const target = anchor.dataset.patronalFeastsAnchor ?? model.variant;
  anchor.parentElement?.querySelector(`[data-patronal-feasts-target="${CSS.escape(target)}"]`)?.remove();
  const section = feastSection(model, target);
  if (section) anchor.insertAdjacentElement("afterend", section);
}

export function replaceHomepageUpcomingPatronalFeasts(
  anchor: HTMLTemplateElement,
  payload: PublicPatronalFeastDay,
): void {
  anchor.parentElement?.querySelector("[data-homepage-upcoming-feasts]")?.remove();
  const model = homepageUpcomingFeasts(payload);
  if (!model) return;

  const section = element("section", "homepage-upcoming-feasts");
  section.dataset.homepageUpcomingFeasts = "";
  section.setAttribute("aria-labelledby", "homepage-upcoming-feasts-title");
  const label = Object.assign(element("h2", "homepage-upcoming-feasts__label"), {
    id: "homepage-upcoming-feasts-title",
    textContent: "Предстојеће славе",
  });
  const date = element("p", "homepage-upcoming-feasts__date");
  const time = Object.assign(element("time"), { dateTime: model.date, textContent: model.dateLabel });
  if (model.calendarHref) {
    const link = Object.assign(element("a"), { href: model.calendarHref });
    const arrow = Object.assign(element("span"), { textContent: " →" });
    arrow.setAttribute("aria-hidden", "true");
    link.append(time, arrow);
    date.append(link);
  } else {
    date.append(time);
  }

  const groups = element("div", "homepage-upcoming-feasts__groups");
  model.feasts.forEach((feast) => {
    const article = element("article", "homepage-upcoming-feasts__group");
    article.dataset.homepageUpcomingFeastId = feast.id;
    const heading = element("h3");
    const feastLink = Object.assign(element("a"), { href: feast.href, textContent: feast.name });
    const arrow = Object.assign(element("span"), { textContent: " →" });
    arrow.setAttribute("aria-hidden", "true");
    feastLink.append(arrow);
    heading.append(feastLink);
    const places = element("ul");
    feast.places.forEach((place) => {
      const item = element("li");
      item.dataset.homepageUpcomingPlace = place.id;
      item.append(Object.assign(element("a"), { href: place.href, textContent: place.name }));
      places.append(item);
    });
    article.append(heading, places);
    if (feast.allPlacesHref) {
      const allPlaces = Object.assign(element("a", "homepage-upcoming-feasts__all"), {
        href: feast.allPlacesHref,
        textContent: `Све светиње (${feast.totalPlaces}) →`,
      });
      article.append(allPlaces);
    }
    groups.append(article);
  });

  section.append(label, date, groups);
  anchor.insertAdjacentElement("afterend", section);
}
