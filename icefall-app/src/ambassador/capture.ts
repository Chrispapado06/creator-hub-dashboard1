/**
 * Ambassador attribution capture — the phone app's half.
 *
 * NOT a synced file (see `src/ambassador/rates.ts`'s header): this is app-local
 * wiring around the shared, canonical parsing/constants, not a domain model
 * every app needs identically.
 *
 * ── THE WHOLE MECHANISM, IN THREE STEPS ─────────────────────────────────────
 *
 * 1. `captureAmbassadorCodeFromLocation()` runs once at boot (see `main.tsx`),
 *    BEFORE React renders — the same "import order is execution order" reason
 *    `@/offline/seed` is the first import there. If the URL carries `?amb=`,
 *    it is written to `localStorage` and survives the navigation from
 *    whatever landed on it (a marketing link, an ambassador's own share) to
 *    `/auth/signup`.
 * 2. `claimAmbassadorReferral()` is called exactly once, from
 *    `ChooseHandle`'s `submit()` — the one screen a brand-new account always
 *    passes through and an existing account never does again (see that
 *    screen's own header comment). This is the true "account now exists"
 *    moment, mirroring `consumeInvitations()` being called right after
 *    `signInWithEmail` succeeds.
 * 3. The RPC (`record_ambassador_referral`) does the real work server-side —
 *    resolving the code, freezing the 12-month window — and this file is
 *    TOLERANT of it failing: a malformed or expired code must not block
 *    somebody from finishing their own signup. The stored code is cleared
 *    either way, so a failed attempt is not silently retried forever against
 *    a code that will never resolve.
 *
 * ── A SECOND, DURABLE PATH — SEE MIGRATION 20260912160000 ───────────────────
 *
 * Step 1 above writes to THIS DEVICE's `localStorage`. That is fine for the
 * ordinary case — tap the link, sign up in the same sitting — but it is not
 * something a real payout should depend on for the case this programme
 * actually has to survive: tap the link, browse, separately and later tap
 * Share → Add to Home Screen, close Safari, and sign up from the new
 * home-screen icon afterwards. iOS isolates a home-screen web app's storage
 * from the Safari tab it was added from (WebKit bug 181849 — "by design",
 * per Apple's own engineer) — so the code `localStorage` captured in the tab
 * is simply not there to read from the installed icon.
 *
 * `claimPendingAmbassadorAttribution()` below is the fix: it asks Postgres
 * whether the account's own email address (not this device's storage) has a
 * code waiting, recorded independently at an earlier `icefall-web` waitlist
 * signup. `claimAmbassadorReferral()` runs both this and the localStorage
 * path together — always safe, since `record_ambassador_referral` is
 * idempotent per account, so whichever path resolves a code first is simply
 * the one that sticks.
 */
import { supabase } from "@/backend/client";
import { AMBASSADOR_CODE_STORAGE_KEY, parseAmbassadorCode } from "@/ambassador/rates";

/** Call once, at boot, before anything reads the stored code. */
export function captureAmbassadorCodeFromLocation(): void {
  try {
    const code = parseAmbassadorCode(window.location.search);
    if (!code) return;
    localStorage.setItem(AMBASSADOR_CODE_STORAGE_KEY, code);
  } catch {
    /* Storage unavailable (private mode, etc.) — nothing to capture into. */
  }
}

function peekStoredCode(): string | null {
  try {
    return localStorage.getItem(AMBASSADOR_CODE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearStoredCode(): void {
  try {
    localStorage.removeItem(AMBASSADOR_CODE_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Consume whatever ambassador code was captured earlier, now that a real,
 * signed-in account exists to attribute.
 *
 * READS THE CODE BUT DOES NOT CLEAR IT until a session actually exists. This
 * screen is only ever reached once a session does (see the header), so in
 * practice the check below always passes — it is defensive rather than load-
 * bearing here, kept identical to the web app's copy of this file, where the
 * same check IS load-bearing (a confirmation-email signup has no session the
 * instant `signUp()` returns, only once the link is opened).
 *
 * TOLERANT OF EVERY OTHER FAILURE, on purpose — same reasoning as
 * `consumeInvitations()`: the caller has just finished creating their own
 * account, and a stranger's stale or mistyped referral code must never be
 * the reason that fails. Nothing here is shown to the person signing up.
 */
export async function claimStoredAmbassadorReferral(): Promise<void> {
  if (!supabase) return;
  const code = peekStoredCode();
  if (!code) return;

  const { data } = await supabase.auth.getSession();
  if (!data.session) return; // no session yet — leave it stored for the real attempt

  clearStoredCode();
  try {
    await supabase.rpc("record_ambassador_referral", { p_code: code });
  } catch {
    /* Expired, malformed, or the ambassador is no longer active — none of
       that is this person's problem, and none of it should be shown to them. */
  }
}

/**
 * DURABLE PATH. Ask Postgres whether the signed-in account's own email has a
 * pending ambassador attribution waiting — recorded, independently of this
 * device's storage, at an earlier `icefall-web` waitlist signup. See this
 * file's header, and migration 20260912160000
 * (`claim_pending_ambassador_attribution`) for the server-side half: it looks
 * up by the account's real email via `auth.users`, never a client-supplied
 * one.
 *
 * A no-op when there is no session, or when nothing is pending for this
 * email — the ordinary case for almost every signup. Tolerant of the RPC
 * failing outright too (this migration not yet applied to a given
 * environment answers "function does not exist", treated exactly like
 * "nothing pending").
 */
export async function claimPendingAmbassadorAttribution(): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  try {
    await supabase.rpc("claim_pending_ambassador_attribution");
  } catch {
    /* Migration not applied yet, or nothing was pending — either way, not
       this person's problem, and never shown to them. */
  }
}

/**
 * THE CALL SITE `ChooseHandle` USES. Runs the fast, localStorage path first,
 * then the durable, email-keyed path — see this file's header for why
 * running both, every time, is always safe and never double-attributes an
 * account.
 */
export async function claimAmbassadorReferral(): Promise<void> {
  await claimStoredAmbassadorReferral();
  await claimPendingAmbassadorAttribution();
}

/* ══════════════════════════════════════════════════════════════════════════
 * THE MANUAL PATH — a typed code, for when `?amb=` never reached this device
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Everything above is silent and automatic. The three exports below back an
 * OPTIONAL field on `ChooseHandle` for the person who was told a code out
 * loud, or whose link's query param got stripped by whatever they shared it
 * through — nothing here changes what is above, and nothing above calls into
 * it.
 */

/** Export equivalent of `peekStoredCode`, so the field can be prefilled with
 * whatever `?amb=` already silently captured — visibly, not invisibly. */
export function peekStoredAmbassadorCode(): string | null {
  return peekStoredCode();
}

/**
 * Writes `AMBASSADOR_CODE_STORAGE_KEY` the way `captureAmbassadorCodeFromLocation`
 * does, for a code that arrived by voice or a stripped link instead of `?amb=`.
 *
 * An empty normalised value REMOVES the key rather than storing "" — matching
 * `record_ambassador_referral`'s own treatment of `v_code = ''` as "no
 * ambassador code was given", so a cleared field and a field that was never
 * touched are indistinguishable to every reader of this key.
 */
export function setStoredAmbassadorCode(code: string): void {
  const normalised = code.trim().toUpperCase();
  try {
    if (!normalised) {
      localStorage.removeItem(AMBASSADOR_CODE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AMBASSADOR_CODE_STORAGE_KEY, normalised);
  } catch {
    /* Storage unavailable (private mode, etc.) — nothing to persist into. */
  }
}

/** What `tryApplyAmbassadorCode` found out — same shape as `icefall-web`'s
 * copy of this file, deliberately: `selfReferral` is a typed field rather than
 * a caller re-deriving it by pattern-matching `message`, and the two apps'
 * `message` strings for a given outcome are the SAME literal text (see that
 * function below), not two independently-worded descriptions of one thing. */
export type ApplyAmbassadorCodeResult =
  | { ok: true; message: string }
  | { ok: false; selfReferral: boolean; message: string };

/**
 * THE ONLY FUNCTION IN THIS FILE THAT TALKS TO THE BACKEND FOR IMMEDIATE
 * FEEDBACK — everything else here is deliberately silent. Only called from
 * the optional field itself; never from `submit()`'s unconditional safety
 * net, which stays exactly as tolerant as it already is.
 *
 * Always persists the normalised code first, win or lose, so a transient
 * failure here (a dropped connection, not a bad code) still leaves the value
 * for `claimAmbassadorReferral()` to retry later.
 */
export async function tryApplyAmbassadorCode(code: string): Promise<ApplyAmbassadorCodeResult> {
  const normalised = code.trim().toUpperCase();
  setStoredAmbassadorCode(normalised);

  const COULD_NOT_CHECK_YET = "Couldn't check that yet — it'll be applied when you continue.";
  const COULD_NOT_CHECK_NOW =
    "Couldn't check that code right now — it'll be applied automatically once you continue.";

  if (!supabase) return { ok: false, selfReferral: false, message: COULD_NOT_CHECK_YET };
  // Defensive, not expected — same posture as `claimStoredAmbassadorReferral`:
  // this screen only ever renders once a session already exists.
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, selfReferral: false, message: COULD_NOT_CHECK_YET };

  try {
    const { error } = await supabase.rpc("record_ambassador_referral", { p_code: normalised });
    if (!error) {
      return { ok: true, message: "Applied — you'll be credited as referred by this ambassador." };
    }
    // FIXED copy, not the SQL exception text pulled out and capitalised — the
    // raw text ("that ambassador code does not match any ambassador", "an
    // ambassador cannot refer themselves") is written for the blocker-list
    // shape `record_ambassador_referral` raises it in, not for a screen
    // showing one reason at a time, and paraphrasing it here (as this file
    // used to) let this app's copy drift from `icefall-web`'s for the exact
    // same outcome. These two strings are the single source both apps show.
    const selfReferral = /cannot refer themselves/i.test(error.message ?? "");
    if (selfReferral) {
      return {
        ok: false,
        selfReferral: true,
        message: "That's your own ambassador code — it can't be used to refer yourself.",
      };
    }
    return {
      ok: false,
      selfReferral: false,
      message: "That referral code couldn't be applied. It may not exist, or may no longer be active.",
    };
  } catch {
    // Unexpected shape (network error, migration not applied, …) — never a
    // raw Postgres/network error in front of a non-technical person.
    return { ok: false, selfReferral: false, message: COULD_NOT_CHECK_NOW };
  }
}
