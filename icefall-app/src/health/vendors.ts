import { HEALTH_PROVIDER_NAME, type HealthProvider } from "./types";

/**
 * WHAT EACH CONNECTION WOULD ACTUALLY DO — in named metrics, not categories.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────
 *
 * "ICEFALL reads your health data" is the sentence this file was written to
 * make impossible. Somebody deciding whether to hand over their sleep and
 * their heart is deciding about specific things — an overnight HRV, a recovery
 * score, a body weight — and a category name hides exactly the part they would
 * have wanted to know. So every card names the readings, and the list is a
 * data structure rather than paragraphs of prose so that no vendor quietly
 * ends up with a vaguer description than the others.
 *
 * ── `absent` IS NOT A FOOTNOTE ───────────────────────────────────────────────
 *
 * The honesty doctrine says a metric a device did not send is a NAMED ABSENCE
 * with its reason. The same rule applies one level up: a capability a vendor
 * does not have is named here, so no screen is ever built that implies it.
 * WHOOP has no GPS and no step count — not "not yet", not "coming"; they are
 * not in its API. Withings can send a cardiogram and ICEFALL deliberately does
 * not ask for one. Both are stated on the card.
 *
 * ── NOTHING HERE IS CONNECTED YET ────────────────────────────────────────────
 *
 * ICEFALL holds no credentials for any of these four. Every sentence below is
 * written in the conditional — "would read", not "reads" — and the screen adds
 * the plain statement that ICEFALL has not registered with the vendor. When a
 * key exists, the conditional stops being a hedge and becomes the description
 * of a live grant; the words do not have to change, because they were true
 * both times.
 */
export interface HealthVendorCopy {
  provider: HealthProvider;
  name: string;
  /** One line under the name: what this connection is FOR. */
  purpose: string;
  /** The readings, named. Never a category. */
  reads: readonly string[];
  /** What crosses in the other direction. */
  sends: string;
  /** Capabilities the vendor genuinely does not have, or ICEFALL deliberately
   *  does not ask for. Empty only when there is honestly nothing to say. */
  absent: readonly string[];
  /** How data would arrive, when it does. */
  delivery: string;
  /** The vendor's own limit on a new app, where it has one. */
  vendorCap: string | null;
  /** What ICEFALL owes this vendor, and where in the code it is met. */
  obligation: string;
  /** The sentence when ICEFALL holds no credentials for this vendor. */
  needsCredentials: string;
}

export const HEALTH_VENDORS: Record<HealthProvider, HealthVendorCopy> = {
  polar: {
    provider: "polar",
    name: HEALTH_PROVIDER_NAME.polar,
    purpose: "Your overnight recovery and daily physiology from a Polar watch.",
    reads: [
      "Sleep, and the stages within it",
      "Nightly Recharge — Polar's overnight recovery figure, and the ANS charge behind it",
      "Cardio Load and Training Load Pro",
      "Heart rate through the day, not only during training",
      "Blood oxygen",
      "Steps",
    ],
    sends: "Nothing. This connection only reads.",
    absent: [
      "Not your recorded outings — those are a separate Polar permission, under Watch accounts above. Polar issues one grant per app, so connecting here may mean reconnecting there, and the other way round.",
    ],
    delivery:
      "A reading has to reach Polar's own cloud before ICEFALL can see it, so it appears after your watch has synced rather than the moment you take it off.",
    vendorCap: null,
    obligation:
      "Polar's agreement requires a written credit — “Source: Polar” — wherever its data appears, forbids the Polar logo without written consent, and requires the token to be deleted when you disconnect. All three are held to in the code.",
    needsCredentials:
      "ICEFALL has not registered with Polar yet, so there is nothing here to connect to. Polar issues credentials to anyone who asks — no approval, no fee — so this is waiting on ICEFALL rather than on Polar. The connection itself is built; it appears here the day the registration is done.",
  },

  whoop: {
    provider: "whoop",
    name: HEALTH_PROVIDER_NAME.whoop,
    purpose: "Recovery, sleep and strain from a WHOOP band.",
    reads: [
      "Recovery score",
      "Heart-rate variability and resting heart rate",
      "Blood oxygen and skin temperature",
      "Sleep stages, and the sleep debt WHOOP calculates from them",
      "Day strain",
      "Workout strain, with heart-rate zones and altitude gain",
      "Which WHOOP account this is, so you can tell two apart",
    ],
    sends: "Nothing. This connection only reads.",
    absent: [
      "No GPS track. WHOOP's API has none, so nothing imported from here can draw a map.",
      "No step count. WHOOP does not report one.",
    ],
    delivery:
      "A reading has to reach WHOOP's own cloud before ICEFALL can see it, so it appears after your band has synced.",
    vendorCap:
      "WHOOP allows a new app ten members until it approves it, so the first ten people to connect would be the only ones who could.",
    obligation:
      "WHOOP's terms require its data to be encrypted where it is stored, and forbid competing with WHOOP or selling WHOOP data. Every token is encrypted before it is written, ICEFALL charges only for its own features, and no WHOOP reading leaves ICEFALL.",
    needsCredentials:
      "ICEFALL has not registered with WHOOP yet, so there is nothing here to connect to. WHOOP's developer dashboard is self-serve — no approval is needed to start — so this is waiting on ICEFALL. The connection itself is built.",
  },

  withings: {
    provider: "withings",
    name: HEALTH_PROVIDER_NAME.withings,
    purpose: "Sleep, weight and blood pressure from Withings scales and watches.",
    reads: [
      "Sleep summaries — stages, overnight heart-rate variability, and the apnea index",
      "Weight and body composition",
      "Blood pressure and heart rate",
      "Activity and workouts",
    ],
    sends: "Nothing. This connection only reads.",
    absent: [
      "ECG is not asked for. Withings can send one; ICEFALL has no screen for a cardiogram and no business holding one, so the permission is never requested.",
    ],
    delivery:
      "Withings tells ICEFALL when something has changed, and ICEFALL never asks unprompted — its terms require that. So there is no “check now” button on this card, and there will not be one.",
    vendorCap:
      "Withings runs a new app in restricted mode — ten linked accounts — until it lifts it.",
    obligation:
      "Withings' terms allow queries only in response to something the person did, and require its webhooks rather than polling. ICEFALL registers those webhooks when you connect and has no scheduled fetch anywhere.",
    needsCredentials:
      "ICEFALL has not registered with Withings yet, so there is nothing here to connect to. Withings' developer sign-up is self-serve, so this is waiting on ICEFALL. The connection itself is built.",
  },

  oura: {
    provider: "oura",
    name: HEALTH_PROVIDER_NAME.oura,
    purpose: "Readiness, sleep and heart-rate variability from an Oura ring.",
    reads: [
      "Readiness",
      "Sleep, and the stages within it",
      "Heart-rate variability — Oura's overnight average",
      "Resting heart rate",
      "Blood oxygen",
      "Stress and resilience",
      "VO2 max",
      "Workouts, without a route",
    ],
    sends: "Nothing. This connection only reads.",
    absent: [
      "No GPS route on an Oura workout — the ring has no GPS.",
      "Oura data would need an Oura membership, which is separate from owning the ring.",
    ],
    delivery:
      "Oura's sleep only reaches their cloud when you open the Oura app, so last night can legitimately arrive a day late. ICEFALL says when a reading was measured rather than implying it is from this morning.",
    vendorCap: "Oura allows a new app ten users until it reviews it.",
    obligation:
      "Everything above is built and none of it is switched on. The two unresolved terms are held in three separate places in ICEFALL's code — the app, the connection path and the server — so no single change can switch Oura on by accident.",
    needsCredentials:
      "ICEFALL has not registered with Oura, and would not switch this on if it had — see above.",
  },
};

/** Iteration helper so a screen never hand-writes the order. */
export function healthVendor(provider: HealthProvider): HealthVendorCopy {
  return HEALTH_VENDORS[provider];
}
