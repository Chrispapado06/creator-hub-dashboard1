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
 * A SECOND MIGRATION NOW GOVERNS THE OTHER HALF OF THIS FILE —
 * `20260903030000_username_reclaim_window.sql`, WRITTEN AND NOT PUSHED. It adds
 * the fourteen-day hold on a handle somebody LEAVES. Everything below the
 * "Changing a handle" rule is written to work on both servers: the old one,
 * where a released handle is free to anybody the instant it is let go, and the
 * new one, where it is that person's alone for a fortnight. Which server this
 * is, is asked — never assumed — and the copy changes with the answer. See
 * `fetchHoldPromise`.
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
import { useCallback, useEffect, useRef, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { classifyBackendError, type BackendFailure } from "@/backend/pgErrors";
import { fmtDate } from "@/lib/format";
import { withTimeout } from "@/lib/netTimeout";

/**
 * The typed client does not know the reclaim functions, and MUST NOT BE MADE TO
 * HERE.
 *
 * `backend/types.ts` declares `username_available` and `claim_username` and
 * nothing else in this family; `my_username_holds` and `username_hold_window`
 * arrive with an unpushed migration and belong to a hand-written schema file
 * this module does not own — `social/safety.ts`, `publicProfile.ts`,
 * `highlights.ts` and `groupSpace.ts` all take the same untyped view of the
 * same client for the same reason. The two TYPED calls stay typed, which is the
 * half that matters: they are the ones that must not drift.
 */
const untyped = supabase as unknown as SupabaseClient | null;

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
  const trimmed = base
    .replace(/^[._]+/, "")
    .replace(/[._]+$/, "")
    .replace(/\.{2,}/g, ".");
  return trimmed.slice(0, USERNAME_MAX);
}

/**
 * FOUR KINDS OF NO, AND THEY ARE NOT THE SAME SENTENCE.
 *
 *   taken    — somebody is WEARING it. It is not coming back.
 *   held     — NOBODY is wearing it. One specific person may take it back, and
 *              on a stated date it becomes ordinary. `heldUntil` is that date,
 *              and it is `null` when the server did not give one — in which
 *              case the screen says so rather than computing one.
 *   reclaim  — it is FREE, and free *because it used to be yours*. The tick is
 *              green; the sentence is different, because "available" and "you
 *              can have your old name back" are different news.
 *   current  — you are wearing it. Answered without asking the server, because
 *              the server would say `taken`, which about your own handle is
 *              true and useless.
 *
 * Collapsing any two of these is the failure this union exists to prevent: a
 * person told "someone has that one" about a handle nobody has, and that will
 * be theirs again on the 17th, has been told something false.
 */
export type Availability =
  | { state: "unknown" }
  | { state: "checking" }
  | { state: "free" }
  | { state: "format" }
  | { state: "reserved" }
  | { state: "taken"; suggestions: string[] }
  | { state: "held"; heldUntil: string | null; suggestions: string[] }
  | { state: "reclaim"; reclaimUntil: string | null }
  | { state: "current" }
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
 *
 * THE ANSWER IS NOW ABOUT *YOU*, NOT ONLY ABOUT THE NAME. Once 20260903030000
 * lands, `username_available` consults `auth.uid()`: one handle is `reclaim`
 * to the person who released it and `held` to everybody else, in the same
 * second. So this result MUST NOT BE CACHED ACROSS ACCOUNTS — if a cache is
 * ever added, its key is the session and the candidate, never the candidate
 * alone. Nothing caches it today; this note is here so nobody adds one keyed
 * the obvious wrong way.
 *
 * `currentHandle` is what the caller believes this person is wearing right now
 * — `useMyProfile().profile.username` on the settings screen, and nothing at
 * all during signup, where there is no current handle by definition. It is
 * answered locally: the server would call your own handle `taken`, which is
 * true and would read as "somebody has that one" about yourself.
 */
export async function checkAvailability(
  raw: string,
  currentHandle?: string | null,
): Promise<Availability> {
  const problem = formatProblem(raw);
  if (problem) return { state: "format" };

  const candidate = normalise(raw);
  if (currentHandle && normalise(currentHandle) === candidate) return { state: "current" };
  if (!supabase) return { state: "offline" };

  const { data, error } = await supabase.rpc("username_available", { candidate });
  if (error) return { state: "offline" };

  const r = data as UsernameWire;

  // The old server answers `{ok:true}` with no `reclaim` key, and the new one
  // answers `{ok:true, reclaim:true, reclaim_until:…}` — so `=== true` rather
  // than truthiness, and a missing key is simply "free", which it is.
  if (r.ok) {
    if (r.reclaim === true) {
      noteHoldFeatureLive();
      return { state: "reclaim", reclaimUntil: instantOrNull(r.reclaim_until) };
    }
    return { state: "free" };
  }
  if (r.reason === "reserved") return { state: "reserved" };
  if (r.reason === "taken") return { state: "taken", suggestions: r.suggestions ?? [] };
  if (r.reason === "held") {
    noteHoldFeatureLive();
    return {
      state: "held",
      // `held_until` is nullable BY CONTRACT. A hold with no readable end date
      // is still a hold; the screen drops the date from the sentence rather
      // than adding fourteen days to today and calling that a fact.
      heldUntil: instantOrNull(r.held_until),
      suggestions: r.suggestions ?? [],
    };
  }
  // Every unrecognised refusal still lands on `format`, which is where this
  // file has always put them. It is a guess, and it is a SAFE guess only
  // because every reason the schema can currently produce is handled above; a
  // new one added to the database and not added here reads as "Pick a
  // username", which is the failure 20260903030000's own header warns about.
  return { state: "format" };
}

export type ClaimResult =
  | { ok: true; username: string }
  /**
   * `not-saved` IS NOT A SYNONYM FOR ANY OF THE OTHERS. It is 20260903030000's
   * new `not_saved`: the UPDATE matched no row — a session whose profile row is
   * missing, which this schema has genuinely had once (20260902190000). The old
   * function returned `ok:true` for it and named a handle nobody got. The
   * screen's job here is to say nothing was saved, and never to navigate on.
   */
  | { ok: false; reason: "format" | "reserved" | "offline" | "signed-out" | "not-saved" }
  | { ok: false; reason: "taken"; suggestions: string[] }
  /** Nobody wears it; one person may take it back until `heldUntil`. */
  | { ok: false; reason: "held"; heldUntil: string | null; suggestions: string[] };

/**
 * The only call that decides. Everything above is a courtesy.
 *
 * `claim_username` converts a unique-violation into a typed reason rather than
 * raising, so this never has to read a Postgres error string and can never
 * mistake "somebody took it a second ago" for "the network died".
 *
 * THIS IS THE FIRST-HANDLE PATH. Use `changeUsername` when the person already
 * has one: the server call is the same, the CONSEQUENCES are not — a change
 * gives a handle away, and the screen has to say so before and after.
 */
export async function claimUsername(raw: string): Promise<ClaimResult> {
  const outcome = await runClaim(raw);
  if (outcome.kind === "ok") return { ok: true, username: outcome.username };
  if (outcome.kind === "verdict") {
    const r = outcome.verdict;
    if (r.reason === "taken")
      return { ok: false, reason: "taken", suggestions: r.suggestions ?? [] };
    if (r.reason === "reserved") return { ok: false, reason: "reserved" };
    if (r.reason === "held") {
      return {
        ok: false,
        reason: "held",
        heldUntil: instantOrNull(r.held_until),
        suggestions: r.suggestions ?? [],
      };
    }
    if (r.reason === "not_saved") return { ok: false, reason: "not-saved" };
    return { ok: false, reason: "format" };
  }
  if (outcome.kind === "signed-out") return { ok: false, reason: "signed-out" };
  // `refused`, `unreachable`, `unknown` and "no client in this build" all land
  // on `offline` here, exactly as they always have — this is the SIGNUP path,
  // where nothing existed to lose and "try again in a moment" is the whole of
  // the honest advice. `changeUsername` keeps them apart, because there the
  // difference decides whether a handle may have been given away.
  return { ok: false, reason: "offline" };
}

/* ==========================================================================
 * CHANGING A HANDLE — and the fourteen days afterwards
 * ==========================================================================
 *
 * ── WHAT CHANGING A HANDLE ALREADY DID, BEFORE ANY OF THIS ─────────────────
 *
 * It worked. `claim_username` is `security definer` and its UPDATE never
 * checked that the current username was null, so a second call simply replaced
 * the first. (`profiles_update_self` forbids changing `username` through a
 * direct update; the definer function bypasses RLS by design.) Nothing below
 * "adds the ability to change a handle" — what it adds is the HOLD, which did
 * not exist at all: until 20260903030000 is pushed, a handle you let go is
 * free to anybody the same second.
 *
 * ── THE THREE THINGS A CHANGE DOES NOT DO ──────────────────────────────────
 *
 * Stated here, exported as `HANDLE_CHANGE_BREAKS_LINKS`, and true of both
 * servers — the hold protects the NAME, not the LINKS:
 *
 *   · Nothing redirects. `/social/people/:idOrUsername` resolves a handle by
 *     an exact `eq("username", …)` match against `public.profiles`
 *     (`social/publicProfile.ts`). There is no alias table, no history table
 *     and no 301 anywhere in this app, so the old address does not point
 *     anywhere new — it points at nobody, or, after fourteen days, at whoever
 *     took the name.
 *   · Nothing is renamed where it was quoted. A handle typed into a post, a
 *     comment, a message or a group description is TEXT in `posts.body` and
 *     friends; no migration stores a mention as a reference to an account, so
 *     nothing can be rewritten when the account changes name.
 *   · Anybody holding the old link finds it broken. That is a real cost and it
 *     falls on other people, which is why the warning belongs BEFORE the
 *     change and not in a toast afterwards.
 * ========================================================================== */

/**
 * The three sentences a screen needs before somebody changes a handle they
 * already have. Exported so the settings screen and any future surface cannot
 * make different promises about the same act.
 */
export const HANDLE_CHANGE_BREAKS_LINKS =
  "Changing your handle breaks every link that used the old one. ICEFALL does not redirect the old address, and it does not rewrite your handle where somebody has typed it into a post, a comment or a message — anybody who saved a link to your profile will find it leads nowhere.";

/** Nothing was saved, and nothing is being reported as saved. */
export const HANDLE_NOT_SAVED =
  "That did not save. Nothing has changed — your handle is still the one you had.";

/**
 * The write went out and no answer came back. NOT "it failed".
 *
 * `claim_username` is a write, and an aborted or dropped request does not undo
 * a transaction that already committed on the server. So this is the one
 * failure the app genuinely cannot resolve on its own, and the sentence says
 * to go and look rather than to try again blindly.
 */
export const HANDLE_CHANGE_UNCONFIRMED =
  "ICEFALL did not get an answer to that change, so it cannot say whether it happened. Check your handle before trying again — a change that reached the server is not undone by the app losing the reply.";

/* -------------------------------------------------------------------------- */
/* The wire                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `claim_username` and `username_available`, as they answer on BOTH servers.
 *
 * `reason` is widened to `string` deliberately: `backend/types.ts` types it as
 * the three codes that exist today, and this module must be able to READ the
 * two the unpushed migration adds without editing a schema file another
 * session owns. Every new key is optional, because on the live server none of
 * them is sent.
 */
type UsernameWire = {
  ok: boolean;
  reason?: string;
  username?: string;
  suggestions?: string[];
  /** ISO instant, or null. Null means "held, end date not given" — never "not held". */
  held_until?: string | null;
  reclaim?: boolean;
  reclaim_until?: string | null;
};

/** What one call to `claim_username` came back as, before it is dressed up. */
type ClaimOutcome =
  | { kind: "ok"; username: string }
  | { kind: "verdict"; verdict: UsernameWire }
  | { kind: "signed-out" }
  | { kind: "no-backend" }
  | { kind: "failure"; failure: BackendFailure };

/**
 * ONE CALL, ONE CLASSIFIER, TWO WRAPPERS.
 *
 * NO TIMEOUT, AND THAT IS DELIBERATE — the opposite of every read in this
 * codebase. `withTimeout` is right for a read, where giving up costs nothing;
 * on a write, aborting the fetch abandons the ANSWER, not the TRANSACTION. A
 * claim that is cut off at six seconds may well have committed, and the app
 * would then tell somebody their handle is unchanged while the server disagrees.
 * Waiting is the lesser harm, and `HANDLE_CHANGE_UNCONFIRMED` covers the case
 * where the reply is lost anyway.
 */
async function runClaim(raw: string): Promise<ClaimOutcome> {
  if (!supabase) return { kind: "no-backend" };

  const { data, error } = await supabase.rpc("claim_username", { candidate: normalise(raw) });

  if (error) {
    // The body raises this before it touches anything, so nothing was written.
    if (/not signed in/i.test(error.message ?? "")) return { kind: "signed-out" };
    // `pgErrors.ts` rather than a hand-rolled test: six modules once read 42501
    // as "not deployed yet" and told people whose session had merely lapsed a
    // confident, false thing about ICEFALL's server.
    return { kind: "failure", failure: classifyBackendError(error as PostgrestError) };
  }

  const verdict = (data ?? {}) as UsernameWire;
  if (verdict.reason === "held" || verdict.reclaim === true) noteHoldFeatureLive();
  // `ok` WITHOUT A USERNAME IS NOT A SUCCESS. The pre-20260903030000 function
  // could return exactly that, and reporting it as done named a handle nobody
  // got. It is read as a verdict, and the verdict falls through to `format`.
  if (verdict.ok && typeof verdict.username === "string" && verdict.username.length > 0) {
    return { kind: "ok", username: verdict.username };
  }
  return { kind: "verdict", verdict };
}

/* -------------------------------------------------------------------------- */
/* Instants, and refusing to invent one                                        */
/* -------------------------------------------------------------------------- */

/**
 * A timestamptz as PostgREST sends it, as milliseconds — or `null`.
 *
 * `2026-09-17T10:22:33.123456+00:00` carries SIX fractional digits, which not
 * every engine's `Date.parse` accepts; the extra digits are trimmed rather than
 * gambled on. Anything that still will not parse comes back `null`, which every
 * caller here renders as "not known" — never as today, never as an epoch, and
 * never as `Invalid Date` on a screen.
 */
function parseInstant(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(ms) ? ms : null;
}

/** The same value back, normalised to a parseable ISO instant, or null. */
function instantOrNull(value: unknown): string | null {
  const ms = parseInstant(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/**
 * The day a hold ends, as a climber reads it — or `null`, which means SAY
 * NOTHING rather than say a date.
 *
 * `fmtDate` is used rather than any local arithmetic because this project has
 * already paid for the alternative: `new Date("2027-05-01")` is UTC midnight by
 * specification, so every bare calendar date in the app rendered A DAY EARLY
 * west of Greenwich. `hold_expires_at` is a full instant and carries its own
 * offset, so `fmtDate` passes it through `new Date(iso)` and gets the right
 * local day — but only if it is still a full instant when it arrives, which is
 * why nothing here ever slices one down to `YYYY-MM-DD` first.
 */
export function holdDateLabel(iso: string | null | undefined): string | null {
  const normalised = instantOrNull(iso);
  return normalised === null ? null : fmtDate(normalised);
}

/* -------------------------------------------------------------------------- */
/* Which server is this                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Whether the fourteen-day hold exists on the server this build is talking to.
 *
 * ASKED, NEVER ASSUMED, AND NEVER BAKED IN. 20260903030000 is written and not
 * pushed. A module that only tells the truth after somebody runs `db push` is
 * broken on arrival — and one that hardcodes "14 days" is lying today, because
 * today a released handle is free instantly.
 *
 * `live` is remembered for the session once observed: a deployed function does
 * not un-deploy under a running app, and the memo only decides which SENTENCE
 * to show while nothing has been asked yet. It never suppresses a call — every
 * read below still goes to the server — so the day the migration lands, the app
 * picks it up on the next request with no redeploy.
 */
let holdFeatureSeenLive = false;
function noteHoldFeatureLive() {
  holdFeatureSeenLive = true;
}

/** The window the server enforces, or an honest absence of one. */
export type HoldPromise =
  /** The hold exists. `days` is null when the interval came back unreadable. */
  | { state: "live"; days: number | null }
  /** Measured: this server has no hold. A released handle is free immediately. */
  | { state: "absent" }
  /** Nobody could be asked. NOT the same as `absent` and must not read like it. */
  | { state: "unknown" }
  /** No client in this build. Nothing was asked and nothing would be saved. */
  | { state: "no-backend" };

/** The constant is immutable, so one successful read is enough for a session. */
let windowDaysMemo: number | null = null;
let windowMemoIsGood = false;

const WINDOW_TIMEOUT_MS = 4_000;

/**
 * How long the server holds a released handle, read FROM THE SERVER.
 *
 * `username_hold_window()` is the only place the schema writes "14 days", and it
 * is granted to `authenticated` precisely so the app can print the promise from
 * the thing that enforces it rather than from a string in a component. If the
 * owner ever makes it thirty, this says thirty on the next launch.
 */
export async function fetchHoldPromise(): Promise<HoldPromise> {
  if (!untyped) return { state: "no-backend" };
  if (windowMemoIsGood) return { state: "live", days: windowDaysMemo };

  const deadline = withTimeout(WINDOW_TIMEOUT_MS);
  const call = untyped.rpc("username_hold_window");
  const { data, error } = await (deadline ? call.abortSignal(deadline) : call);

  if (error) {
    // `not-provisioned` is the ONLY error that says something about the
    // deployment. A refusal (a lapsed JWT) and a dead network say nothing about
    // it, and answering `absent` for those would tell somebody their old handle
    // is free the instant they let it go — which, on a server that holds it, is
    // false and would talk them out of a change they could safely make.
    return classifyBackendError(error as PostgrestError) === "not-provisioned"
      ? { state: "absent" }
      : { state: "unknown" };
  }

  noteHoldFeatureLive();
  windowDaysMemo = intervalDays(data);
  windowMemoIsGood = true;
  return { state: "live", days: windowDaysMemo };
}

/**
 * A Postgres `interval` as a number of days, or `null` for "not readable".
 *
 * PostgREST serialises an interval according to the server's `IntervalStyle`,
 * and all four styles are in circulation: `14 days`, `@ 14 days`, `P14D`,
 * `14 00:00:00`. Some stacks hand back an object instead. All are read; nothing
 * else is guessed at, and MONTHS AND YEARS ARE REFUSED rather than converted —
 * a month is not a fixed number of days, and this number is printed to somebody
 * as a promise.
 */
function intervalDays(value: unknown): number | null {
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
    if (typeof o.months === "number" && o.months !== 0) return null;
    if (typeof o.years === "number" && o.years !== 0) return null;
    const days = num("days") + num("hours") / 24 + num("minutes") / 1440 + num("seconds") / 86400;
    return days > 0 ? days : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/^@\s*/, "");
  if (text.length === 0) return null;

  // ISO 8601: P[n]W[n]DT[n]H[n]M[n]S. A P with Y or M in the date part is a
  // calendar length, not a duration, and is refused above the same way.
  const iso =
    /^P(?!$)(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      text,
    );
  if (iso) {
    if (iso[1] || iso[2]) return null;
    const days =
      Number(iso[3] ?? 0) * 7 +
      Number(iso[4] ?? 0) +
      Number(iso[5] ?? 0) / 24 +
      Number(iso[6] ?? 0) / 1440 +
      Number(iso[7] ?? 0) / 86400;
    return days > 0 ? days : null;
  }

  if (/\b(mon|year)/i.test(text)) return null;

  // `sql_standard`: a bare day count, then a clock — `14 0:00:00`. It is the one
  // style with no unit word in it, so it has to be recognised by shape before
  // the general case below, which would otherwise read the `0:00:00` and call
  // the whole interval zero.
  const sqlStd = /^(-?\d+)\s+(-?\d+):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(text);
  if (sqlStd) {
    const sign = sqlStd[1].startsWith("-") ? -1 : 1;
    const clockDays =
      Math.abs(Number(sqlStd[2])) / 24 + Number(sqlStd[3]) / 1440 + Number(sqlStd[4] ?? 0) / 86400;
    const total = Number(sqlStd[1]) + sign * clockDays;
    return total > 0 ? total : null;
  }

  let days = 0;
  let read = false;
  const dayPart = /(-?\d+(?:\.\d+)?)\s*days?/i.exec(text);
  if (dayPart) {
    days += Number(dayPart[1]);
    read = true;
  }
  const clock = /(-?\d+):(\d{2})(?::(\d{2}(?:\.\d+)?))?/.exec(text);
  if (clock) {
    const sign = clock[1].startsWith("-") ? -1 : 1;
    days +=
      sign *
      (Math.abs(Number(clock[1])) / 24 + Number(clock[2]) / 1440 + Number(clock[3] ?? 0) / 86400);
    read = true;
  }
  if (!read) return null;
  return days > 0 ? days : null;
}

/**
 * "14 days" from a number of days — or `null`, which means the sentence must be
 * written without a length.
 *
 * Only prints a whole number when the value really is one. A window of 13.5 days
 * rendered as "14 days" would promise half a day nobody has.
 */
export function fmtHoldWindow(days: number | null): string | null {
  if (days === null || !Number.isFinite(days) || days <= 0) return null;
  if (days < 1) {
    const hours = days * 24;
    const whole = Math.round(hours);
    return Math.abs(hours - whole) < 0.01
      ? `${whole} ${whole === 1 ? "hour" : "hours"}`
      : `${hours.toFixed(1)} hours`;
  }
  const whole = Math.round(days);
  return Math.abs(days - whole) < 0.005
    ? `${whole} ${whole === 1 ? "day" : "days"}`
    : `${days.toFixed(1)} days`;
}

/**
 * THE WARNING THAT MUST BE READ BEFORE A HANDLE IS GIVEN AWAY.
 *
 * Four sentences for four different servers-and-situations, and the reason they
 * are not one sentence is that only one of them is true at a time:
 *
 *   live      — the hold exists, and the person gets it back if they change
 *               their mind. This is the promise the owner asked for.
 *   absent    — MEASURED. The function is not there. The old handle is free the
 *               instant they press the button, and saying otherwise would be
 *               inviting somebody to lose a name on a promise nobody keeps.
 *   unknown   — nobody could be asked. It says so, and errs toward the harsher
 *               reading, because a person who expects no safety net and gets one
 *               is pleased, and a person who expects one and has none is not.
 *   no-backend— nothing would be saved at all, so nothing is at stake.
 *
 * `HANDLE_CHANGE_BREAKS_LINKS` is not folded in: it is true in all four cases,
 * and the screen renders it as its own line so it cannot be dropped by picking
 * a different branch.
 */
export function changeWarning(currentHandle: string | null, promise: HoldPromise): string {
  const old = currentHandle ? `@${normalise(currentHandle)}` : "your old handle";
  switch (promise.state) {
    case "live": {
      const window = fmtHoldWindow(promise.days);
      return window
        ? `${old} will be held for you for ${window}. Until then nobody else can take it and you can change back; after that, anybody can have it.`
        : `${old} will be held for you for a while afterwards — ICEFALL could not read for how long. Until it lapses nobody else can take it; after that, anybody can.`;
    }
    case "absent":
      return `${old} becomes free the moment you change it. This server does not hold a released handle for anybody, so somebody else can take it straight away and you would not be able to change back.`;
    case "unknown":
      return `ICEFALL could not check whether ${old} would be held for you afterwards, so treat it as gone the moment you change it.`;
    case "no-backend":
      return "This build has no server, so nothing would be saved and nothing has been checked.";
  }
}

/* -------------------------------------------------------------------------- */
/* What you released, and how long is left                                     */
/* -------------------------------------------------------------------------- */

/**
 * One handle this person let go and can still take back.
 *
 * THE COUNTDOWN IS MEASURED AGAINST THE SERVER'S CLOCK, NOT THE PHONE'S.
 * `my_username_holds()` returns `server_now` beside `hold_expires_at` for
 * exactly this reason: a phone an hour fast would show an hour less than the
 * person really has, and one an hour slow would offer time that does not exist.
 * `remainingMsAtRead` is the difference between two SERVER values, so the device
 * clock never enters it.
 *
 * The device is then trusted for one thing only, and it is a different thing:
 * how much time has ELAPSED since the answer landed. An elapsed duration from
 * `Date.now()` differences is sound even on a phone whose absolute clock is
 * wrong by a year — see `holdRemainingMs`.
 */
export interface UsernameHold {
  /** The released handle, lowercase, exactly as the server holds it. */
  username: string;
  /** ISO instant the handle was let go, or null if it did not parse. */
  releasedAt: string | null;
  /** ISO instant the hold lapses, or null if it did not parse. */
  expiresAt: string | null;
  /**
   * Milliseconds left AT THE MOMENT THE SERVER ANSWERED, or `null` when either
   * server value was unreadable. `null` is NOT ZERO: it means the app does not
   * know how long is left, and the screen must say that rather than count.
   */
  remainingMsAtRead: number | null;
  /** `Date.now()` when the answer arrived. Used only as the start of an elapsed
      duration, never as a wall clock. */
  readAtDeviceMs: number;
}

/**
 * Six states, because six different things can be true, and only one of them is
 * "you have nothing waiting".
 *
 *   ready         — the server answered. `holds: []` IS A MEASURED EMPTY: the
 *                   query ran and found none. It renders as NOTHING — no zero,
 *                   no em dash, no row.
 *   not-deployed  — this server has no hold feature. Also a measured answer,
 *                   and a different sentence: there is nothing to wait for
 *                   because nothing is ever held here.
 *   refused       — a lapsed session, most likely. Sign in again.
 *   unreachable   — nothing answered.
 *   unknown       — it failed and would not say why. Never promoted to
 *                   "unreachable": guessing that a refusal was bad signal is
 *                   the exact mistake `pgErrors.ts` exists to end.
 *   no-backend    — this build has no client.
 */
export type HoldsResult =
  | { state: "ready"; holds: UsernameHold[] }
  | { state: "not-deployed" }
  | { state: "refused" }
  | { state: "unreachable" }
  | { state: "unknown" }
  | { state: "no-backend" };

const HOLDS_TIMEOUT_MS = 6_000;

/**
 * The handles this person released and may still take back.
 *
 * WORKS ON BOTH SERVERS. On today's, `my_username_holds` does not exist and
 * PostgREST answers `PGRST202`, which `pgErrors.ts` classifies as
 * `not-provisioned` — reported as `not-deployed`, which is a true statement
 * about ICEFALL rather than a false one about the person ("you have released
 * nothing"). The moment the migration lands the same call returns rows, with no
 * redeploy of the app.
 *
 * LIVE HOLDS ONLY, and the filter is the server's: `hold_expires_at > now()`
 * against the SERVER's now. An expired release is not a hold, and listing one
 * would put "take @oldname back" in front of somebody the claim would refuse.
 */
export async function fetchMyHolds(signal?: AbortSignal): Promise<HoldsResult> {
  if (!untyped) return { state: "no-backend" };

  const deadline = withTimeout(HOLDS_TIMEOUT_MS, signal);
  const call = untyped.rpc("my_username_holds");
  const { data, error } = await (deadline ? call.abortSignal(deadline) : call);

  if (error) {
    switch (classifyBackendError(error as PostgrestError)) {
      case "not-provisioned":
        return { state: "not-deployed" };
      case "refused":
        return { state: "refused" };
      case "unreachable":
        return { state: "unreachable" };
      default:
        return { state: "unknown" };
    }
  }

  noteHoldFeatureLive();
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return { state: "ready", holds: rows.map(toHold).filter((h): h is UsernameHold => h !== null) };
}

/**
 * One row as a hold, or `null` if it cannot be read as one.
 *
 * A row with no handle on it is dropped rather than rendered, for the same
 * reason `publicProfile.ts` refuses to draw a climber with no name: an empty
 * chip that says "you can take  back" is worse than one fewer chip.
 */
function toHold(row: Record<string, unknown>): UsernameHold | null {
  const username = typeof row.username === "string" ? row.username.trim().toLowerCase() : "";
  if (!username) return null;

  const expiresMs = parseInstant(row.hold_expires_at);
  const serverNowMs = parseInstant(row.server_now);

  return {
    username,
    releasedAt: instantOrNull(row.released_at),
    expiresAt: instantOrNull(row.hold_expires_at),
    // BOTH VALUES OR NOTHING. If either instant was unreadable there is no
    // honest subtraction to do, and `null` here is what makes the screen say
    // "not known" instead of counting down from a number it made up.
    remainingMsAtRead: expiresMs !== null && serverNowMs !== null ? expiresMs - serverNowMs : null,
    readAtDeviceMs: Date.now(),
  };
}

/**
 * How long is left, right now — or `null` for "not known".
 *
 * THE DEVICE CLOCK IS USED FOR A DURATION AND NEVER FOR A DATE. The subtraction
 * that produced `remainingMsAtRead` was server-value minus server-value; all
 * this adds is how long the phone has been sitting here since, which is the one
 * thing a phone can measure without being right about what day it is.
 *
 * Never returns a negative: a lapsed hold is `0`, and `0` here is a MEASURED
 * zero — the hold has ended. `null` is the unmeasured one. The two must not be
 * drawn the same way; see `fmtHoldRemaining`, which refuses to invent a number
 * for `null`.
 */
export function holdRemainingMs(
  hold: UsernameHold,
  deviceNowMs: number = Date.now(),
): number | null {
  if (hold.remainingMsAtRead === null) return null;
  const elapsed = Math.max(0, deviceNowMs - hold.readAtDeviceMs);
  return Math.max(0, hold.remainingMsAtRead - elapsed);
}

/**
 * A remaining duration as a climber reads it — or `null`, which means print no
 * countdown at all.
 *
 * ROUNDS DOWN, ALWAYS. "13 days left" with 13 days and 20 hours remaining
 * understates by hours; rounding up would promise a day the person does not
 * have, and this number is the difference between getting a name back and not.
 *
 * It takes a DURATION, not two dates, so there is no date arithmetic in it and
 * none of the timezone class of bug that this project has already paid for
 * twice can reach it.
 */
export function fmtHoldRemaining(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  if (ms <= 0) return "Ended";
  if (ms >= 86_400_000) {
    const days = Math.floor(ms / 86_400_000);
    return `${days} ${days === 1 ? "day" : "days"} left`;
  }
  if (ms >= 3_600_000) {
    const hours = Math.floor(ms / 3_600_000);
    return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  }
  if (ms >= 60_000) {
    const mins = Math.floor(ms / 60_000);
    return `${mins} ${mins === 1 ? "minute" : "minutes"} left`;
  }
  return "Less than a minute left";
}

/**
 * Your live holds, for the settings screen.
 *
 * ONE READ ON MOUNT AND A MANUAL `refresh`, no polling. The countdown does not
 * need the server to tick — `holdRemainingMs` advances it from the offset the
 * one read established — and a timer that re-queried every minute would spend a
 * climber's data to learn a number the app already knows.
 *
 * `refresh` exists because ONE event genuinely changes this: claiming a handle.
 * A change adds a hold and a reclaim removes one, so the screen calls it after
 * `changeUsername` rather than guessing at the new list.
 */
export function useMyUsernameHolds(): { result: HoldsResult | null; refresh: () => void } {
  const [result, setResult] = useState<HoldsResult | null>(null);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();

    void fetchMyHolds(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted && alive.current) setResult(next);
      })
      // Nothing above is expected to reject — postgrest reports through `error`
      // — but an unhandled rejection here would strand `result` on `null`
      // forever, which is the one state with no sentence attached to it.
      .catch(() => {
        if (!controller.signal.aborted && alive.current) setResult({ state: "unknown" });
      });

    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { result, refresh };
}

/* -------------------------------------------------------------------------- */
/* The change itself                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What happened to the handle that was given up, READ BACK FROM THE SERVER
 * rather than assumed from the fact that the change succeeded.
 *
 *   held            — there is a row, with a real expiry. The only state that
 *                     may show a date, and the date is the server's.
 *   free-now        — measured: this server holds nothing (or holds nothing of
 *                     yours). The old handle is available to anybody.
 *   nothing-to-hold — there was no old handle. A first claim, not a change.
 *   unknown         — the read-back did not come back. Says so.
 */
export type ReleasedHandle =
  | { state: "held"; hold: UsernameHold }
  | { state: "free-now" }
  | { state: "nothing-to-hold" }
  | { state: "unknown" };

export type ChangeResult =
  | {
      ok: true;
      /** The handle now worn, as the SERVER spelled it. */
      username: string;
      /** The handle given up, or null if there was none. */
      previous: string | null;
      released: ReleasedHandle;
    }
  | { ok: false; reason: "taken"; suggestions: string[] }
  | { ok: false; reason: "held"; heldUntil: string | null; suggestions: string[] }
  | {
      ok: false;
      reason: /** Failed the shape rules, or a refusal this app does not recognise. */
        | "format"
        /** Kept for ICEFALL itself. Beats a hold: a reserved name is refused
            even to the person who released it, which is the true sentence. */
        | "reserved"
        /** The candidate is already this person's handle. Answered locally. */
        | "unchanged"
        /** The UPDATE matched no row. NOTHING WAS SAVED. */
        | "not-saved"
        /** The session is gone. Nothing was written. */
        | "signed-out"
        /** The server would not run it — a lapsed grant, or a function that is
            not there. Either way it did not write. */
        | "refused"
        /** No client in this build. Nothing was attempted. */
        | "no-backend"
        /** THE WRITE MAY HAVE LANDED. See `HANDLE_CHANGE_UNCONFIRMED`. */
        | "unconfirmed";
    };

/**
 * Change a handle that already exists — the settings-screen path.
 *
 * SEPARATE FROM `claimUsername` BECAUSE THE CONSEQUENCES ARE. The RPC is the
 * same one; what differs is that this call GIVES A NAME AWAY. That means a
 * warning before (`changeWarning` + `HANDLE_CHANGE_BREAKS_LINKS`), a read-back
 * after (what became of the old handle, and until when), and a failure
 * vocabulary that keeps "nothing was written" apart from "we never found out" —
 * a distinction signup does not need and a change cannot do without.
 *
 * `currentHandle` is what the caller believes is worn now. It is used for two
 * things and neither of them is authority: to refuse a no-op change locally,
 * and to know which handle to look for in the read-back. The SERVER decides
 * what was actually released; if `currentHandle` is stale, the read-back simply
 * finds nothing under that name and answers `free-now`, which is honest — it
 * does not invent a hold for a handle it cannot see.
 */
export async function changeUsername(
  raw: string,
  currentHandle: string | null,
): Promise<ChangeResult> {
  const candidate = normalise(raw);
  const previous = currentHandle ? normalise(currentHandle) : null;

  if (formatProblem(candidate)) return { ok: false, reason: "format" };
  // Answered without a round trip. The server would take it, write the same
  // value back and record no release — harmless, and it would let the screen
  // report a change that did not happen.
  if (previous && previous === candidate) return { ok: false, reason: "unchanged" };

  const outcome = await runClaim(candidate);

  if (outcome.kind === "no-backend") return { ok: false, reason: "no-backend" };
  if (outcome.kind === "signed-out") return { ok: false, reason: "signed-out" };
  if (outcome.kind === "failure") {
    // `refused` and `not-provisioned` both mean the body never ran, so nothing
    // was written and the handle is untouched. `unreachable` and `unknown` mean
    // the reply was lost, which is NOT the same thing and must never be
    // reported as "nothing changed".
    const f = outcome.failure;
    return {
      ok: false,
      reason: f === "refused" || f === "not-provisioned" ? "refused" : "unconfirmed",
    };
  }

  if (outcome.kind === "verdict") {
    const r = outcome.verdict;
    if (r.reason === "taken")
      return { ok: false, reason: "taken", suggestions: r.suggestions ?? [] };
    if (r.reason === "held") {
      return {
        ok: false,
        reason: "held",
        heldUntil: instantOrNull(r.held_until),
        suggestions: r.suggestions ?? [],
      };
    }
    if (r.reason === "reserved") return { ok: false, reason: "reserved" };
    if (r.reason === "not_saved") return { ok: false, reason: "not-saved" };
    return { ok: false, reason: "format" };
  }

  return {
    ok: true,
    username: outcome.username,
    previous,
    released: await readBackRelease(previous),
  };
}

/**
 * What became of the handle just given up.
 *
 * A SECOND REQUEST, AND IT IS ALLOWED TO FAIL. The change has already committed
 * by the time this runs; its answer only decides which sentence goes under the
 * confirmation. So every failure lands on `unknown` — never on `free-now`,
 * which is a claim, and never on a fabricated hold.
 *
 * It reads rather than assumes because the app cannot know from the claim alone
 * whether a release was recorded: `claim_username` returns `{ok, username}` and
 * nothing about the hold, and 20260903030000's insert is GUARDED — it refuses to
 * overwrite a live hold belonging to somebody else, in which case the change
 * succeeds and no hold of yours exists. Assuming one would put a date on screen
 * for a promise nobody made.
 */
async function readBackRelease(previous: string | null): Promise<ReleasedHandle> {
  if (previous === null) return { state: "nothing-to-hold" };

  const holds = await fetchMyHolds();
  switch (holds.state) {
    case "ready": {
      const mine = holds.holds.find((h) => h.username === previous);
      // A measured absence: the server has the feature, was asked, and holds
      // nothing of yours under that name.
      return mine ? { state: "held", hold: mine } : { state: "free-now" };
    }
    case "not-deployed":
      // Also measured, and the harsher truth: this server holds nothing for
      // anybody, so the old handle is free this second.
      return { state: "free-now" };
    default:
      return { state: "unknown" };
  }
}

/* -------------------------------------------------------------------------- */
/* The sentences — one place, so two screens cannot make different promises    */
/* -------------------------------------------------------------------------- */

/**
 * What to say about a handle somebody just gave up.
 *
 * The four cases are four different pieces of news and share no wording. Note
 * that `held` prints a date ONLY when there is one: a hold whose expiry could
 * not be read still says it is held, and says the date is unknown, rather than
 * adding fourteen days to today.
 */
export function releasedSentence(previous: string | null, released: ReleasedHandle): string | null {
  if (previous === null || released.state === "nothing-to-hold") return null;
  const old = `@${previous}`;

  switch (released.state) {
    case "held": {
      const date = holdDateLabel(released.hold.expiresAt);
      const left = fmtHoldRemaining(holdRemainingMs(released.hold));
      if (date && left)
        return `${old} is held for you until ${date} — ${left}. Nobody else can take it before then. After that, anybody can.`;
      if (date) return `${old} is held for you until ${date}. Nobody else can take it before then.`;
      return `${old} is held for you. ICEFALL could not read the date it stops being yours, so do not count on a particular day.`;
    }
    case "free-now":
      return `${old} is free now. ICEFALL is not holding it for you, so somebody else can take it.`;
    case "unknown":
      return `ICEFALL could not check what happened to ${old}, so it cannot say whether you can take it back.`;
  }
}

/**
 * The status line under a handle field, for every state this module can be in.
 *
 * Exported so that the settings screen and the signup screen say the SAME thing
 * about the same state. `null` means draw nothing — for `unknown` (nothing
 * typed) and `checking`, which is a spinner rather than a sentence.
 *
 * `held` AND `reclaim` AND `taken` GET THREE DIFFERENT SENTENCES, and that is
 * the whole point of the function: they are three different facts about the
 * world, and a person choosing a name acts differently on each.
 */
export function availabilitySentence(a: Availability): string | null {
  switch (a.state) {
    case "free":
      return "Available right now.";
    case "current":
      return "This is already your handle.";
    case "reclaim": {
      const date = holdDateLabel(a.reclaimUntil);
      return date
        ? `This was yours. You can take it back until ${date}.`
        : "This was yours. You can still take it back — ICEFALL could not read until when.";
    }
    case "held": {
      const date = holdDateLabel(a.heldUntil);
      return date
        ? `Released recently. Free again on ${date}.`
        : "Released recently. Not free yet.";
    }
    case "taken":
      return "Someone has that one.";
    case "reserved":
      return "That one is kept for ICEFALL itself.";
    case "format":
      return "That handle will not do — check the rules above.";
    case "offline":
      // NEVER "that name is free". Nothing was checked.
      return "Can't check right now. You can still try to claim it.";
    case "unknown":
    case "checking":
      return null;
  }
}

/**
 * Why a change did not happen, in a climber's terms.
 *
 * `unconfirmed` IS THE ONE THAT MATTERS. Everything else in this switch is a
 * refusal — the server said no and nothing moved. `unconfirmed` is the app
 * admitting it does not know, which is the honest state after a write whose
 * reply was lost, and the only one that tells the reader to go and look.
 */
export function changeFailureSentence(result: Extract<ChangeResult, { ok: false }>): string {
  switch (result.reason) {
    case "taken":
      return "Someone is using that handle. Nothing has changed.";
    case "held": {
      const date = holdDateLabel(result.heldUntil);
      return date
        ? `Nobody is using that handle, but the person who released it can still take it back. It is free again on ${date}.`
        : "Nobody is using that handle, but the person who released it can still take it back. It is not free yet.";
    }
    case "reserved":
      return "That one is kept for ICEFALL itself. Nothing has changed.";
    case "unchanged":
      return "That is already your handle. Nothing has changed.";
    case "format":
      return "That handle will not do. Nothing has changed.";
    case "not-saved":
      return HANDLE_NOT_SAVED;
    case "signed-out":
      return "Your session has expired, so nothing was changed. Sign in again and your handle will be exactly as it was.";
    case "refused":
      return "ICEFALL's server would not run that change, so nothing has changed. Signing out and back in often fixes it.";
    case "no-backend":
      return "This build has no server, so nothing was changed.";
    case "unconfirmed":
      return HANDLE_CHANGE_UNCONFIRMED;
  }
}

/**
 * Whether this session has ever seen the hold feature answer.
 *
 * A HINT FOR COPY, NOT A GATE. Nothing in this module skips a request because
 * of it — every call still asks the server, which is what makes the feature
 * appear the moment the migration is pushed, with no redeploy. It exists so a
 * screen that has already learned the answer does not have to re-ask before
 * choosing a heading.
 */
export function holdFeatureSeen(): boolean {
  return holdFeatureSeenLive;
}
