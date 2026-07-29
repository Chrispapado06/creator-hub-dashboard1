import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentWorkspaceId } from "@/stores/workspace-store";
import type { AppRole, MembershipStatus } from "@/features/auth/use-current-member";

export interface TeamMember {
  userId: string;
  email: string;
  fullName: string;
  role: AppRole;
  status: MembershipStatus;
}

/** Edge-Function errors carry the real message in the Response body, not `.message`. */
async function functionError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).json();
      if (body?.error) return new Error(String(body.error));
    } catch {
      /* fall through */
    }
  }
  return new Error((error as Error)?.message ?? "Request failed");
}

export function useTeamMembers() {
  const ws = useCurrentWorkspaceId();
  return useQuery({
    queryKey: ["team-members", ws],
    enabled: Boolean(ws),
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, role, status")
        .eq("workspace_id", ws!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as {
        user_id: string;
        role: AppRole;
        status: MembershipStatus;
      }[];

      const ids = rows.map((r) => r.user_id);
      const profilesById: Record<string, { email: string; full_name: string }> =
        {};
      if (ids.length) {
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", ids);
        if (pErr) throw pErr;
        for (const p of (profiles ?? []) as {
          id: string;
          email: string;
          full_name: string;
        }[]) {
          profilesById[p.id] = { email: p.email, full_name: p.full_name };
        }
      }

      return rows.map((r) => ({
        userId: r.user_id,
        email: profilesById[r.user_id]?.email ?? "",
        fullName: profilesById[r.user_id]?.full_name ?? "",
        role: r.role,
        status: r.status,
      }));
    },
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: { email: string; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email: input.email,
          role: input.role,
          workspace_id: ws,
        },
      });
      if (error) throw await functionError(error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("set_member_role", {
        p_user: input.userId,
        p_workspace: ws!,
        p_role: input.role,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}

export function useSetMemberActive() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      action: "deactivate" | "reactivate";
    }) => {
      const { data, error } = await supabase.functions.invoke("deactivate-user", {
        body: {
          user_id: input.userId,
          action: input.action,
          workspace_id: ws,
        },
      });
      if (error) throw await functionError(error);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}
