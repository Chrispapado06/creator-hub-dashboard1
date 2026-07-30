import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/auth-context";
import type { AppRole } from "@/features/auth/use-current-member";

export interface WorkspaceSummary {
  id: string;
  name: string;
  icon: string | null;
  logoUrl: string | null;
  createdBy: string | null;
  role: AppRole;
}

/** All workspaces the signed-in user is an active member of. */
export function useWorkspaces() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-workspaces", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<WorkspaceSummary[]> => {
      const { data, error } = await supabase
        .from("memberships")
        .select("role, workspaces(id, name, icon, logo_url, created_by)")
        .eq("user_id", user!.id)
        .eq("status", "active");
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        role: AppRole;
        workspaces: {
          id: string;
          name: string;
          icon: string | null;
          logo_url: string | null;
          created_by: string | null;
        } | null;
      }[];
      return rows
        .filter((r) => r.workspaces)
        .map((r) => ({
          id: r.workspaces!.id,
          name: r.workspaces!.name,
          icon: r.workspaces!.icon,
          logoUrl: r.workspaces!.logo_url,
          createdBy: r.workspaces!.created_by,
          role: r.role,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const { data, error } = await supabase.rpc("create_workspace", {
        p_name: name,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-workspaces"] }),
  });
}
