import type { Score } from "@/coach/types";
import type { ExperienceLevel as AppExperienceLevel } from "@/types";

/**
 * The Expedition Network model.
 *
 * READ THIS BEFORE ADDING ANYTHING TO THIS DIRECTORY.
 *
 * ICEFALL has no server, no user database and no other users. Nothing in this
 * module may be populated with an invented person — no sample athletes, no
 * seeded profiles, no "demo" flag that quietly turns fabricated people on. A
 * list with no real entries renders the empty state, because at zero users the
 * empty state is the correct and honest rendering of the network.
 *
 * That is not pedantry about mock data. Somebody could plan an alpine objective
 * around a partner who does not exist, and this feature's own safety copy is
 * about meeting strangers in the mountains. A fabricated climbing partner is
 * therefore not a placeholder; it is a hazard.
 *
 * Two further rules the shapes below enforce rather than merely describe:
 *
 *   1. ICEFALL VERIFIES NOTHING. There is no verification system, no vetting,
 *      no check of anyone's identity, qualifications, experience or safety.
 *      `AthleteProfile.verified` is typed as the literal `false` so that no
 *      code path can ever set it true, and it must render as nothing at all —
 *      no tick, no badge, no "verified" label anywhere.
 *   2. NOTHING IS DELIVERED. Connection requests, chat and group membership
 *      cannot function without a backend, so the models exist and the UI can be
 *      built, but every surface where a user would otherwise expect delivery
 *      must say plainly that the network is not connected and nothing was sent.
 */

/* -------------------------------------------------------------------------- */
/* The single local athlete                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The id of the person using this device.
 *
 * With no backend there is exactly one athlete here, so a constant is honest
 * and avoids the failure mode of a generated id: a profile created after an
 * expedition would carry a different id from the one recorded in `createdBy`,
 * and the athlete would find themselves not a member of the group they made.
 */
export const LOCAL_ATHLETE_ID = "local:you";

/* -------------------------------------------------------------------------- */
/* What people are here for                                                    */
/* -------------------------------------------------------------------------- */

export type LookingFor =
  | "expedition-partners"
  | "training-partners"
  | "hiking-partners"
  | "expedition-group"
  | "friends"
  | "networking";

/** One phrasing across the whole feature, so two screens cannot disagree. */
export const LOOKING_FOR_LABELS: Record<LookingFor, string> = {
  "expedition-partners": "Expedition partners",
  "training-partners": "Training partners",
  "hiking-partners": "Hiking partners",
  "expedition-group": "A group to join",
  friends: "Friends in the mountains",
  networking: "Networking",
};

/**
 * Self-declared standing, and nothing more.
 *
 * DISTINCT from `ExperienceLevel` in `@/types` ("new" | "developing" |
 * "experienced" | "advanced"), which is the onboarding scale. Two types with
 * one name is a footgun, so import this one explicitly and never assume a
 * string from one scale is valid in the other — use `experienceFromAppLevel`.
 */
export type ExperienceLevel = "beginner" | "intermediate" | "advanced" | "expert";

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

/**
 * Relabels the onboarding scale onto the network scale.
 *
 * A pure one-to-one rename of something the athlete already told us about
 * themselves. It infers nothing: no recorded session, summit or distance feeds
 * it, because none of those say what someone can do on technical ground.
 */
export function experienceFromAppLevel(level: AppExperienceLevel): ExperienceLevel {
  switch (level) {
    case "new":
      return "beginner";
    case "developing":
      return "intermediate";
    case "experienced":
      return "advanced";
    case "advanced":
      return "expert";
  }
}

/* -------------------------------------------------------------------------- */
/* Athletes                                                                    */
/* -------------------------------------------------------------------------- */

export interface AthleteProfile {
  id: string;
  displayName: string;
  bio?: string;
  /** The mountain, not the person, is what this network is organised around. */
  objective?: {
    peakName: string;
    elevationM: number;
    /** ISO date. The month matters far more than the day. */
    targetDate: string;
    /** Public position of the PEAK. Nothing personal — see `approxLocation`. */
    lat?: number;
    lon?: number;
  };
  experience?: ExperienceLevel;
  /**
   * Readiness for the objective above.
   *
   * SELF-REPORTED or DERIVED, never measured, and every surface that shows it
   * must say so. It is a `Score`, so it is either a value or the reason there
   * isn't one — a missing readiness is never rendered or scored as a zero.
   */
  readiness?: Score;
  /** Free text the athlete wrote about what they have done. Never parsed into a number. */
  previousObjectives: string[];
  lookingFor: LookingFor[];
  /**
   * Coarsened to roughly a 5 km grid before it is ever stored — see
   * `coarsen` in `./privacy`. NEVER a precise position, never an address, and
   * never rendered as a coordinate. Distance is shown banded, so repeated
   * readings cannot be differenced back into a home or a regular start point.
   */
  approxLocation?: { label: string; lat: number; lon: number };
  /** Free text, e.g. "Weekends", "June to August". */
  availability?: string[];
  /**
   * No verification system exists. Typed as the literal `false` so nothing can
   * set it otherwise; present only so the model is ready if one is ever built.
   * MUST RENDER AS NOTHING — a tick implies ICEFALL checked somebody, and
   * ICEFALL has checked nobody.
   */
  verified: false;
}

/* -------------------------------------------------------------------------- */
/* Expeditions                                                                 */
/* -------------------------------------------------------------------------- */

export type ExpeditionPrivacy = "public" | "invite-only";

/**
 * A group forming around one objective.
 *
 * `privacy` describes intent, not enforcement: with no backend there is nothing
 * to enforce it against and nobody who could see it either way. Say that on the
 * form rather than letting "invite-only" imply a door that is being held shut.
 */
export interface Expedition {
  id: string;
  peakName: string;
  elevationM?: number;
  window: { fromIso: string; toIso: string };
  sizeMin: number;
  sizeMax: number;
  experience: ExperienceLevel;
  lookingFor: LookingFor[];
  description?: string;
  privacy: ExpeditionPrivacy;
  /** Only ids that are really on this device. Never padded to look populated. */
  memberIds: string[];
  createdBy: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Connection requests                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A message the athlete has written to someone.
 *
 * `"queued"` IS THE ONLY STATUS, and it is a closed union on purpose. There is
 * no server, so nothing is transmitted, nothing is received, and no reply can
 * ever arrive. A `"sent"` or `"pending"` state would be the app telling the
 * athlete their message is in flight when it is sitting in localStorage — and
 * someone waiting on a reply that cannot come may believe a partner is arranged
 * for an objective they are about to leave for.
 *
 * The shape is the one a real backend would use, so wiring one up later does
 * not touch the screens. Adding a status before that backend exists does.
 */
export interface ConnectionRequest {
  id: string;
  toAthleteId: string;
  message: string;
  sentAt: string;
  status: "queued";
}

/**
 * The sentence that must appear wherever a user would expect delivery.
 *
 * Held here so every screen says the same thing: a softer paraphrase written
 * fresh on each surface is how "not connected" turns into "sending…".
 */
export const NETWORK_NOT_CONNECTED_NOTICE =
  "The Expedition Network is not connected. ICEFALL has no server and no other members yet, so nothing here is sent, nobody is notified, and no reply can arrive. What you write is saved on this device only.";
