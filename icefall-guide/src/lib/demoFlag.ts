import { OFFLINE } from "@/offline/offline";
/**
 * Whether this build may render invented demo data.
 *
 * TRUE in local development, always. Otherwise only when the build was made
 * with `VITE_SHOW_DEMO=1` — an explicit, per-build opt-in that nothing sets by
 * default, so an ordinary `npm run build` produces a bundle containing no
 * invented guide, no invented clients and no invented money.
 *
 * Copied deliberately from `icefall-app/src/lib/demoFlag.ts` rather than
 * reinvented, so the two apps cannot drift on the one switch that decides
 * whether fiction ships.
 *
 * WHAT THE FLAG IS FOR IN *THIS* APP, AND WHY THE STAKES DIFFER
 *
 * The athlete app's demo data invents guides a stranger might hire. This app
 * inverts that: every invented figure here is a claim about a guide's own
 * livelihood — what they earned, who is waiting on them, how they are doing on
 * the marketplace. A guide reading an invented earnings figure is being told
 * something false about their own income, and the person best placed to catch
 * it is the one person the screen is designed to convince.
 *
 * The seed also names a person who does not exist. `ME` is a fictional guide
 * carrying a fictional IFMGA carnet number and a fictional insurance policy
 * reference. Shipping that in a public bundle publishes an invented
 * professional credential, which is the same class of claim owner decision 2
 * removed for companies.
 *
 * So this flag may only be set on a deployment that is NOT publicly readable:
 * Vercel Deployment Protection (password or SSO) must be enabled on the project
 * first, and CONFIRMED — an unauthenticated request has to be refused before a
 * build carrying demo data is promoted. If protection is ever turned off,
 * rebuild without the flag before doing so. (Constitution §7.5, §6.11.)
 *
 * HOW TO USE IT, AND THE TRAP.
 *
 * Gate the DEFINITION, not just the render. Checking this flag where the data is
 * drawn stops it appearing on screen and leaves every string in the bundle,
 * where anyone can read it.
 *
 *     const DEMO: T[] = !SHOW_DEMO_DATA ? [] : [ ... ];   // dropped at build
 *     {SHOW_DEMO_DATA && <Thing />}                       // shipped anyway
 *
 * Verify with a grep over `dist/assets` after building, not by looking at the
 * page. In this tree the string to grep for is the seed guide's name.
 *
 * AND THE SECOND TRAP, WHICH HAS BITTEN THIS PROJECT THREE TIMES (§6e):
 * gating the definition does not travel to a second reader. After changing what
 * this flag covers, grep every importer of the seed and check each one
 * individually — an aggregate, a sort key, a dedupe or a tab-bar badge counting
 * a now-empty array is a different bug, and it only appears in production.
 */
/**
 * DEMO vs OFFLINE — the split (owner escalation, 2026-08-31, contract in
 * `icefall-sessions/12-DEMO-FLAG-SPLIT.md`). The deployed demos were built
 * with OFFLINE=1, which suppressed the Supabase client while the visitor's
 * connection sat right there. The flag conflated two ideas:
 *
 *   DEMO    where data comes from + access — sample data, no login walls,
 *           the sample banner. The network stays LIVE: the client is
 *           constructed, and a visitor who signs in for real displaces the
 *           sample exactly as in production.
 *   OFFLINE whether the network exists — client suppression, photo
 *           placeholders, the flight banner, in-memory support tickets.
 *
 * `VITE_ICEFALL_DEMO=1` alone is the internet demo. `VITE_ICEFALL_OFFLINE=1`
 * remains exactly the flight build (OFFLINE implies DEMO — a build with no
 * server must show sample data or nothing). The public-protection warning
 * above is superseded FOR THE SAMPLE by the owner's explicit instruction to
 * run public demos; it still stands for anything real.
 */
export const DEMO: boolean = OFFLINE || import.meta.env.VITE_ICEFALL_DEMO === "1";

export const SHOW_DEMO_DATA: boolean =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === "1" || DEMO;
