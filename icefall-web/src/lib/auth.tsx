import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { OFFLINE } from "@/offline/offline";
import { OFFLINE_SESSION } from "@/offline/fixtures";
import { isBackendConfigured, supabase } from "@/backend/client";
import {
  consumeInvitations,
  sendPasswordReset,
  signInWithEmail,
  signInWithProvider,
  signOut as backendSignOut,
  signUpWithEmail,
  type AuthOutcome,
  type ProviderKey,
} from "@/auth/account";

/**
 * Sessions, Airbnb-style: browse freely, sign in at the moment you act.
 *
 * ── THESE ARE REAL ACCOUNTS NOW, AND THEY ARE THE PHONE APP'S ACCOUNTS ──────
 *
 * This file used to keep a name and an email in `localStorage` and throw the
 * password away, because there was no account server. There is one, and it is
 * the same Supabase project `icefall-app` uses — so a climber who signed up on
 * their phone signs in here and finds their own data, rather than a lookalike
 * session that knows nothing about them.
 *
 * `requireAuth(then)` is unchanged and is still the operational trick: signed
 * in, it runs immediately; signed out, it opens the modal and runs `then` the
 * instant sign-in succeeds — so "Book" while signed out becomes
 * sign-in-then-book with nothing lost in between.
 *
 * ── `ready` EXISTS BECAUSE A CACHED SESSION TAKES A TICK TO RESTORE ─────────
 *
 * Restoring a session from storage is asynchronous. Without `ready`, the first
 * paint has `session === null` and the router would show a returning climber
 * the waitlist for a frame before swapping to their dashboard — or worse,
 * redirect them out of the page they opened. Every gate must wait for `ready`
 * rather than treating "not yet known" as "signed out". **Not yet known and
 * signed out are different statements**, which is the same rule
 * `setDayAvailability` follows in the phone app.
 */

export interface Session {
  /** The Supabase user id — needed by anything that reads their own rows. */
  id: string;
  name: string;
  email: string;
}

type Mode = "in" | "up";

interface AuthValue {
  session: Session | null;
  signedIn: boolean;
  /** False until the cached session has been read. Never treat as signed out. */
  ready: boolean;
  /** False when there is no account server reachable — the modal says so. */
  configured: boolean;
  authOpen: boolean;
  authMode: Mode;
  openAuth: (mode?: Mode) => void;
  closeAuth: () => void;
  setMode: (m: Mode) => void;
  /** Run now if signed in, else open the modal and run after a successful sign-in. */
  requireAuth: (then?: () => void) => void;
  signIn: (email: string, password: string) => Promise<AuthOutcome>;
  signUp: (name: string, email: string, password: string) => Promise<AuthOutcome>;
  signInWith: (provider: ProviderKey) => Promise<AuthOutcome>;
  resetPassword: (email: string) => Promise<AuthOutcome>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

/** A Supabase user, as the app wants to read it. */
function toSession(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined): Session | null {
  if (!user) return null;
  const email = user.email ?? "";
  const metaName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
  return {
    id: user.id,
    // Falls back to the local part of the address rather than to "there" or an
    // empty string — a greeting with a blank in it reads as a broken page.
    name: metaName.trim() || email.split("@")[0] || "Climber",
    email,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  /*
   * OFFLINE DEMO: already signed in, before the first paint.
   *
   * `BookingConfirm` renders a full-screen "Sign in to confirm your trip" wall
   * when signed out, and every Book button routes through `requireAuth`. Seeding
   * the demo identity means neither is ever reached, so somebody reading this on
   * a plane lands on content rather than on a form — and no network call is made
   * to discover that, because the client itself is null offline.
   */
  const [session, setSession] = useState<Session | null>(OFFLINE ? () => OFFLINE_SESSION : null);
  const [ready, setReady] = useState<boolean>(OFFLINE || !isBackendConfigured());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<Mode>("in");
  // The action waiting for a successful sign-in, held in state so it survives
  // the modal being open across renders.
  const [pending, setPending] = useState<(() => void) | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  pendingRef.current = pending;

  /* ---- restore, then follow the session for the life of the page --------- */
  useEffect(() => {
    if (OFFLINE || !supabase) return;
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const s = toSession(data.session?.user);
      setSession(s);
      setReady(true);
      if (s) void consumeInvitations();
    });

    /*
      The one door every arrival walks through: an email sign-in, an OAuth
      callback landing back on the site, or a token refresh. Routing on the
      STATE rather than on how somebody arrived is why the social providers
      need no second flow of their own.
    */
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      const s = toSession(next?.user);
      setSession(s);
      setReady(true);
      if (s) {
        void consumeInvitations();
        setAuthOpen(false);
        const run = pendingRef.current;
        if (run) {
          setPending(null);
          // After the modal has closed.
          setTimeout(run, 0);
        }
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const openAuth = useCallback((m: Mode = "in") => {
    setAuthMode(m);
    setAuthOpen(true);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      signedIn: session !== null,
      ready,
      configured: isBackendConfigured(),
      authOpen,
      authMode,
      openAuth,
      closeAuth: () => {
        setAuthOpen(false);
        setPending(null);
      },
      setMode: setAuthMode,
      requireAuth: (then) => {
        if (session) {
          then?.();
          return;
        }
        setPending(() => then ?? null);
        setAuthMode("up");
        setAuthOpen(true);
      },
      /*
        These return the outcome rather than swallowing it, because the modal has
        to tell somebody WHY a sign-in failed. The session itself is not set
        here — `onAuthStateChange` above is the single place that happens, so a
        session created by a provider redirect and one created by a password are
        the same code path.
      */
      signIn: (email, password) => signInWithEmail(email, password),
      signUp: (name, email, password) => signUpWithEmail(name, email, password),
      signInWith: (provider) => signInWithProvider(provider),
      resetPassword: (email) => sendPasswordReset(email),
      signOut: async () => {
        await backendSignOut();
        setSession(null);
      },
    }),
    [session, ready, authOpen, authMode, openAuth],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
