/**
 * Enquiries, from the marketplace.
 *
 * The browser half of `api/_enquiry.mjs`. It talks to our own endpoint and
 * never to Supabase: the key lives on the server.
 *
 * Owner ruling 2026-08-31 — an enquiry lands in the Company CRM as an inbound
 * queue and ICEFALL staff answer it. Operator delivery comes later, when there
 * are operators to deliver to. That is what makes a Send button honest.
 */

/**
 * IS THE SEND PATH LIVE?
 *
 * `false` until the owner pushes `20260831110000_enquiries.sql`. Verified
 * 2026-08-31: `POST /rest/v1/enquiries` returns `PGRST205 — Could not find the
 * table 'public.enquiries' in the schema cache`.
 *
 * While this is false the enquiry surfaces keep the link they have always had,
 * and **no Send button is rendered anywhere**. That is the ordering rule
 * (constitution §6, widened): nothing may announce itself as working before the
 * thing it depends on exists. A Send button that fails every time is worse than
 * no button, because the person believes they have been heard.
 *
 * TO GO LIVE: push the migration, flip this to `true`, send one enquiry, and
 * confirm the row is in the CRM queue. Not before — and not the other way
 * round.
 */
export const ENQUIRY_LIVE = true;

/** Matched to `enquiries_body_len` exactly. NOT the support intake's 20. */
export const BODY_MIN = 10;
export const BODY_MAX = 4000;

import { supabase } from "@/backend/client";

/** Same rule as the server. See the note in `waitlist.ts` on why it is permissive. */
export const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;".]+\.[^\s@<>,;".]{2,}$/;

/**
 * What an enquiry is about.
 *
 * Only a destination — a trek or a mountain — today. Those resolve to real rows
 * in `destinations`, which is seeded from this app's own catalogue. Trips and
 * companies here are invented client-side with slug ids and are not rows in
 * `products` or `companies`, so an enquiry naming one cannot be filed at all.
 *
 * The owner ruled that the company enquiry WAITS rather than falling back to
 * the mountain: somebody who asks about an operator and generates a lead
 * reading "asked about Everest" has had their question silently changed into a
 * different one, and staff would answer the wrong thing.
 */
export interface EnquiryObject {
  kind: "destination";
  id: string;
  /** The object's name as this app knows it — stored beside the key. */
  label: string;
}

/**
 * SIGNED IN, AN ENQUIRY GOES THROUGH `open_enquiry` — NOT THE ANON INSERT.
 *
 * This is not a refinement, it is a prerequisite for "My enquiries", and the
 * policies say why. Reading your own enquiry needs `sender_id = auth.uid()`:
 *
 *     enquiries_select      using (is_staff() or sender_id = auth.uid())
 *     enquiries_anon_insert with check (sender_id is null and ...)
 *
 * The anonymous path FORCES `sender_id` to null. So every enquiry sent that way
 * is unreadable by the person who wrote it, forever — "My enquiries" would be
 * permanently empty and look broken rather than empty-because-new.
 *
 * `open_enquiry` stamps the sender from `auth.uid()`, derives their kind, and
 * resolves `object_label` from the record. It takes no email, because a signed-in
 * sender's address is already known — **do not ask for what can be derived**,
 * which is the same rule that keeps the form from asking what kind of user
 * somebody is.
 */
export async function openEnquiryAsUser(input: {
  body: string;
  object: EnquiryObject;
  originScreen?: string;
}): Promise<EnquiryResult> {
  const body = input.body.trim();
  if (body.length < BODY_MIN) {
    return { ok: false, error: `Please add a little more — at least ${BODY_MIN} characters.`, notReady: false };
  }
  if (body.length > BODY_MAX) {
    return { ok: false, error: `That enquiry is too long. Please keep it under ${BODY_MAX} characters.`, notReady: false };
  }
  if (!supabase) {
    return { ok: false, error: "ICEFALL can't reach the server just now. Nothing was sent.", notReady: true };
  }

  const { error } = await supabase.rpc("open_enquiry", {
    p_body: body,
    p_destination_id: input.object.id,
    p_origin_app: "web",
    p_origin_screen: input.originScreen ?? null,
  });

  if (!error) return { ok: true };

  /*
   * NEVER THE RAW MESSAGE. An unauthenticated or mis-granted call returns a
   * Postgres permission string — "permission denied for function
   * open_enquiry" — which reads as a broken app rather than a signed-out one.
   * Unrecognised messages still pass through unchanged, because a
   * wrong-but-friendly string hides the real fault from whoever they report to.
   */
  const m = (error.message || "").toLowerCase();
  if (m.includes("permission denied") || m.includes("not signed in")) {
    return { ok: false, error: "Sign in again to send this — your session has expired.", notReady: false };
  }
  if (m.includes("ten characters")) {
    return { ok: false, error: `Please add a little more — at least ${BODY_MIN} characters.`, notReady: false };
  }
  if (m.includes("no such")) {
    return { ok: false, error: "That enquiry has nothing to be about.", notReady: false };
  }
  if (m.includes("fetch") || m.includes("network")) {
    return { ok: false, error: "No connection. Check your network and try again.", notReady: false };
  }
  return { ok: false, error: error.message, notReady: false };
}

export type EnquiryResult =
  | { ok: true }
  | { ok: false; error: string; notReady: boolean };

export async function sendEnquiry(input: {
  email: string;
  name?: string;
  body: string;
  object: EnquiryObject;
  /** Where they were standing. Triage only — never authority for what they want. */
  originScreen?: string;
  /** Honeypot. Always sent empty by real people; bots fill it in. */
  website?: string;
}): Promise<EnquiryResult> {
  const email = input.email.trim().toLowerCase();
  const body = input.body.trim();

  // Checked here for the person typing; `api/_enquiry.mjs` holds the rule that
  // counts, and these are the same numbers so the two cannot disagree.
  if (!email) {
    return { ok: false, error: "Enter your email address so the answer can reach you.", notReady: false };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "That doesn't look like an email address.", notReady: false };
  }
  if (body.length < BODY_MIN) {
    return { ok: false, error: `Please add a little more — at least ${BODY_MIN} characters.`, notReady: false };
  }
  if (body.length > BODY_MAX) {
    return { ok: false, error: `That enquiry is too long. Please keep it under ${BODY_MAX} characters.`, notReady: false };
  }

  let res: Response;
  try {
    res = await fetch("/api/enquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: input.name?.trim() ?? "",
        body,
        objectKind: input.object.kind,
        objectId: input.object.id,
        objectLabel: input.object.label,
        originScreen: input.originScreen ?? "",
        website: input.website ?? "",
      }),
    });
  } catch {
    return { ok: false, error: "No connection. Check your network and try again.", notReady: false };
  }

  let data: { ok?: boolean; error?: string; code?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* a non-JSON body is a server fault, handled below */
  }

  if (res.ok && data.ok) return { ok: true };

  /*
   * Only repeat a message our own endpoint wrote — see the longer note in
   * `support.ts`. `ok: false` is the discriminator; a proxy 404 or a gateway
   * 502 does not carry it, and an internal string written for an engineer must
   * never reach somebody asking about a mountain.
   */
  const ours = data.ok === false && typeof data.error === "string" && data.error.trim() !== "";

  return {
    ok: false,
    error: ours ? (data.error as string) : "Something went wrong. Please try again.",
    notReady: ours && (data.code === "not_ready" || data.code === "not_configured"),
  };
}
