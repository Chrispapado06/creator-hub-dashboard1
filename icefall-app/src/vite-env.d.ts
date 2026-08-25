/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional server-side coach proxy. Unset in this build — the scripted coach runs locally. */
  readonly VITE_COACH_ENDPOINT?: string;
  /**
   * "1" opts this BUILD into rendering invented demo data. Unset by default.
   * Only permitted on a deployment that is password/SSO protected — see
   * `@/lib/demoFlag`.
   */
  readonly VITE_SHOW_DEMO?: string;
  /** Supabase project URL. Absent until a project is provisioned — see @/backend/client. */
  readonly VITE_SUPABASE_URL?: string;
  /** PUBLISHABLE (anon) key. Never the service-role key. Note the name: not ..._ANON_KEY. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
