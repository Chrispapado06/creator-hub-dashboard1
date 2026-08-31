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
  /**
   * "1" builds this app to run with no network at all — no Supabase client, no
   * photographs fetched, no session checked, every screen read from
   * `src/offline/fixtures.ts` under a permanent banner. See
   * `src/offline/offline.ts`. Unset everywhere by default.
   */
  readonly VITE_ICEFALL_OFFLINE?: string;
  /** Origin the peak and trek photographs are served from. See `components/Photo.tsx`. */
  readonly VITE_ICEFALL_WEB_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
