import { supabase } from "@/backend/client";
import type { CoachContext } from "@/coach/context";
import { buildReadinessAttachment } from "@/enquiries/readinessAttachment";
import { destinationIdForPeak, type EnquiryFailure, type EnquiryOriginScreen } from "@/enquiries/send";
import {
  VITALS_MAY_REACH_OPERATOR,
  VITALS_WITHHELD_FROM_OPERATOR,
} from "@/enquiries/operatorDisclosurePolicy";

/**
 * SENDING A TRAINING RECORD TO AN EXPEDITION COMPANY.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT IS ALREADY DECIDED, AND IS NOT RE-DECIDED HERE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `readinessAttachment.ts` already owns WHAT MAY BE SAID about an athlete to a
 * commercial desk: measured and self-reported kept apart under two headings,
 * nothing medical, no readiness score, no name, no email, no home base. It is
 * shipped, it is wired into the compose screen, and its exclusions are argued
 * at the field rather than asserted.
 *
 * This module does not write a second version of that block. It CALLS it. A
 * second builder would be a second voice describing the same person, and the
 * first time the two disagreed the athlete would have approved one string and
 * sent another — which is the precise failure the preview exists to prevent.
 *
 * What is new here is everything the shipped attachment deliberately has no
 * opinion about, because in its world nothing left the device:
 *
 *   WHO IT GOES TO         a named company, resolved from a live product
 *   UNDER WHAT PERMISSION  a per-share consent, recorded with its wording
 *   WITH WHAT WITHHELD     wearable and health data, by policy and by refusal
 *   AND HOW TO STOP IT     a withdrawal, with its real limit stated
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSENT IS PER SHARE AND DEFAULTS TO OFF — STRUCTURALLY, NOT BY HABIT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There is no "share my readiness with operators" preference in this module,
 * no local flag, and nothing that caches a previous decision. The only way a
 * disclosure happens is `sendEnquiryWithReadiness`, which requires the caller to
 * hand back the exact `OperatorShare` object it previewed. A screen cannot
 * accidentally share by forgetting to check a boolean, because there is no
 * boolean to forget: sharing and not sharing are two different function calls.
 *
 * `sendEnquiry` (the shipped one) is still the send path when nothing is being
 * disclosed, and it is unchanged.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RECIPIENT HAS TO EXIST BEFORE THE CONTROL IS OFFERED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the half that decides whether any of it is honest. An ICEFALL enquiry
 * about a MOUNTAIN carries no company — `enquiries_resolve_object` assigns
 * `company_id` only on the product branch — so a share attached to one can
 * never reach an operator, no matter how carefully it was consented to. Putting
 * a consent flow in front of a disclosure that cannot occur is worse than
 * having no feature: it collects a permission under a false description of what
 * it permits.
 *
 * So `operatorShareGate` resolves the recipient FIRST, from
 * `live_operator_companies` and the live products attached to this mountain,
 * and returns `no-recipient` when there is none. The compose screen renders no
 * control in that case — not a disabled one, not a "coming soon" one. Nothing
 * to tap, and one flat sentence saying why.
 */

/* -------------------------------------------------------------------------- */
/* The text                                                                    */
/* -------------------------------------------------------------------------- */

export interface OperatorShare {
  /**
   * EXACTLY what will be disclosed. The same characters the preview renders,
   * the same characters sent to `open_enquiry_with_readiness`, and the same
   * characters stored in `readiness_shares.disclosed_text`.
   *
   * One string, built once, carried through. Nothing downstream rebuilds it.
   */
  text: string;
  measuredLines: number;
  reportedLines: number;
}

/**
 * The disclosure, or null when there is nothing to disclose.
 *
 * Null rather than an empty string, because "this athlete has no recorded
 * sessions and no objective" is a state a screen has to handle differently
 * — there is no preview to show and therefore nothing to consent to. Rule 3:
 * no control that cannot act.
 */
export function buildOperatorShare(ctx: CoachContext): OperatorShare | null {
  const base = buildReadinessAttachment(ctx);
  if (base.text === "") return null;

  /*
   * The withholding line is part of the DISCLOSED TEXT, not a footnote the app
   * shows and then drops. The operator reading this in their CRM six weeks
   * later needs it as much as the athlete pressing the button does — see the
   * reasoning on `VITALS_WITHHELD_FROM_OPERATOR`.
   *
   * The condition is the constant rather than `true`, so that if the policy is
   * ever widened the sentence disappears with it instead of contradicting the
   * data underneath it. It is not a condition on whether the athlete owns a
   * device: a line that appeared only for ring owners would itself disclose who
   * owns a ring.
   */
  const text = VITALS_MAY_REACH_OPERATOR
    ? base.text
    : `${base.text}\n\n${VITALS_WITHHELD_FROM_OPERATOR}`;

  return { text, measuredLines: base.measuredLines, reportedLines: base.reportedLines };
}

/* -------------------------------------------------------------------------- */
/* Who there is to send it to                                                  */
/* -------------------------------------------------------------------------- */

/** A company that can actually receive this, because it sells this mountain. */
export interface ShareRecipient {
  companyId: string;
  companyName: string;
  /** The live product that makes the company nameable, and names the enquiry. */
  productId: string;
  productName: string;
}

export type OperatorShareGate =
  | { state: "checking" }
  /**
   * Nothing about this athlete can reach a company through this enquiry.
   * `detail` is rendered as written — each reason is a different fact and they
   * must not collapse into "not available".
   */
  | { state: "no-recipient"; reason: NoRecipientReason; detail: string }
  /** A named company, and the sentence the decision will be recorded against. */
  | {
      state: "ready";
      recipients: ShareRecipient[];
      wording: string;
      version: string;
    };

export type NoRecipientReason =
  /** No backend in this build. */
  | "no-backend"
  /** Signed out — a disclosure is recorded against an account or not at all. */
  | "signed-out"
  /** This app cannot place the peak, so it cannot match it to a product either. */
  | "unknown-peak"
  /** No company sells this mountain through ICEFALL. The ordinary case today. */
  | "no-operator"
  /** The consent sentence could not be read. No wording, no grant — Article 9. */
  | "no-wording"
  /** The question could not be asked. Distinct from every answer above. */
  | "unreachable";

const NO_RECIPIENT_DETAIL: Record<NoRecipientReason, string> = {
  "no-backend":
    "This build has no server connection, so nothing about you can be sent anywhere and nothing is recorded.",
  "signed-out":
    "Sign in to share your training figures. A record of what was sent, to whom and when has to belong to an account — an anonymous disclosure is one nobody could ever withdraw.",
  "unknown-peak":
    "ICEFALL does not hold this peak as a destination, so it cannot match it to a company either. Your message still sends; there is just nobody for the figures to go to.",
  "no-operator":
    "No expedition company runs this mountain through ICEFALL yet, so there is nobody to send your training figures to. Your enquiry still reaches the ICEFALL desk — write what you have been doing in the message instead.",
  "no-wording":
    "ICEFALL cannot show you the permission sentence right now, and it will not record an agreement to words it did not put in front of you. Try again later; your message still sends without the figures.",
  unreachable:
    "ICEFALL could not check who this could be sent to. Nothing has been sent and nothing recorded. Your message still sends without the figures.",
};

/**
 * Whether THIS enquiry has a recipient, and what the athlete would be agreeing
 * to.
 *
 * Per-enquiry, like `enquiryGate` and for the same reason: the answer is about
 * this mountain and this moment, and a screen that asked once per session would
 * offer a control that was true on a different page.
 *
 * THE WORDING IS FETCHED, NEVER HARDCODED. `health/consent.ts` settles the rule
 * this follows: the database is the single source of the sentence, and a build
 * that printed its own copy could record somebody's agreement against words
 * they were never shown. With no wording there is no control at all — which is
 * why `no-wording` is a `no-recipient` state rather than a warning beside a
 * live button.
 */
export async function operatorShareGate(peakName: string): Promise<OperatorShareGate> {
  const deny = (reason: NoRecipientReason): OperatorShareGate => ({
    state: "no-recipient",
    reason,
    detail: NO_RECIPIENT_DETAIL[reason],
  });

  if (!supabase) return deny("no-backend");

  const destinationId = destinationIdForPeak(peakName);
  if (destinationId === null) return deny("unknown-peak");

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return deny("signed-out");

  /*
   * The live products on this mountain, and the companies behind them.
   *
   * `products_select` permits `status = 'live'` to any signed-in user, and
   * `live_operator_companies` is the only surface on which this app may read a
   * company's name. A product whose company is absent from that view is not a
   * nameable recipient and is dropped below, rather than shown with a blank
   * name.
   *
   * THREE FLAT QUERIES RATHER THAN ONE EMBEDDED JOIN. PostgREST would do this
   * in a single `product_destinations!inner(...)` select, and the hand-written
   * `Database` type in `backend/types.ts` declares `Relationships: []` on every
   * table — so an embedded select type-checks against nothing and returns a
   * shape the compiler has to be told to ignore with a cast. A cast that
   * silences the compiler about data crossing a trust boundary is how a null
   * company id becomes a blank company name on a consent screen. Flat queries
   * cost two extra round trips and keep every row typed.
   */
  const { data: linkData, error: linkError } = await supabase
    .from("product_destinations")
    .select("product_id")
    .eq("destination_id", destinationId);

  if (linkError) return deny("unreachable");

  const productIds = ((linkData ?? []) as { product_id: string }[]).map((r) => r.product_id);
  if (productIds.length === 0) return deny("no-operator");

  const { data, error } = await supabase
    .from("products")
    .select("id,name,company_id")
    .eq("status", "live")
    .in("id", productIds);

  if (error) return deny("unreachable");

  const rows = (data ?? []) as { id: string; name: string; company_id: string }[];
  if (rows.length === 0) return deny("no-operator");

  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  const { data: companyData, error: companyError } = await supabase
    .from("live_operator_companies")
    .select("id,name")
    .in("id", companyIds);

  if (companyError) return deny("unreachable");

  const nameById = new Map<string, string>();
  for (const c of (companyData ?? []) as { id: string; name: string }[]) {
    nameById.set(c.id, c.name);
  }

  const recipients: ShareRecipient[] = [];
  for (const r of rows) {
    const companyName = nameById.get(r.company_id);
    // No name, no recipient. An unnamed company on a consent screen is a
    // consent to nobody, and a placeholder would be an invented business.
    if (companyName === undefined) continue;
    recipients.push({
      companyId: r.company_id,
      companyName,
      productId: r.id,
      productName: r.name,
    });
  }
  if (recipients.length === 0) return deny("no-operator");

  const { data: wordingData, error: wordingError } = await supabase.rpc(
    "health_consent_wording_in_force",
    { p_purpose: READINESS_TO_OPERATOR_PURPOSE },
  );
  if (wordingError) return deny("unreachable");

  const wording = (wordingData ?? [])[0];
  if (!wording) return deny("no-wording");

  return {
    state: "ready",
    recipients,
    wording: wording.wording,
    version: wording.version,
  };
}

/** The purpose slug seeded by 20260911200000. One purpose, one meaning. */
export const READINESS_TO_OPERATOR_PURPOSE = "readiness-to-operator";

/* -------------------------------------------------------------------------- */
/* Sending it                                                                  */
/* -------------------------------------------------------------------------- */

export type ShareSendResult =
  | {
      ok: true;
      /**
       * The share's id — the ONE identifier this app does show, because unlike
       * the enquiry uuid it is useful: it is what a withdrawal needs. The
       * athlete never types it; the "what I have shared" list carries it.
       */
      shareId: string;
      /**
       * Whether the enquiry named a company at all. False means it reached the
       * ICEFALL desk and can never reach an operator, and the screen must say
       * that rather than "sent".
       */
      namedACompany: boolean;
      /** The account address the answer goes to, so the screen can name it. */
      email: string;
    }
  | { ok: false; reason: EnquiryFailure };

/**
 * Send the enquiry AND record the disclosure, in one statement.
 *
 * `share.text` is passed through untouched. This function does not rebuild it,
 * trim it beyond the server's own `btrim`, or re-derive it from the context —
 * the only text anybody consented to is the text that was on the screen, and
 * the argument is how it gets from there to the record.
 *
 * THE BODY AND THE DISCLOSURE ARE SENT SEPARATELY ON PURPOSE. The shipped
 * attachment pastes the block into the message, where the athlete can edit it
 * like any other sentence. That remains the right interaction for a message
 * somebody is composing. It is the wrong shape for a RECORD: an edited copy
 * inside a 4,000-character body cannot answer "what did ICEFALL disclose about
 * me". So the disclosure travels as itself, and the body is whatever the
 * athlete wrote. A screen may legitimately do both; they are not the same act.
 */
export async function sendEnquiryWithReadiness(args: {
  body: string;
  peakName: string;
  originScreen: EnquiryOriginScreen;
  recipient: ShareRecipient;
  share: OperatorShare;
}): Promise<ShareSendResult> {
  if (!supabase) return { ok: false, reason: "no-backend" };

  const destinationId = destinationIdForPeak(args.peakName);
  if (destinationId === null) return { ok: false, reason: "unknown-object" };

  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData.session?.user.email;
  if (!sessionData.session || !email) return { ok: false, reason: "signed-out" };

  const { data, error } = await supabase.rpc("open_enquiry_with_readiness", {
    p_body: args.body,
    p_readiness_text: args.share.text,
    /*
     * Sent explicitly rather than left to the column default, so that a change
     * to `VITALS_MAY_REACH_OPERATOR` shows up here as a refused call instead of
     * a silently mislabelled row. The server refuses `false` outright today —
     * this is the app agreeing with it in writing, not asking permission.
     */
    p_vitals_withheld: !VITALS_MAY_REACH_OPERATOR,
    /*
     * THE PRODUCT, WHICH IS HOW THE ENQUIRY NAMES A COMPANY AT ALL.
     * `enquiries_resolve_object` reads the company off the product; the
     * destination travels too so the enquiry is still about the mountain the
     * athlete was looking at.
     */
    p_product_id: args.recipient.productId,
    p_destination_id: destinationId,
    p_origin_app: "phone_app",
    p_origin_screen: args.originScreen,
    p_measured_lines: args.share.measuredLines,
    p_reported_lines: args.share.reportedLines,
  });

  if (error || !data) {
    const transport = (error?.message ?? "").toLowerCase().includes("fetch");
    return { ok: false, reason: transport ? "unreachable" : "refused" };
  }

  return {
    ok: true,
    shareId: data.share,
    namedACompany: data.delivered_to_company,
    email,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading it back, and taking it back                                         */
/* -------------------------------------------------------------------------- */

/**
 * One disclosure, as the athlete's own record of it.
 *
 * THREE STATES, NOT TWO. `in-force`, `withdrawn` and — the one that is easy to
 * lose — `no-recipient`: a share made against an enquiry that never named a
 * company, which is held at the ICEFALL desk and can reach no operator. It is
 * not "pending". Nothing is going to happen to it, and a list that implied
 * otherwise would be inventing a delivery.
 */
export interface MyReadinessShare {
  id: string;
  createdAt: string;
  status: "in-force" | "withdrawn" | "no-recipient";
  /** The exact characters that were disclosed. Shown back, never summarised. */
  disclosedText: string;
  measuredLines: number;
  reportedLines: number;
  /** True on every row ICEFALL has ever written. Rendered, not assumed. */
  vitalsWithheld: boolean;
  withdrawnAt: string | null;
}

export type MyReadinessSharesResult =
  | { ok: true; shares: MyReadinessShare[] }
  | { ok: false; reason: "no-backend" | "signed-out" | "unreachable" };

/**
 * What this athlete has disclosed, ever.
 *
 * Read straight off the table under `readiness_shares_select_own` rather than
 * through an RPC, because "what has been sent about me" is a question somebody
 * is entitled to answer by looking, and a policy that says `auth.uid() =
 * user_id` is a plainer guarantee than a function nobody reads.
 */
export async function myReadinessShares(): Promise<MyReadinessSharesResult> {
  if (!supabase) return { ok: false, reason: "no-backend" };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, reason: "signed-out" };

  const { data, error } = await supabase
    .from("readiness_shares")
    .select("id,created_at,company_id,disclosed_text,measured_lines,reported_lines,vitals_withheld,revoked_at")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, reason: "unreachable" };

  const shares = ((data ?? []) as {
    id: string;
    created_at: string;
    company_id: string | null;
    disclosed_text: string;
    measured_lines: number;
    reported_lines: number;
    vitals_withheld: boolean;
    revoked_at: string | null;
  }[]).map<MyReadinessShare>((r) => ({
    id: r.id,
    createdAt: r.created_at,
    /*
     * Order matters: a withdrawn share is withdrawn whether or not it had a
     * recipient, and reporting it as `no-recipient` would tell somebody their
     * withdrawal had not registered.
     */
    status: r.revoked_at !== null ? "withdrawn" : r.company_id === null ? "no-recipient" : "in-force",
    disclosedText: r.disclosed_text,
    measuredLines: r.measured_lines,
    reportedLines: r.reported_lines,
    vitalsWithheld: r.vitals_withheld,
    withdrawnAt: r.revoked_at,
  }));

  return { ok: true, shares };
}

export type RevokeResult =
  | {
      ok: true;
      /** It was already withdrawn. Not an error, and not a second withdrawal. */
      already: boolean;
      /**
       * Whether ICEFALL had already handed the enquiry to the company.
       *
       * TRUE IS NOT A FAILURE AND MUST NOT BE DRAWN AS ONE. It is the fact that
       * decides which of two true sentences the screen shows: stopped before
       * anybody outside ICEFALL saw it, or stopped from here on with no claim
       * about what was already read.
       */
      seenByCompany: boolean;
    }
  | { ok: false; reason: "no-backend" | "signed-out" | "unreachable" | "refused" };

/** Withdraw one disclosure. See `SHARE_WITHDRAWAL_LIMIT` for what that means. */
export async function revokeReadinessShare(shareId: string): Promise<RevokeResult> {
  if (!supabase) return { ok: false, reason: "no-backend" };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return { ok: false, reason: "signed-out" };

  const { data, error } = await supabase.rpc("readiness_share_revoke", { p_share_id: shareId });
  if (error || !data) {
    const transport = (error?.message ?? "").toLowerCase().includes("fetch");
    return { ok: false, reason: transport ? "unreachable" : "refused" };
  }

  return { ok: true, already: data.already, seenByCompany: data.seen_by_company };
}
