/**
 * MAY A MEASURED VITAL BE PUT IN FRONT OF AN EXPEDITION COMPANY?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SAME QUESTION PHASE 4 ASKED ABOUT A MODEL, ASKED ABOUT A BUSINESS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `coach/vitalsPolicy.ts` settled `VITALS_MAY_REACH_MODEL = false` because the
 * device makers' terms on sending their readings to an AI provider are
 * unresolved, and withholding is the position an engineer can defend without a
 * signature. An operator is not a model, so that answer does not carry over on
 * its own and the question has to be asked again here.
 *
 * It gets the same answer, for three reasons that are not the model's reasons:
 *
 *   1. CONSENT COVERAGE. The permission under which ICEFALL holds a sleep or
 *      heart-rate figure is the `health-metrics` purpose, and that purpose says
 *      in its own description — 20260903060000_oura_health.sql:136 — that it
 *      "DOES NOT COVER research, sharing with expedition companies, or any use
 *      by a third party". The data is held under a sentence that excludes this
 *      use by name. No amount of enthusiasm on the athlete's part converts it.
 *
 *   2. WHAT A COMMERCIAL READER WOULD DO WITH IT. A resting heart rate in front
 *      of somebody deciding whether to take a client onto an 8,000 m mountain is
 *      not a curiosity, it is a screening input — and it is an input nobody has
 *      validated for that use. ICEFALL would be supplying a medical-looking
 *      number to a decision it has no business shaping, and the athlete would
 *      have no way to know it had been weighed.
 *
 *   3. IT CANNOT BE TAKEN BACK. A model call ends. A disclosure to a company
 *      sits in their CRM. Article 9 data is exactly the category where the
 *      irreversibility matters most, and the consent wording says so in the
 *      athlete's own words rather than burying it here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONST, NOT AN ENVIRONMENT VARIABLE — THE PHASE 4 ARGUMENT, UNCHANGED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A `VITE_` flag can be flipped from a dashboard to unblock a demo, is baked in
 * at build time so a preview can differ from production without anyone noticing
 * which one real people are using, and records nothing about who decided.
 * Lifting this should cost a commit and a reviewer.
 *
 * IT IS ALSO ENFORCED IN THE DATABASE, which is the difference from Phase 4.
 * `open_enquiry_with_readiness` refuses `p_vitals_withheld = false` outright,
 * and `readiness_shares.vitals_withheld` records on every row that the
 * withholding was in force when the disclosure was made. A constant in a bundle
 * is a decision; a refusal in the write path is a control. Both exist because
 * the app is not the only thing that can call that function.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXACTLY WHAT IS WITHHELD, AND EXACTLY WHAT IS NOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WITHHELD while false: every measured vital READING — sleep duration, resting
 * heart rate, HRV, respiratory rate, blood oxygen, body-temperature deviation —
 * its unit, its instrument and its date. `RecoveryAssessment.vitals` is the
 * seam Phase 4 built for exactly this, and it is the seam used here.
 *
 * ALSO WITHHELD, and decided before this file existed: anything medical at all.
 * `readinessAttachment.ts:31-35` already excludes `limitations`,
 * `limitationsNote` and `altitudeIllness`, and `:37-41` already excludes the
 * composite readiness score on the grounds that sent to a company it reads as
 * ICEFALL's opinion of a client. This file does not re-decide those; it names
 * them so a reader of the disclosure policy finds the whole policy in one place.
 *
 * NOT WITHHELD: what the athlete recorded doing — sessions, distance, ascent,
 * moving time, the objective and how much of the prescribed plan they have
 * completed. That is training, not health, and it is the thing an operator
 * actually asks for. It is also the thing the athlete currently retypes badly
 * or not at all, which is why any of this exists.
 *
 * NOT AFFECTED AT ALL: what the app does with a vital for the athlete's own
 * eyes. The Recovery screen is unchanged. This is about disclosure.
 */
export const VITALS_MAY_REACH_OPERATOR = false;

/**
 * What the DISCLOSURE says instead — addressed to the operator reading it.
 *
 * It states the withholding rather than hiding it, for the reason Phase 4 gives
 * about the prompt: a reader who is not told a category was deliberately left
 * out will read its absence as "this person has no wearable" or, worse, as a
 * gap to ask the athlete to fill in privately. Naming it closes both readings,
 * and it makes the boundary the operator's to respect rather than the athlete's
 * to defend in a follow-up message.
 *
 * Included on every share while `VITALS_MAY_REACH_OPERATOR` is false, whether
 * or not the athlete has ever connected a device — because "ICEFALL does not
 * send these" is true either way, and a line that appeared only for ring owners
 * would itself disclose who owns a ring.
 */
export const VITALS_WITHHELD_FROM_OPERATOR =
  "ICEFALL does not send wearable or health data to expedition companies. Sleep, heart rate, " +
  "heart-rate variability, blood oxygen, injuries and altitude-illness history are withheld by " +
  "policy — not absent, and not something to ask me to supply instead. There is also no ICEFALL " +
  "readiness score here: ICEFALL has not assessed me and does not clear anybody to climb.";

/**
 * The same fact, addressed to the ATHLETE, above the preview.
 *
 * Two audiences, two sentences, and they are kept apart on purpose: the
 * operator's line has to be defensible to a stranger reading a CRM record, and
 * the athlete's has to answer "what is actually leaving my phone".
 */
export const VITALS_WITHHELD_NOTICE_TO_ATHLETE =
  "Your health data is not in this and cannot be added to it. Sleep, heart rate and anything you " +
  "told ICEFALL about injuries or altitude illness stay on your side — the database refuses a share " +
  "that claims otherwise, so this is not a setting you or anyone else can turn off.";

/**
 * WHAT A WITHDRAWAL CAN AND CANNOT DO, in one sentence, used wherever a
 * withdrawal control appears.
 *
 * Rule 2: absence carries its reason, and so does a limit. "Withdraw" on a
 * screen implies undo; this says what it really is, before the press rather
 * than after it.
 */
export const SHARE_WITHDRAWAL_LIMIT =
  "Withdrawing stops ICEFALL passing this on and removes it from anything the company has not " +
  "opened yet. If it has already been handed over and read, it cannot be unread — that is what " +
  "sending means, and no app can undo it.";
