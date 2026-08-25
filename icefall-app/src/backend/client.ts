import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * The Supabase client, or null.
 *
 * NULL IS A SUPPORTED STATE, not a failure. ICEFALL has run entirely on
 * localStorage until now, and there is no project provisioned yet — so every
 * surface built on this module must keep working without a backend rather than
 * white-screening on a missing key. `isBackendConfigured()` is the check, and
 * the messaging UI falls back to its local store when it returns false.
 *
 * That also keeps the honest posture the rest of the app has: with no backend,
 * a "sent" message genuinely has not gone anywhere, and the UI says so instead
 * of pretending a delivery it cannot make.
 *
 * The key is the PUBLISHABLE (anon) key, and it is meant to be in the bundle —
 * it grants nothing on its own. Row-level security is what protects the data,
 * which is why the migration is written the way it is. A service-role key must
 * never appear in this app.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
// `VITE_SUPABASE_PUBLISHABLE_KEY`, not `..._ANON_KEY`. The wrong name resolves
// to undefined and fails silently at request time rather than at startup.
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient<Database> | null =
  url && key
    ? createClient<Database>(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function isBackendConfigured(): boolean {
  return supabase !== null;
}

/**
 * Shown wherever a surface would otherwise imply something was delivered.
 *
 * One sentence, in one place, so two screens cannot make different promises
 * about whether a message actually reached anybody.
 */
export const BACKEND_NOT_CONNECTED =
  "ICEFALL is not connected to a server yet. Nothing here is sent, nobody is notified, and no reply can arrive — what you write is saved on this device only.";

/** Narrows to a live client, for code paths that already checked. */
export function requireBackend(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Guard with isBackendConfigured() before calling this.",
    );
  }
  return supabase;
}
