import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { ViewConfig, ViewType } from "./view-types";

// View writes require can_manage_db (owner/manager/creator); surface RLS denials.
const toastError = (e: unknown) => toast.error((e as Error)?.message ?? "Action failed");

export interface DbView {
  id: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  position: number;
}

const key = (databaseId: string) => ["db-views", databaseId];

export function useViews(databaseId: string | undefined) {
  return useQuery({
    queryKey: key(databaseId ?? ""),
    enabled: Boolean(databaseId),
    queryFn: async (): Promise<DbView[]> => {
      const { data, error } = await supabase
        .from("db_views")
        .select("id,name,type,config,position")
        .eq("database_id", databaseId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DbView[];
    },
  });
}

export function useCreateView(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: ViewType;
      position: number;
      config?: ViewConfig;
    }): Promise<string> => {
      const { data, error } = await supabase
        .from("db_views")
        .insert({
          database_id: databaseId,
          name: input.name,
          type: input.type,
          config: input.config ?? {},
          position: input.position,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(databaseId) }),
    onError: toastError,
  });
}

export function useUpdateView(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: { name?: string; type?: ViewType; config?: ViewConfig };
    }) => {
      const { error } = await supabase
        .from("db_views")
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(databaseId) }),
    onError: toastError,
  });
}

export function useDeleteView(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("db_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(databaseId) }),
    onError: toastError,
  });
}
