/**
 * Whether this build may render invented demo data.
 *
 * TRUE in local development, always. Otherwise only when the build was made
 * with `VITE_SHOW_DEMO=1` — an explicit, per-build opt-in that nothing sets by
 * default, so an ordinary `npm run build` still produces a bundle containing no
 * invented guides, no invented operators and no generated portraits.
 *
 * WHAT THE FLAG IS FOR, AND THE CONDITION ON USING IT
 *
 * The demo data exists so the marketplace can be judged with something in it.
 * Reviewing it on a phone means deploying it, and a deployed URL is readable by
 * anyone who has the link unless something stops them. What sits behind that
 * link is a page of mountain guides who do not exist, carrying invented IFMGA
 * licences, invented ascent records and invented day rates — credentials a
 * stranger could act on when choosing who to hire on glaciated ground. The
 * operator directory carries the same kind of invented figures — ratings,
 * summit rates, prices — though it no longer attaches them to real companies:
 * those four names and their marks were replaced with invented ones, so this
 * flag is no longer the only thing standing between a defamatory claim and the
 * public. It is still the thing standing between invented safety-relevant
 * numbers and a stranger, which is reason enough to keep the condition below.
 *
 * So this flag may only be set on a deployment that is NOT publicly readable:
 * Vercel Deployment Protection (password or SSO) must be enabled on the project
 * first, and confirmed — an unauthenticated request has to be refused before
 * a build carrying demo data is promoted. If protection is ever turned off,
 * rebuild without the flag before doing so.
 *
 * HOW TO USE IT, AND THE TRAP.
 *
 * Gate the DEFINITION, not just the render. Checking this flag where the data
 * is drawn stops it appearing on screen and leaves every string in the bundle,
 * where anyone can read it — and a defamatory claim about a real company is
 * published the moment it is downloadable, whether or not a component draws it.
 *
 *     const DEMO: T[] = !SHOW_DEMO_DATA ? [] : [ ... ];   // dropped at build
 *     {SHOW_DEMO_DATA && <Thing />}                       // shipped anyway
 *
 * This was live for a while: an ordinary build carried four real companies'
 * names against invented ratings, statistics and reviews in `index-*.js`, while
 * rendering none of it. Verify with a grep over `dist/assets` after building,
 * not by looking at the page.
 *
 * The default remains "no demo data in production". This is the exception, and
 * it is opt-in per build precisely so nobody enables it by forgetting.
 */
export const SHOW_DEMO_DATA: boolean =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO === "1";
