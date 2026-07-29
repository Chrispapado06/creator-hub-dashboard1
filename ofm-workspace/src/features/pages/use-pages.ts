import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentWorkspaceId } from "@/stores/workspace-store";
import { useAuth } from "@/features/auth/auth-context";

export interface PageNode {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  position: number;
}

export interface PageDoc extends PageNode {
  content: unknown;
  createdBy: string | null;
  published: boolean;
  publicToken: string | null;
}

const pagesKey = (ws: string | null | undefined) => ["pages", ws];
const archivedKey = (ws: string | null | undefined) => ["pages-archived", ws];
const FAVORITES_KEY = ["page-favorites"];

const EMPTY_DOC = { type: "doc", content: [] };

function toNode(p: {
  id: string;
  parent_id: string | null;
  title: string;
  icon: string | null;
  position: number;
}): PageNode {
  return {
    id: p.id,
    parentId: p.parent_id,
    title: p.title,
    icon: p.icon,
    position: p.position,
  };
}

/** All active (non-archived) pages in the current workspace. */
export function usePages() {
  const ws = useCurrentWorkspaceId();
  return useQuery({
    queryKey: pagesKey(ws),
    enabled: Boolean(ws),
    queryFn: async (): Promise<PageNode[]> => {
      const { data, error } = await supabase
        .from("pages")
        .select("id,parent_id,title,icon,position")
        .eq("workspace_id", ws!)
        .is("archived_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p) => toNode(p as never));
    },
  });
}

/** Archived pages (the Trash) in the current workspace. */
export function useArchivedPages() {
  const ws = useCurrentWorkspaceId();
  return useQuery({
    queryKey: archivedKey(ws),
    enabled: Boolean(ws),
    queryFn: async (): Promise<PageNode[]> => {
      const { data, error } = await supabase
        .from("pages")
        .select("id,parent_id,title,icon,position,archived_at")
        .eq("workspace_id", ws!)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => toNode(p as never));
    },
  });
}

/** A single page with its content, for the editor. */
export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: ["page", id],
    enabled: Boolean(id),
    staleTime: Infinity,
    queryFn: async (): Promise<PageDoc | null> => {
      const { data, error } = await supabase
        .from("pages")
        .select(
          "id,parent_id,title,icon,position,content,created_by,published,public_token",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const d = data as never as {
        id: string;
        parent_id: string | null;
        title: string;
        icon: string | null;
        position: number;
        content: unknown;
        created_by: string | null;
        published: boolean;
        public_token: string | null;
      };
      return {
        ...toNode(d),
        content: d.content ?? EMPTY_DOC,
        createdBy: d.created_by,
        published: Boolean(d.published),
        publicToken: d.public_token,
      };
    },
  });
}

export function useCreatePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: {
      parentId?: string | null;
      title?: string;
    }): Promise<string> => {
      const parentId = input.parentId ?? null;
      let maxQuery = supabase
        .from("pages")
        .select("position")
        .eq("workspace_id", ws!)
        .order("position", { ascending: false })
        .limit(1);
      maxQuery =
        parentId === null
          ? maxQuery.is("parent_id", null)
          : maxQuery.eq("parent_id", parentId);
      const { data: maxRow } = await maxQuery.maybeSingle();
      const position = maxRow ? (maxRow.position as number) + 1 : 0;

      const { data, error } = await supabase
        .from("pages")
        .insert({
          workspace_id: ws!,
          parent_id: parentId,
          title: input.title ?? "",
          position,
          created_by: user?.id ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pagesKey(ws) }),
  });
}

/** Merge a persisted patch into the cached ["page", id] doc so the editor never reverts. */
function patchPageCache(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: Record<string, unknown>,
) {
  qc.setQueryData(["page", id], (old: PageDoc | null | undefined) => {
    if (!old) return old;
    const next = { ...old };
    if ("title" in patch) next.title = patch.title as string;
    if ("icon" in patch) next.icon = patch.icon as string | null;
    if ("parent_id" in patch) next.parentId = patch.parent_id as string | null;
    if ("position" in patch) next.position = patch.position as number;
    if ("content" in patch) next.content = patch.content;
    return next;
  });
}

/** Generic page patch used by tree ops (rename, icon, move, restore). */
export function useUpdatePage() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from("pages")
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      patchPageCache(qc, v.id, v.patch);
      qc.invalidateQueries({ queryKey: pagesKey(ws) });
      qc.invalidateQueries({ queryKey: archivedKey(ws) });
    },
  });
}

/** Content-only autosave. Keeps the ["page", id] cache in sync (no refetch). */
export function useSavePageContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; content: unknown }) => {
      const { error } = await supabase
        .from("pages")
        .update({ content: input.content } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => patchPageCache(qc, v.id, { content: v.content }),
  });
}

/** Archive a page AND its whole subtree together (so children never orphan to root). */
export function useArchivePage() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (id: string) => {
      const pages = qc.getQueryData<PageNode[]>(pagesKey(ws)) ?? [];
      const childrenByParent = new Map<string, string[]>();
      for (const p of pages) {
        const key = p.parentId ?? "";
        const arr = childrenByParent.get(key);
        if (arr) arr.push(p.id);
        else childrenByParent.set(key, [p.id]);
      }
      const ids: string[] = [];
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        ids.push(cur);
        for (const child of childrenByParent.get(cur) ?? []) stack.push(child);
      }
      const { error } = await supabase
        .from("pages")
        .update({ archived_at: new Date().toISOString() } as never)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pagesKey(ws) });
      qc.invalidateQueries({ queryKey: archivedKey(ws) });
    },
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pagesKey(ws) });
      qc.invalidateQueries({ queryKey: archivedKey(ws) });
    },
  });
}

export function useSetPublished() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      publish: boolean;
      currentToken: string | null;
    }) => {
      const patch = input.publish
        ? {
            published: true,
            public_token: input.currentToken ?? crypto.randomUUID(),
            published_at: new Date().toISOString(),
          }
        : { published: false };
      const { error } = await supabase
        .from("pages")
        .update(patch as never)
        .eq("id", input.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch, v) => {
      qc.setQueryData(["page", v.id], (old: PageDoc | null | undefined) =>
        old
          ? {
              ...old,
              published: Boolean((patch as { published?: boolean }).published),
              publicToken:
                (patch as { public_token?: string }).public_token ??
                old.publicToken,
            }
          : old,
      );
    },
  });
}

export function useFavorites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...FAVORITES_KEY, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("page_favorites")
        .select("page_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => (r as { page_id: string }).page_id);
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { pageId: string; on: boolean }) => {
      if (input.on) {
        const { error } = await supabase
          .from("page_favorites")
          .insert({ user_id: user!.id, page_id: input.pageId } as never);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("page_favorites")
          .delete()
          .eq("user_id", user!.id)
          .eq("page_id", input.pageId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FAVORITES_KEY }),
  });
}
