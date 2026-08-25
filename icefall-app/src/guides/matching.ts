import { EXPERIENCE_LABELS, type ExperienceLevel } from "@/network/types";
import { AVAILABILITY_LABELS, SPECIALITY_LABELS, type Guide, type Speciality } from "./types";

/**
 * Guide compatibility.
 *
 * Pure: no React, no state, no clock, no network. Given a request and a guide it
 * returns a number, the working behind it, and one line naming the real reason.
 * Structurally this is `@/network/matching` — same factor shape, same
 * renormalisation, same refusal to score an unknown as a zero — because the two
 * numbers appear side by side in the app and must behave identically.
 *
 * WHAT THE NUMBER IS
 *
 * `GUIDE_MATCH_CAPTION` is the only caption permitted on it: ICEFALL
 * compatibility. It compares what a client asked for against what a guide has
 * listed, and that is the whole of it.
 *
 * WHAT THE NUMBER IS NOT
 *
 * It is not a safety judgement, a vetting result, an endorsement, or an opinion
 * about whether a client should be on that mountain with that person. ICEFALL
 * checks nothing: not a licence, not an insurance certificate, not a single
 * ascent claimed on a profile. A guide scoring 94 has listed a lot of ascents of
 * the mountain in question. Nothing about that sentence is a promise about the
 * day. `GUIDE_MATCH_DISCLAIMER` must appear wherever the score does, and no
 * screen may caption it "safe to climb with" or anything a reader could mistake
 * for it.
 *
 * WHAT IT SCORES, AND WHY IT IS WEIGHTED THIS WAY
 *
 * Recorded ascents of THIS mountain dominate at 0.34. A guide who has been up
 * the objective twenty times knows the descent in cloud, the hut warden and the
 * hour the couloir starts moving; a guide with an identical licence who has
 * never been on it does not. That is the product thesis, and it is enforced by
 * `NO_ASCENTS_CEILING` rather than by copy.
 *
 * Availability is second at 0.22 and caps the total hard when the guide is not
 * taking work, because everything else is moot if they cannot come.
 *
 * NOTHING here scores popularity, response speed, how much a guide charges
 * relative to others, or how many clients they have taken. Rate is scored only
 * against a budget the client set, and only at 0.03.
 *
 * MISSING DATA IS NEVER A ZERO
 *
 * A factor either has both sides to compare or it is dropped and the remaining
 * weights renormalise. Dropped factors are still returned carrying `weight: 0`,
 * and a UI must test the weight and render the note rather than an empty bar.
 * "No recorded ascents of Mont Blanc" is NOT a dropped factor — it is a real
 * comparison with a low result, and its note says which it is.
 */

/* -------------------------------------------------------------------------- */
/* Public shape                                                                */
/* -------------------------------------------------------------------------- */

export type GuideMatchFactorId =
  | "mountain"
  | "availability"
  | "technical"
  | "experience"
  | "language"
  | "group"
  | "budget";

export interface GuideMatchFactor {
  id: string;
  label: string;
  /**
   * The weight ACTUALLY APPLIED, after renormalisation over the factors that
   * could be computed. Across one result these sum to 1.
   *
   * `weight === 0` means the factor was dropped: one side or the other had
   * nothing to compare. Its `score` is then meaningless filler, so a UI MUST
   * test the weight and render the note — a dropped factor drawn as an empty
   * bar reads as "scored nothing", which is the one thing it does not mean.
   */
  weight: number;
  /** 0–100. Only meaningful when `weight > 0`. */
  score: number;
  /** Convenience for a UI: the factor scored at or above `GUIDE_FACTOR_MET_AT`. Never a verdict. */
  met: boolean;
  note: string;
}

export interface GuideMatch {
  /** 0–100, rounded. When every factor was dropped this is 0 and the headline says so. */
  score: number;
  factors: GuideMatchFactor[];
  /** The real reason, in one line. Always renderable, even at zero. */
  headline: string;
}

/** What a client is asking for. Every field but the mountain is optional. */
export interface GuideRequestCriteria {
  peakName: string;
  elevationM: number;
  fromIso?: string;
  toIso?: string;
  groupSize?: number;
  experience?: string;
  languages?: string[];
  maxDailyRateEur?: number;
}

/**
 * The nominal weights, exported so a UI can show its working.
 *
 * These are what a factor is worth when everything is known; the applied weight
 * on each returned factor is this figure renormalised over the factors that
 * survived, which is why both are exposed.
 */
export const GUIDE_MATCH_WEIGHTS: Record<GuideMatchFactorId, number> = {
  mountain: 0.34,
  availability: 0.22,
  technical: 0.16,
  experience: 0.12,
  language: 0.08,
  group: 0.05,
  budget: 0.03,
};

export const GUIDE_MATCH_FACTOR_LABELS: Record<GuideMatchFactorId, string> = {
  mountain: "Experience on this mountain",
  availability: "Availability",
  technical: "Suitability for the ground",
  experience: "Depth against your experience",
  language: "Language",
  group: "Party size",
  budget: "Day rate",
};

/** The only caption this number may carry. */
export const GUIDE_MATCH_CAPTION = "ICEFALL compatibility";

export const GUIDE_MATCH_DISCLAIMER =
  "ICEFALL compatibility compares what you asked for against what this guide has listed. It is not a safety judgement, not a vetting result and not an endorsement: ICEFALL checks no licence, no insurance and no ascent claimed on any profile. Verify the qualification with the issuing body, and speak to the guide before you commit.";

/** Where a single factor starts reading as "yes" rather than "partly". */
export const GUIDE_FACTOR_MET_AT = 60;

/**
 * Hard ceiling when the guide is not taking work.
 *
 * Availability is worth 0.22 on its own, which is not enough: a guide who
 * cannot come is not a 70% match however perfectly the rest lines up, and a
 * client scanning a list should never have to read the small print to work out
 * why the top result is unbookable.
 */
export const UNAVAILABLE_CEILING = 15;

/**
 * Ceiling when the guide has no recorded ascents of the objective.
 *
 * A single recorded ascent scores the mountain factor 58, so a guide with one
 * ascent and everything else perfect reaches 86, and one with one ascent and a
 * middling profile still lands in the fifties. 45 therefore sits below any
 * plausible guide who has been on the mountain, and no amount of language,
 * budget and availability can buy a way past the mountain itself.
 *
 * Deliberately NOT zero: a guide with the right licence and no ascents of this
 * particular peak is a legitimate choice, and somebody has to be first on every
 * route. The ceiling holds them off the top of the list; it does not remove them.
 *
 * APPLIED BY COMPRESSION, not by `Math.min` — see `compressTo`.
 */
export const NO_ASCENTS_CEILING = 45;

/**
 * Ceiling when no objective was named at all.
 *
 * A different statement from the one above. "No ascents of Denali" is something
 * ICEFALL knows; "no mountain given" is something it does not, so the guide is
 * neither ranked as a strong match nor pushed below one known to have never
 * been on the peak. Without it, a search with no objective drops the mountain,
 * technical and party-size factors and scores every guide who is taking work at
 * 100 — a confident number resting entirely on a status flag.
 */
export const UNKNOWN_OBJECTIVE_CEILING = 50;

/**
 * Brings a total under a ceiling while keeping the order below it.
 *
 * `Math.min` was the obvious implementation and it was wrong here. Clamping
 * pinned every guide without an ascent of the objective to exactly 45, so a
 * ranked list fell back to its alphabetical tie-break and told a client that
 * six quite different guides were equally suitable. Scaling keeps the ceiling
 * absolute — nothing capped can ever reach a guide who has been on the
 * mountain — while preserving the differences the model did measure.
 */
function compressTo(raw: number, ceiling: number): number {
  return (raw / 100) * ceiling;
}

/* -------------------------------------------------------------------------- */
/* Thresholds                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Recorded ascents → score, banded rather than continuous.
 *
 * Banded for the same reason `@/network/matching` bands distance: the counts
 * are self-reported and approximate, and a smooth curve over them would imply a
 * precision nobody has. The step from none to one is the largest in the table
 * because it is the largest in reality.
 */
const ASCENT_BANDS: { atLeast: number; score: number }[] = [
  { atLeast: 20, score: 100 },
  { atLeast: 10, score: 92 },
  { atLeast: 5, score: 82 },
  { atLeast: 2, score: 70 },
  { atLeast: 1, score: 58 },
];

/** Lists the mountain as ground they work, but records no ascent of it. */
const MOUNTAIN_LISTED_SCORE = 30;

const AVAILABILITY_SCORE: Record<Guide["availability"], number> = {
  available: 100,
  limited: 55,
  unavailable: 0,
};

/**
 * What the ground normally demands, by altitude band.
 *
 * A rough, honest banding of the objective — not a grade of the route, which
 * ICEFALL does not hold. `maxPartyPerGuide` is ICEFALL's own published guidance
 * (see `UNIVERSAL` in `@/services/expeditionAccess`: 1:1 or 1:2 on technical
 * ground), not a limit any guide has told us about.
 */
interface TechnicalBand {
  id: string;
  label: string;
  fromM: number;
  expects: Speciality[];
  maxPartyPerGuide: number;
}

const TECHNICAL_BANDS: TechnicalBand[] = [
  {
    id: "high-altitude",
    label: "high altitude",
    fromM: 6000,
    expects: ["high-altitude", "mountaineering", "glacier"],
    maxPartyPerGuide: 2,
  },
  {
    id: "high-alpine",
    label: "high alpine",
    fromM: 4500,
    expects: ["mountaineering", "glacier", "high-altitude", "mixed"],
    maxPartyPerGuide: 2,
  },
  {
    id: "alpine",
    label: "glaciated alpine",
    fromM: 3000,
    expects: ["mountaineering", "glacier", "ice", "mixed", "ski-mountaineering"],
    maxPartyPerGuide: 2,
  },
  {
    id: "mountain",
    label: "mountain walking and scrambling",
    fromM: 0,
    expects: ["trekking", "winter", "rock", "mountaineering"],
    maxPartyPerGuide: 6,
  },
];

/**
 * Ceiling on the technical factor when the guide has not guided as high as the
 * objective. Not a disqualification — everyone's highest day was once their
 * first — but a client is owed the gap before they read a strong score.
 */
const ALTITUDE_GAP_CEILING = 45;

/**
 * Years guiding a client at each self-declared level would reasonably expect.
 *
 * Rough, and said to be rough in the note. It exists because "experience level
 * fit" has to compare against something, and years plus expeditions led is the
 * only depth ICEFALL holds. It measures nothing about teaching, patience or
 * whether a guide enjoys a first-timer's day — the three things that actually
 * decide whether a beginner has a good week.
 */
const EXPERIENCE_EXPECTED_YEARS: Record<ExperienceLevel, number> = {
  beginner: 4,
  intermediate: 6,
  advanced: 9,
  expert: 12,
};

/** Never zero: a newer guide is a lesser depth match, not an incompatibility. */
const EXPERIENCE_FLOOR = 30;

/**
 * Free text → the network's experience scale.
 *
 * NOTE ON "advanced": it means the third rung here and the FOURTH — top — rung
 * on the onboarding scale in `@/types`. This map reads it as the third, which
 * expects slightly less depth of a guide. Callers holding an onboarding level
 * should convert with `experienceFromAppLevel` from `@/network/types` first
 * rather than passing the raw string.
 */
const EXPERIENCE_ALIASES: Record<string, ExperienceLevel> = {
  beginner: "beginner",
  new: "beginner",
  novice: "beginner",
  intermediate: "intermediate",
  developing: "intermediate",
  advanced: "advanced",
  experienced: "advanced",
  expert: "expert",
};

const BUDGET_BANDS: { overBy: number; score: number }[] = [
  { overBy: 0, score: 100 },
  { overBy: 0.1, score: 70 },
  { overBy: 0.25, score: 40 },
];
/** A rate over budget is a conversation, not a wall — day rates are negotiable. */
const BUDGET_FAR_SCORE = 10;

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDay(iso: string | undefined): number | null {
  if (typeof iso !== "string" || iso.trim().length === 0) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const metres = (m: number) => `${Math.round(m).toLocaleString("en-GB")} m`;

function monthRange(fromIso?: string, toIso?: string): string | null {
  const from = parseDay(fromIso);
  const to = parseDay(toIso);
  if (from === null) return null;
  const fmt = (t: number) =>
    new Date(t).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  if (to === null || fmt(to) === fmt(from)) return fmt(from);
  return `${fmt(from)} to ${fmt(to)}`;
}

function bandFor(elevationM: number): TechnicalBand | null {
  if (!Number.isFinite(elevationM) || elevationM <= 0) return null;
  // Ordered high to low, so the first match is the tightest band that applies.
  return TECHNICAL_BANDS.find((b) => elevationM >= b.fromM) ?? null;
}

/**
 * Recorded ascents of this peak.
 *
 * Matched on a normalised name so "Mont Blanc" finds "mont blanc"; nothing
 * cleverer, because unlike `@/network/matching` there are no coordinates on
 * either side here to resolve alternative names with. A peak the guide records
 * under another name therefore reads as zero, and the note says "no recorded
 * ascents", which is exactly what ICEFALL knows.
 */
function ascentsOf(guide: Guide, peakName: string): number | null {
  const wanted = normaliseName(peakName);
  if (wanted.length === 0) return null;
  for (const [name, count] of Object.entries(guide.ascentsByMountain)) {
    if (normaliseName(name) === wanted) {
      return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
    }
  }
  return 0;
}

function listsMountain(guide: Guide, peakName: string): boolean {
  const wanted = normaliseName(peakName);
  return guide.mountains.some((m) => normaliseName(m) === wanted);
}

/* -------------------------------------------------------------------------- */
/* Factor outcomes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * `score === null` means the factor could not be computed and is dropped from
 * the total. It never means zero, and no branch below may conflate the two.
 */
interface FactorOutcome {
  score: number | null;
  note: string;
}

/* ---- Mountain ------------------------------------------------------------ */

function mountainFactor(guide: Guide, peakName: string, ascents: number | null): FactorOutcome {
  if (ascents === null) {
    return {
      score: null,
      note: "No objective named, so there is no mountain to compare experience on.",
    };
  }

  if (ascents === 0) {
    // A genuine measured absence, not an unknown: ICEFALL holds this guide's
    // ascent record and this mountain is not in it.
    return {
      score: listsMountain(guide, peakName) ? MOUNTAIN_LISTED_SCORE : 0,
      note: listsMountain(guide, peakName)
        ? `Lists ${peakName} as ground they work, but records no ascents of it. Ask how many times they have been up, and when.`
        : `No recorded ascents of ${peakName}, and does not list it among the mountains they work. Self-reported either way — ICEFALL has confirmed nothing.`,
    };
  }

  const band = ASCENT_BANDS.find((b) => ascents >= b.atLeast);

  return {
    score: band ? band.score : MOUNTAIN_LISTED_SCORE,
    note: `${ascents} recorded ascent${ascents === 1 ? "" : "s"} of ${peakName}. Self-reported by the guide; ICEFALL has not checked it.`,
  };
}

/* ---- Availability -------------------------------------------------------- */

function availabilityFactor(guide: Guide, fromIso?: string, toIso?: string): FactorOutcome {
  const when = monthRange(fromIso, toIso);

  // Said plainly every time: ICEFALL holds no diary for anybody, so this is a
  // standing status and not a check of the client's dates. Scoring a flag and
  // captioning it "available on your dates" is how somebody books flights.
  const provenance =
    when === null
      ? "A standing status the guide set, not a diary — ICEFALL holds no calendar for anyone."
      : `You asked about ${when}. This is the guide's standing status, not a check of those dates — ICEFALL holds no calendar for anyone, so confirm the dates with them.`;

  return {
    score: AVAILABILITY_SCORE[guide.availability],
    note: `${AVAILABILITY_LABELS[guide.availability]}. ${provenance}`,
  };
}

/* ---- Technical ----------------------------------------------------------- */

function technicalFactor(guide: Guide, elevationM: number): FactorOutcome {
  const band = bandFor(elevationM);
  if (!band) {
    return {
      score: null,
      note: "No height recorded for the objective, so there is no band to compare against.",
    };
  }

  const covered = band.expects.filter((s) => guide.specialities.includes(s));
  const raw = (covered.length / band.expects.length) * 100;

  const missingAltitude =
    Number.isFinite(guide.highestGuidedM) && guide.highestGuidedM < elevationM;

  const listed =
    covered.length > 0
      ? `Lists ${joinList(covered.map((s) => SPECIALITY_LABELS[s].toLowerCase()))}.`
      : `Lists ${joinList(guide.specialities.map((s) => SPECIALITY_LABELS[s].toLowerCase()))} — none of what ${band.label} ground normally asks for.`;

  const framing =
    "A comparison of what the guide lists against what this band of ground normally demands. It is not a judgement that they are suitable for you, or that you are ready for the route.";

  if (missingAltitude) {
    return {
      score: Math.min(raw, ALTITUDE_GAP_CEILING),
      note: `${listed} Records no guiding above ${metres(guide.highestGuidedM)}, and the objective is ${metres(elevationM)} — ask about that gap. ${framing}`,
    };
  }

  return {
    score: raw,
    note: `${listed} Records guiding to ${metres(guide.highestGuidedM)}, at or above the objective's ${metres(elevationM)}. ${framing}`,
  };
}

/* ---- Experience ---------------------------------------------------------- */

function experienceFactor(guide: Guide, experience?: string): FactorOutcome {
  const key = (experience ?? "").trim().toLowerCase();
  const level = EXPERIENCE_ALIASES[key];

  if (!level) {
    return {
      score: null,
      note:
        key.length === 0
          ? "You have not said where you are in your climbing, so there is nothing to fit a guide's depth against."
          : `"${experience}" is not a level this can read, so depth was not scored.`,
    };
  }

  const expected = EXPERIENCE_EXPECTED_YEARS[level];
  const raw = (guide.yearsGuiding / expected) * 100;
  const score = Math.max(EXPERIENCE_FLOOR, Math.min(100, raw));

  return {
    score,
    note: `You describe yourself as ${EXPERIENCE_LABELS[level].toLowerCase()}. ${guide.yearsGuiding} years guiding and ${guide.expeditionsLed} trips led, against the ${expected} years that level would usually look for. A rough depth comparison only — it says nothing about how well anyone teaches, and your level is self-declared.`,
  };
}

/* ---- Language ------------------------------------------------------------ */

function languageFactor(guide: Guide, languages?: string[]): FactorOutcome {
  const wanted = (languages ?? []).map((l) => l.trim()).filter((l) => l.length > 0);

  if (wanted.length === 0) {
    return { score: null, note: "You have not said which languages you need." };
  }

  const theirs = guide.languages.map((l) => l.toLowerCase());
  const shared = wanted.filter((l) => theirs.includes(l.toLowerCase()));

  // Binary on purpose. One shared language is the whole requirement — you can
  // be understood on the ridge — and a second adds nothing a client should be
  // ranked on. Partial credit here would let a second language outweigh an
  // ascent count, which is the wrong trade.
  return {
    score: shared.length > 0 ? 100 : 0,
    note:
      shared.length > 0
        ? `You share ${joinList(shared)}. Speaks ${joinList(guide.languages)}.`
        : `Speaks ${joinList(guide.languages)}; you asked for ${joinList(wanted)}. Nothing in common on record.`,
  };
}

/* ---- Party size ---------------------------------------------------------- */

function groupFactor(elevationM: number, groupSize?: number): FactorOutcome {
  if (groupSize === undefined || !Number.isFinite(groupSize) || groupSize < 1) {
    return { score: null, note: "You have not said how many of you there are." };
  }

  const band = bandFor(elevationM);
  if (!band) {
    return {
      score: null,
      note: "No height recorded for the objective, so there is no ratio to compare your party against.",
    };
  }

  const size = Math.trunc(groupSize);
  const max = band.maxPartyPerGuide;

  // Scored against ICEFALL's own guidance for the ground, NOT against anything
  // the guide told us: no ratio is held for any guide, and inventing one would
  // be the most dangerous fabrication on this screen.
  const provenance = `ICEFALL holds no client ratio for this guide. This compares your party against the 1:${max} ratio ${band.label} ground normally warrants — agree the real ratio with the guide in writing.`;

  if (size <= max) return { score: 100, note: `${size} of you, within 1:${max}. ${provenance}` };
  if (size <= max * 2) {
    return {
      score: 45,
      note: `${size} of you, over the 1:${max} this ground warrants — a second guide is the usual answer. ${provenance}`,
    };
  }
  return {
    score: 15,
    note: `${size} of you is well over the 1:${max} this ground warrants, and needs more than one guide. ${provenance}`,
  };
}

/* ---- Budget -------------------------------------------------------------- */

function budgetFactor(guide: Guide, maxDailyRateEur?: number): FactorOutcome {
  if (maxDailyRateEur === undefined || !Number.isFinite(maxDailyRateEur) || maxDailyRateEur <= 0) {
    return { score: null, note: "You have not set a daily budget." };
  }

  const over = (guide.dailyRateEur - maxDailyRateEur) / maxDailyRateEur;
  const band = BUDGET_BANDS.find((b) => over <= b.overBy);
  const rate = `€${guide.dailyRateEur.toLocaleString("en-GB")} a day against your €${Math.round(maxDailyRateEur).toLocaleString("en-GB")}`;

  return {
    score: band ? band.score : BUDGET_FAR_SCORE,
    // A day rate is not a price. Saying so here stops the number reading as a
    // quote — permits, huts, lifts, insurance and travel routinely double it.
    note: `${rate}. A day rate only: permits, huts, lifts, the guide's expenses and your travel are normally on top, so ask what a full itinerary comes to.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Headline                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One line naming the actual reason, never a grade or an adjective about a
 * person. "Nineteen ascents of Denali" is a fact a client can act on;
 * "Excellent guide" is flattery, and flattery about the person holding your
 * rope is exactly what nobody needs.
 */
function headlineFor(guide: Guide, peakName: string, ascents: number | null): string {
  if (guide.availability === "unavailable") return "Not taking work";
  if (ascents === null) return "No objective set";
  if (ascents === 0) {
    return listsMountain(guide, peakName)
      ? `Works ${peakName}, no ascents recorded`
      : `No recorded ascents of ${peakName}`;
  }
  const scale =
    ascents >= 20 ? "Deep experience on" : ascents >= 5 ? "Experienced on" : "Has climbed";
  return `${scale} ${peakName} · ${ascents} recorded`;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export function guideMatch(args: GuideRequestCriteria, guide: Guide): GuideMatch {
  const peakName = args.peakName.trim();
  const ascents = ascentsOf(guide, peakName);

  const outcomes: { id: GuideMatchFactorId; outcome: FactorOutcome }[] = [
    { id: "mountain", outcome: mountainFactor(guide, peakName, ascents) },
    { id: "availability", outcome: availabilityFactor(guide, args.fromIso, args.toIso) },
    { id: "technical", outcome: technicalFactor(guide, args.elevationM) },
    { id: "experience", outcome: experienceFactor(guide, args.experience) },
    { id: "language", outcome: languageFactor(guide, args.languages) },
    { id: "group", outcome: groupFactor(args.elevationM, args.groupSize) },
    { id: "budget", outcome: budgetFactor(guide, args.maxDailyRateEur) },
  ];

  // Renormalise over what could actually be computed. An unanswered question is
  // not a zero, and dividing by the full weight table would silently punish
  // every guide for the fields the client left blank.
  const appliedWeight = outcomes.reduce(
    (sum, o) => (o.outcome.score === null ? sum : sum + GUIDE_MATCH_WEIGHTS[o.id]),
    0,
  );

  const factors: GuideMatchFactor[] = outcomes.map(({ id, outcome }) => {
    const label = GUIDE_MATCH_FACTOR_LABELS[id];
    if (outcome.score === null || appliedWeight === 0) {
      return { id, label, weight: 0, score: 0, met: false, note: `Not counted. ${outcome.note}` };
    }
    return {
      id,
      label,
      weight: GUIDE_MATCH_WEIGHTS[id] / appliedWeight,
      score: Math.round(outcome.score),
      met: outcome.score >= GUIDE_FACTOR_MET_AT,
      note: outcome.note,
    };
  });

  const raw =
    appliedWeight === 0
      ? 0
      : outcomes.reduce(
          (sum, o) =>
            o.outcome.score === null
              ? sum
              : sum + (GUIDE_MATCH_WEIGHTS[o.id] / appliedWeight) * o.outcome.score,
          0,
        );

  // The ceilings, applied last so nothing downstream can undo them. All three
  // are minimums, so a guide who is both unavailable and has never been on the
  // mountain lands on the lower of the two.
  let capped = raw;
  if (ascents === null) capped = compressTo(capped, UNKNOWN_OBJECTIVE_CEILING);
  if (ascents === 0) capped = compressTo(capped, NO_ASCENTS_CEILING);
  // Clamped rather than compressed: a guide who cannot come is not more or less
  // unbookable depending on their languages, so there is no order left to keep.
  if (guide.availability === "unavailable") capped = Math.min(capped, UNAVAILABLE_CEILING);

  const headline =
    appliedWeight === 0 ? "Nothing to compare yet" : headlineFor(guide, peakName, ascents);

  return {
    score: Math.round(Math.max(0, Math.min(100, capped))),
    factors,
    headline,
  };
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                    */
/* -------------------------------------------------------------------------- */

export interface RankedGuide {
  guide: Guide;
  match: GuideMatch;
}

/**
 * The organic order: relevance to the objective, availability, depth and
 * mountain expertise, which is precisely what `guideMatch` weighs.
 *
 * `featured` IS DELIBERATELY IGNORED HERE. Nothing is sold today, and when
 * something is, a paid slot must be rendered separately and labelled FEATURED
 * or SPONSORED rather than mixed into this list — a client cannot tell a bought
 * position from a qualification, so the two must never share a scale.
 *
 * Ties break on name, so the order is deterministic and cannot drift between
 * renders.
 */
export function rankGuides(args: GuideRequestCriteria, guides: Guide[]): RankedGuide[] {
  return guides
    .map((guide) => ({ guide, match: guideMatch(args, guide) }))
    .sort((a, b) => b.match.score - a.match.score || a.guide.name.localeCompare(b.guide.name));
}
