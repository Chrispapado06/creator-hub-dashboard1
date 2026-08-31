import { OFFLINE } from "@/offline/offline";
import { offlineSendSupportMessage } from "@/offline/fixtures";

/**
 * Support, from the public site.
 *
 * The browser half of `api/_support.mjs`. It talks to our own endpoint and never
 * to Supabase: the key lives on the server, and this file could not reach the
 * database if it wanted to.
 *
 * ── WHAT THIS PATH IS, AND WHY IT IS NOT THE OTHER ONE ──────────────────────
 *
 * Every signed-in ICEFALL app opens a ticket through `open_support_ticket`,
 * which works out who is asking from their session. The public site has no
 * accounts, so there is no session to ask — a visitor writes into
 * `support_intake` instead, and staff turn those into real tickets.
 *
 * Two consequences show up in this file:
 *
 *   • **No reference comes back.** The `ICE-…` number belongs to a real ticket;
 *     an intake row is not one yet. There is nothing to show and nothing may be
 *     invented to fill the gap — a reference a visitor cannot quote to anyone is
 *     a fabricated receipt.
 *   • **We never ask what kind of user they are.** On the signed-in paths it is
 *     derived rather than declared, precisely so nobody can answer it wrongly.
 *     A public form has nothing to derive from, and asking would be worse than
 *     not knowing.
 */

/** Same rule as the server. See the note in `waitlist.ts` on why it is permissive. */
export const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;".]+\.[^\s@<>,;".]{2,}$/;

/**
 * The database enforces 20–4000 on the message, and these match it exactly.
 *
 * Exported so the form can show a live count against the same numbers the
 * database will apply — a counter that disagrees with the rule that rejects you
 * is worse than no counter.
 */
export const BODY_MIN = 20;
export const BODY_MAX = 4000;
export const SUBJECT_MAX = 200;

export type SupportResult =
  | { ok: true }
  | { ok: false; error: string; notConnected: boolean };

export async function sendSupportMessage(input: {
  email: string;
  name?: string;
  subject: string;
  body: string;
  /** Honeypot. Always sent empty by real people; bots fill it in. */
  website?: string;
}): Promise<SupportResult> {
  const email = input.email.trim().toLowerCase();
  const subject = input.subject.trim();
  const body = input.body.trim();

  /*
   * Checked here as well as on the server, for the reason every form is: this
   * check is for the person typing, the server's is the one that counts.
   * `api/_support.mjs` holds the authoritative rule and these are the same
   * numbers, so the two cannot disagree in front of a visitor.
   */
  if (!email) return { ok: false, error: "Enter your email address so we can reply.", notConnected: false };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "That doesn't look like an email address.", notConnected: false };
  }
  if (!subject) return { ok: false, error: "Add a subject.", notConnected: false };
  if (body.length < BODY_MIN) {
    return {
      ok: false,
      error: `Please add a little more — at least ${BODY_MIN} characters.`,
      notConnected: false,
    };
  }
  if (body.length > BODY_MAX) {
    return {
      ok: false,
      error: `That message is too long. Please keep it under ${BODY_MAX} characters.`,
      notConnected: false,
    };
  }

  /*
   * OFFLINE DEMO. Below the validation, above the network, and nowhere else.
   *
   * Offline the honest "No connection" string in the catch below is
   * unreachable: behind the dev proxy the request resolves with a 200 whose
   * body carries no `ok:false`, so a visitor gets the generic "Something went
   * wrong" instead. Accepting the message into memory keeps the form doing what
   * a form should — it takes what you wrote and tells you it has it — and the
   * banner above the page is what stops that being a promise ICEFALL cannot
   * keep.
   */
  if (OFFLINE) {
    return offlineSendSupportMessage({ email, name: input.name, subject, body });
  }

  let res: Response;
  try {
    res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: input.name?.trim() ?? "",
        subject,
        body,
        website: input.website ?? "",
      }),
    });
  } catch {
    return {
      ok: false,
      error: "No connection. Check your network and try again.",
      notConnected: false,
    };
  }

  let data: { ok?: boolean; error?: string; code?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* a non-JSON body is a server fault, handled by the !ok branch below */
  }

  if (res.ok && data.ok) return { ok: true };

  /*
   * ONLY REPEAT A MESSAGE OUR OWN ENDPOINT WROTE.
   *
   * Found in the browser, not in review: with the API route missing, the dev
   * server's generic 404 body — `{ "error": "not found" }` — was displayed to
   * the visitor verbatim, because the old code trusted any `error` string it
   * received. "not found" tells somebody asking about crampons nothing at all,
   * and reads as a broken site.
   *
   * `ok: false` is the discriminator: every response this endpoint produces
   * carries it, and infrastructure errors — a proxy 404, a gateway 502, an HTML
   * error page that happened to parse — do not. Anything without it gets the
   * generic sentence.
   *
   * This is the same rule the support contract states for the signed-in path
   * ("never show `error.message` raw"), which exists because an unauthenticated
   * RPC call returns `permission denied for function open_support_ticket`. The
   * source differs; the failure is identical — an internal string, written for
   * an engineer, put in front of a person who wanted help.
   */
  const ours = data.ok === false && typeof data.error === "string" && data.error.trim() !== "";

  return {
    ok: false,
    error: ours ? (data.error as string) : "Something went wrong. Please try again.",
    notConnected: ours && data.code === "not_configured",
  };
}
