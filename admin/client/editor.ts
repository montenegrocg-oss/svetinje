import maplibregl from "maplibre-gl";
import { CoordinatePickerState, parseCoordinateInputs } from "./coordinate-picker-state.ts";
import { hasLoadedBaseStyle, isFatalBaseStyleError } from "./coordinate-map-readiness.ts";
import { setupFeastSelectors } from "./feast-selector.ts";

const form = document.querySelector<HTMLFormElement>("[data-place-editor]");
if (!form) throw new Error("Place editor form is missing");
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const status = form.querySelector<HTMLElement>("[data-save-status]");
const dirtyStatus = form.querySelector<HTMLElement>("[data-dirty-status]");
const summary = form.querySelector<HTMLElement>("[data-validation-summary]");
const saveButton = form.querySelector<HTMLButtonElement>("[data-save]");
let dirty = false;
let translationDirty = false;
const markDirty = () => {
  dirty = true;
  if (dirtyStatus) { dirtyStatus.textContent = "Имате несачуване измјене."; dirtyStatus.className = "is-dirty"; }
};
const feastValue = setupFeastSelectors(markDirty);
form.addEventListener("input", (event) => { if (!(event.target as HTMLElement).closest("#foto")) markDirty(); });
window.addEventListener("beforeunload", (event) => { if (dirty || translationDirty) event.preventDefault(); });

const languageTabs = [...document.querySelectorAll<HTMLButtonElement>("[data-language-tab]")];
const languagePanels = [...document.querySelectorAll<HTMLElement>("[data-language-panel]")];
const serbianSectionNav = document.querySelector<HTMLElement>("[data-serbian-section-nav]");
for (const tab of languageTabs) tab.addEventListener("click", () => {
  const locale = tab.dataset.languageTab;
  for (const panel of languagePanels) panel.hidden = panel.dataset.languagePanel !== locale;
  for (const candidate of languageTabs) candidate.classList.toggle("secondary", candidate !== tab);
  if (serbianSectionNav) serbianSectionNav.hidden = locale !== "sr";
});

for (const translationForm of document.querySelectorAll<HTMLFormElement>("[data-translation-editor]")) {
  translationForm.addEventListener("input", () => { translationDirty = true; });
  translationForm.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-remove-feast]")) {
      target.closest("[data-feast-row]")?.remove();
      translationDirty = true;
    }
    if (target.closest("[data-add-feast]")) {
      const template = translationForm.querySelector<HTMLTemplateElement>("[data-feast-template]");
      if (template) translationForm.querySelector("[data-feast-list]")?.appendChild(template.content.cloneNode(true));
      translationDirty = true;
    }
  });
  translationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const locale = translationForm.dataset.locale;
    if (locale !== "ru" && locale !== "en") return;
    const translationStatus = translationForm.querySelector<HTMLElement>("[data-translation-status]");
    const submit = translationForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    if (translationStatus) translationStatus.textContent = "Чување…";
    const values = Object.fromEntries(new FormData(translationForm));
    const patronalFeasts = [...translationForm.querySelectorAll<HTMLInputElement>("[data-feast-name]")].map((input) => input.value);
    const response = await fetch(`/api/places/${encodeURIComponent(form.dataset.placeId ?? "")}/narratives/${locale}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, patronalFeasts, expectedHeadSha: form.dataset.headSha }),
    });
    const result = await response.json() as any;
    if (!response.ok) {
      if (translationStatus) translationStatus.textContent = response.status === 409 ? "Конфликт: освјежите страницу." : result.error?.message ?? "Превод није сачуван.";
    } else {
      form.dataset.headSha = result.commitSha;
      translationDirty = false;
      if (translationStatus) translationStatus.textContent = result.unchanged ? "Нема измјена за чување." : `Commit ${result.commitSha}`;
      if (!result.unchanged && submit) submit.textContent = "Сачувај превод";
    }
    if (submit) submit.disabled = false;
  });
}

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

const visibilityControl = document.querySelector<HTMLElement>("[data-visibility-control]");
const visibilityToggle = visibilityControl?.querySelector<HTMLButtonElement>("[data-visibility-toggle]");
const visibilityBadge = visibilityControl?.querySelector<HTMLElement>("[data-visibility-badge]");
const visibilityStatus = visibilityControl?.querySelector<HTMLElement>("[data-visibility-status]");
const visibilityDialog = visibilityControl?.querySelector<HTMLDialogElement>("[data-visibility-dialog]");
let published = visibilityControl?.dataset.published === "true";

const renderVisibilityState = (enabled: boolean) => {
  published = enabled;
  if (visibilityControl) visibilityControl.dataset.published = String(enabled);
  if (visibilityBadge) {
    visibilityBadge.textContent = enabled ? "Објављено" : "Нацрт";
    visibilityBadge.className = `badge ${enabled ? "status-published" : "status-draft"}`;
  }
  if (visibilityToggle) {
    visibilityToggle.textContent = enabled ? "Врати у нацрт" : "Објави";
    visibilityToggle.classList.toggle("secondary", enabled);
  }
};

async function updateVisibility(enabled: boolean) {
  if (!visibilityToggle) return;
  visibilityToggle.disabled = true;
  if (visibilityStatus) visibilityStatus.textContent = enabled ? "Објављивање…" : "Враћање у нацрт…";
  if (summary) summary.textContent = "";
  const response = await fetch(`/api/places/${encodeURIComponent(form!.dataset.placeId ?? "")}/visibility`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedHeadSha: form!.dataset.headSha, published: enabled }),
  });
  const result = await response.json() as any;
  if (!response.ok) {
    renderValidationErrors(result);
    if (visibilityStatus) visibilityStatus.textContent = response.status === 409
      ? "Садржај је у међувремену измијењен. Освјежите страницу и покушајте поново."
      : "Садржај још није спреман за објављивање.";
  } else {
    form!.dataset.headSha = result.commitSha;
    renderVisibilityState(result.inPreview === true);
    if (visibilityStatus) visibilityStatus.textContent = result.unchanged
      ? "Нема промјена."
      : enabled
        ? "Објекат је објављен. Сајт се ажурира аутоматски."
        : "Објекат је враћен у нацрт.";
  }
  visibilityToggle.disabled = false;
}

visibilityToggle?.addEventListener("click", () => {
  if (!published) {
    void updateVisibility(true);
    return;
  }
  visibilityDialog?.showModal();
});
visibilityDialog?.addEventListener("close", () => {
  if (visibilityDialog.returnValue === "confirm") void updateVisibility(false);
  visibilityDialog.returnValue = "";
});

const deleteOpen = document.querySelector<HTMLButtonElement>("[data-delete-place-open]");
const deleteDialog = document.querySelector<HTMLDialogElement>("[data-delete-place-dialog]");
const deleteConfirmation = deleteDialog?.querySelector<HTMLInputElement>("[data-delete-place-confirmation]");
const deleteCancel = deleteDialog?.querySelector<HTMLButtonElement>("[data-delete-place-cancel]");
const deleteSubmit = deleteDialog?.querySelector<HTMLButtonElement>("[data-delete-place-submit]");
const deleteStatus = deleteDialog?.querySelector<HTMLElement>("[data-delete-place-status]");
const placeId = form.dataset.placeId ?? "";
let deletePending = false;

const resetDeleteDialog = () => {
  if (deleteConfirmation) deleteConfirmation.value = "";
  if (deleteSubmit) deleteSubmit.disabled = true;
  if (deleteStatus) deleteStatus.textContent = "";
};

deleteOpen?.addEventListener("click", () => {
  resetDeleteDialog();
  deleteDialog?.showModal();
  deleteConfirmation?.focus();
});
deleteConfirmation?.addEventListener("input", () => {
  if (deleteSubmit) deleteSubmit.disabled = deletePending || deleteConfirmation.value !== placeId;
});
deleteCancel?.addEventListener("click", () => deleteDialog?.close());
deleteDialog?.addEventListener("close", () => {
  if (!deletePending) resetDeleteDialog();
});
deleteSubmit?.addEventListener("click", async () => {
  if (deletePending || deleteConfirmation?.value !== placeId) return;
  deletePending = true;
  if (deleteOpen) deleteOpen.disabled = true;
  deleteSubmit.disabled = true;
  if (deleteStatus) deleteStatus.textContent = "Брисање…";
  let completed = false;
  try {
    const response = await fetch(`/api/places/${encodeURIComponent(placeId)}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedHeadSha: form.dataset.headSha,
        confirmed: true,
        confirmationId: placeId,
      }),
    });
    const result = await response.json() as any;
    if (!response.ok) {
      if (deleteStatus) deleteStatus.textContent = result.error?.code === "git_conflict"
        ? "Садржај је у међувремену измијењен. Освјежите страницу и покушајте поново."
        : result.error?.message ?? "Објекат није обрисан.";
      return;
    }
    dirty = false;
    completed = true;
    const query = new URLSearchParams({ deleted: placeId });
    if (result.mediaCleanupIncomplete === true) query.set("mediaCleanup", "incomplete");
    location.assign(`/places?${query.toString()}`);
  } catch {
    if (deleteStatus) deleteStatus.textContent = "Објекат није обрисан.";
  } finally {
    deletePending = false;
    if (!completed) {
      if (deleteOpen) deleteOpen.disabled = false;
      if (deleteSubmit) deleteSubmit.disabled = deleteConfirmation?.value !== placeId;
    }
  }
});
const collectAlternateNames = () => [...form.querySelectorAll<HTMLElement>("[data-alternate-row]")].map((row) => ({
  name: row.querySelector<HTMLInputElement>("[data-alt-name]")?.value ?? "",
  context: row.querySelector<HTMLTextAreaElement>("[data-alt-context]")?.value ?? "",
  verificationStatus: (row.querySelector("[data-alt-status]") as HTMLSelectElement | null)?.value ?? "requires-verification",
}));
const placeTypeInput = field("placeType") as HTMLSelectElement;
const monasticCommunityInput = field("monasticCommunity") as HTMLSelectElement;
const monasticCommunityField = form.querySelector<HTMLElement>("[data-monastic-community-field]");
const syncMonasticCommunityField = () => {
  const enabled = placeTypeInput.value === "monastery";
  if (monasticCommunityField) monasticCommunityField.hidden = !enabled;
  monasticCommunityInput.disabled = !enabled;
  if (!enabled) monasticCommunityInput.value = "";
};
placeTypeInput.addEventListener("change", syncMonasticCommunityField);
syncMonasticCommunityField();
const body = () => ({
  expectedHeadSha: form.dataset.headSha,
  preferredName: field("preferredName").value,
  shortName: field("shortName").value,
  slug: field("slug").value,
  placeType: field("placeType").value,
  monasticCommunity: monasticCommunityInput.disabled ? "" : monasticCommunityInput.value,
  browseAreaId: field("browseAreaId").value,
  summary: field("summary").value,
  eparchyId: field("eparchyId").value,
  jurisdiction: field("jurisdiction").value,
  municipalityId: field("municipalityId").value,
  settlement: field("settlement").value,
  latitude: field("latitude").value,
  longitude: field("longitude").value,
  ...feastValue(),
  serviceSchedule: field("serviceSchedule").value,
  youtubeUrl: field("youtubeUrl").value,
  narrativeBody: field("narrativeBody").value,
  alternateNames: collectAlternateNames(),
});
form.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("[data-remove-alternate]")) target.closest("[data-alternate-row]")?.remove();
  if (target.closest("[data-add-alternate]")) {
    const template = document.querySelector<HTMLTemplateElement>("[data-alternate-template]");
    if (template) form.querySelector("[data-alternate-list]")?.appendChild(template.content.cloneNode(true));
  }
  if (target.closest("button") && !target.closest("#foto")) markDirty();
});

const youtubeInput = field("youtubeUrl") as HTMLInputElement;
const youtubePreview = form.querySelector<HTMLAnchorElement>("[data-youtube-preview]");
youtubeInput.addEventListener("input", () => {
  if (!youtubePreview) return;
  try {
    const url = new URL(youtubeInput.value.trim());
    const allowed = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
    youtubePreview.hidden = url.protocol !== "https:" || !allowed.has(url.hostname.toLowerCase());
    if (!youtubePreview.hidden) youtubePreview.href = url.href;
  } catch {
    youtubePreview.hidden = true;
  }
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
    if (result.registryChanged) location.reload();
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
const mapCanvas = form.querySelector<HTMLElement>("[data-coordinate-map-canvas]");
const mapStatus = form.querySelector<HTMLElement>("[data-coordinate-map-status]");
const clearPoint = form.querySelector<HTMLButtonElement>("[data-clear-point]");
const latitude = field("latitude") as HTMLInputElement;
const longitude = field("longitude") as HTMLInputElement;
const initialResult = parseCoordinateInputs(latitude.value, longitude.value);
const coordinateState = new CoordinatePickerState(initialResult.kind === "valid" ? initialResult.pair : undefined);
let coordinateMap: maplibregl.Map | undefined;
let coordinateMarker: maplibregl.Marker | undefined;

const formatMapCoordinate = (value: number) => String(Number(value.toFixed(7)));
const setCoordinateValidity = (result = parseCoordinateInputs(latitude.value, longitude.value)) => {
  latitude.setCustomValidity("");
  longitude.setCustomValidity("");
  if (result.kind === "incomplete") {
    const message = "Унесите и географску ширину и географску дужину.";
    latitude.setCustomValidity(message);
    longitude.setCustomValidity(message);
  } else if (result.kind === "invalid") {
    (result.field === "latitude" ? latitude : longitude).setCustomValidity(
      result.field === "latitude" ? "Ширина мора бити између -90 и 90." : "Дужина мора бити између -180 и 180.",
    );
  }
  return result;
};
const updateClearButton = () => { if (clearPoint) clearPoint.hidden = !coordinateState.pair; };
const createMarkerElement = () => { const element = document.createElement("span"); element.className = "admin-coordinate-marker"; element.setAttribute("aria-hidden", "true"); return element; };
const syncMarker = (pair: { latitude: number; longitude: number }) => {
  if (!coordinateMap) return;
  if (!coordinateMarker) {
    coordinateMarker = new maplibregl.Marker({ element: createMarkerElement(), draggable: true, anchor: "bottom" })
      .setLngLat([pair.longitude, pair.latitude]).addTo(coordinateMap);
    coordinateMarker.on("dragend", () => {
      const point = coordinateMarker!.getLngLat();
      const next = coordinateState.setFromMap(point.lng, point.lat);
      latitude.value = formatMapCoordinate(next.latitude);
      longitude.value = formatMapCoordinate(next.longitude);
      setCoordinateValidity(); updateClearButton(); markDirty();
    });
  } else coordinateMarker.setLngLat([pair.longitude, pair.latitude]);
};
const resetMontenegro = () => coordinateMap?.fitBounds([[18.42, 41.8], [20.36, 43.57]], { padding: 42, duration: 0 });
const syncManualPoint = () => {
  const result = coordinateState.setFromInputs(latitude.value, longitude.value);
  setCoordinateValidity(result);
  if (result.kind === "valid") {
    syncMarker(result.pair);
    coordinateMap?.easeTo({ center: [result.pair.longitude, result.pair.latitude], zoom: Math.max(coordinateMap.getZoom(), 15) });
  } else if (result.kind === "empty") {
    coordinateMarker?.remove(); coordinateMarker = undefined;
  }
  updateClearButton();
};
for (const input of [latitude, longitude]) {
  input.addEventListener("change", syncManualPoint);
  input.addEventListener("blur", syncManualPoint);
}
clearPoint?.addEventListener("click", () => {
  coordinateState.clear(); latitude.value = ""; longitude.value = ""; setCoordinateValidity();
  coordinateMarker?.remove(); coordinateMarker = undefined; updateClearButton(); resetMontenegro(); markDirty();
});
updateClearButton();

const key = form.dataset.mapKey;
if (mapContainer && mapCanvas && key) {
  try {
    coordinateMap = new maplibregl.Map({
      container: mapCanvas,
      style: `https://api.maptiler.com/maps/019fc7d8-717c-701d-9ca5-a53d9438d3ce/style.json?key=${encodeURIComponent(key)}`,
      center: coordinateState.pair ? [coordinateState.pair.longitude, coordinateState.pair.latitude] : [19.25, 42.7],
      zoom: coordinateState.pair ? 16 : 6.2,
      attributionControl: false,
    });
    coordinateMap.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© MapTiler © OpenStreetMap contributors" }));
    const controls = document.createElement("div");
    controls.className = "admin-map-controls maplibregl-ctrl maplibregl-ctrl-group";
    const addControl = (label: string, title: string, action: () => void) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.title = title; button.setAttribute("aria-label", title); button.addEventListener("click", action); controls.appendChild(button);
    };
    addControl("+", "Увећај карту", () => coordinateMap?.zoomIn());
    addControl("−", "Умањи карту", () => coordinateMap?.zoomOut());
    addControl("⌂", "Прикажи Црну Гору", resetMontenegro);
    coordinateMap.addControl({ onAdd: () => controls, onRemove: () => controls.remove() }, "top-right");
    let mapReady = false;
    let mapFailed = false;
    let readinessTimeout = 0;
    const showMapFailure = () => {
      if (mapReady || mapFailed) return;
      mapFailed = true;
      window.clearTimeout(readinessTimeout);
      if (mapStatus) {
        mapStatus.hidden = false;
        mapStatus.textContent = "Мапа тренутно није доступна. Координате можете унијети ручно.";
      }
      coordinateMap?.remove();
      coordinateMap = undefined;
      coordinateMarker = undefined;
    };
    const revealCoordinateMap = () => {
      if (mapReady || mapFailed || !coordinateMap || !hasLoadedBaseStyle(coordinateMap)) return;
      mapReady = true;
      window.clearTimeout(readinessTimeout);
      if (mapStatus) mapStatus.hidden = true;
      coordinateMap.resize();
    };
    const handleMapError = (event: unknown) => {
      if (!mapReady && isFatalBaseStyleError(event)) showMapFailure();
    };
    readinessTimeout = window.setTimeout(showMapFailure, 11_000);
    coordinateMap.once("load", revealCoordinateMap);
    coordinateMap.once("idle", revealCoordinateMap);
    coordinateMap.on("error", handleMapError);
    if (coordinateState.pair) syncMarker(coordinateState.pair); else resetMontenegro();
    coordinateMap.resize();
    coordinateMap.triggerRepaint();
    window.requestAnimationFrame(() => {
      if (!coordinateMap || mapReady || mapFailed) return;
      coordinateMap.resize();
      coordinateMap.triggerRepaint();
    });
    coordinateMap.on("click", ({ lngLat }) => {
      const next = coordinateState.setFromMap(lngLat.lng, lngLat.lat);
      latitude.value = formatMapCoordinate(next.latitude); longitude.value = formatMapCoordinate(next.longitude);
      setCoordinateValidity(); syncMarker(next); updateClearButton(); markDirty();
    });
  } catch {
    if (mapStatus) { mapStatus.hidden = false; mapStatus.textContent = "Мапа тренутно није доступна. Координате можете унијети ручно."; }
  }
} else if (mapStatus) {
  mapStatus.hidden = false;
  mapStatus.textContent = "Мапа тренутно није доступна. Координате можете унијети ручно.";
}
