import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentWorkspaceId } from "@/stores/workspace-store";
import { useAuth } from "./auth-context";

export type AppRole = "owner" | "manager" | "chatter";
export type MembershipStatus = "active" | "deactivated";

export interface CurrentMember {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: AppRole;
  status: MembershipStatus;
  workspaceId: string;
}

/**
 * Resolves the signed-in user's membership + profile for the current workspace.
 * Returns `null` when the user has no *active* membership visible under RLS
 * (i.e. not yet accepted an invite, or deactivated) — the app treats that as
 * "no access". RLS is the source of truth; this only drives the UI.
 */
export function useCurrentMember() {
  const { user } = useAuth();
  const workspaceId = useCurrentWorkspaceId();

  return useQuery({
    queryKey: ["current-member", user?.id, workspaceId],
    enabled: Boolean(user?.id && workspaceId),
    staleTime: 15_000,
    queryFn: async (): Promise<CurrentMember | null> => {
      const uid = user!.id;

      const [membershipRes, profileRes] = await Promise.all([
        supabase
          .from("memberships")
          .select("role,status,workspace_id")
          .eq("user_id", uid)
          .eq("workspace_id", workspaceId!)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("email,full_name,avatar_url")
          .eq("id", uid)
          .maybeSingle(),
      ]);

      if (membershipRes.error) throw membershipRes.error;
      if (profileRes.error) throw profileRes.error;

      const membership = membershipRes.data as
        | { role: AppRole; status: MembershipStatus; workspace_id: string }
        | null;
      if (!membership) return null;

      const profile = profileRes.data as
        | { email: string; full_name: string; avatar_url: string | null }
        | null;

      return {
        userId: uid,
        email: profile?.email ?? user!.email ?? "",
        fullName: profile?.full_name ?? "",
        avatarUrl: profile?.avatar_url ?? null,
        role: membership.role,
        status: membership.status,
        workspaceId: membership.workspace_id,
      };
    },
  });
}
