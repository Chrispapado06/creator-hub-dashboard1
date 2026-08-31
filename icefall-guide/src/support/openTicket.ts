import { supabase } from "@/backend/client";
import { friendly } from "@/auth/account";
import { OFFLINE } from "@/offline/offline";
import { openOfflineTicket } from "@/offline/state";

/**
 * OPENING A SUPPORT TICKET — the one call, wired to the contract.
 *
 * `open_support_ticket` takes no argument for who the requester is, DELIBERATELY.
 * It derives them from `auth.uid()` — company, then guide, then staff, then
 * athlete — and stamps it on the row. So this app never sends a requester kind,
 * and there is no field on the form that could ask: a form that asked is a form
 * somebody could answer wrongly, and the answer would then be wrong on a ticket
 * about their livelihood.
 *
 * `p_origin_app` is HARDCODED to "guide_app". It is not a parameter of this
 * function and must never become one — every ticket from this tree comes from
 * this app, and a caller able to claim otherwise is a caller able to misfile
 * somebody else's question.
 *
 * `p_origin_screen` IS TRIAGE, NEVER AUTHORITY. It records where the guide was
 * standing so a report is actionable. The desk must never read "they were on
 * /payouts" as "they want a payout released" — a deliberate technical
 * restriction reopens socially the moment intent is inferred from a URL. What
 * they asked for is in the body, which a person reads.
 *
 * THE RETURNED REFERENCE IS THE PROOF. `ICE-000107` comes back only because a
 * row was written; showing it is the difference between "sent" and "stored".
 * On failure this returns the message and the screen keeps what they typed —
 * nothing may look sent that was not.
 *
 * NO RESPONSE-TIME PROMISE, anywhere, ever. `first_response_at` exists and is
 * empty because nothing has ever been answered. When it has data a number can be
 * stated; until then any figure would be invented, and invented to somebody
 * waiting on money.
 */

/**
 * The types this app can legitimately raise.
 *
 * `verification` and `listing` were added to the schema for exactly these
 * questions — verified present in `20260830140000_support_intake.sql` and
 * ABSENT from the older CHECK in `20260828170000`, which lists only eight. A
 * type the database rejects would fail at the worst possible moment.
 */
export type GuideTicketType = "payment" | "verification" | "listing" | "account" | "technical";

export type OpenTicketResult =
  | { ok: true; reference: string; id: string }
  | { ok: false; message: string };

export async function openSupportTicket(args: {
  subject: string;
  body: string;
  type: GuideTicketType;
  /** The route the guide was on. Triage only — see the header. */
  originScreen: string;
}): Promise<OpenTicketResult> {
  /**
   * OFFLINE THE MESSAGE IS ACCEPTED AND KEPT IN MEMORY.
   *
   * A demo that answers a support form with a red failure line is a demo that
   * looks broken, so this returns a reference — but one that says SAMPLE, not
   * one shaped like `ICE-000107`. The rule the real path enforces still holds:
   * the reference is only as good as what is behind it, and behind this one is
   * a variable that disappears when the tab is closed. The permanent offline
   * banner above the form is what makes that plain.
   */
  if (OFFLINE) {
    /* The same two local checks the online path makes below, so the form does
       not behave differently offline — they are arithmetic on a string and
       touch nothing. */
    if (args.subject.trim().length === 0) {
      return { ok: false, message: "Give it a short subject so the desk can find it." };
    }
    if (args.body.trim().length < 10) {
      return { ok: false, message: "Please describe the problem in a little more detail." };
    }
    const t = openOfflineTicket(args.subject.trim().slice(0, 200), args.body.trim());
    return { ok: true, reference: t.reference, id: t.id };
  }

  if (!supabase) {
    return {
      ok: false,
      message: "ICEFALL is not connected on this device, so nothing was sent.",
    };
  }

  /* The database refuses a body under 10 characters. Catching it here means the
     guide is told before they lose the tap, not after a round trip. */
  if (args.subject.trim().length === 0) {
    return { ok: false, message: "Give it a short subject so the desk can find it." };
  }
  if (args.body.trim().length < 10) {
    return { ok: false, message: "Please describe the problem in a little more detail." };
  }

  const { data, error } = await supabase.rpc("open_support_ticket", {
    p_subject: args.subject.trim().slice(0, 200),
    p_body: args.body.trim(),
    p_type: args.type,
    p_origin_app: "guide_app",
    p_origin_screen: args.originScreen,
  });

  if (error) return { ok: false, message: friendly(error.message) };

  /**
   * The reference is what makes this provable, so its absence is a FAILURE and
   * not a success with a missing field. Returning ok:true without one would tell
   * a guide their message was stored when nothing came back to say so.
   */
  const row = data as { ok?: boolean; reference?: string; id?: string } | null;
  if (!row?.ok || !row.reference || !row.id) {
    return {
      ok: false,
      message: "The server did not confirm your message was stored. Nothing has been sent.",
    };
  }

  return { ok: true, reference: row.reference, id: row.id };
}
