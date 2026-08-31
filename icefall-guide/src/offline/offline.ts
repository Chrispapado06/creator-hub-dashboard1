/**
 * THE OFFLINE SWITCH — one build-time constant, and nothing else.
 *
 * Set `VITE_ICEFALL_OFFLINE=1` and this app runs with no network at all: no
 * Supabase client is constructed, no photograph is fetched, no session is
 * checked, and every screen reads from `src/offline/fixtures.ts`. Unset — which
 * is the default everywhere, including this repo — every line of offline code is
 * dead and behaviour is exactly what it was before offline mode existed.
 *
 * DELIBERATELY NOT `navigator.onLine`. A laptop on a plane is usually
 * ASSOCIATED with a wifi network that has no route to anywhere, so `onLine`
 * reports true and the app would try to reach a server that is not there. Worse,
 * a runtime check can change value mid-session and flip the app between two data
 * sources while somebody is reading it. A build-time flag cannot: whatever the
 * app was when it started is what it stays.
 *
 * IDENTICAL IN ALL FIVE ICEFALL APPS. Same file name, same variable name, same
 * environment variable, so one command runs the whole family offline and no app
 * has its own dialect of "am I offline".
 *
 * AN OFFLINE BUILD MUST NOT BE DEPLOYED PUBLICLY. It carries invented sample
 * data — the same rule, and the same reason, as `lib/demoFlag.ts`.
 */
export const OFFLINE = import.meta.env.VITE_ICEFALL_OFFLINE === "1";
