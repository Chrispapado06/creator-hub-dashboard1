/**
 * Session and data access for the whole portal.
 *
 * One context, one backend reference. Screens never import the memory adapter
 * directly — they take `backend` from here, so replacing it with the Supabase
 * implementation is a one-line change in this file.
 *
 * THE SESSION IS THE SCOPE. There is no "current company" stored separately from
 * the signed-in user, because two sources of truth for "whose data is this" is
 * how a portal ends up showing one company another's inbox.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { OperatorBackend } from "@/domain/adapter";
import type { Session } from "@/domain/authz";
import { memoryBackend } from "@/domain/memory/adapter";
import { offlineBackend, OFFLINE_SESSION } from "@/offline/backend";
import { DEMO } from "@/offline/offline";
import { ThemeProvider } from "@/state/theme";
import type { Company, CompanyMountain, Mountain, Placement } from "@/domain/types";

interface OperatorContextValue {
  backend: OperatorBackend;
  session: Session | null;
  company: Company | null;
  /** Authorization: which mountains may be edited. */
  access: CompanyMountain[];
  /** The paid slots, read-only. */
  placements: Placement[];
  mountains: Mountain[];
  signIn: (email: string) => Promise<boolean>;
  signOut: () => void;
  /**
   * True until the stored sign-in has been checked.
   *
   * Load-bearing: without it the route guard runs before the session exists and
   * redirects every deep link to the dashboard. An operator following a
   * notification straight to one conversation would never arrive at it.
   */
  restoring: boolean;
  /** Bumped after a write, so lists re-read without a full page reload. */
  revision: number;
  refresh: () => void;
}

const Ctx = createContext<OperatorContextValue | null>(null);

/**
 * DEMO swaps the whole seam for the fixture implementation (§ the flag split:
 * data source is a DEMO question; OFFLINE is only connectivity). Nothing else in
 * this file's normal path changes: with the flag unset this is exactly the
 * `memoryBackend` line it has always been.
 */
const backend: OperatorBackend = DEMO ? offlineBackend : memoryBackend;

const SESSION_KEY = "icefall-operator.session-email";

export function OperatorProvider({ children }: { children: ReactNode }) {
  /**
   * DEMO STARTS SIGNED IN, AND STARTS RESTORED.
   *
   * There is no sign-in offline: a demo that opens on a login wall is a demo
   * nobody gets past on a plane. Seeding the session here — rather than signing
   * in inside an effect — also means `restoring` is already false on the first
   * render, so the route guard never briefly redirects to `/operator/sign-in`.
   */
  const [session, setSession] = useState<Session | null>(DEMO ? OFFLINE_SESSION : null);
  const [company, setCompany] = useState<Company | null>(null);
  const [access, setAccess] = useState<CompanyMountain[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [mountains, setMountains] = useState<Mountain[]>([]);
  const [revision, setRevision] = useState(0);
  const [restoring, setRestoring] = useState(!DEMO);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  const signIn = useCallback(async (email: string) => {
    const s = await backend.signIn(email);
    if (!s) return false;
    setSession(s);
    try {
      window.localStorage.setItem(SESSION_KEY, email);
    } catch {
      // A browser refusing storage is not a reason to fail a sign-in.
    }
    return true;
  }, []);

  const signOut = useCallback(() => {
    // Offline there is nowhere to sign out TO — the sign-in screen is exactly
    // the dead end this mode exists to avoid — so the control does nothing.
    if (DEMO) return;
    setSession(null);
    setCompany(null);
    setAccess([]);
    setPlacements([]);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Restore the last sign-in so a reload does not throw the operator out.
  useEffect(() => {
    // Offline the session is already seeded above and there is nothing stored
    // to restore from. Reading localStorage here could only undo that.
    if (DEMO) return;
    let cancelled = false;
    (async () => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(SESSION_KEY);
      } catch {
        stored = null;
      }
      if (!stored) {
        if (!cancelled) setRestoring(false);
        return;
      }
      const s = await backend.signIn(stored);
      if (cancelled) return;
      if (s) setSession(s);
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session) return;
      const [c, a, pl, m] = await Promise.all([
        backend.getCompany(session),
        backend.getAccess(session),
        backend.getPlacements(session),
        backend.getMountains(),
      ]);
      if (cancelled) return;
      setCompany(c);
      setAccess(a);
      setPlacements(pl);
      setMountains(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, revision]);

  const value = useMemo<OperatorContextValue>(
    () => ({ backend, session, company, access, placements, mountains, signIn, signOut, restoring, revision, refresh }),
    [session, company, access, placements, mountains, signIn, signOut, restoring, revision, refresh],
  );

  /**
   * The theme sits INSIDE this provider on purpose. It is a per-person display
   * preference held in the browser, not company data and not part of the
   * session — nothing about it is scoped by who is signed in, and it is
   * deliberately not another field on this context for that reason.
   * Nesting it here rather than in `App.tsx` keeps OP-09 inside its own files.
   */
  return (
    <Ctx.Provider value={value}>
      <ThemeProvider>{children}</ThemeProvider>
    </Ctx.Provider>
  );
}

export function useOperator(): OperatorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOperator must be used inside OperatorProvider");
  return v;
}

/**
 * Screens that only run behind the sign-in gate.
 *
 * Throws rather than returning null when there is no session, because a screen
 * rendering with no session is a bug that must not degrade into showing
 * something — there is no safe "logged out" view of an operator's leads.
 */
export function useSession(): Session {
  const { session } = useOperator();
  if (!session) throw new Error("This screen requires a signed-in operator");
  return session;
}

/** Small async read helper, so every screen does not hand-roll the same effect. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let cancelled = false;
    fn().then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
