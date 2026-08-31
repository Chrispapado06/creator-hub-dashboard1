/**
 * WHAT AN OFFLINE WRITE DOES — it is accepted, it changes the screen, and it is
 * gone on reload.
 *
 * The offline contract is that nothing may throw and nothing may show an error
 * where the app would normally save something. A guide clicking around on a
 * plane must not meet a red line saying their message failed; there is no server
 * to fail to. So the one write that needs a server lands in memory here, and the
 * banner at the top of every screen is what tells the truth about how long it
 * lasts.
 *
 * THE OTHER WRITES IN THIS APP NEED NOTHING FROM THIS FILE, and that is worth
 * knowing before adding to it. The availability calendar, the profile edit and
 * the listing all save to `localStorage` (`data/availabilityStore.ts`,
 * `data/listingStore.ts`) and therefore already work with no network at all —
 * they even survive a reload. The only write that ever needed a server was the
 * support ticket, so it is the only one handled here.
 *
 * WHAT IS DELIBERATELY NOT HERE: sending a chat message. That composer is
 * hard-disabled in this app because there is no message path, and its own header
 * says it "stays hard-disabled until a real send path exists — not gated on an
 * environment variable". An offline flag is an environment variable. Offline
 * mode renders invented DATA; it does not switch on a capability the product
 * does not have.
 *
 * NOTHING IN HERE RUNS UNLESS `OFFLINE` IS TRUE. Its only caller is inside an
 * `if (OFFLINE)` branch.
 */

export interface OfflineTicket {
  reference: string;
  id: string;
  subject: string;
  body: string;
  at: string;
}

const tickets: OfflineTicket[] = [];

/**
 * Accept a support message and hand back a reference.
 *
 * THE REFERENCE SAYS SAMPLE, and that is the whole design of this function. On
 * the real path a reference is proof that a row exists — "the desk has your
 * message" — so offline it would be the one dishonest thing on the screen if it
 * looked like the real thing. `SAMPLE-000101` cannot be mistaken for
 * `ICE-000107`, and the card that shows it says what actually happened.
 */
export function openOfflineTicket(subject: string, body: string): OfflineTicket {
  const n = 101 + tickets.length;
  const ticket: OfflineTicket = {
    reference: `SAMPLE-${String(n).padStart(6, "0")}`,
    id: `offline-ticket-${n}`,
    subject,
    body,
    at: new Date().toISOString(),
  };
  tickets.push(ticket);
  return ticket;
}

/** Everything asked this session, newest last. Kept so nothing is silently dropped. */
export const offlineTickets = (): readonly OfflineTicket[] => tickets;
