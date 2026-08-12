export type AdminErrorCode =
  | "unauthenticated"
  | "invalid_form_data"
  | "unsupported_place_type"
  | "duplicate_id"
  | "invalid_editorial_branch"
  | "github_authentication_failure"
  | "git_conflict"
  | "not_found"
  | "internal_error";

export class AdminError extends Error {
  readonly code: AdminErrorCode;
  readonly status: number;

  constructor(
    code: AdminErrorCode,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminError";
    this.code = code;
    this.status = status;
  }
}

const SAFE_MESSAGES: Record<AdminErrorCode, string> = {
  unauthenticated: "Пријава није важећа.",
  invalid_form_data: "Подаци обрасца нијесу важећи.",
  unsupported_place_type: "Врста објекта није подржана.",
  duplicate_id: "Објекат са тим техничким ID-јем већ постоји.",
  invalid_editorial_branch: "Уређивачка Git грана није безбједно конфигурисана.",
  github_authentication_failure: "GitHub App аутентификација није успјела.",
  git_conflict: "Уређивачка грана је у међувремену промијењена. Освјежите податке и покушајте поново.",
  not_found: "Тражени запис није пронађен.",
  internal_error: "Дошло је до интерне грешке.",
};

export function errorResponse(error: unknown): Response {
  const safe = error instanceof AdminError
    ? error
    : new AdminError("internal_error", 500, SAFE_MESSAGES.internal_error);
  return Response.json(
    { error: { code: safe.code, message: SAFE_MESSAGES[safe.code] } },
    { status: safe.status, headers: { "cache-control": "no-store" } },
  );
}
