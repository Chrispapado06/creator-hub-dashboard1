import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentWorkspaceId } from "@/stores/workspace-store";
import { useAuth } from "@/features/auth/auth-context";
import { applyTexts, collectTexts } from "@/features/editor/translate-content";

async function functionError(error: unknown): Promise<Error> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).json();
      if (body?.error) return new Error(String(body.error));
    } catch {
      /* ignore */
    }
  }
  return new Error((error as Error)?.message ?? "Request failed");
}

/** Duplicate a page (optionally translating all its text to another language). */
export function useDuplicatePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      icon: string | null;
      content: unknown;
      parentId: string | null;
      translateTo?: string;
      langLabel?: string;
      /** When `content` is absent (e.g. from a sidebar/link menu), fetch it by id. */
      sourceId?: string;
    }): Promise<string> => {
      let content = input.content;
      if ((content == null || content === "") && input.sourceId) {
        const { data: src, error: srcErr } = await supabase
          .from("pages")
          .select("content")
          .eq("id", input.sourceId)
          .single();
        if (srcErr) throw srcErr;
        content = (src as { content: unknown }).content;
      }
      let title = `${input.title || "Untitled"} (copy)`;

      if (input.translateTo) {
        const texts = collectTexts(content);
        if (texts.length) {
          const { data, error } = await supabase.functions.invoke("translate", {
            body: { texts, target: input.translateTo },
          });
          if (error) throw await functionError(error);
          content = applyTexts(
            content,
            (data as { translations: string[] }).translations,
          );
        }
        title = `${input.title || "Untitled"} (${input.langLabel ?? input.translateTo})`;
      }

      const { data, error } = await supabase
        .from("pages")
        .insert({
          workspace_id: ws!,
          parent_id: input.parentId,
          title,
          icon: input.icon,
          content,
          position: Date.now(),
          created_by: user?.id ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pages", ws] }),
  });
}
