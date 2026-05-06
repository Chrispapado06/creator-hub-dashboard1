import type { PostgrestError } from "@supabase/supabase-js";

/** PostgREST / Postgres when `avatar_url` is not migrated yet */
export function isMissingCreatorAvatarColumnError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const m = error.message.toLowerCase();
  const code = (error as { code?: string }).code;
  return (
    m.includes("avatar_url") ||
    (m.includes("column") && m.includes("does not exist")) ||
    code === "42703"
  );
}

/** Shape read from `.select('*')` so rows work with or without an `avatar_url` column */
export type CreatorColumns = {
  id: string;
  name: string;
  of_username: string | null;
  status: string;
  avatar_url: string | null;
};

export function normalizeCreatorFromDb(data: unknown): CreatorColumns | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.status !== "string") {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    of_username: row.of_username != null ? String(row.of_username) : null,
    status: row.status,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
  };
}
