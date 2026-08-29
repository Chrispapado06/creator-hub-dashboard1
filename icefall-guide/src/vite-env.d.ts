/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** PUBLISHABLE (anon) key. Never the service-role key — see icefall-supabase/README.md. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * "1" permits this build to carry invented seed data. See `lib/demoFlag.ts`
   * for the deployment-protection precondition — it is not optional.
   */
  readonly VITE_SHOW_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
