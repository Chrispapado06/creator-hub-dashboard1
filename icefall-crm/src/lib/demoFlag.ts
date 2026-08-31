/**
 * Whether this build may render invented data.
 *
 * TRUE in local development, always. Otherwise only when the build was made with
 * `VITE_SHOW_DEMO=1` — an explicit, per-build opt-in that nothing sets by
 * default, so an ordinary `npm run build` produces a bundle containing no
 * invented companies, no invented revenue and no invented commission rates.
 *
 * WHY THIS EXISTS, AND WHAT IT IS FOR
 *
 * The product owner asked to see the CRM populated, in order to judge the
 * layout. That is a real need and an empty screen cannot answer it. The
 * honesty doctrine's fourth tier is the sanctioned route: it ships behind ONE
 * NAMED FLAG, it is deterministic, a notice prints wherever it could change a
 * decision, and the file carries an instruction to delete it.
 *
 * THE PROTECTED-URL CONDITION WAS SUPERSEDED BY THE OWNER (31 Aug night,
 * 12-DEMO-FLAG-SPLIT): public demo deployments now exist by their explicit
 * instruction, carrying sample figures behind DEMO — which is why DEMO implies
 * this flag below. The disclosure moved from "never leaves a protected URL" to
 * "the banner prints on every screen that could change a decision", and the
 * DemoBanner is that banner. A build with NONE of the flags still contains and
 * renders nothing invented.
 *
 * THE TRAP: GATE THE DEFINITION, NOT THE RENDER.
 *
 * Checking this flag where the data is drawn stops it appearing on screen and
 * leaves every string in the bundle, where anyone can read it:
 *
 *     const DEMO: T[] = !SHOW_DEMO_DATA ? [] : [ ... ];   // dropped at build
 *     {SHOW_DEMO_DATA && <Thing rows={DEMO} />}           // shipped anyway
 *
 * This has already been live once in `icefall-app`: an ordinary build carried
 * four real companies' names against invented ratings in `index-*.js` while
 * rendering none of it. Verify with a grep over `dist/assets` after building,
 * not by looking at the page.
 *
 * ── DELETE THIS FILE, AND `src/demo/`, WHEN A DATABASE IS CONNECTED. ─────────
 *
 * The demo dataset is not a fallback and must never become one. A CRM that
 * quietly falls back to invented revenue is a CRM that lies to the person
 * deciding what the business is worth. When a Supabase project exists, the real
 * queries answer and this whole directory goes.
 */
import { DEMO } from "@/offline/offline";

export const SHOW_DEMO_DATA: boolean =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === "1" || DEMO;

/** Printed wherever invented figures could be mistaken for measurements. */
export const DEMO_NOTICE =
  "Invented data, shown so the layout can be judged with a populated screen. " +
  "None of these companies exist, no booking below happened, no money has moved and " +
  "no commission rate here has been agreed. The database is built but not yet connected.";
