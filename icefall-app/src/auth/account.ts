/**
 * Real accounts: signup, sign-in, and the three social providers.
 *
 * Until now `Auth.tsx` matched an email against a localStorage record and threw
 * the password away on purpose, because there was nothing to authenticate
 * against. There is now.
 *
 * TWO RULES THIS FILE EXISTS TO KEEP.
 *
 * 1. A CACHED SESSION IS ENOUGH TO OPEN THE APP. The phone app's whole value is
 *    that it works at four in the morning in a hut with no signal. `persistSession`
 *    is on, so a returning climber opens straight into their training. Only
 *    CREATING an account, claiming a username and syncing need the network.
 *    Never send somebody back to /welcome because a token refresh failed.
 *
 * 2. NOTHING HERE MAY IMPLY A DELIVERY IT CANNOT MAKE. A confirmation email is
 *    sent by Supabase, not by us, and it goes nowhere useful until a real email
 *    provider is configured — Supabase's built-in sender manages a handful an
 *    hour. `signUp` therefore reports whether confirmation is pending rather
 *    than saying "check your inbox" unconditionally.
 */
import { supabase } from "@/backend/client";

/**
 * Microsoft's provider id in Supabase is `azure`, NOT `microsoft`.
 *
 * Getting this wrong produces a generic "provider is not enabled" that reads
 * like a dashboard misconfiguration and sends you looking in the wrong place.
 */
/**
 * `scopes` IS NOT OPTIONAL DECORATION FOR MICROSOFT.
 *
 * Supabase's Azure provider requests only `openid` by default, and Supabase Auth
 * REFUSES a sign-in that comes back without an email address — the browser lands
 * on /auth/callback showing "Error getting user email from external provider".
 * Every portal step can be correct and Microsoft still fails on this one line,
 * which is the worst kind of bug to hand somebody: the error points at the app
 * and the cause is a missing four-letter string.
 *
 * Google and Apple are deliberately left without it. Both already return an
 * email under Supabase's defaults, and naming scopes for a provider that does
 * not need them is how a working sign-in acquires a consent screen asking for
 * more than it uses.
 */
export const PROVIDERS = {
  google: { id: "google", label: "Google", scopes: undefined },
  apple: { id: "apple", label: "Apple", scopes: undefined },
  microsoft: { id: "azure", label: "Microsoft", scopes: "email profile" },
} as const;

export type ProviderKey = keyof typeof PROVIDERS;

export type AuthOutcome =
  | { ok: true; needsEmailConfirmation: boolean }
  | { ok: false; message: string };

/** Where a provider sends the browser back to. Must be allow-listed in Supabase. */
function callbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

const OFFLINE =
  "ICEFALL can't reach the account server. Check your connection and try again — nothing was lost.";

/**
 * Create an account.
 *
 * `display_name` goes into user metadata, which the `handle_new_user` trigger
 * reads to build the profile row. The trigger reads metadata for the name and
 * avatar ONLY — never a role, never a username — because metadata is whatever
 * the client sent.
 */
export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { display_name: name.trim().slice(0, 80) },
      emailRedirectTo: callbackUrl(),
    },
  });

  if (error) return { ok: false, message: friendly(error.message) };

  // Supabase returns a user with no session when confirmation is required. That
  // distinction is the difference between "you're in" and "go and click a link",
  // and the screen must not guess.
  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE };

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
 * This navigates away from the app, so there is no success path to return — the
 * browser comes back to `/auth/callback`. Only a failure returns here.
 */
export async function signInWithProvider(key: ProviderKey): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE };

  const { error } = await supabase.auth.signInWithOAuth({
    provider: PROVIDERS[key].id,
    options: { redirectTo: callbackUrl(), scopes: PROVIDERS[key].scopes },
  });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, needsEmailConfirmation: false };
}

export async function sendPasswordReset(email: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: OFFLINE };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: callbackUrl(),
  });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, needsEmailConfirmation: true };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * What the app must do next with a live session.
 *
 * ONE ROUTER FOR TWO SITUATIONS THAT ARE THE SAME STATE. "Signed in with Google
 * and has never picked a handle" and "confirmed their email and has never picked
 * a handle" are byte-for-byte identical: a session whose profile has a null
 * username. Routing on the STATE rather than on how they arrived is why social
 * login needs no second flow.
 */
export type NextStep = "handle" | "onboarding" | "home" | "signed-out" | "offline";

export async function nextStepForSession(): Promise<NextStep> {
  if (!supabase) return "offline";

  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return "signed-out";

  // CONSUME ANY INVITATION ADDRESSED TO THIS PERSON, before anything routes.
  //
  // ICEFALL invites people by EMAIL before they have an account (a company's
  // staff, ICEFALL's own staff). The invitation is consumed by the server-side
  // `accept_invitations()`, which matches the signed-in address and creates the
  // membership — and NOTHING ELSE CALLS IT. Without this line, an invited
  // person signs up, lands as an ordinary athlete, and their invitation sits
  // unconsumed forever, silently. This router is the one door every arrival
  // walks through — email sign-in, OAuth callback, restored session — in every
  // app that copies this module, so the call lives here and nobody has to
  // remember it per-app.
  //
  // Tolerant of failure on purpose: they ARE signed in, and the call is
  // idempotent and retried on the next load. A nonzero count means their role
  // may just have changed (athlete → company user or staff), which the reads
  // below then see fresh.
  try {
    await supabase.rpc("accept_invitations");
  } catch {
    // Consuming retries next load; routing must not break because it could not.
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", sess.session.user.id)
    .maybeSingle();

  // A read failure is NOT a reason to throw somebody back to the sign-in screen.
  // They are signed in; the network is what failed.
  if (error) return "offline";
  if (!data?.username) return "handle";

  const { data: athlete } = await supabase
    .from("athlete_profiles")
    .select("onboarded_at")
    .eq("id", sess.session.user.id)
    .maybeSingle();

  return athlete?.onboarded_at ? "home" : "onboarding";
}

/**
 * The signed-in person's name and email, for hydrating this device's local
 * profile after a sign-in.
 *
 * WHY THIS IS NEEDED. The app gates and renders off a LOCAL account record. Sign
 * in on a new phone and the server knows who you are while the device still
 * shows whoever used it last — which is how a profile ended up captioned with
 * one person's name above another person's handle during testing.
 */
export async function serverIdentity(): Promise<{ name: string; email: string } | null> {
  if (!supabase) return null;
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", sess.session.user.id)
    .maybeSingle();
  return {
    name: data?.display_name ?? sess.session.user.email?.split("@")[0] ?? "Climber",
    email: sess.session.user.email ?? "",
  };
}

/**
 * Record that onboarding is finished, and keep the answers.
 *
 * WHY THIS EXISTS AT ALL — a loop that shipped for about an hour. Sign-in routes
 * on `athlete_profiles.onboarded_at`, and nothing wrote that row. So every
 * returning climber was sent back through all twelve questions, every time,
 * forever. The router was right; the write was missing.
 *
 * FIRE AND FORGET, DELIBERATELY. The caller does not await this and does not
 * branch on it. localStorage is authoritative for the running session — the app
 * opens on a mountain with no signal — so a failed sync must never block
 * somebody from finishing onboarding. The cost of losing it is one re-ask on a
 * new device, not a person stuck on a form.
 *
 * The answers go in `athlete_profiles`, never on `profiles`: that table is
 * readable by every signed-in account, and body mass and birth year are not
 * public facts.
 */
export async function syncOnboarding(answers: Record<string, unknown>): Promise<void> {
  if (!supabase) return;
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    await supabase.from("athlete_profiles").upsert(
      {
        id: sess.session.user.id,
        experience: typeof answers.experience === "string" ? answers.experience : null,
        answers,
        answers_version: 1,
        onboarded_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch {
    // Offline, or the row is not writable. Neither is worth a message here: the
    // athlete has finished, and the only consequence is being asked again on a
    // device that has never seen them.
  }
}

/**
 * The onboarding answers this person gave, from whichever device they gave them
 * on — so a new phone restores their training instead of re-asking.
 *
 * WHY NOT JUST SET A FLAG. The obvious shortcut is to mark the device
 * "onboarded" when the server says so. That routes them to Home with none of
 * their disciplines, experience or objective — a working app with an empty
 * person in it, which is worse than being asked again. The answers are stored
 * precisely so they can come back.
 *
 * Returns null when there is nothing to restore, which is a real and ordinary
 * state: a brand-new account, or an offline device.
 */
export async function storedOnboarding(): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return null;
    const { data } = await supabase
      .from("athlete_profiles")
      .select("answers, onboarded_at")
      .eq("id", sess.session.user.id)
      .maybeSingle();
    if (!data?.onboarded_at) return null;
    return validAnswers(data.answers);
  } catch {
    return null;
  }
}

/**
 * A stored record is only restorable if it still has the shape the app needs.
 *
 * THIS IS THE FAIL-CLOSED RULE AGAIN, in a new place. The first version handed
 * whatever was in the column straight to `completeOnboarding`, which does
 * `a.name.trim()`. A record missing `name` — an older `answers_version`, a
 * partial write, a row somebody edited — threw
 * `Cannot read properties of undefined (reading 'trim')` DURING RENDER, which
 * white-screens the app on sign-in. Caught by signing in, not by the typecheck:
 * `answers` is `jsonb`, so its type is `Record<string, unknown>` and every
 * property access type-checks perfectly.
 *
 * `answers_version` exists precisely because this shape will change. Returning
 * null sends the person to the questions again — mildly irritating, and far
 * better than an app that will not open.
 */
function validAnswers(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.name !== "string") return null;
  if (typeof a.experience !== "string") return null;
  if (!Array.isArray(a.disciplines)) return null;
  if (typeof a.goalName !== "string") return null;
  return a;
}

export async function setMyLocation(label: string, country: string | null): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("set_my_location", {
    p_label: label.trim() || null,
    p_country: country && /^[A-Z]{2}$/.test(country) ? country : null,
  });
  if (error) return false;
  return Boolean((data as { ok?: boolean } | null)?.ok);
}

/**
 * Supabase's messages are accurate and written for developers. These are the
 * few a climber will actually hit, in words that say what to do next.
 *
 * Deliberately NOT rewritten: anything unrecognised passes through unchanged.
 * A wrong-but-friendly message is worse than an unfamiliar accurate one, and it
 * makes a real fault unsearchable.
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
  if (m.includes("fetch") || m.includes("network")) return OFFLINE;
  return message;
}
