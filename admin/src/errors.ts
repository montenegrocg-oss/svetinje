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

export type InternalDiagnosticStage =
  | "repository_request_failed"
  | "catalog_tree_processing_failed"
  | "catalog_blob_decode_failed"
  | "catalog_yaml_parse_failed"
  | "schema_compile_failed"
  | "canonical_schema_fingerprint_mismatch"
  | "media_bucket_binding_missing"
  | "media_object_key_invalid"
  | "media_object_already_exists"
  | "dashboard_render_failed";

export function internalFailure(
  stage: InternalDiagnosticStage,
  fields: { status?: number; operation?: "branch_ref" | "commit" | "tree" | "blob" } = {},
): AdminError {
  return new AdminError("internal_error", 502, stage, { stage, ...fields });
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
  const fields = safe.code === "github_authentication_failure" || safe.code === "internal_error"
    ? undefined
    : safe.fields;
  return Response.json(
    { error: { code: safe.code, message: SAFE_MESSAGES[safe.code], ...(fields ? { fields } : {}) } },
    { status: safe.status, headers: { "cache-control": "no-store" } },
  );
}
