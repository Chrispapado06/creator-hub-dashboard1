/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The live Supabase project this portal authenticates against.
   *
   * Both are optional: a build with neither constructs no client at all, which
   * is a supported state (`src/backend/client.ts`), not a failure.
   */
  readonly VITE_SUPABASE_URL?: string;

  /**
   * THE PUBLISHABLE (anon) KEY, and the name is load-bearing:
   * `VITE_SUPABASE_PUBLISHABLE_KEY`, never `VITE_SUPABASE_ANON_KEY`. The wrong
   * name resolves to `undefined` and fails silently at request time rather than
   * loudly at startup — it has already cost this codebase a working feature
   * once. Declared here so the typo has a type to fail against.
   *
   * A service-role key must never appear in this app under any name.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;

  /**
   * Where `icefall-web` is served, for the live company-page preview.
   *
   * Defaults to the dev server. Both ends of that preview are DEV-only —
   * `/app/*` is dropped from icefall-web production builds — so this is a
   * development convenience, not a deployment setting.
   */
  readonly VITE_ICEFALL_WEB_ORIGIN?: string;

  /**
   * `"1"` runs the portal entirely from the fixtures in `src/offline/`.
   *
   * Unset — the default — and nothing offline exists at runtime. See
   * `src/offline/offline.ts`; this declaration is the only reason the flag can
   * be read at all under `noUncheckedIndexedAccess`-strict typing.
   */
  readonly VITE_ICEFALL_OFFLINE?: string;
  readonly VITE_ICEFALL_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
