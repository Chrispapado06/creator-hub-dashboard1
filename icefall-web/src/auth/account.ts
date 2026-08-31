import { supabase } from "@/backend/client";

/**
 * Real accounts on the web — the same accounts as the phone app.
 *
 * `lib/auth.tsx` used to match an email against a `localStorage` record and
 * throw the password away, because there was nothing to authenticate against.
 * There is now, and it is the SAME Supabase project the phone app uses: a
 * climber who signed up on their phone signs in here with those credentials and
 * finds their own data.
 *
 * ── DELIBERATELY A MIRROR OF `icefall-app/src/auth/account.ts` ──────────────
 *
 * Same provider ids, same outcome type, same error mapping, same rule about
 * confirmation. Two apps sharing accounts must not disagree about what a
 * failure means — a climber told "that email and password don't match" on one
 * device and shown a raw Postgres string on the other will conclude the account
 * itself is broken.
 *
 * ── TWO RULES THIS FILE EXISTS TO KEEP ──────────────────────────────────────
 *
 * 1. **Nothing here may imply a delivery it cannot make.** A confirmation email
 *    comes from Supabase, not from us, and goes nowhere useful until a real
 *    email provider is configured — the built-in sender manages a handful an
 *    hour. So `signUp` REPORTS whether confirmation is pending rather than
 *    saying "check your inbox" unconditionally.
 *
 * 2. **An unrecognised error passes through unchanged.** A wrong-but-friendly
 *    string is worse than an unfamiliar accurate one: it sends the reader
 *    looking in the wrong place and hides the real fault from whoever they ask.
 */

/**
 * Microsoft's provider id in Supabase is `azure`, NOT `microsoft`.
 *
 * Getting this wrong produces a generic "provider is not enabled" that reads
 * like a dashboard misconfiguration and sends you hunting in the wrong place.
 */
export const PROVIDERS = {
  google: { id: "google", label: "Google" },
  apple: { id: "apple", label: "Apple" },
  microsoft: { id: "azure", label: "Microsoft" },
} as const;

export type ProviderKey = keyof typeof PROVIDERS;

export type AuthOutcome =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; message: string };

/** Where a provider sends the browser back to. Must be allow-listed in Supabase. */
function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

const OFFLINE_MESSAGE =
  "ICEFALL can't reach the account server. Check your connection and try again — nothing was lost.";

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE_MESSAGE };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      // Metadata is whatever the client sent, so the `handle_new_user` trigger
      // reads it for the name and avatar ONLY — never a role, never a username.
      data: { display_name: name.trim().slice(0, 80) },
      emailRedirectTo: callbackUrl(),
    },
  });

  if (error) return { ok: false, message: friendly(error.message) };

  // Supabase returns a user with NO session when confirmation is required.
  // That distinction is the difference between "you're in" and "go and click a
  // link", and the screen must not guess.
  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE_MESSAGE };

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, needsEmailConfirmation: false };
}

/**
 * Hand off to Google / Apple / Microsoft.
 *
 * This navigates away, so there is no success path to return — the browser
 * comes back to `/auth/callback`. Only a failure returns here.
 */
export async function signInWithProvider(key: ProviderKey): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE_MESSAGE };

  const { error } = await supabase.auth.signInWithOAuth({
    provider: PROVIDERS[key].id,
    options: { redirectTo: callbackUrl() },
  });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, needsEmailConfirmation: false };
}

export async function sendPasswordReset(email: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE_MESSAGE };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: callbackUrl(),
  });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, needsEmailConfirmation: true };
}

/**
 * Change the display name on the real account.
 *
 * Only the name. **Changing an email address is a verification flow** — the new
 * address has to prove it is reachable before it replaces the old one, or an
 * account can be moved to an address its owner does not control. That flow does
 * not exist yet, so this does not offer it, and the Settings screen says why
 * rather than showing a field that silently does nothing.
 */
export async function updateDisplayName(name: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE_MESSAGE };
  const { error } = await supabase.auth.updateUser({
    data: { display_name: name.trim().slice(0, 80) },
  });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, needsEmailConfirmation: false };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * Consume any invitation addressed to the signed-in address.
 *
 * ICEFALL invites people by EMAIL before they have an account — a company's
 * staff, ICEFALL's own staff. `accept_invitations()` matches the address and
 * creates the membership, and NOTHING ELSE CALLS IT. The phone app runs this on
 * every arrival for that reason, and the web must too: somebody invited as a
 * company user who happens to sign in here FIRST would otherwise land as an
 * ordinary athlete with their invitation sitting unconsumed forever, silently.
 *
 * Tolerant of failure on purpose — they ARE signed in, the call is idempotent,
 * and it retries on the next load. Routing must not break because it could not.
 */
export async function consumeInvitations(): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.rpc("accept_invitations");
  } catch {
    /* retries next load */
  }
}

/**
 * Turn a Supabase error into something a climber can act on.
 *
 * The last line is the important one: **an unrecognised message passes through
 * unchanged.** Mapping everything to a friendly catch-all would hide the real
 * fault from whoever they report it to.
 */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match an account.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the link we sent.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "There's already an account with that email. Sign in instead.";
  }
  if (m.includes("password") && m.includes("6 characters")) {
    return "That password is too short.";
  }
  if (m.includes("provider is not enabled")) {
    return "That sign-in method isn't switched on yet.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (m.includes("fetch") || m.includes("network")) return OFFLINE_MESSAGE;
  return message;
}
