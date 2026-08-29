import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "@/lib/supabase";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";
import type { StaffRole } from "@/data/types";

/**
 * Who is using the CRM, and which desk they sit at.
 *
 * TWO GATES, NOT ONE. Being signed in is not being staff: `profiles.role` must
 * be `admin` AND there must be an active `staff_members` row. That is exactly
 * what `public.is_staff()` answers in the database, and asking the database
 * rather than reasoning about it here means the screen and the row policies can
 * never disagree about who someone is.
 *
 * There is no local override, no `?role=` parameter and no development bypass.
 * A staff CRM with a way to pretend to be an administrator is a staff CRM with a
 * way to be an administrator.
 */
export interface StaffIdentity {
  profileId: string;
  displayName: string;
  role: StaffRole;
}

type State =
  | { kind: "loading" }
  | { kind: "unconfigured" }
  | { kind: "signed_out" }
  | { kind: "not_staff" }
  | { kind: "staff"; identity: StaffIdentity };

const Ctx = createContext<State>({ kind: "loading" });

export function SessionProvider({ children }: { children: ReactNode }) {
  // With no database AND the demo flag on, sign in as a stand-in super admin so
  // the screens can be looked at. This is NOT an auth bypass: it only applies
  // when there is no backend to authenticate against, so there is nothing it
  // could grant access to. The moment a Supabase project is configured, the real
  // two-gate check below is the only path in.
  const [state, setState] = useState<State>(
    isConfigured
      ? { kind: "loading" }
      : SHOW_DEMO_DATA
        ? { kind: "staff", identity: { profileId: "s1", displayName: "Alex Christofis", role: "super_admin" } }
        : { kind: "unconfigured" },
  );

  useEffect(() => {
    // Captured once so TypeScript can see it is non-null inside the closures
    // below; `supabase` itself is `SupabaseClient | null` by design.
    const db = supabase;
    if (!db) return;
    let cancelled = false;

    const resolve = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) setState({ kind: "signed_out" });
        return;
      }
      const [{ data: profile }, { data: staff }] = await Promise.all([
        db.from("profiles").select("display_name, role").eq("id", session.user.id).maybeSingle(),
        db.from("staff_members").select("staff_role, active").eq("profile_id", session.user.id).maybeSingle(),
      ]);
      if (cancelled) return;

      // Both halves, and `=== true` rather than truthiness: an absent row must
      // read as "not staff", not as "unknown, probably fine".
      if (profile?.role !== "admin" || staff?.active !== true) {
        setState({ kind: "not_staff" });
        return;
      }
      setState({
        kind: "staff",
        identity: {
          profileId: session.user.id,
          displayName: profile.display_name ?? "ICEFALL staff",
          role: staff.staff_role as StaffRole,
        },
      });
    };

    db.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      void resolve(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export function useStaff(): StaffIdentity | null {
  const s = useSession();
  return s.kind === "staff" ? s.identity : null;
}

/**
 * Which desks may do a thing.
 *
 * A mirror of `public.has_staff_role(...)`, and only ever used to decide what to
 * SHOW. The database refuses the write regardless — hiding a button the policy
 * would reject is a courtesy to the user, not a security boundary, and treating
 * it as one is how a CRM ends up with its rules in the front end.
 */
export function may(role: StaffRole | null, desks: StaffRole[]): boolean {
  if (!role) return false;
  return role === "super_admin" || desks.includes(role);
}

export const DESK_LABEL: Record<StaffRole, string> = {
  super_admin: "Super Admin",
  sales: "Sales",
  operations: "Operations",
  finance: "Finance",
  support: "Support",
};
