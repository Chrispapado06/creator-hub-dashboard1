import { supabase } from "@/backend/client";
import { MOUNTAINS } from "@/data/mock/mountains";

/**
 * Sending an enquiry from the phone app.
 *
 * WHAT AN ENQUIRY IS ABOUT, AND WHAT IT IS NOT ABOUT
 *
 * `07-ENQUIRY-CONTRACT.md` rule 2: an enquiry names its object. The database
 * takes three, all real foreign keys — a product, a destination, a company.
 *
 * This app can name exactly ONE of them honestly. Its operators are invented
 * client-side with slug ids (`op-himalaya`), so `company_id` — a uuid — cannot
 * resolve and the foreign key refuses the row. **That is the constraint
 * working.** An enquiry that silently became a lead about an invented company
 * would put a fabricated business into a commercial queue, which is the exact
 * failure the key exists to prevent.
 *
 * So an enquiry names the MOUNTAIN, and the operator travels in the body where
 * a human can read it and see it for what it is. Nobody's question is changed:
 * a climber asking about Mont Blanc produces a lead about Mont Blanc.
 *
 * HOW I KNOW THE MOUNTAIN IS REAL, HAVING NO WAY TO READ THE TABLE
 *
 * The app has no select grant on `destinations` — `GET /destinations` answers
 * `401 / 42501`. It cannot list valid objects, so it cannot check an id the
 * ordinary way. Two probes settled it without writing anything, both omitting
 * `sender_email` so the visitor policy had to refuse them:
 *
 *   destination_id: "mont-blanc"             → 401 / 42501  RLS refusal
 *   destination_id: "zzz-nonexistent-probe"  → 400 / P0001  "no such mountain or trek"
 *
 * The nonsense slug is stopped by the object check BEFORE RLS is reached; the
 * real one gets past it and dies on the missing email. The difference in which
 * error fires is the proof the row exists. A refusal, read carefully, is a
 * reading instrument.
 *
 * WHAT COMES BACK IS NOT A RECEIPT
 *
 * `open_enquiry` returns `{ok, id}` — a raw uuid. It is NOT shown. A number the
 * sender cannot quote to anybody is a fabricated receipt: it looks like a
 * reference, it is useless as one, and it teaches people that a long code on a
 * screen means someone has their message. There is no `ICE-000107` here. The
 * signed-in athlete's real proof is that they can read their own row back.
 *
 * NO SILENT QUEUE. Same rule as support: if it cannot be sent, this module says
 * so and the screen keeps what was typed. Nothing may look sent that was not
 * stored.
 */

/** The screen an enquiry came from. Stamped so staff can see the path. */
export type EnquiryOriginScreen = "trip_detail" | "trek_detail" | "inbox_new";

export type EnquirySendResult =
  /**
   * Stored. There is no reference to show — see the note above.
   *
   * `email` is the account address the answer will go to, carried back so the
   * confirmation can NAME it. "We will be in touch" is the sentence people
   * ignore; "the answer will go to <their address>" is checkable, and if it is
   * the wrong address they find out now rather than in a week of silence.
   */
  | { ok: true; email: string }
  /** Nothing was written, and the screen must say so in these words. */
  | { ok: false; reason: EnquiryFailure };

export type EnquiryFailure =
  /** No backend configured in this build. */
  | "no-backend"
  /** Signed out. The anonymous path needs an email this screen does not collect. */
  | "signed-out"
  /** The mountain is not one the database knows. Nothing may be invented here. */
  | "unknown-object"
  /** Offline, or the request never completed. */
  | "unreachable"
  /** The database refused it. */
  | "refused";

/**
 * The destination id for a peak NAME, or null.
 *
 * The compose screen is handed a display name, not an id, because the link that
 * opens it carries `peak=Mont Blanc`. Resolution is by exact name against the
 * local catalogue, and returns the SLUG — `mont-blanc` — which is the shape
 * `p_destination_id` takes.
 *
 * Null is the honest answer for a peak this app cannot place. It is not a
 * fallback to "some nearby mountain" and it is not a guess: an enquiry filed
 * against the wrong peak is answered about the wrong peak.
 */
export function destinationIdForPeak(peakName: string): string | null {
  const wanted = peakName.trim().toLowerCase();
  if (wanted === "") return null;
  const hit = MOUNTAINS.find((m) => m.name.trim().toLowerCase() === wanted);
  return hit ? hit.id : null;
}

export async function sendEnquiry(args: {
  body: string;
  peakName: string;
  originScreen: EnquiryOriginScreen;
}): Promise<EnquirySendResult> {
  if (!supabase) return { ok: false, reason: "no-backend" };

  const destinationId = destinationIdForPeak(args.peakName);
  if (destinationId === null) return { ok: false, reason: "unknown-object" };

  // The signed-in path only. `open_enquiry` derives the sender from
  // `auth.uid()`; the anonymous path is a direct insert that REQUIRES an email,
  // and this screen has never asked for one. Adding a field to collect it is a
  // product decision, not something to improvise inside a send function — so a
  // signed-out athlete keeps their draft and is told plainly.
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user.email;
  if (!sessionData.session || !email) return { ok: false, reason: "signed-out" };

  // `object_label` is NOT sent, on purpose. A BEFORE INSERT trigger resolves it
  // from the referenced record on every path, so anything a client sends is
  // overwritten — and sending it anyway invites the next reader to believe it
  // matters. See the contract's note on the "FREE HELICOPTER RIDES" probe.
  const { error } = await supabase.rpc("open_enquiry", {
    p_body: args.body,
    p_destination_id: destinationId,
    p_origin_app: "phone_app",
    p_origin_screen: args.originScreen,
  });

  if (error) {
    // A transport failure and a refusal are different things and must not be
    // reported with the same sentence: one is worth retrying, the other never is.
    const transport = error.message.toLowerCase().includes("fetch");
    return { ok: false, reason: transport ? "unreachable" : "refused" };
  }

  return { ok: true, email };
}


/* -------------------------------------------------------------------------- */
/* What this screen may promise, decided before a word is typed                */
/* -------------------------------------------------------------------------- */

export type EnquiryGate =
  | { state: "checking" }
  /**
   * Nothing will be transmitted. The screen keeps its held-on-device notice,
   * which is still TRUE on this path — the removal rule is "amend only the
   * sentence that became false", and for a signed-out athlete it has not.
   */
  | { state: "local-only"; reason: EnquiryFailure }
  /** A real send is possible, and the answer goes to this address. */
  | { state: "ready"; email: string };

/**
 * Whether THIS enquiry can really be sent, resolved before the compose screen
 * makes any claim.
 *
 * Deliberately per-enquiry and not a global "is the backend up" flag: an
 * unknown peak is as much a reason this particular message cannot be filed as
 * being signed out is, and a screen that promised delivery on the strength of a
 * session and then failed on the object would have lied for the whole time
 * somebody was typing.
 */
export async function enquiryGate(peakName: string): Promise<EnquiryGate> {
  if (!supabase) return { state: "local-only", reason: "no-backend" };
  if (destinationIdForPeak(peakName) === null) {
    return { state: "local-only", reason: "unknown-object" };
  }

  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  if (!data.session || !email) return { state: "local-only", reason: "signed-out" };

  return { state: "ready", email };
}
