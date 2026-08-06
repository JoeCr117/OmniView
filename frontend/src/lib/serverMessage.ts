/**
 * The sentence a server sent, not `apiFetch`'s wrapper around it.
 *
 * `ApiError.message` is `API <path> failed: <status> <body>` (see `http.ts`),
 * and django-ninja's body is `{"detail": "..."}` - the only part an admin can
 * act on. Any app surfacing an API error should go through this rather than
 * printing the raw wrapper or re-deriving this parsing itself.
 */
export function serverMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const start = raw.indexOf("{");
  if (start === -1) return raw;
  try {
    const body: unknown = JSON.parse(raw.slice(start));
    const detail = (body as { detail?: unknown }).detail;
    return typeof detail === "string" ? detail : raw;
  } catch {
    return raw;
  }
}
