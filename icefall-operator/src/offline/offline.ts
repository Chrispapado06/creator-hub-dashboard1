/**
 * THE OFFLINE FLAG — one decision, made once, at build time.
 *
 * Set `VITE_ICEFALL_OFFLINE=1` and the portal runs entirely from the fixtures
 * in `src/offline/`. Unset — the default — and nothing in this file's shadow
 * runs at all: every offline behaviour is new code guarded by `if (OFFLINE)`.
 *
 * DELIBERATELY NOT `navigator.onLine`. A laptop can hold a wifi association
 * with no route to anywhere, and a runtime check would flip the app mid-session
 * — half the screens reading fixtures and half reading the backend is worse
 * than either. This is a constant for the life of the process.
 */
export const OFFLINE = import.meta.env.VITE_ICEFALL_OFFLINE === "1";
