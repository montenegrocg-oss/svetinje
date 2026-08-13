import maplibregl from "maplibre-gl";

const form = document.querySelector<HTMLFormElement>("[data-place-editor]");
if (!form) throw new Error("Place editor form is missing");
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const status = form.querySelector<HTMLElement>("[data-save-status]");
const dirtyStatus = form.querySelector<HTMLElement>("[data-dirty-status]");
const summary = form.querySelector<HTMLElement>("[data-validation-summary]");
const saveButton = form.querySelector<HTMLButtonElement>("[data-save]");
let dirty = false;
const markDirty = () => {
  dirty = true;
  if (dirtyStatus) { dirtyStatus.textContent = "Имате несачуване измјене."; dirtyStatus.className = "is-dirty"; }
};
form.addEventListener("input", markDirty);
window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });

const selected = (select: Element | null) => select instanceof HTMLSelectElement ? [...select.selectedOptions].map(({ value }) => value) : [];
const renderValidationErrors = (result: any) => {
  if (!summary) return;
  summary.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = result.error?.message ?? "Подаци нису сачувани.";
  summary.appendChild(heading);
  if (!result.error?.fields || typeof result.error.fields !== "object") return;
  const list = document.createElement("ul");
  for (const [key, value] of Object.entries(result.error.fields)) {
    const item = document.createElement("li");
    const code = document.createElement("code");
    code.textContent = key;
    item.appendChild(code); item.appendChild(document.createTextNode(`: ${String(value)}`));
    list.appendChild(item);
  }
  summary.appendChild(list);
};
const collectAlternateNames = () => [...form.querySelectorAll<HTMLElement>("[data-alternate-row]")].map((row) => ({
  name: row.querySelector<HTMLInputElement>("[data-alt-name]")?.value ?? "",
  context: row.querySelector<HTMLTextAreaElement>("[data-alt-context]")?.value ?? "",
  sourceIds: selected(row.querySelector("[data-alt-sources]")),
  verificationStatus: (row.querySelector("[data-alt-status]") as HTMLSelectElement | null)?.value ?? "requires-verification",
}));
const collectSections = () => [...form.querySelectorAll<HTMLElement>("[data-section]")].map((section) => ({
  id: section.dataset.sectionId ?? "",
  title: section.querySelector<HTMLInputElement>("[data-section-title]")?.value ?? "",
  paragraphs: [...section.querySelectorAll<HTMLTextAreaElement>("[data-paragraph]")].map(({ value }) => value),
}));
const body = () => ({
  expectedHeadSha: form.dataset.headSha,
  preferredName: field("preferredName").value,
  shortName: field("shortName").value,
  slug: field("slug").value,
  placeType: field("placeType").value,
  browseAreaId: field("browseAreaId").value,
  summary: field("summary").value,
  jurisdiction: field("jurisdiction").value,
  countryCode: field("countryCode").value,
  municipality: field("municipality").value,
  settlement: field("settlement").value,
  postalAddress: field("postalAddress").value,
  latitude: field("latitude").value,
  longitude: field("longitude").value,
  coordinateAccuracy: field("coordinateAccuracy").value,
  publicationSafety: field("publicationSafety").value,
  alternateNames: collectAlternateNames(),
  sections: collectSections(),
});

const createParagraph = () => {
  const wrapper = document.createElement("div"); wrapper.className = "paragraph";
  const textarea = document.createElement("textarea"); textarea.dataset.paragraph = "";
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "icon-button"; remove.dataset.removeParagraph = ""; remove.textContent = "×"; remove.setAttribute("aria-label", "Уклони пасус");
  wrapper.appendChild(textarea); wrapper.appendChild(remove); return wrapper;
};
form.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("[data-remove-alternate]")) target.closest("[data-alternate-row]")?.remove();
  if (target.closest("[data-add-alternate]")) {
    const template = document.querySelector<HTMLTemplateElement>("[data-alternate-template]");
    if (template) form.querySelector("[data-alternate-list]")?.appendChild(template.content.cloneNode(true));
  }
  if (target.closest("[data-remove-paragraph]")) target.closest(".paragraph")?.remove();
  const addParagraph = target.closest("[data-add-paragraph]");
  if (addParagraph) addParagraph.closest("[data-section]")?.querySelector("[data-paragraphs]")?.appendChild(createParagraph());
  const moveSection = target.closest<HTMLButtonElement>("[data-move-section]");
  if (moveSection) {
    const section = moveSection.closest<HTMLElement>("[data-section]");
    const sibling = moveSection.dataset.moveSection === "up" ? section?.previousElementSibling : section?.nextElementSibling;
    if (section && sibling) {
      const parent = section.parentElement;
      if (parent && moveSection.dataset.moveSection === "up") parent.insertBefore(section, sibling);
      else if (parent) parent.insertBefore(sibling, section);
    }
  }
  if (target.closest("[data-add-section]")) {
    const select = form.querySelector("[data-new-section]") as HTMLSelectElement | null;
    if (!select?.value) return;
    const article = document.createElement("article"); article.className = "section-editor"; article.dataset.section = ""; article.dataset.sectionId = select.value;
    const toolbar = document.createElement("div"); toolbar.className = "toolbar";
    const heading = document.createElement("h3"); heading.textContent = select.value;
    const actions = document.createElement("div"); actions.className = "actions";
    for (const [direction, label, glyph] of [["up", "Помјери одјељак навише", "↑"], ["down", "Помјери одјељак наниже", "↓"]] as const) {
      const move = document.createElement("button"); move.type = "button"; move.className = "icon-button"; move.dataset.moveSection = direction; move.setAttribute("aria-label", label); move.textContent = glyph; actions.appendChild(move);
    }
    toolbar.appendChild(heading); toolbar.appendChild(actions);
    const titleLabel = document.createElement("label"); titleLabel.className = "field"; titleLabel.append("Наслов");
    const titleInput = document.createElement("input"); titleInput.dataset.sectionTitle = ""; titleLabel.appendChild(titleInput);
    const paragraphs = document.createElement("div"); paragraphs.dataset.paragraphs = "";
    const add = document.createElement("button"); add.type = "button"; add.className = "button secondary"; add.dataset.addParagraph = ""; add.textContent = "Додај пасус";
    article.appendChild(toolbar); article.appendChild(titleLabel); article.appendChild(paragraphs); article.appendChild(add);
    form.querySelector("[data-section-list]")?.appendChild(article); select.selectedOptions[0]?.remove();
  }
  if (target.closest("button")) markDirty();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (saveButton) saveButton.disabled = true;
  if (status) status.textContent = "Чување…";
  if (summary) summary.textContent = "";
  const response = await fetch(`/api/places/${encodeURIComponent(form.dataset.placeId ?? "")}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body()) });
  const result = await response.json() as any;
  if (!response.ok) {
    renderValidationErrors(result);
    if (status) status.textContent = response.status === 409 ? "Конфликт: освјежите страницу." : "Чување није успјело.";
  } else {
    dirty = false; form.dataset.headSha = result.commitSha;
    if (dirtyStatus) { dirtyStatus.textContent = "Све измјене су сачуване."; dirtyStatus.className = "is-clean"; }
    if (status) { status.replaceChildren("Commit "); const code = document.createElement("code"); code.textContent = result.commitSha; status.appendChild(code); }
  }
  if (saveButton) saveButton.disabled = false;
});

const mapContainer = form.querySelector<HTMLElement>("[data-coordinate-map]");
const key = form.dataset.mapKey;
if (mapContainer && key) {
  mapContainer.replaceChildren();
  const latitude = field("latitude") as HTMLInputElement;
  const longitude = field("longitude") as HTMLInputElement;
  const validPoint = () => Number.isFinite(latitude.valueAsNumber) && Number.isFinite(longitude.valueAsNumber);
  const map = new maplibregl.Map({ container: mapContainer, style: `https://api.maptiler.com/maps/019fc7d8-717c-701d-9ca5-a53d9438d3ce/style.json?key=${encodeURIComponent(key)}`, center: validPoint() ? [longitude.valueAsNumber, latitude.valueAsNumber] : [19.25, 42.7], zoom: validPoint() ? 14 : 6.2, attributionControl: false });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© MapTiler © OpenStreetMap contributors" }));
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  let marker: maplibregl.Marker | undefined;
  const setPoint = (lng: number, lat: number) => {
    longitude.value = String(Number(lng.toFixed(7))); latitude.value = String(Number(lat.toFixed(7)));
    if (!marker) { marker = new maplibregl.Marker({ draggable: true }).setLngLat([lng, lat]).addTo(map); marker.on("dragend", () => { const point = marker!.getLngLat(); setPoint(point.lng, point.lat); markDirty(); }); }
    else marker.setLngLat([lng, lat]);
  };
  if (validPoint()) setPoint(longitude.valueAsNumber, latitude.valueAsNumber);
  map.on("click", ({ lngLat }) => { setPoint(lngLat.lng, lngLat.lat); markDirty(); });
  for (const input of [latitude, longitude]) input.addEventListener("change", () => { if (validPoint()) setPoint(longitude.valueAsNumber, latitude.valueAsNumber); });
  form.querySelector("[data-clear-point]")?.addEventListener("click", () => { latitude.value = ""; longitude.value = ""; marker?.remove(); marker = undefined; markDirty(); });
}
