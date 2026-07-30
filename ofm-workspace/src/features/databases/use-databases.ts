import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useCurrentWorkspaceId } from "@/stores/workspace-store";
import { useAuth } from "@/features/auth/auth-context";

export type DbPropertyType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "person"
  | "url"
  | "created_time"
  | "updated_time"
  | "relation";

export interface SelectOption {
  id: string;
  label: string;
  color?: string;
}

export interface DbProperty {
  id: string;
  name: string;
  type: DbPropertyType;
  config: { options?: SelectOption[] } & Record<string, unknown>;
  position: number;
}

export interface DbRecord {
  id: string;
  properties: Record<string, unknown>;
  position: number;
  created_at?: string;
  updated_at?: string;
}

/** The property used as a record's title — the first text property, else the first. */
export function getTitleProp(properties: DbProperty[]): DbProperty | undefined {
  return properties.find((p) => p.type === "text") ?? properties[0];
}
export function recordTitle(
  record: DbRecord,
  properties: DbProperty[],
): string {
  const tp = getTitleProp(properties);
  const v = tp ? record.properties?.[tp.id] : null;
  return v == null || v === "" ? "Untitled" : String(v);
}

export interface DatabaseMeta {
  id: string;
  title: string;
  icon: string | null;
}

const dbsKey = (ws: string | null | undefined) => ["databases", ws];
const propsKey = (id: string) => ["db-properties", id];
const recordsKey = (id: string) => ["db-records", id];

export function useDatabases() {
  const ws = useCurrentWorkspaceId();
  return useQuery({
    queryKey: dbsKey(ws),
    enabled: Boolean(ws),
    queryFn: async (): Promise<DatabaseMeta[]> => {
      const { data, error } = await supabase
        .from("databases")
        .select("id,title,icon")
        .eq("workspace_id", ws!)
        .is("archived_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DatabaseMeta[];
    },
  });
}

export function useDatabase(id: string | undefined) {
  return useQuery({
    queryKey: ["database", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<DatabaseMeta | null> => {
      const { data, error } = await supabase
        .from("databases")
        .select("id,title,icon")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as DatabaseMeta | null) ?? null;
    },
  });
}

export function useCreateDatabase() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input?: { title?: string }): Promise<string> => {
      const { data, error } = await supabase
        .from("databases")
        .insert({
          workspace_id: ws!,
          title: input?.title ?? "Untitled database",
          created_by: user?.id ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const dbId = (data as { id: string }).id;
      // Seed a default "Name" text column, a Status select, and a Table view.
      await supabase.from("db_properties").insert([
        { database_id: dbId, name: "Name", type: "text", position: 0 },
        {
          database_id: dbId,
          name: "Status",
          type: "select",
          position: 1,
          config: {
            options: [
              { id: crypto.randomUUID(), label: "To do", color: "gray" },
              { id: crypto.randomUUID(), label: "In progress", color: "blue" },
              { id: crypto.randomUUID(), label: "Done", color: "green" },
            ],
          },
        },
      ] as never);
      await supabase
        .from("db_views")
        .insert({ database_id: dbId, name: "Table", type: "table", position: 0 } as never);
      return dbId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dbsKey(ws) }),
  });
}

export function useUpdateDatabase() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("databases")
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: dbsKey(ws) });
      qc.invalidateQueries({ queryKey: ["database", v.id] });
    },
  });
}

export function useArchiveDatabase() {
  const qc = useQueryClient();
  const ws = useCurrentWorkspaceId();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("databases")
        .update({ archived_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: dbsKey(ws) }),
  });
}

export function useProperties(databaseId: string | undefined) {
  return useQuery({
    queryKey: propsKey(databaseId ?? ""),
    enabled: Boolean(databaseId),
    queryFn: async (): Promise<DbProperty[]> => {
      const { data, error } = await supabase
        .from("db_properties")
        .select("id,name,type,config,position")
        .eq("database_id", databaseId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DbProperty[];
    },
  });
}

export function useRecords(databaseId: string | undefined) {
  return useQuery({
    queryKey: recordsKey(databaseId ?? ""),
    enabled: Boolean(databaseId),
    queryFn: async (): Promise<DbRecord[]> => {
      const { data, error } = await supabase
        .from("db_records")
        .select("id,properties,position,created_at,updated_at")
        .eq("database_id", databaseId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DbRecord[];
    },
  });
}

export function useCreateProperty(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      type: DbPropertyType;
      config?: Record<string, unknown>;
      position: number;
    }) => {
      const { error } = await supabase.from("db_properties").insert({
        database_id: databaseId,
        name: input.name,
        type: input.type,
        config: input.config ?? {},
        position: input.position,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propsKey(databaseId) }),
  });
}

export function useUpdateProperty(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("db_properties")
        .update(input.patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propsKey(databaseId) }),
  });
}

export function useDeleteProperty(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("db_properties").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: propsKey(databaseId) }),
  });
}

export function useCreateRecord(databaseId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input?: {
      properties?: Record<string, unknown>;
      position?: number;
    }) => {
      const { error } = await supabase.from("db_records").insert({
        database_id: databaseId,
        properties: input?.properties ?? {},
        position: input?.position ?? Date.now(),
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: recordsKey(databaseId) }),
  });
}

export function useUpdateRecord(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      properties: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from("db_records")
        .update({ properties: input.properties } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    // Optimistic: patch the cached record so cell edits feel instant.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: recordsKey(databaseId) });
      const prev = qc.getQueryData<DbRecord[]>(recordsKey(databaseId));
      qc.setQueryData<DbRecord[]>(recordsKey(databaseId), (old) =>
        (old ?? []).map((r) =>
          r.id === input.id ? { ...r, properties: input.properties } : r,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(recordsKey(databaseId), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: recordsKey(databaseId) }),
  });
}

export function useDeleteRecord(databaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("db_records").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: recordsKey(databaseId) }),
  });
}
