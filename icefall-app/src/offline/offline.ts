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
