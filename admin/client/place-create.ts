import { setupFeastSelectors } from "./feast-selector.ts";

const form = document.querySelector<HTMLFormElement>("[data-create-form]");
if (!form) throw new Error("Place create form is missing");
const status = form.querySelector<HTMLElement>("[data-form-status]");
const feastValue = setupFeastSelectors();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter as HTMLButtonElement | null;
  const body: Record<string, unknown> = Object.fromEntries(new FormData(form));
  Object.assign(body, feastValue(), { published: submitter?.value === "publish" });
  const response = await fetch("/api/places", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as any;
  if (!response.ok) {
    if (status) status.textContent = response.status === 409 ? "Конфликт: освјежите страницу." : result.error?.message ?? "Грешка";
    return;
  }
  const errors = result.publicationErrors
    ? `<p class="error">Објекат је сачуван као нацрт, али још није спреман за објављивање: ${Object.values(result.publicationErrors).join(" ")}</p>`
    : "";
  if (status) status.innerHTML = `${result.published ? "Објекат је објављен." : "Објекат је сачуван као нацрт."}${errors} <a href="/places/${encodeURIComponent(result.place.id)}/edit">Настави уређивање</a>`;
});
