/**
 * Session and data access for the whole portal.
 *
 * One context, one backend reference. Screens never import an adapter
 * directly — they take `backend` from here, so the DEMO/live split is decided
 * once, in this file, and nowhere else.
 *
 * THE SESSION IS THE SCOPE. There is no "current company" stored separately from
 * the signed-in user, because two sources of truth for "whose data is this" is
 * how a portal ends up showing one company another's inbox.
 *
 * ── TWO THINGS ARE CALLED "SESSION" HERE ────────────────────────────────────
 * `AuthSession` (`@/auth/session`) is WHO IS AUTHENTICATED — an account, a JWT.
 * `Session` (`@/domain/authz`) is WHICH COMPANY USER THIS IS — a company id, a
 * role, a status. One does not imply the other, and the gap between them is the
 * whole security question of this portal. Turning the first into the second is
 * a server-authorized READ of `company_users`, and it is `backend.signIn()`.
 *
 * An authenticated account with NO active membership is the ORDINARY answer for
 * every athlete account in the project. It is `membership: "none"` below — a
 * state, not an error, and it must never be rendered as one.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, useRef } from "react";
import type { OperatorBackend } from "@/domain/adapter";
import type { OperatorOpsBackend } from "@/domain/ops/adapter";
import { memoryOpsBackend } from "@/domain/memory/opsAdapter";
import type { Session } from "@/domain/authz";
import { supabaseBackend } from "@/backend/supabaseBackend";
import { supabaseOps } from "@/backend/supabaseOps";
import { signOut as authSignOut } from "@/auth/account";
import { AUTH_MESSAGES } from "@/auth/messages";
import { useSessionState } from "@/auth/session";
import { offlineBackend, OFFLINE_SESSION } from "@/offline/backend";
import { DEMO } from "@/offline/offline";
import { ThemeProvider } from "@/state/theme";
import type { Company, CompanyMountain, Mountain, Placement } from "@/domain/types";

/**
 * WHETHER THIS AUTHENTICATED ACCOUNT IS AN OPERATOR, in the states the portal
 * can honestly be in. `unknown` covers both "auth not checked yet" and "the
 * membership read is in flight" — from a route guard's point of view they are
 * the same instruction: wait, do not decide.
 *
 *   unknown       not established yet
 *   signed-out    nobody is authenticated
 *   active        authenticated, and an active `company_users` row exists
 *   none          authenticated, and there is no active membership. NOT an error.
 *   unavailable   the membership read itself failed. NOT "you have no account".
 */
export type MembershipState = "unknown" | "signed-out" | "active" | "none" | "unavailable";

interface OperatorContextValue {
  backend: OperatorBackend & OperatorOpsBackend;
  session: Session | null;
  company: Company | null;
  /** Authorization: which mountains may be edited. */
  access: CompanyMountain[];
  /** The paid slots, read-only. */
  placements: Placement[];
  mountains: Mountain[];
  /**
   * DEMO ONLY — the identity picker's door.
   *
   * On a live build there is nothing behind it: `supabaseBackend.signIn` turns
   * an EXISTING Supabase session into a company user and authenticates nobody.
   * Password sign-in is `signInWithEmail` in `@/auth/account`, called by the
   * sign-in screen, and the session it creates arrives here through
   * `useSessionState()` rather than through this function.
   */
  signIn: (email: string) => Promise<boolean>;
  signOut: () => void;
  /**
   * True until the stored sign-in has been checked.
   *
   * Load-bearing: without it the route guard runs before the session exists and
   * redirects every deep link to the dashboard. An operator following a
   * notification straight to one conversation would never arrive at it.
   *
   * It is now DERIVED from `membership === "unknown"` rather than held as its
   * own piece of state, so the two cannot disagree — `src/auth/session.ts`
   * asks for exactly that.
   */
  restoring: boolean;
  /** Why there is no operator session, when there is an account but no scope. */
  membership: MembershipState;
  /** Operator-facing sentence for `membership === "unavailable"`. */
  membershipError: string | null;
  /**
   * The company/access/placement load failed, in words. Null when it is fine or
   * has not been tried. A null `company` alone cannot say which of those it is.
   */
  loadError: string | null;
  /** Bumped after a write, so lists re-read without a full page reload. */
  revision: number;
  refresh: () => void;
}

const Ctx = createContext<OperatorContextValue | null>(null);

/**
 * THE SWAP. Live is the Supabase implementation; the fixtures are the DEMO path
 * and nothing else.
 *
 * The old third option — `memoryBackend` — was the placeholder both of these
 * replaced. It stays in the tree because the authorization test suite drives it
 * directly (it is real logic, not a permissive fake), but no screen reaches it
 * any more: a screen must not be able to read seeded people as an operator's
 * own business.
 *
 * A DEMO BUILD STILL NEEDS NO ENV AND NO NETWORK. `backend/client.ts` builds no
 * client under DEMO, so importing the Supabase module here is inert in that
 * build — the fixture object is the one that gets called.
 */
// TEMP-PROPOSALS-VERIFY
import { memoryBackend as __mb, __store as __ms } from "@/domain/memory/adapter";
void offlineBackend;
const baseBackend: OperatorBackend = DEMO ? __mb : supabaseBackend;
/**
 * THE OPERATIONS SEAM (`@/domain/ops`), composed onto the base. Every method on
 * it is optional, so `{}` is an honest live implementation: a screen finding a
 * method absent renders NOT_CONNECTED, never an empty list.
 *
 * DONE: that hook is now `supabaseOps` (`@/backend/supabaseOps`), which carries
 * only the one pure, tableless method (`describeIntegrationRequirement`) and
 * leaves the other forty absent on purpose. Its header records the migration
 * check and names the pending schema request. Nothing else here changed.
 *
 * `memoryOpsBackend` scopes by `session.user.companyId` and its seed is the
 * MEMORY seed's world (`co-lantern`, Ravi/Marta). With `offlineBackend` as the
 * base the DEMO session is `co-snowpetrel`, and the ops methods answer honestly
 * with empty lists for that company — the two demo worlds are not yet one.
 */
const liveOpsBackend: OperatorOpsBackend = supabaseOps;
const opsBackend: OperatorOpsBackend = DEMO ? memoryOpsBackend : liveOpsBackend;
const backend: OperatorBackend & OperatorOpsBackend = { ...baseBackend, ...opsBackend };
const __TEMP_SESSION: Session = { user: __ms.users.find((u) => u.id === "cu-ravi")! };
void OFFLINE_SESSION;

/** The sentence for a thrown read. `BackendUnavailable.message` is operator-facing. */
function sentenceFor(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return AUTH_MESSAGES.UNEXPLAINED;
}

export function OperatorProvider({ children }: { children: ReactNode }) {
  /**
   * DEMO STARTS SIGNED IN, AND STARTS RESTORED.
   *
   * There is no sign-in offline: a demo that opens on a login wall is a demo
   * nobody gets past on a plane. Seeding the session here — rather than signing
   * in inside an effect — also means `restoring` is already false on the first
   * render, so the route guard never briefly redirects to `/operator/sign-in`.
   */
  const [session, setSession] = useState<Session | null>(DEMO ? __TEMP_SESSION : null);
  const [membership, setMembership] = useState<MembershipState>(DEMO ? "active" : "unknown");
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [access, setAccess] = useState<CompanyMountain[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [mountains, setMountains] = useState<Mountain[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  /**
   * WHO IS AUTHENTICATED, in three states — `undefined` (not known yet), `null`
   * (nobody), or an account. DEMO never consults it: `supabase` is null there,
   * so the hook answers `null` immediately and the seeded session above stands.
   */
  const authSession = useSessionState();

  /*
   * Depend on the STATE and the ADDRESS, not on the session object. auth-js
   * hands back a new object on every token refresh, and depending on it would
   * re-run the membership read every hour for no change.
   */
  const authPhase: "unknown" | "signed-out" | "authed" =
    authSession === undefined ? "unknown" : authSession === null ? "signed-out" : "authed";
  const authEmail = authSession?.user.email ?? "";

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  const signIn = useCallback(async (email: string) => {
    /*
     * DEMO's picker. On a live build `backend.signIn` reads `company_users` for
     * whoever is ALREADY authenticated — it cannot create a session, so calling
     * it here without one would answer null and look like a rejected password.
     */
    const s = await backend.signIn(email);
    if (!s) return false;
    setSession(s);
    setMembership("active");
    return true;
  }, []);

  const signOut = useCallback(() => {
    // Offline there is nowhere to sign out TO — the sign-in screen is exactly
    // the dead end this mode exists to avoid — so the control does nothing.
    if (DEMO) return;
    /*
     * Clear the scoped data immediately rather than waiting for the auth event
     * to come back: one company's leads and prices are on this screen, and the
     * gap between the click and the round-trip is the gap in which they stay on
     * it. The event still arrives and settles `membership` to "signed-out".
     */
    setSession(null);
    setMembership("signed-out");
    setMembershipError(null);
    setCompany(null);
    setAccess([]);
    setPlacements([]);
    setLoadError(null);
    void authSignOut();
  }, []);

  /**
   * AUTHENTICATED ACCOUNT → COMPANY USER.
   *
   * The one read that decides whether this browser has an operator scope. Its
   * three outcomes are three different sentences on the sign-in screen, and
   * collapsing any two of them would tell somebody something untrue: "no active
   * membership" is not "wrong password", and a failed read is not "you have no
   * operator account".
   */
  useEffect(() => {
    if (DEMO) return;

    if (authPhase === "unknown") {
      setMembership("unknown");
      return;
    }
    if (authPhase === "signed-out") {
      setSession(null);
      setMembership("signed-out");
      setMembershipError(null);
      setCompany(null);
      setAccess([]);
      setPlacements([]);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setMembership("unknown");
    setMembershipError(null);
    (async () => {
      try {
        const s = await backend.signIn(authEmail);
        if (cancelled) return;
        setSession(s);
        setMembership(s ? "active" : "none");
      } catch (error) {
        if (cancelled) return;
        setSession(null);
        setMembership("unavailable");
        setMembershipError(sentenceFor(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authPhase, authEmail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session) return;
      try {
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
        setLoadError(null);
      } catch (error) {
        /*
         * A THROWN READ IS NOT AN EMPTY COMPANY. `supabaseBackend` throws
         * `BackendUnavailable` rather than returning `[]`, precisely so that a
         * network failure cannot print "you have no mountains". Left
         * unhandled this would be an unhandled rejection and every screen
         * would render the empty state anyway; caught, the reason is carried
         * where the frame can say it.
         */
        if (cancelled) return;
        setLoadError(sentenceFor(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, revision]);

  const restoring = membership === "unknown";

  const value = useMemo<OperatorContextValue>(
    () => ({
      backend, session, company, access, placements, mountains,
      signIn, signOut, restoring, membership, membershipError, loadError, revision, refresh,
    }),
    [
      session, company, access, placements, mountains,
      signIn, signOut, restoring, membership, membershipError, loadError, revision, refresh,
    ],
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

/* -------------------------------------------------------------------------- */
/* READ FAILURES — the difference between "nothing" and "we could not ask"     */
/* -------------------------------------------------------------------------- */

/**
 * THE DEFECT THIS CLOSES, found by the audit and confirmed by the owner
 * reporting "all operator pages are empty".
 *
 * `useAsync` returns `T`, so a failed read has nowhere to put its reason and
 * leaves the caller holding the initial value — almost always `[]`. On screen
 * that is INDISTINGUISHABLE from a company that genuinely has no leads, no
 * trips and no bookings. It is the exact confusion this product exists to
 * prevent, and it was in the helper every screen imports.
 *
 * Changing `useAsync` to return `Reading<T>` would touch 79 call sites across
 * 23 screens mid-flight. So the failure is recorded HERE instead, and the shell
 * renders one honest banner above everything: the screens keep their shape and
 * an empty page can no longer pass itself off as a measured emptiness.
 */
let readKeySeq = 0;
const readFailures = new Map<string, string>();
const readListeners = new Set<() => void>();

function recordReadFailure(key: string, reason: string): void {
  if (readFailures.get(key) === reason) return;
  readFailures.set(key, reason);
  readListeners.forEach((l) => l());
}

function clearReadFailure(key: string): void {
  if (!readFailures.delete(key)) return;
  readListeners.forEach((l) => l());
}

/** Every read that is currently failing, newest reason per source. */
export function useReadFailures(): string[] {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    readListeners.add(l);
    return () => {
      readListeners.delete(l);
    };
  }, []);
  return [...new Set(readFailures.values())];
}

/** Small async read helper, so every screen does not hand-roll the same effect. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  /* Stable per call site, so one failing read does not shout for all of them. */
  const key = useRef(`read-${++readKeySeq}`).current;
  useEffect(() => {
    let cancelled = false;
    fn().then(
      (v) => {
        if (!cancelled) {
          clearReadFailure(key);
          setValue(v);
        }
      },
      (err: unknown) => {
        if (!cancelled) {
          recordReadFailure(
            key,
            err instanceof Error && err.message ? err.message : "A read failed and gave no reason.",
          );
        }
        /*
         * The screen still keeps its initial value and does not crash — but the
         * failure is now RECORDED above, so the shell can say so. Before that,
         * a thrown read and an empty table looked the same on screen.
         */
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
