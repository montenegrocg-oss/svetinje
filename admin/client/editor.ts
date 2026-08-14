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
form.addEventListener("input", (event) => { if (!(event.target as HTMLElement).closest("#foto")) markDirty(); });
window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });

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

const previewControl = document.querySelector<HTMLElement>("[data-preview-control]");
const previewToggle = previewControl?.querySelector<HTMLButtonElement>("[data-preview-toggle]");
const previewBadge = previewControl?.querySelector<HTMLElement>("[data-preview-badge]");
const previewDescription = previewControl?.querySelector<HTMLElement>("[data-preview-description]");
const previewStatus = previewControl?.querySelector<HTMLElement>("[data-preview-status]");
const previewDialog = previewControl?.querySelector<HTMLDialogElement>("[data-preview-dialog]");
let previewEnabled = previewControl?.dataset.previewEnabled === "true";

const renderPreviewState = (enabled: boolean) => {
  previewEnabled = enabled;
  if (previewControl) previewControl.dataset.previewEnabled = String(enabled);
  if (previewBadge) previewBadge.hidden = !enabled;
  if (previewDescription) {
    previewDescription.hidden = enabled;
    previewDescription.textContent = enabled ? "" : "Објекат још није видљив на радној верзији сајта.";
  }
  if (previewToggle) {
    previewToggle.textContent = enabled ? "Уклони из радног приказа" : "Додај у радни приказ";
    previewToggle.classList.toggle("secondary", enabled);
  }
};

async function updatePreview(enabled: boolean) {
  if (!previewToggle) return;
  previewToggle.disabled = true;
  if (previewStatus) previewStatus.textContent = enabled ? "Додавање у радни приказ…" : "Уклањање из радног приказа…";
  if (summary) summary.textContent = "";
  const response = await fetch(`/api/places/${encodeURIComponent(form!.dataset.placeId ?? "")}/preview`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedHeadSha: form!.dataset.headSha, enabled }),
  });
  const result = await response.json() as any;
  if (!response.ok) {
    renderValidationErrors(result);
    if (previewStatus) previewStatus.textContent = response.status === 409
      ? "Садржај је у међувремену измијењен. Освјежите страницу и покушајте поново."
      : "Промјена радног приказа није успјела.";
  } else {
    form!.dataset.headSha = result.commitSha;
    renderPreviewState(result.inPreview === true);
    if (previewStatus) previewStatus.textContent = result.unchanged
      ? "Нема промјена."
      : enabled
        ? "Објекат је додат у радни приказ."
        : "Објекат је уклоњен из радног приказа.";
  }
  previewToggle.disabled = false;
}

previewToggle?.addEventListener("click", () => {
  if (!previewEnabled) {
    void updatePreview(true);
    return;
  }
  previewDialog?.showModal();
});
previewDialog?.addEventListener("close", () => {
  if (previewDialog.returnValue === "confirm") void updatePreview(false);
  previewDialog.returnValue = "";
});
const collectAlternateNames = () => [...form.querySelectorAll<HTMLElement>("[data-alternate-row]")].map((row) => ({
  name: row.querySelector<HTMLInputElement>("[data-alt-name]")?.value ?? "",
  context: row.querySelector<HTMLTextAreaElement>("[data-alt-context]")?.value ?? "",
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
  if (target.closest("button") && !target.closest("#foto")) markDirty();
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
    if (dirtyStatus) { dirtyStatus.textContent = result.unchanged ? "Нема измјена за чување." : "Све измјене су сачуване."; dirtyStatus.className = "is-clean"; }
    if (status) {
      if (result.unchanged) status.textContent = "Нема измјена за чување.";
      else { status.replaceChildren("Commit "); const code = document.createElement("code"); code.textContent = result.commitSha; status.appendChild(code); }
    }
  }
  if (saveButton) saveButton.disabled = false;
});

const photoInput = form.querySelector<HTMLInputElement>("[data-photo-input]");
const photoDrop = form.querySelector<HTMLElement>("[data-photo-drop]");
const photoLocalList = form.querySelector<HTMLElement>("[data-photo-local-list]");
const photoStatus = form.querySelector<HTMLElement>("[data-photo-status]");
const uploadPhotosButton = form.querySelector<HTMLButtonElement>("[data-upload-photos]");
const photoStatusStorageKey = "svetinje.admin.photo-status";
type PreparedPhoto = { file: File; previewUrl: string; width: number; height: number; originalName: string };
let preparedPhotos: PreparedPhoto[] = [];

const setPhotoStatus = (message: string, isError = false) => {
  if (!photoStatus) return;
  photoStatus.textContent = message;
  photoStatus.className = isError ? "error" : "help";
};

try {
  const restoredPhotoStatus = sessionStorage.getItem(photoStatusStorageKey);
  if (restoredPhotoStatus) {
    sessionStorage.removeItem(photoStatusStorageKey);
    setPhotoStatus(restoredPhotoStatus);
  }
} catch {
  // Storage is optional; the upload itself remains functional when unavailable.
}

const rememberPhotoStatus = (message: string) => {
  try { sessionStorage.setItem(photoStatusStorageKey, message); } catch { /* Optional enhancement only. */ }
};

const uploadButtonLabel = (count: number) => {
  if (count === 1) return "Отпреми 1 фотографију";
  if (count > 1 && count < 5) return `Отпреми ${count} фотографије`;
  if (count >= 5) return `Отпреми ${count} фотографија`;
  return "Отпреми фотографије";
};

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function decodePhoto(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ("createImageBitmap" in globalThis) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Fall through to the browser image decoder, including Safari's HEIC path.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: оригинал је већи од 20 MB.`);
  if (!file.type.startsWith("image/")) throw new Error(`${file.name}: датотека није фотографија.`);
  let decoded;
  try {
    decoded = await decodePhoto(file);
  } catch {
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) throw new Error(`${file.name}: овај прегледач не може да отвори HEIC/HEIF. Извезите фотографију као JPEG.`);
    throw new Error(`${file.name}: формат фотографије није могуће прочитати.`);
  }
  try {
    if (decoded.width < 1 || decoded.height < 1) throw new Error(`${file.name}: фотографија нема важеће димензије.`);
    const scale = Math.min(1, 2400 / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: file.type !== "image/jpeg" });
    if (!context) throw new Error(`${file.name}: обрада фотографије није доступна.`);
    context.drawImage(decoded.source, 0, 0, width, height);
    const preferredType = file.type === "image/jpeg" || /hei[cf]/i.test(file.type) ? "image/jpeg" : "image/webp";
    let blob = await canvasBlob(canvas, preferredType, 0.85);
    if (!blob || !["image/jpeg", "image/webp"].includes(blob.type)) blob = await canvasBlob(canvas, "image/jpeg", 0.85);
    if (!blob) throw new Error(`${file.name}: оптимизована фотографија није направљена.`);
    if (blob.size > 20 * 1024 * 1024) throw new Error(`${file.name}: оптимизована фотографија је и даље већа од 20 MB.`);
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const output = new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${extension}`, { type: blob.type });
    return { file: output, previewUrl: URL.createObjectURL(output), width, height, originalName: file.name };
  } finally {
    decoded.close();
  }
}

function renderPreparedPhotos() {
  if (!photoLocalList) return;
  photoLocalList.replaceChildren(...preparedPhotos.map((photo, index) => {
    const card = document.createElement("article");
    card.className = "photo-card";
    const image = document.createElement("img");
    image.src = photo.previewUrl;
    image.alt = `Локални преглед: ${photo.originalName}`;
    const meta = document.createElement("div");
    meta.className = "photo-card__meta";
    const name = document.createElement("strong");
    name.textContent = photo.originalName;
    const dimensions = document.createElement("span");
    dimensions.className = "help";
    dimensions.textContent = `${photo.width} × ${photo.height}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button secondary";
    remove.textContent = "Уклони из избора";
    remove.addEventListener("click", () => {
      URL.revokeObjectURL(photo.previewUrl);
      preparedPhotos.splice(index, 1);
      renderPreparedPhotos();
    });
    meta.appendChild(name); meta.appendChild(dimensions); meta.appendChild(remove);
    card.appendChild(image); card.appendChild(meta);
    return card;
  }));
  if (uploadPhotosButton) {
    uploadPhotosButton.disabled = preparedPhotos.length === 0;
    uploadPhotosButton.textContent = uploadButtonLabel(preparedPhotos.length);
  }
}

async function addPhotoFiles(files: File[]) {
  const available = 10 - preparedPhotos.length;
  if (files.length > available) {
    setPhotoStatus("Могуће је отпремити највише 10 фотографија у једној групи.", true);
    files = files.slice(0, available);
  }
  for (const file of files) {
    setPhotoStatus(`Обрада: ${file.name}…`);
    try {
      preparedPhotos.push(await preparePhoto(file));
    } catch (error) {
      setPhotoStatus(error instanceof Error ? error.message : "Фотографија није обрађена.", true);
      renderPreparedPhotos();
      return;
    }
  }
  setPhotoStatus(preparedPhotos.length ? `Спремно за отпремање: ${preparedPhotos.length}.` : "");
  renderPreparedPhotos();
}

photoInput?.addEventListener("change", () => {
  void addPhotoFiles([...photoInput.files ?? []]);
  photoInput.value = "";
});
for (const eventName of ["dragenter", "dragover"]) photoDrop?.addEventListener(eventName, (event) => { event.preventDefault(); photoDrop.classList.add("is-dragging"); });
for (const eventName of ["dragleave", "drop"]) photoDrop?.addEventListener(eventName, (event) => { event.preventDefault(); photoDrop.classList.remove("is-dragging"); });
photoDrop?.addEventListener("drop", (event) => { void addPhotoFiles([...event.dataTransfer?.files ?? []]); });

uploadPhotosButton?.addEventListener("click", async () => {
  if (!preparedPhotos.length) return;
  uploadPhotosButton.disabled = true;
  setPhotoStatus("Отпремање фотографија…");
  const upload = new FormData();
  upload.set("expectedHeadSha", form.dataset.headSha ?? "");
  for (const photo of preparedPhotos) upload.append("photos", photo.file, photo.file.name);
  const response = await fetch(`/api/places/${encodeURIComponent(form.dataset.placeId ?? "")}/photos`, { method: "POST", body: upload });
  const result = await response.json() as any;
  if (!response.ok) {
    setPhotoStatus(result.error?.message ?? "Отпремање није успјело.", true);
    uploadPhotosButton.disabled = false;
    return;
  }
  form.dataset.headSha = result.commitSha;
  for (const photo of preparedPhotos) URL.revokeObjectURL(photo.previewUrl);
  preparedPhotos = [];
  rememberPhotoStatus(result.mediaIds?.length === 1 ? "Фотографија је отпремљена и сачувана." : "Фотографије су отпремљене и сачуване.");
  location.reload();
});

form.addEventListener("click", async (event) => {
  const primary = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-set-primary-photo]");
  if (!primary) return;
  const card = primary.closest<HTMLElement>("[data-existing-photo]");
  if (!card?.dataset.mediaId) return;
  primary.disabled = true;
  setPhotoStatus("Постављање главне фотографије…");
  const response = await fetch(`/api/places/${encodeURIComponent(form.dataset.placeId ?? "")}/photos/${encodeURIComponent(card.dataset.mediaId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedHeadSha: form.dataset.headSha, primary: true }),
  });
  const result = await response.json() as any;
  if (!response.ok) { primary.disabled = false; setPhotoStatus(result.error?.message ?? "Главна фотографија није промијењена.", true); return; }
  form.dataset.headSha = result.commitSha;
  rememberPhotoStatus(result.unchanged ? "Фотографија је већ главна." : "Главна фотографија је промијењена.");
  location.reload();
});

form.addEventListener("click", async (event) => {
  const saveAlt = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-save-photo-alt]");
  if (saveAlt) {
    const card = saveAlt.closest<HTMLElement>("[data-existing-photo]");
    const altText = card?.querySelector<HTMLInputElement>("[data-photo-alt]")?.value.trim();
    if (!card?.dataset.mediaId || !altText) {
      setPhotoStatus("Алтернативни опис не смије бити празан.", true);
      return;
    }
    saveAlt.disabled = true;
    setPhotoStatus("Чување алтернативног описа…");
    const response = await fetch(`/api/places/${encodeURIComponent(form.dataset.placeId ?? "")}/photos/${encodeURIComponent(card.dataset.mediaId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedHeadSha: form.dataset.headSha, altText }),
    });
    const result = await response.json() as any;
    saveAlt.disabled = false;
    if (!response.ok) {
      setPhotoStatus(result.error?.message ?? "Алтернативни опис није сачуван.", true);
      return;
    }
    form.dataset.headSha = result.commitSha;
    const image = card.querySelector<HTMLImageElement>("img");
    if (image) image.alt = altText;
    setPhotoStatus(result.unchanged ? "Алтернативни опис није промијењен." : "Алтернативни опис је сачуван.");
    return;
  }
  const remove = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-delete-photo]");
  if (!remove) return;
  const card = remove.closest<HTMLElement>("[data-existing-photo]");
  if (!card?.dataset.mediaId || !confirm("Уклонити ову фотографију?")) return;
  remove.disabled = true;
  setPhotoStatus("Уклањање фотографије…");
  const response = await fetch(`/api/places/${encodeURIComponent(form.dataset.placeId ?? "")}/photos/${encodeURIComponent(card.dataset.mediaId)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedHeadSha: form.dataset.headSha, confirmed: true }),
  });
  const result = await response.json() as any;
  if (!response.ok) { remove.disabled = false; setPhotoStatus(result.error?.message ?? "Фотографија није уклоњена.", true); return; }
  form.dataset.headSha = result.commitSha;
  rememberPhotoStatus("Фотографија је уклоњена.");
  location.reload();
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
