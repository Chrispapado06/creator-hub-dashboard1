/// <reference types="vite/client" />

interface ImportMetaEnv {
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
