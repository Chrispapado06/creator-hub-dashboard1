/**
 * MAY A MEASURED VITAL BE PUT IN FRONT OF A LANGUAGE MODEL?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE QUESTION, AND WHY IT IS A CONSTANT RATHER THAN AN ASSUMPTION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The coach roadmap raises this as an open item: "a check of Oura's developer
 * terms before sending its data to a model". It is not open in the sense of
 * unexamined — `tracking/sources/oura.ts` already writes the answer down, and
 * the answer is that nobody has established it:
 *
 *   "CLAUSE 2 — AI TRAINING. Oura data may NEVER be used to train or improve
 *    any AI model. ICEFALL has a Coach. […] the day a model sits behind that
 *    endpoint, putting an Oura HRV into its prompt is arguably the 'ingestion
 *    into a context window' that Strava's equivalent clause names outright.
 *    Nothing in the code prevents that today except the Coach having no model,
 *    and 'there is no model yet' is not a control."
 *
 * A model now sits behind that endpoint. So this file is the control that
 * comment says does not exist, and its default is the only default an engineer
 * is entitled to choose when a lawyer has not answered: NO.
 *
 * The same reasoning is not Oura-specific. Apple's Health data has its own
 * restrictions on disclosure to third parties, and a person who connected a
 * ring to see a number on a recovery screen did not thereby agree to have their
 * nights posted to an AI provider. Withholding is the position that can be
 * defended without a signature; sending is the position that needs one.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONST, NOT AN ENVIRONMENT VARIABLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Exactly the argument `OURA_LEGAL_HOLD` makes, and for the same reason. A
 * `VITE_` flag can be flipped from a dashboard to unblock a demo, is baked in
 * at build time so a preview can differ from production without anyone
 * noticing which one real people are using, and records nothing about who
 * decided. Lifting this should cost a commit and a reviewer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXACTLY WHAT THIS WITHHOLDS, AND EXACTLY WHAT IT DOES NOT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WITHHELD while false: every measured vital READING — the figure, its unit,
 * its instrument and its date — and every sentence containing one. That is why
 * `assessRecovery` keeps measured values out of its `summary` string and puts
 * them in a structured `vitals` list instead: the summary goes to the model
 * verbatim, so the seam has to exist upstream of the prompt, not inside it.
 *
 * NOT WITHHELD: ICEFALL'S OWN recovery and readiness scores, which are
 * ICEFALL's arithmetic over several inputs and are a judgement of ours rather
 * than a reading of Oura's. This is a deliberate line and it is worth stating
 * plainly rather than leaving implicit: a score that a measured night helped
 * shape does still reach the model. If a reviewer decides that a derived score
 * is also "Oura data", the fix is to compute a second, vitals-free assessment
 * for the prompt — not to widen this flag quietly, because two different
 * recovery numbers in one app is its own harm.
 *
 * NOT AFFECTED AT ALL: what the app itself does with a vital. ICEFALL's own
 * engines reading a person's own sleep to shape their own session is the thing
 * the person connected the ring for. The clause is about models, and so is this.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE LOCK BELOW THIS ONE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `OURA_LEGAL_HOLD` in `tracking/sources/oura.ts` is still `true`, so no Oura
 * figure exists anywhere in the app today and this flag has nothing to withhold
 * yet. That is the point of writing it now: the control should already be in
 * place and tested on the day the hold lifts, rather than being remembered
 * afterwards.
 */
export const VITALS_MAY_REACH_MODEL = false;

/**
 * What the prompt says instead. Addressed to the model, not to the athlete.
 *
 * It states the withholding rather than hiding it, because a model that is not
 * told a category of evidence exists will cheerfully tell somebody ICEFALL
 * cannot see their sleep — which would be false, and rule 2 forbids it
 * anywhere, including in an answer nobody proofread.
 */
export const VITALS_WITHHELD_FROM_MODEL =
  "Wearable readings (sleep, resting heart rate) are deliberately NOT included in this prompt. " +
  "ICEFALL may hold them and may have counted them in the recovery and readiness figures above, " +
  "but the device makers' developer terms on sharing their data with AI models are unresolved, so " +
  "the readings themselves are not sent to you. Do NOT state, guess at or ask the athlete to " +
  "confirm any sleep duration, resting heart rate or HRV figure. If they ask what their ring " +
  "measured, tell them it is on the Recovery screen — you are not shown it.";
