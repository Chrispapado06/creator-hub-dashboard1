/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** PUBLISHABLE (anon) key. Never the service-role key — see icefall-supabase/README.md. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * "1" turns on OFFLINE DEMO mode. Unset — which is every normal run, every
   * deploy and every CI build — the site behaves exactly as it always has.
   * Read in exactly one place: `src/offline/offline.ts`.
   */
  readonly VITE_ICEFALL_OFFLINE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
