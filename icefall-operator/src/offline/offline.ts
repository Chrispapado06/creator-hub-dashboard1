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

/**
 * THE DEMO/OFFLINE SPLIT (owner escalation, `12-DEMO-FLAG-SPLIT.md`).
 *
 * The public demo shipped built with OFFLINE=1 and rendered suppressed
 * previews and drawn placeholders while the connection sat right there. The
 * flag had conflated two ideas, split here:
 *
 *   DEMO    — WHERE DATA COMES FROM and WHO IS SIGNED IN: the fixture
 *             backend, the auto session, the sample banner. True under
 *             OFFLINE too, because an offline build is necessarily a demo.
 *   OFFLINE — WHETHER THE NETWORK EXISTS: the photo library, the live-page
 *             preview, the View-on-Icefall links. Nothing else.
 *
 * VITE_ICEFALL_DEMO=1 alone → the internet demo: sample data, no sign-in
 * wall, every network feature live. VITE_ICEFALL_OFFLINE=1 → exactly the
 * flight build, unchanged. Neither → the ordinary portal.
 */
export const DEMO = OFFLINE || import.meta.env.VITE_ICEFALL_DEMO === "1";
