import { supabase } from "@/backend/client";
/* Aliased because this module already exports a string constant called
   `OFFLINE` — the message shown when the account server cannot be reached.
   Renaming that would be an edit to a production path for the sake of an
   offline build, which is exactly what offline mode must not do. */
import { OFFLINE as OFFLINE_BUILD } from "@/offline/offline";

/**
 * SIGNING IN — AND DELIBERATELY NOT SIGNING UP.
 *
 * A guide uses THE SAME ICEFALL ACCOUNT as the athlete app. One person, one
 * login, whichever app they open; both are browser apps only because neither is
 * in a store yet. The database already worked this way — `open_support_ticket`
 * looks the caller up and stamps `guide` when they have a `guide_profiles` row.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THERE IS NO SIGN-UP HERE, AND THAT IS A SAFETY RULE RATHER THAN A GAP.
 *
 * Registration always creates an ATHLETE and cannot create anything else:
 * `profiles_insert_self` carries `with check (id = auth.uid() and role =
 * 'athlete')` and `handle_new_user` passes the literal. So nobody can register
 * themselves as a guide — and a person self-declaring as a qualified mountain
 * guide, to strangers who will then follow them onto glaciated ground, is
 * exactly what that invariant exists to prevent.
 *
 * A guide becomes one because ICEFALL creates their `guide_profiles` row after
 * a member of staff has read their documents. So this app signs people IN, and
 * when somebody without a guide profile signs in it says plainly that this app
 * is for guides and their account is not one. **It does not offer to make them
 * one**, because there is no honest way for this app to do that.
 * ───────────────────────────────────────────────────────────────────────────
 */

export type AuthOutcome = { ok: true } | { ok: false; message: string };

const OFFLINE =
  "ICEFALL can't reach the account server. Check your connection and try again — nothing was lost.";

/**
 * THE DEMO IDENTITY, used only in an offline build.
 *
 * Not a real user id and not shaped like one — no uuid, so it cannot be pasted
 * into a query and match anything. Offline the app is already signed in as this
 * person; there is no sign-in screen and nothing to sign in to.
 */
export const OFFLINE_USER_ID = "offline-demo-guide";

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  /* Offline the user is already signed in, so this can only be reached by
     someone poking at /welcome. Accept rather than show a failure about a
     server this build never intended to reach. */
  if (OFFLINE_BUILD) return { ok: true };
  if (!supabase) return { ok: false, message: OFFLINE };
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** The signed-in user's id, or null. Null is a supported state. */
export async function currentUserId(): Promise<string | null> {
  if (OFFLINE_BUILD) return OFFLINE_USER_ID;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * WHERE A SESSION STANDS WITH THIS APP, as one state rather than three booleans.
 *
 * `not-a-guide` is a real, expected state and not an error: an ICEFALL account
 * is an athlete account until staff make it more, so a climber signing in here
 * has done nothing wrong and must not be told they have.
 *
 * `unknown` is the honest fourth: signed in, and the check itself failed. It is
 * NOT folded into `not-a-guide`, because "we looked and you are not a guide" and
 * "we could not look" are different statements and only one of them should shut
 * somebody out of their own tool.
 */
export type GuideAccess = "signed-out" | "guide" | "not-a-guide" | "unknown" | "offline";

export async function guideAccess(): Promise<GuideAccess> {
  /**
   * OFFLINE THE ANSWER IS "guide", AND IT RESOLVES IMMEDIATELY.
   *
   * This is the one function in the app that decides whether a guide sees their
   * own tool, and offline it must never be `null` while a promise is pending —
   * that is the state that renders "Checking whether you can reach the ICEFALL
   * desk…" forever on Payouts, Verification and Profile. A build with no client
   * has nothing to check and nothing to wait for.
   */
  if (OFFLINE_BUILD) return "guide";
  if (!supabase) return "offline";

  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return "signed-out";

  /* A guide may read their own row: `guide_profiles_select` permits
     `id = auth.uid()`. `maybeSingle` returns null rather than throwing when
     there is none, which is the ordinary case for a climber. */
  const { data, error } = await supabase
    .from("guide_profiles")
    .select("id")
    .eq("id", uid)
    .maybeSingle();

  if (error) return "unknown";
  return data ? "guide" : "not-a-guide";
}

/** Fires on sign-in, sign-out and token refresh. Returns an unsubscribe. */
export function onAuthChange(fn: () => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(() => fn());
  return () => data.subscription.unsubscribe();
}

/**
 * Turn a server message into one a guide can act on — and PASS ANYTHING
 * UNRECOGNISED THROUGH UNCHANGED.
 *
 * That last rule is the important one. Rewriting an unknown error into a
 * friendly generic destroys the only clue anybody has, and this app has a
 * specific one worth seeing: an unauthenticated RPC call fails at the GRANT
 * before the function body runs, returning
 * `42501 permission denied for function open_support_ticket` — which reads as a
 * broken app when it actually means signed out. It is mapped below by name; a
 * message nobody has mapped yet reaches the screen intact.
 */
export function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match an account.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox for the link we sent.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (m.includes("permission denied for function") || m.includes("not signed in")) {
    return "You are signed out. Sign in again and your message will send.";
  }
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch")) return OFFLINE;
  return message;
}

export { OFFLINE };
