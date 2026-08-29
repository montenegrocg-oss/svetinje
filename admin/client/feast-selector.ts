import { matchesCatalogueSearch, normalizeCatalogueSearchText } from "../../src/lib/catalogue-search.ts";

export type ClientFeastDate = { kind: "fixed"; month: number; day: number } | { kind: "movable" };
export interface ClientFeast { id: string; name_sr: string; legacy_names: string[]; date?: ClientFeastDate }
export interface StagedClientFeast {
  id: string;
  nameSr: string;
  dateKind: "fixed" | "movable" | "undated";
  month?: number;
  day?: number;
  nearDuplicateConfirmed?: boolean;
}

const MONTHS = ["", "јануар", "фебруар", "март", "април", "мај", "јун", "јул", "август", "септембар", "октобар", "новембар", "децембар"];

export function feastDisplayLabel(feast: ClientFeast): string {
  if (feast.date?.kind === "fixed") return `${feast.name_sr} — ${feast.date.day}. ${MONTHS[feast.date.month]}`;
  if (feast.date?.kind === "movable") return `${feast.name_sr} — покретни празник`;
  return `${feast.name_sr} — датум није унесен`;
}

export function feastClientId(name: string): string {
  return normalizeCatalogueSearchText(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

const identity = (value: string) => normalizeCatalogueSearchText(value).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

function distance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

export function similarFeasts(name: string, feasts: readonly ClientFeast[]): ClientFeast[] {
  const key = identity(name);
  if (key.length < 4) return [];
  return feasts.filter((feast) => {
    const candidate = identity(feast.name_sr);
    const limit = Math.max(2, Math.floor(Math.max(key.length, candidate.length) * 0.18));
    return candidate !== key && (distance(key, candidate) <= limit || candidate.includes(key) || key.includes(candidate));
  });
}

export function filterFeasts(feasts: readonly ClientFeast[], query: string): ClientFeast[] {
  return feasts.filter((feast) => matchesCatalogueSearch([feast.name_sr, feast.id, ...feast.legacy_names].join(" "), query));
}

const civilDateIsValid = (month: number, day: number) => Number.isInteger(month)
  && Number.isInteger(day)
  && month >= 1
  && month <= 12
  && day >= 1
  && day <= new Date(Date.UTC(2024, month, 0)).getUTCDate();

export interface FeastSelectorValue {
  patronalFeastIds: string[];
  stagedFeasts: StagedClientFeast[];
  expectedFeastRegistryBlobSha: string;
}

export function setupFeastSelector(root: HTMLElement, onChange: () => void = () => {}): () => FeastSelectorValue {
  const data = root.querySelector<HTMLScriptElement>("[data-feast-registry-data]");
  const parsed = JSON.parse(data?.textContent ?? "[]") as ClientFeast[];
  const feasts = [...parsed].sort((left, right) => left.name_sr.localeCompare(right.name_sr, "sr"));
  const selected = JSON.parse(root.dataset.selectedIds ?? "[]") as string[];
  const staged = new Map<string, StagedClientFeast>();
  const chips = root.querySelector<HTMLElement>("[data-feast-chips]")!;
  const input = root.querySelector<HTMLInputElement>("[data-feast-search]")!;
  const options = root.querySelector<HTMLElement>("[data-feast-options]")!;
  const dialog = root.querySelector<HTMLDialogElement>("[data-new-feast-dialog]")!;
  const creationPanel = dialog.querySelector<HTMLElement>("[data-new-feast-panel]")!;
  const creationStatus = creationPanel.querySelector<HTMLElement>("[data-new-feast-status]")!;
  const nameInput = creationPanel.querySelector<HTMLInputElement>("[data-new-feast-name]")!;
  const kind = creationPanel.querySelector("[data-new-feast-kind]") as unknown as HTMLSelectElement;
  const monthInput = creationPanel.querySelector<HTMLInputElement>("[data-new-feast-month]")!;
  const dayInput = creationPanel.querySelector<HTMLInputElement>("[data-new-feast-day]")!;
  const fixedFields = creationPanel.querySelector<HTMLElement>("[data-fixed-date-fields]")!;
  const nearWarning = creationPanel.querySelector<HTMLElement>("[data-near-duplicate-warning]")!;
  const nearConfirmation = creationPanel.querySelector<HTMLInputElement>("[data-near-duplicate-confirmed]")!;
  const nearConfirmationLabel = nearConfirmation.closest<HTMLElement>("[data-near-duplicate-confirmation]")!;
  let exactExisting: ClientFeast | undefined;

  const byId = () => new Map(feasts.map((feast) => [feast.id, feast]));
  const renderChips = () => {
    chips.replaceChildren();
    for (const id of selected) {
      const feast = byId().get(id);
      if (!feast) continue;
      const chip = document.createElement("span");
      chip.className = "feast-chip";
      const label = document.createElement("span");
      label.textContent = feastDisplayLabel(feast);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.removeFeastId = id;
      remove.setAttribute("aria-label", `Уклони: ${feast.name_sr}`);
      remove.textContent = "×";
      chip.appendChild(label);
      chip.appendChild(remove);
      chips.appendChild(chip);
    }
    if (selected.length === 0) {
      const empty = document.createElement("span");
      empty.className = "help";
      empty.textContent = "Ниједна слава није изабрана.";
      chips.appendChild(empty);
    }
  };
  const select = (id: string) => {
    if (selected.includes(id)) return;
    selected.push(id);
    input.value = "";
    options.hidden = true;
    renderChips();
    onChange();
  };
  const renderOptions = () => {
    options.replaceChildren();
    for (const feast of filterFeasts(feasts, input.value)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "feast-option";
      button.dataset.selectFeastId = feast.id;
      button.disabled = selected.includes(feast.id);
      button.textContent = `${feastDisplayLabel(feast)}${button.disabled ? " · изабрано" : ""}`;
      options.appendChild(button);
    }
    const add = document.createElement("button");
    add.type = "button";
    add.className = "feast-option feast-option--add";
    add.dataset.openNewFeast = "";
    add.textContent = "+ Додај нову славу";
    options.appendChild(add);
    options.hidden = false;
  };
  const syncDateFields = () => {
    const fixed = kind.value === "fixed";
    fixedFields.hidden = !fixed;
    for (const input of fixedFields.querySelectorAll<HTMLInputElement>("input")) input.disabled = !fixed;
  };
  const resetDialog = () => {
    nameInput.value = "";
    monthInput.value = "";
    dayInput.value = "";
    kind.value = "fixed";
    creationStatus.textContent = "";
    nearWarning.hidden = true;
    nearConfirmationLabel.hidden = true;
    nearWarning.replaceChildren();
    nearConfirmation.checked = false;
    exactExisting = undefined;
    syncDateFields();
  };

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const remove = target.closest<HTMLButtonElement>("[data-remove-feast-id]");
    if (remove?.dataset.removeFeastId) {
      const id = remove.dataset.removeFeastId;
      selected.splice(selected.indexOf(id), 1);
      if (staged.has(id)) {
        staged.delete(id);
        const index = feasts.findIndex((feast) => feast.id === id);
        if (index >= 0) feasts.splice(index, 1);
      }
      renderChips();
      renderOptions();
      onChange();
      return;
    }
    const option = target.closest<HTMLButtonElement>("[data-select-feast-id]");
    if (option?.dataset.selectFeastId) select(option.dataset.selectFeastId);
    if (target.closest("[data-open-new-feast]")) {
      resetDialog();
      options.hidden = true;
      dialog.showModal();
    }
  });
  input.addEventListener("focus", renderOptions);
  input.addEventListener("input", renderOptions);
  kind.addEventListener("change", syncDateFields);
  creationPanel.querySelector("[data-cancel-new-feast]")?.addEventListener("click", () => dialog.close());
  const stageNewFeast = () => {
    creationStatus.textContent = "";
    const nameSr = nameInput.value.trim();
    const id = feastClientId(nameSr);
    const existing = feasts.find((feast) => feast.id === id || [feast.name_sr, ...feast.legacy_names].some((name) => identity(name) === identity(nameSr)));
    if (!nameSr || !id) {
      creationStatus.textContent = "Назив славе је обавезан.";
      return;
    }
    if (existing) {
      exactExisting = existing;
      creationStatus.replaceChildren(document.createTextNode("Ова слава већ постоји. "));
      const use = document.createElement("button");
      use.type = "button";
      use.className = "button secondary";
      use.textContent = `Изабери: ${existing.name_sr}`;
      use.addEventListener("click", () => { select(exactExisting!.id); dialog.close(); });
      creationStatus.appendChild(use);
      return;
    }
    const dateKind = kind.value as StagedClientFeast["dateKind"];
    const month = Number(monthInput.value);
    const day = Number(dayInput.value);
    if (dateKind === "fixed" && !civilDateIsValid(month, day)) {
      creationStatus.textContent = "Дан није важећи за изабрани мјесец.";
      return;
    }
    const candidates = similarFeasts(nameSr, feasts);
    if (candidates.length > 0 && !nearConfirmation.checked) {
      nearWarning.hidden = false;
      nearConfirmationLabel.hidden = false;
      nearWarning.replaceChildren(document.createTextNode(`Можда већ постоји слична слава: ${candidates.map((feast) => feast.name_sr).join(", ")}. Потврдите да ипак желите нову.`));
      nearConfirmation.focus();
      return;
    }
    const entry: StagedClientFeast = {
      id,
      nameSr,
      dateKind,
      ...(dateKind === "fixed" ? { month, day } : {}),
      ...(candidates.length > 0 ? { nearDuplicateConfirmed: true } : {}),
    };
    staged.set(id, entry);
    const legacyName = dateKind === "fixed" ? `${nameSr} ${day}. ${MONTHS[month]}` : nameSr;
    feasts.push({ id, name_sr: nameSr, legacy_names: [legacyName], ...(dateKind === "fixed" ? { date: { kind: "fixed", month, day } } : dateKind === "movable" ? { date: { kind: "movable" } } : {}) });
    feasts.sort((left, right) => left.name_sr.localeCompare(right.name_sr, "sr"));
    select(id);
    dialog.close();
  };
  creationPanel.querySelector("[data-stage-new-feast]")?.addEventListener("click", stageNewFeast);
  creationPanel.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    stageNewFeast();
  });
  renderChips();
  syncDateFields();
  return () => ({
    patronalFeastIds: [...selected],
    stagedFeasts: [...staged.values()],
    expectedFeastRegistryBlobSha: root.dataset.registrySha ?? "",
  });
}

export function setupFeastSelectors(onChange: () => void = () => {}): () => FeastSelectorValue {
  const root = document.querySelector<HTMLElement>("[data-patronal-feast-selector]");
  if (!root) throw new Error("Patronal feast selector is missing");
  return setupFeastSelector(root, onChange);
}
