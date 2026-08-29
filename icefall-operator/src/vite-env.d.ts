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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
