/**
 * THE OFFLINE FLAG. The one and only thing that decides offline mode.
 *
 * Set at BUILD time (`VITE_ICEFALL_OFFLINE=1`), never at runtime. Deliberately
 * NOT `navigator.onLine`: a laptop on a plane is usually associated with a wifi
 * access point that has no route to anywhere, so `navigator.onLine` reads true
 * and would flip the whole app mid-session the moment it changed its mind.
 * A demo that reconfigures itself halfway through is worse than no demo.
 *
 * DEFAULT IS OFF. With the variable unset this is `false`, every `if (OFFLINE)`
 * branch in the app is dead, and behaviour is exactly what it was before this
 * file existed.
 */
export const OFFLINE = import.meta.env.VITE_ICEFALL_OFFLINE === "1";

/**
 * THE DEMO FLAG — data source, not connectivity.
 *
 * `OFFLINE` was quietly answering two different questions: "where does data
 * come from?" and "does the network exist?". Deploying the flight bundle to
 * the public internet exposed the conflation — visitors with perfect
 * connections saw IMAGERY OFFLINE placeholders, because the flag that gave
 * them a sample identity also told the map the world was unreachable.
 *
 * DEMO answers only the first question: sample identity, seeded fixtures,
 * in-memory writes, no auth walls, no real backend client, the banner. It
 * says nothing about the network, so maps stream, imagery loads and
 * conditions stay live.
 *
 * An OFFLINE build is a demo by definition — the flight bundle sets one flag
 * and gets both behaviours, exactly as before. `VITE_ICEFALL_DEMO=1` alone is
 * the internet demo. Neither set is production, unchanged.
 */
export const DEMO = OFFLINE || import.meta.env.VITE_ICEFALL_DEMO === "1";
