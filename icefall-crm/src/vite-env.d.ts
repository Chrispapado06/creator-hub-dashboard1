/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** NOT `..._ANON_KEY`. The wrong name fails silently rather than erroring. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /**
   * `"1"` builds the aeroplane demo: no Supabase client, no network, fixtures
   * from `src/offline/`. Anything else — including unset — is the real CRM.
   */
  readonly VITE_ICEFALL_OFFLINE?: string;
  readonly VITE_ICEFALL_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
