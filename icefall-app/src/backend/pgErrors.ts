/**
 * What a Postgres/PostgREST error actually means — one copy, because six
 * disagreed.
 *
 * ── THE BUG THIS EXISTS TO END ──────────────────────────────────────────────
 * Six modules classified `42501` as "this feature is not deployed yet", and one
 * of them said so in its own comment while doing the opposite: "42501 is a
 * missing grant OR a row-level security refusal". It is never a deployment fact.
 *
 * MEASURED against the live project on 2026-09-02, unauthenticated:
 *   deployed table, no grant for this role  ->  42501 permission denied
 *   table that genuinely does not exist     ->  PGRST205 could not find the table
 *
 * Every grant in this schema is `to authenticated`, so a request whose JWT has
 * expired is served as `anon` and gets 42501 from a perfectly healthy server.
 * The screens then told the climber "highlights aren't live on ICEFALL's server
 * yet" — a confident, checkable, FALSE claim about the deployment, shown to
 * somebody whose session had simply lapsed. The honest answer is "sign in
 * again", and the two are not close.
 *
 * The rule, stated once:
 *   NOT-PROVISIONED  the object is absent          PGRST205, 42P01, 42883, 42703
 *   REFUSED          you are not allowed           42501, PGRST301
 *   UNREACHABLE      nothing answered              no code, message mentions fetch
 *
 * 42883 (no such function) and 42703 (no such column) join the first group
 * because a computed field from an unpushed migration fails the whole select —
 * that is a deployment fact and it is what "not provisioned" is for.
 */
export type BackendFailure = "not-provisioned" | "refused" | "unreachable" | "unknown";

const ABSENT = new Set(["PGRST205", "42P01", "42883", "42703", "PGRST204", "PGRST202"]);
const NOT_ALLOWED = new Set(["42501", "PGRST301"]);

export function classifyBackendError(error: {
  code?: string | null;
  message?: string | null;
} | null | undefined): BackendFailure {
  if (!error) return "unknown";
  const code = error.code ?? "";
  if (ABSENT.has(code)) return "not-provisioned";
  if (NOT_ALLOWED.has(code)) return "refused";

  const m = (error.message ?? "").toLowerCase();
  if (m.includes("fetch") || m.includes("network") || m.includes("timed out")) {
    return "unreachable";
  }
  /* "permission denied" and "row-level security" are the same refusal arriving
     without a code — some client paths drop it. */
  if (m.includes("permission denied") || m.includes("row-level security")) return "refused";
  return "unknown";
}

/** True only when the object really is absent — never merely forbidden. */
export function isNotProvisioned(error: Parameters<typeof classifyBackendError>[0]): boolean {
  return classifyBackendError(error) === "not-provisioned";
}
