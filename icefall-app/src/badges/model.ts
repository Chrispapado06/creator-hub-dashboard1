import type { Status } from "@/components/settings/kit";
import type { SettingsState } from "@/settings/store";
import type { TierId } from "@/growth/tiers";

/**
 * ICEFALL badges.
 *
 * Five, and only five. A badge here is a claim ICEFALL makes about somebody to
 * other people who might climb with them, which is a heavier thing than a
 * points-and-levels achievement — those live separately in the achievement
 * catalogue and are earned by your own activity.
 *
 * ── The rule the whole file exists to enforce ────────────────────────────────
 *
 * **No badge can be granted by this app.** Every one of them asserts something
 * ICEFALL would have to check — an identity, a qualification, a company's
 * insurance — and there is no backend to check anything. So the only states
 * reachable from the client are "not applied" and "under review". `approved`
 * exists in the type because a server will one day set it, and nothing in the
 * app writes it.
 *
 * That is not a limitation to work around. A guide badge on a mountaineering
 * app is a statement that someone is safe to follow onto a glacier.
 */

export type BadgeId = "verified" | "sherpa" | "guide" | "company" | "community";

export interface BadgeSpec {
  id: BadgeId;
  name: string;
  /** The one-line description, as it reads under the name. */
  tagline: string;
  /** The fuller explanation on the badge's own page. */
  about: string;
  /** Hex fill and stroke, in oklch to match the palette. */
  fill: string;
  stroke: string;
  /** Requires an active paid plan even to apply. */
  proOnly?: boolean;
  /** Earned by what other people do, so there is nothing to apply for. */
  earnedNotApplied?: boolean;
  /** Where applying happens. */
  applyPath?: string;
}

export const BADGES: BadgeSpec[] = [
  {
    id: "verified",
    name: "Verified",
    tagline: "Identity & profile verified",
    about:
      "Your identity and profile have been reviewed and verified by ICEFALL. It says the person is who they say they are — it does not say they are experienced, qualified or safe to climb with.",
    fill: "oklch(0.48 0.13 250)",
    stroke: "oklch(0.72 0.15 250)",
    proOnly: true,
    applyPath: "/settings/verification",
  },
  {
    id: "sherpa",
    name: "Sherpa",
    tagline: "Recognised mountain expert",
    about:
      "Awarded to athletes with exceptional experience and valuable contributions to the mountain community. Reviewed by ICEFALL — never granted from what someone says about themselves.",
    fill: "oklch(0.52 0.10 68)",
    stroke: "oklch(0.75 0.12 72)",
    applyPath: "/settings/professional/sherpa",
  },
  {
    id: "guide",
    name: "Guide",
    tagline: "ICEFALL approved guide",
    about:
      "An approved professional mountain guide, issued after a review of qualifications, insurance and experience. ICEFALL expects IFMGA/UIAGM certification or a recognised national equivalent for technical and glaciated terrain.",
    fill: "oklch(0.44 0.09 150)",
    stroke: "oklch(0.68 0.12 150)",
    applyPath: "/settings/professional/guide",
  },
  {
    id: "company",
    name: "Expedition company",
    tagline: "Verified expedition partner",
    about:
      "A verified expedition company operating on mountains worldwide, earned after company verification — registration, insurance and licensing.",
    fill: "oklch(0.45 0.12 305)",
    stroke: "oklch(0.70 0.14 305)",
    applyPath: "/settings/professional/company",
  },
  {
    id: "community",
    name: "Community favourite",
    tagline: "Earned from the community",
    about:
      "Earned by receiving likes and positive engagement from the community on your activities and posts. There is nothing to apply for — it arrives on its own.",
    fill: "oklch(0.46 0.11 300)",
    stroke: "oklch(0.72 0.13 300)",
    earnedNotApplied: true,
  },
];

export const badgeById = (id: BadgeId) => BADGES.find((b) => b.id === id)!;

export const BADGES_INTRO =
  "Badges highlight your achievements, experience and contributions to the mountain community.";

/**
 * Said wherever a badge is explained.
 *
 * A badge is evidence that ICEFALL checked one specific thing. It is never
 * evidence that a person is safe, fit, or right for your mountain — that
 * judgement stays with the two people roping up.
 */
export const BADGE_LIMIT_NOTICE =
  "A badge records that ICEFALL checked one specific thing. It is not a judgement that someone is safe, medically fit, or qualified for a particular climb, and it is never a substitute for asking directly what somebody has actually done.";

export const BADGE_NOT_BUILT_NOTICE =
  "No badge can be awarded yet: reviewing an identity, a qualification or a company needs people and a server ICEFALL does not have. Applications are stored on this device so the flow is real, and nothing is sent anywhere.";

/* -------------------------------------------------------------------------- */
/* State                                                                      */
/* -------------------------------------------------------------------------- */

export type BadgeState =
  | { kind: "earned" }
  /** Applied, waiting on a review that cannot happen yet. */
  | { kind: "pending" }
  | { kind: "declined" }
  /** Can be applied for right now. */
  | { kind: "open" }
  /** Needs a paid plan before applying. */
  | { kind: "locked-pro" }
  /** Nothing to apply for; it arrives from other people. */
  | { kind: "community" };

export function badgeState(
  badge: BadgeSpec,
  settings: SettingsState,
  tier: TierId,
): BadgeState {
  if (badge.earnedNotApplied) return { kind: "community" };

  const application: { status: Status } =
    badge.id === "verified"
      ? settings.verification.identity
      : badge.id === "sherpa"
        ? settings.sherpa
        : badge.id === "guide"
          ? settings.guide
          : settings.company;

  if (application.status === "approved") return { kind: "earned" };
  if (application.status === "pending") return { kind: "pending" };
  if (application.status === "declined") return { kind: "declined" };
  if (badge.proOnly && tier === "free") return { kind: "locked-pro" };
  return { kind: "open" };
}

export const BADGE_STATE_LABEL: Record<BadgeState["kind"], string> = {
  earned: "Earned",
  pending: "Under review",
  declined: "Declined",
  open: "Apply",
  "locked-pro": "Pro only",
  community: "Earned from the community",
};

/** The badges to show as a row on a profile: earned first, then pending. */
export function visibleBadges(settings: SettingsState, tier: TierId): BadgeSpec[] {
  return BADGES.filter((b) => {
    const s = badgeState(b, settings, tier).kind;
    return s === "earned" || s === "pending";
  });
}
