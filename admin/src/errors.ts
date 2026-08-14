export type AdminErrorCode =
  | "unauthenticated"
  | "invalid_form_data"
  | "unsupported_place_type"
  | "unknown_browse_area"
  | "unsupported_narrative_section"
  | "duplicate_id"
  | "invalid_editorial_branch"
  | "github_authentication_failure"
  | "git_conflict"
  | "not_found"
  | "internal_error";

export class AdminError extends Error {
  readonly code: AdminErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string | number | string[]>;

  constructor(
    code: AdminErrorCode,
    status: number,
    message: string,
    fields?: Record<string, string | number | string[]>,
  ) {
    super(message);
    this.name = "AdminError";
    this.code = code;
    this.status = status;
    if (fields) this.fields = fields;
  }
}

const GITHUB_AUTHENTICATION_STAGES = new Set([
  "configuration_incomplete",
  "private_key_import_failed",
  "app_jwt_sign_failed",
  "installation_token_http_failure",
  "installation_token_response_invalid",
  "repository_request_rejected",
]);

const GITHUB_OPERATIONS = new Set([
  "branch_ref",
  "commit",
  "tree",
  "blob",
  "create_tree",
  "create_commit",
  "update_ref",
]);

const GITHUB_CONFIGURATION_NAMES = new Set([
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
]);

function safeGitHubAuthenticationFields(
  fields: Record<string, string | number | string[]> | undefined,
): Record<string, string | number | string[]> | undefined {
  const stage = typeof fields?.stage === "string" && GITHUB_AUTHENTICATION_STAGES.has(fields.stage)
    ? fields.stage
    : undefined;
  if (!stage) return undefined;

  const safe: Record<string, string | number | string[]> = { stage };
  if (typeof fields?.status === "number" && Number.isInteger(fields.status) && fields.status >= 100 && fields.status <= 599) {
    safe.status = fields.status;
  }
  if (typeof fields?.operation === "string" && GITHUB_OPERATIONS.has(fields.operation)) {
    safe.operation = fields.operation;
  }
  if (stage === "configuration_incomplete" && Array.isArray(fields?.missing)) {
    safe.missing = fields.missing.filter((name) => GITHUB_CONFIGURATION_NAMES.has(name));
  }
  return safe;
}

const SAFE_MESSAGES: Record<AdminErrorCode, string> = {
  unauthenticated: "Пријава није важећа.",
  invalid_form_data: "Подаци обрасца нијесу важећи.",
  unsupported_place_type: "Врста објекта није подржана.",
  unknown_browse_area: "Област није дио важећег каталога области.",
  unsupported_narrative_section: "Одељак текста није подржан канонском шемом.",
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
  const fields = safe.code === "github_authentication_failure"
    ? safeGitHubAuthenticationFields(safe.fields)
    : safe.fields;
  return Response.json(
    { error: { code: safe.code, message: SAFE_MESSAGES[safe.code], ...(fields ? { fields } : {}) } },
    { status: safe.status, headers: { "cache-control": "no-store" } },
  );
}
