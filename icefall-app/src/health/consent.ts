import { supabase } from "@/backend/client";

/**
 * Consent for storing health measurements.
 *
 * ── WHY THIS IS ITS OWN FILE AND ITS OWN QUESTION ───────────────────────────
 *
 * Heart rate, heart-rate variability, sleep, respiratory rate and blood oxygen
 * are special category data under Article 9. They are not ordinary profile
 * fields, and the permission to hold them is not covered by signing up, and not
 * covered by the marketing tick on the waitlist. It has to be asked separately,
 * in its own words, and it has to be refusable without breaking the account.
 *
 * So this module is deliberately not part of `oura.ts`. Oura is the first
 * source that needs this permission; it will not be the last, and the consent
 * must not read as "a setting on the ring screen".
 *
 * ── THE APP DOES NOT OWN THE SENTENCE ───────────────────────────────────────
 *
 * The wording is read from the database (`health_consent_wording_in_force`) and
 * rendered verbatim. It is NOT hardcoded here, and that is the whole point:
 * `health_record_consent` stamps each decision with the version that is in
 * force at the moment it is recorded, so if the app displayed its own copy of
 * the sentence, an old build could record a person's agreement against words
 * they were never shown. The database is the single source of the sentence and
 * of the record that it was agreed to.
 *
 * The consequence is a rule with no exception: WITH NO WORDING, THERE IS NO
 * GRANT BUTTON. If the sentence cannot be fetched, the UI must say it cannot
 * ask right now rather than offering an unevidenced tick. `wordingInForce()`
 * returning null is that case.
 *
 * ── THREE STATES, NOT A BOOLEAN ─────────────────────────────────────────────
 *
 * The same shape 20260903050000 settled on for marketing consent:
 *
 *   never-asked  no screen has been shown to this person
 *   granted      they said yes, to a named version of a named sentence
 *   declined     they said no
 *   withdrawn    they said yes and then took it back
 *
 * `never-asked` and `declined` must stay distinct. Collapsing them into "not
 * granted" would let the app re-ask somebody who has already refused, every
 * time they open a screen, which is nagging dressed as a prompt.
 *
 * ── WITHDRAWAL DELETES, AND THE DELETION IS NOT DONE HERE ───────────────────
 *
 * `health_record_consent` calls `oura_delete_all` inside the same transaction
 * when a decision is `withdrawn` or `declined`. That is on purpose: a caller
 * cannot forget to erase, and an app that crashes between "record withdrawal"
 * and "delete rows" cannot leave a heart-rate history behind a withdrawn
 * consent. This file therefore does NOT also try to delete — it would be a
 * second, weaker guarantee sitting on top of a real one.
 */

/** The purpose slug seeded by the migration. One purpose, one meaning. */
export const HEALTH_CONSENT_PURPOSE = "health-metrics";

/** Where the decision was taken. Constrained by the database's own check. */
/**
 * How a decision reached the database. `app-onboarding` is the "Connect your
 * accounts" page at the end of sign-up (migration 20260907150000); it is its own
 * value rather than a reuse of `app-settings` because the route is evidence of
 * how considered the decision was, and the event log is owed the true one.
 */
export type ConsentRoute = "app-settings" | "app-onboarding" | "app-disconnect";

export type ConsentDecision = "granted" | "declined" | "withdrawn";

/**
 * What we know about this person's decision.
 *
 * `unknown` is a first-class member and never collapses into "not granted".
 * "We could not reach the store" and "they said no" are different facts, and
 * only one of them is a reason to stop asking.
 */
export type HealthConsent =
  | {
      status: "unknown";
      reason: "backend-not-configured" | "signed-out" | "unreachable";
      detail: string;
    }
  | { status: "never-asked" }
  | {
      status: "granted";
      /** The version of the sentence they agreed to, as recorded. */
      version: string | null;
      /** The sentence itself, frozen at the moment of the decision. */
      wording: string | null;
      recordedAt: string;
    }
  | { status: "declined"; recordedAt: string }
  | { status: "withdrawn"; recordedAt: string };

/** The sentence currently on the page, and the version that names it. */
export interface ConsentWording {
  version: string;
  wording: string;
}

/**
 * Postgres refuses an ungranted function with 42501 before the body's own "not
 * signed in" check ever runs, so an anonymous caller gets a permission string
 * meant for an operator. `support/tickets.ts` learned this first; the mapping
 * is repeated here rather than exported from there because the two modules
 * should not couple over an error code.
 */
const NOT_SIGNED_IN = "42501";

function signedOut(): HealthConsent {
  return {
    status: "unknown",
    reason: "signed-out",
    detail: "Sign in to see or change your health-data permission.",
  };
}

/** Reads the decision in force for this person, or the reason we cannot. */
export async function readHealthConsent(): Promise<HealthConsent> {
  if (!supabase) {
    return {
      status: "unknown",
      reason: "backend-not-configured",
      detail:
        "This build has no server connection, so no health-data permission can be recorded or checked.",
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return signedOut();

  const { data, error } = await supabase.rpc("health_my_consent", {
    p_purpose: HEALTH_CONSENT_PURPOSE,
  });

  if (error) {
    if (error.code === NOT_SIGNED_IN) return signedOut();
    return {
      status: "unknown",
      reason: "unreachable",
      detail: "We could not check your health-data permission just now.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.decision) return { status: "never-asked" };

  if (row.decision === "granted") {
    return {
      status: "granted",
      version: row.version ?? null,
      wording: row.wording ?? null,
      recordedAt: row.recorded_at,
    };
  }
  if (row.decision === "withdrawn") {
    return { status: "withdrawn", recordedAt: row.recorded_at };
  }
  return { status: "declined", recordedAt: row.recorded_at };
}

/**
 * The sentence to put on screen, or null.
 *
 * NULL MEANS DO NOT ASK. Not "ask with a default sentence" — there is no
 * default sentence, and a grant recorded against no wording is refused by the
 * database anyway. The UI's job on null is to explain that the permission
 * screen is unavailable right now.
 */
export async function wordingInForce(): Promise<ConsentWording | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("health_consent_wording_in_force", {
    p_purpose: HEALTH_CONSENT_PURPOSE,
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.wording || !row.version) return null;
  return { version: row.version, wording: row.wording };
}

export interface RecordResult {
  ok: boolean;
  /** Shown to the person verbatim when `ok` is false. */
  error?: string;
}

/**
 * Records a decision.
 *
 * The wording version is NOT passed. The database takes whatever is in force at
 * the moment of the write, which is what the person was just shown — accepting
 * a version from the client would let a stale build record agreement to an old
 * sentence. Callers must therefore render `wordingInForce()` and record within
 * the same sitting, which is what the screen does.
 */
export async function recordHealthConsent(
  decision: ConsentDecision,
  route: ConsentRoute = "app-settings",
): Promise<RecordResult> {
  if (!supabase) {
    return {
      ok: false,
      error: "This build has no server connection, so nothing can be recorded.",
    };
  }

  const { error } = await supabase.rpc("health_record_consent", {
    p_purpose: HEALTH_CONSENT_PURPOSE,
    p_decision: decision,
    p_route: route,
  });

  if (!error) return { ok: true };

  if (error.code === NOT_SIGNED_IN) {
    return { ok: false, error: "Sign in first — this is recorded against your account." };
  }

  /*
    Said plainly rather than smoothed over. When a withdrawal fails, the person
    needs to know their measurements are STILL THERE and to try again; an
    apology that implies it probably worked is the failure mode to avoid.
  */
  return {
    ok: false,
    error:
      decision === "granted"
        ? "We could not record your permission just now. Nothing has changed — please try again."
        : "We could not record that just now. Your measurements have NOT been deleted — please try again.",
  };
}
