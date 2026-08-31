/**
 * Username rules, mirrored from the database — and deliberately only a mirror.
 *
 * THE SERVER DECIDES. `profiles_username_key` (a unique index) and
 * `claim_username()` are what actually enforce any of this. Everything here
 * exists so somebody typing a name gets an answer without a round trip, and so
 * the refusal they read is a sentence rather than a Postgres error.
 *
 * KEEP THIS IN STEP WITH `20260830100000_identity_username_location.sql`. The
 * regex below is the same one the CHECK constraint uses. If they drift, the
 * failure is silent and one-directional: the app says a name is fine and the
 * server refuses it, on the last screen of signup.
 *
 * WHAT THIS FILE CANNOT DO, AND MUST NOT PRETEND TO:
 *
 *   · It cannot tell you a name is free. Only the claim can, and only at the
 *     instant it commits. Two people can both be told "available" and only one
 *     can win — see `checkAvailability` and the note on staleness there.
 *   · It cannot catch look-alikes. `summ1t` against `summit`, `rn` against `m`,
 *     `0` against `o`. A regex that tried would reject real names and still miss
 *     most of it. Impersonation is answered by reporting and a change history,
 *     not by a character class.
 */
import { supabase } from "@/backend/client";

/** Same expression as the `profiles_username_shape` CHECK. */
const SHAPE = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export type FormatProblem =
  | "empty"
  | "too-short"
  | "too-long"
  | "bad-characters"
  | "bad-edges"
  | "double-dot";

/**
 * What the person should read while they type. One problem at a time, in the
 * order they would hit them — a field listing four faults at once reads as a
 * telling-off.
 */
export function formatProblem(raw: string): FormatProblem | null {
  const v = normalise(raw);
  if (v.length === 0) return "empty";
  if (v.length < USERNAME_MIN) return "too-short";
  if (v.length > USERNAME_MAX) return "too-long";
  if (/[^a-z0-9_.]/.test(v)) return "bad-characters";
  if (/\.\./.test(v)) return "double-dot";
  if (!SHAPE.test(v)) return "bad-edges";
  return null;
}

export const PROBLEM_TEXT: Record<FormatProblem, string> = {
  empty: "Pick a username.",
  "too-short": `At least ${USERNAME_MIN} characters.`,
  "too-long": `At most ${USERNAME_MAX} characters.`,
  "bad-characters": "Letters, numbers, underscore and full stop only.",
  "bad-edges": "Start and end with a letter or number.",
  "double-dot": "No two full stops in a row.",
};

/**
 * Lowercase and trim — the same thing `claim_username` does server-side.
 *
 * Doing it here as well means the person sees the name they will actually get,
 * as they type it, rather than typing `Alex` and later discovering they are
 * `alex`. The database CHECK then guarantees uppercase cannot exist by any
 * path, including a direct admin update.
 */
export function normalise(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Strip what someone pasted down to something claimable, for a prefill. */
export function suggestFrom(seed: string): string {
  const base = normalise(seed).replace(/[^a-z0-9_.]/g, "");
  const trimmed = base.replace(/^[._]+/, "").replace(/[._]+$/, "").replace(/\.{2,}/g, ".");
  return trimmed.slice(0, USERNAME_MAX);
}

export type Availability =
  | { state: "unknown" }
  | { state: "checking" }
  | { state: "free" }
  | { state: "format" }
  | { state: "reserved" }
  | { state: "taken"; suggestions: string[] }
  | { state: "offline" };

/**
 * ADVISORY. Always stale by the time the button is pressed.
 *
 * This is not a flaw to engineer away — it is why `claimUsername` is built to
 * fail politely and why the caller must never treat a green tick as a promise.
 * The tick has to be cleared the moment a claim comes back taken, or the person
 * is looking at two statements that contradict each other.
 *
 * Returns `offline` rather than throwing when there is no backend: the app is
 * built to open on a mountain with no signal, and a username field is not a
 * reason to break that.
 */
export async function checkAvailability(raw: string): Promise<Availability> {
  const problem = formatProblem(raw);
  if (problem) return { state: "format" };
  if (!supabase) return { state: "offline" };

  const { data, error } = await supabase.rpc("username_available", { candidate: normalise(raw) });
  if (error) return { state: "offline" };

  const r = data as { ok: boolean; reason?: string; suggestions?: string[] };
  if (r.ok) return { state: "free" };
  if (r.reason === "reserved") return { state: "reserved" };
  if (r.reason === "taken") return { state: "taken", suggestions: r.suggestions ?? [] };
  return { state: "format" };
}

export type ClaimResult =
  | { ok: true; username: string }
  | { ok: false; reason: "format" | "reserved" | "offline" | "signed-out" }
  | { ok: false; reason: "taken"; suggestions: string[] };

/**
 * The only call that decides. Everything above is a courtesy.
 *
 * `claim_username` converts a unique-violation into a typed reason rather than
 * raising, so this never has to read a Postgres error string and can never
 * mistake "somebody took it a second ago" for "the network died".
 */
export async function claimUsername(raw: string): Promise<ClaimResult> {
  if (!supabase) return { ok: false, reason: "offline" };
  const { data, error } = await supabase.rpc("claim_username", { candidate: normalise(raw) });

  if (error) {
    if (/not signed in/i.test(error.message)) return { ok: false, reason: "signed-out" };
    return { ok: false, reason: "offline" };
  }

  const r = data as { ok: boolean; reason?: string; username?: string; suggestions?: string[] };
  if (r.ok && r.username) return { ok: true, username: r.username };
  if (r.reason === "taken") return { ok: false, reason: "taken", suggestions: r.suggestions ?? [] };
  if (r.reason === "reserved") return { ok: false, reason: "reserved" };
  return { ok: false, reason: "format" };
}
