import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * True only when both client env vars are present. The app renders a setup
 * screen (rather than crashing) when this is false — see ConfigNeeded.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

/**
 * Single shared Supabase client for the whole app.
 * NOTE: only the publishable/anon key ever lives in the client. Anything that
 * needs the service_role key runs in a Supabase Edge Function (see supabase/functions).
 *
 * When env is missing we still construct a client with placeholder values so a
 * bare import never throws; callers gate on `isSupabaseConfigured` before use.
 */
export const supabase = createClient<Database>(
  supabaseUrl ?? "http://localhost:54321",
  supabaseKey ?? "anon-key-not-configured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
