import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The database connection, or an honest absence of one.
 *
 * NOTE THE VARIABLE NAME: `VITE_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY`.
 * The wrong name does not error — it produces a client that fails every request,
 * which has already cost this codebase a silently broken feature once.
 *
 * When the project is not configured the client is `null` rather than a stub
 * that returns empty arrays. A CRM whose revenue page renders €0 because the
 * database is unreachable is worse than one that says it cannot reach the
 * database: the first is a number somebody might act on.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isConfigured = supabase !== null;

export const NOT_CONFIGURED =
  "This CRM is not connected to a database yet. No ICEFALL Supabase project exists — " +
  "figures appear here once one is created and these migrations are applied. " +
  "Nothing below is placeholder data; there is simply nothing to read.";
