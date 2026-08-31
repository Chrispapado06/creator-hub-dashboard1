/**
 * NOTIFICATION PERMISSION — real, and honest about what it does not do.
 *
 * The owner asked for "Allow notification" for bookings and client messages
 * (GU-01). The permission request below is genuine: it changes browser state,
 * that state persists, and it is a hard prerequisite for ever notifying anybody.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GRANTING IT DOES NOT MEAN A NOTIFICATION WILL ARRIVE, AND THE SCREEN SAYS SO.
 *
 * Verified 2026-08-31, not assumed:
 *   · there is no service worker in this app — no `public/`, no `registerSW`,
 *     nothing calling `navigator.serviceWorker`. Without one nothing can be
 *     delivered while the app is closed, which is when a booking would land.
 *   · there is no push sender. ICEFALL has no server that pushes anything to
 *     anybody, and a guide's messages do not even send yet.
 *
 * So this collects the permission and states plainly that nothing is sent yet.
 * The alternative — a toggle that says "on" and produces silence — is the same
 * failure as a support form that stores nothing: the guide stops watching for
 * the thing they think they enabled, and misses a client.
 *
 * WHEN A SENDER EXISTS this file does not change. `permissionState()` already
 * returns `granted`; what is missing is a service worker registration and a
 * push subscription, and those land in the change that makes sending real.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type NotificationState =
  /** The browser has no Notification API at all. */
  | "unsupported"
  /** Never asked. The only state where asking is possible. */
  | "default"
  /** Permission held. Still nothing is sent — see the header. */
  | "granted"
  /**
   * Refused. A browser will not re-prompt after this, so offering the button
   * again would be a control that cannot work — the guide has to change it in
   * browser settings, and the screen says that rather than retrying.
   */
  | "denied";

export function permissionState(): NotificationState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = Notification.permission;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
}

/**
 * Ask, once.
 *
 * Returns the resulting state rather than a boolean, because "denied" and
 * "dismissed without choosing" both mean the guide is not notified but only one
 * of them can be asked again — and the screen says different things about them.
 */
export async function requestPermission(): Promise<NotificationState> {
  if (permissionState() === "unsupported") return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result === "granted" ? "granted" : result === "denied" ? "denied" : "default";
  } catch {
    /* Some browsers throw on a non-user-gesture call rather than resolving. The
       guide has not been notified either way, so report the unchanged state. */
    return permissionState();
  }
}
