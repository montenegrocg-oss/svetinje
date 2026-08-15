import maplibregl from "maplibre-gl";

const form = document.querySelector<HTMLFormElement>("[data-route-editor]");
if (!form) throw new Error("Route editor form is missing");
const routeId = form.dataset.routeId!;
const head = () => form.dataset.headSha!;
const setHead = (value: string) => { form.dataset.headSha = value; };
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const status = form.querySelector<HTMLElement>("[data-save-status]");
const summary = form.querySelector<HTMLElement>("[data-validation-summary]");
const dirtyStatus = form.querySelector<HTMLElement>("[data-dirty-status]");
let dirty = false;
form.addEventListener("input", () => { dirty = true; if (dirtyStatus) dirtyStatus.textContent = "Имате несачуваних измјена."; });
window.addEventListener("beforeunload", (event) => { if (dirty) event.preventDefault(); });

const request = async (url: string, init: RequestInit): Promise<any> => {
  const response = await fetch(url, init); const body = await response.json() as any;
  if (!response.ok) {
    const details = body.error?.fields && typeof body.error.fields === "object" ? Object.values(body.error.fields).join(" ") : "";
    throw new Error(details || body.error?.message || "Захтјев није успио.");
  }
  if (typeof body.commitSha === "string") setHead(body.commitSha);
  return body;
};

form.addEventListener("submit", async (event) => {
  event.preventDefault(); summary?.replaceChildren(); if (status) status.textContent = "Чување…";
  const values = new FormData(form);
  const sections = [...form.querySelectorAll<HTMLTextAreaElement>("[data-route-section]")].flatMap((textarea) => textarea.value.trim() ? [{ id: textarea.dataset.routeSection, title: textarea.dataset.routeSectionTitle, paragraphs: textarea.value.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean) }] : []);
  const body = {
    expectedHeadSha: head(), preferredName: field("preferredName").value, shortName: field("shortName").value, slug: field("slug").value,
    routeType: field("routeType").value, direction: field("direction").value, startPlaceId: field("startPlaceId").value, endPlaceId: field("endPlaceId").value,
    summary: field("summary").value, estimatedDurationMinutes: field("estimatedDurationMinutes").value, difficulty: field("difficulty").value,
    waterStatus: field("waterStatus").value, waterNote: field("waterNote").value, surface: values.getAll("surface"), recommendedSeasons: values.getAll("recommendedSeasons"),
    startAccessNote: field("startAccessNote").value, parkingStatus: field("parkingStatus").value, parkingNote: field("parkingNote").value,
    trailMarkingStatus: field("trailMarkingStatus").value, trailMarkingNote: field("trailMarkingNote").value,
    difficultSectionsStatus: field("difficultSectionsStatus").value, difficultSectionsNote: field("difficultSectionsNote").value,
    footwearRecommendation: field("footwearRecommendation").value, mobileSignalStatus: field("mobileSignalStatus").value,
    mobileSignalNote: field("mobileSignalNote").value, weatherNote: field("weatherNote").value, lastVerifiedAt: field("lastVerifiedAt").value,
    featured: values.get("featured") === "on", featuredOrder: field("featuredOrder").value, sections,
  };
  try { const result = await request(`/api/routes/${encodeURIComponent(routeId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); dirty = false; if (dirtyStatus) dirtyStatus.textContent = "Нема несачуваних измјена."; if (status) status.textContent = result.unchanged ? "Нема измјена." : "Сачувано."; }
  catch (error) { if (status) status.textContent = ""; if (summary) summary.textContent = error instanceof Error ? error.message : "Грешка"; }
});

const visibility = document.querySelector<HTMLElement>("[data-route-visibility]");
const visibilityButton = visibility?.querySelector<HTMLButtonElement>("[data-visibility-toggle]");
const visibilityDialog = visibility?.querySelector<HTMLDialogElement>("[data-visibility-dialog]");
const updateVisibility = async (published: boolean) => {
  const output = visibility?.querySelector<HTMLElement>("[data-visibility-status]");
  if (!visibility || !visibilityButton) return;
  visibilityButton.disabled = true;
  try {
    const result = await request(`/api/routes/${encodeURIComponent(routeId)}/visibility`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedHeadSha: head(), published }) });
    visibility.dataset.published = String(published);
    const badge = visibility.querySelector<HTMLElement>("[data-visibility-badge]");
    if (badge) { badge.textContent = published ? "Објављено" : "Нацрт"; badge.className = `badge ${published ? "status-published" : "status-draft"}`; }
    visibilityButton.textContent = published ? "Врати у нацрт" : "Објави";
    visibilityButton.classList.toggle("secondary", published);
    if (output) output.textContent = result.unchanged ? "Нема промјена." : published ? "Рута је објављена. Сајт се ажурира аутоматски." : "Рута је враћена у нацрт.";
  } catch (error) { if (output) output.textContent = error instanceof Error ? error.message : "Садржај још није спреман за објављивање."; }
  visibilityButton.disabled = false;
};
visibilityButton?.addEventListener("click", () => {
  if (visibility?.dataset.published === "true") visibilityDialog?.showModal();
  else void updateVisibility(true);
});
visibilityDialog?.addEventListener("close", () => {
  if (visibilityDialog.returnValue === "confirm") void updateVisibility(false);
  visibilityDialog.returnValue = "";
});

const gpxInput = document.querySelector<HTMLInputElement>("[data-route-gpx]");
const uploadButton = document.querySelector<HTMLButtonElement>("[data-upload-gpx]");
const gpxStatus = document.querySelector<HTMLElement>("[data-gpx-status]");
gpxInput?.addEventListener("change", () => { if (uploadButton) uploadButton.disabled = !gpxInput.files?.length; });
uploadButton?.addEventListener("click", async () => {
  const file = gpxInput?.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { if (gpxStatus) gpxStatus.textContent = "GPX је већи од 5 MB."; return; }
  const body = new FormData(); body.set("expectedHeadSha", head()); body.set("gpx", file);
  try { if (gpxStatus) gpxStatus.textContent = "Провјера и учитавање…"; await request(`/api/routes/${encodeURIComponent(routeId)}/track`, { method: "PUT", body }); location.reload(); }
  catch (error) { if (gpxStatus) gpxStatus.textContent = error instanceof Error ? error.message : "Грешка"; }
});
document.querySelector<HTMLButtonElement>("[data-remove-track]")?.addEventListener("click", async () => {
  if (!confirm("Уклонити трасу из руте?")) return;
  try { await request(`/api/routes/${encodeURIComponent(routeId)}/track`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedHeadSha: head() }) }); location.reload(); }
  catch (error) { if (gpxStatus) gpxStatus.textContent = error instanceof Error ? error.message : "Грешка"; }
});

const confirmation = document.querySelector<HTMLInputElement>("[data-delete-route-confirmation]");
const deleteButton = document.querySelector<HTMLButtonElement>("[data-delete-route]");
confirmation?.addEventListener("input", () => { if (deleteButton) deleteButton.disabled = confirmation.value !== routeId; });
deleteButton?.addEventListener("click", async () => {
  const output = document.querySelector<HTMLElement>("[data-delete-status]");
  try { await request(`/api/routes/${encodeURIComponent(routeId)}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedHeadSha: head(), confirmed: true, confirmationId: confirmation?.value }) }); dirty = false; location.href = "/routes"; }
  catch (error) { if (output) output.textContent = error instanceof Error ? error.message : "Грешка"; }
});

const mapContainer = document.querySelector<HTMLElement>("[data-route-map]");
const trackNode = document.querySelector<HTMLScriptElement>("[data-route-track]");
const key = form.dataset.mapKey;
if (mapContainer && trackNode && key) {
  const track = JSON.parse(trackNode.textContent ?? "null") as GeoJSON.Feature<GeoJSON.LineString> | null;
  if (track) {
    const map = new maplibregl.Map({ container: mapContainer, style: `https://api.maptiler.com/maps/019fc7d8-717c-701d-9ca5-a53d9438d3ce/style.json?key=${encodeURIComponent(key)}`, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right"); map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "© MapTiler © OpenStreetMap contributors" }));
    map.once("load", () => { map.addSource("route", { type: "geojson", data: track }); map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#b68a37", "line-width": 5 } }); const bounds = new maplibregl.LngLatBounds(); track.geometry.coordinates.forEach((point) => bounds.extend([point[0]!, point[1]!])); map.fitBounds(bounds, { padding: 36, duration: 0 }); });
  }
}
