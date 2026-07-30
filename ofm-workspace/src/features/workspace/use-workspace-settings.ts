import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentWorkspaceId } from "@/stores/workspace-store";
import type { AppRole } from "@/features/auth/use-current-member";

const LOGO_BUCKET = "workspace-logos";

/** Update the current workspace's branding (owner-only, enforced by RLS). */
export function useUpdateWorkspace() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (patch: {
      name?: string;
      icon?: string | null;
      logo_url?: string | null;
    }) => {
      const { error } = await supabase
        .from("workspaces")
        .update(patch as never)
        .eq("id", ws!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-workspaces"] }),
  });
}

/** Upload a logo image to the public bucket and return its public URL. */
export function useUploadWorkspaceLogo() {
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${ws}/logo-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data
        .publicUrl;
    },
  });
}

/** Grant an existing team member access to this workspace (owner-only RPC). */
export function useAddWorkspaceMember() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: { email: string; role: AppRole }) => {
      const { error } = await supabase.rpc("add_workspace_member_by_email", {
        p_email: input.email,
        p_workspace: ws!,
        p_role: input.role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["my-workspaces"] });
    },
  });
}

/** Delete the whole workspace — creator-only (enforced by the RPC). */
export function useDeleteWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase.rpc("delete_workspace", {
        p_workspace: workspaceId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-workspaces"] }),
  });
}

/** Revoke a user's access to this workspace (owner-only RPC). */
export function useRemoveWorkspaceMember() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("remove_workspace_member", {
        p_user: userId,
        p_workspace: ws!,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members"] }),
  });
}
