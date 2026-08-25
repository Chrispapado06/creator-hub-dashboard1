import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Sessions, Airbnb-style: browse freely, sign in at the moment you act.
 *
 * THIS IS A LOCAL DEMO SESSION. There is no account server. `signUp` keeps a
 * name and email in localStorage so the marketplace behaves like the real thing
 * — the header changes, gated actions open — but NO PASSWORD IS STORED, nothing
 * is transmitted, and every screen that could imply otherwise says so. It mirrors
 * the phone app's deliberately local-only auth: the flow is real, the backend is
 * honestly absent.
 *
 * `requireAuth(then)` is the whole operational trick: if you are signed in it
 * runs immediately; if not, it opens the modal and runs `then` the instant you
 * sign in — so "Book" while signed out becomes sign-in-then-book, seamlessly.
 */

export interface Session {
  name: string;
  email: string;
}

type Mode = "in" | "up";

interface AuthValue {
  session: Session | null;
  signedIn: boolean;
  authOpen: boolean;
  authMode: Mode;
  openAuth: (mode?: Mode) => void;
  closeAuth: () => void;
  setMode: (m: Mode) => void;
  /** Run now if signed in, else open the modal and run after a successful sign-in. */
  requireAuth: (then?: () => void) => void;
  signIn: (email: string) => void;
  signUp: (name: string, email: string) => void;
  signOut: () => void;
}

const KEY = "icefall.web.session.v1";

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(load);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<Mode>("in");
  // The action waiting for a successful sign-in, held in state so it survives
  // the modal being open across renders.
  const [pending, setPending] = useState<(() => void) | null>(null);

  const persist = useCallback((s: Session | null) => {
    setSession(s);
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      /* private mode — the session still works for this tab */
    }
  }, []);

  const finish = useCallback(
    (s: Session) => {
      persist(s);
      setAuthOpen(false);
      if (pending) {
        const run = pending;
        setPending(null);
        // After the modal has closed.
        setTimeout(run, 0);
      }
    },
    [pending, persist],
  );

  const value = useMemo<AuthValue>(
    () => ({
      session,
      signedIn: session !== null,
      authOpen,
      authMode,
      openAuth: (m = "in") => {
        setAuthMode(m);
        setAuthOpen(true);
      },
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
      // No real accounts, so a sign-in restores a local session from the email.
      signIn: (email) => finish({ name: session?.name ?? email.split("@")[0], email }),
      signUp: (name, email) => finish({ name, email }),
      signOut: () => persist(null),
    }),
    [session, authOpen, authMode, finish, persist],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
