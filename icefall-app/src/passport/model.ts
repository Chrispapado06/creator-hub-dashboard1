import type { Unavailable } from "@/coach/types";
import { assessObjectiveReadiness } from "@/coach/mountainReadiness";
import { MOUNTAINS } from "@/data/mock/mountains";
import { assessPeak, type PeakAssessment } from "@/services/peakAssessment";
import { activityById } from "@/tracking/activities";
import type { RecordedActivity } from "@/tracking/types";
import type { CoachProfile, SavedObjective } from "@/state/AppState";
import type { Expedition } from "@/network/types";
import type { ExperienceLevel, Goal, Summit } from "@/types";

/**
 * The MOUNTAIN PASSPORT — the athlete's mountaineering record as a document.
 *
 * This module holds no React. It assembles what ICEFALL actually knows about an
 * athlete's mountain life into the shape the passport pages render, and every
 * field it produces carries where it came from.
 *
 * ── THE RULE THIS FILE EXISTS TO ENFORCE ─────────────────────────────────────
 *
 * ICEFALL HAS NO VERIFICATION SYSTEM. There is no GPS-checked summit, no guide
 * attestation, no identity check, no operator confirming anybody stood anywhere.
 * A passport is a credential, and this one may well be shown to a guide or an
 * expedition company deciding whether someone is competent for an objective —
 * so a credential nobody checked is worse than no credential at all.
 *
 * Therefore:
 *
 *   · `Provenance` HAS a `verified` member and NOTHING IN THIS BUILD RETURNS IT.
 *     It is modelled because the day a real check exists (a guide signing an
 *     ascent, an operator confirming a permit) this is the seam it lands on. It
 *     is unreachable today, deliberately, and the UI must never render it as an
 *     achievable state.
 *   · Every summit is `user-added`. The athlete typed it in.
 *   · Every technical skill is `self-reported`. Skills are NEVER inferred from
 *     recorded activity — see mountainReadiness for the long-form argument.
 *   · Highest altitude has two possible provenances, `recorded` and
 *     `self-reported`, and the figure names which one it is.
 *   · A figure ICEFALL does not have resolves to null WITH a reason, never to a
 *     zero and never to a dash. The same contract the coach layer uses.
 *
 * Simulated recordings are excluded from every observed figure here, matching
 * src/coach/hooks.ts and mountainReadiness: they exist so the tracker can be
 * reviewed indoors, and a labelled simulation is not evidence of ground covered.
 */

/* -------------------------------------------------------------------------- */
/* Notices                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shown on the cover, inside the document and at the head of the Mountain CV.
 *
 * It is not boilerplate. The CV is the artefact somebody would actually hand to
 * a guide, and this paragraph is the only thing standing between a personal
 * logbook and a document that reads like a qualification.
 */
export const VERIFICATION_NOTICE =
  "ICEFALL verifies none of this. There is no checked summit, no guide attestation and no identity check behind this document: every summit was entered by the athlete, every skill is their own claim, and any altitude marked self-reported was typed in rather than measured. Read it as a personal logbook, not as a qualification. Anyone deciding whether this athlete is competent for an objective should ask them directly — and for glaciated or technical ground that judgement belongs to an IFMGA/UIAGM-certified guide, made in person.";

/** The word that goes on every summit stamp. Not "verified". Not "confirmed". */
export const SUMMIT_STAMP_LABEL = "User added";

/** Sits under the upcoming pages so a plan can never be read as a record. */
export const UPCOMING_NOTICE =
  "These are objectives, not ascents. Nothing on this page has been climbed, and none of it belongs among the stamps.";

/* -------------------------------------------------------------------------- */
/* Provenance                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Where a value came from.
 *
 * `verified` is unreachable in this build and must stay that way until an actual
 * check exists to set it. See the header.
 */
export type Provenance = "recorded" | "self-reported" | "user-added" | "verified";

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  recorded: "Recorded",
  "self-reported": "Self-reported",
  "user-added": "User added",
  verified: "Verified",
};

/* -------------------------------------------------------------------------- */
/* Altitude bands — derived, never re-typed                                    */
/* -------------------------------------------------------------------------- */

export interface PassportBandSpec {
  band: PeakAssessment["band"];
  label: string;
  shortLabel: string;
  /** The competences this class of ground normally demands. */
  skills: string[];
  floorM: number;
  /** null on the top band, which is open-ended. */
  ceilingM: number | null;
}

/** Fine enough to land exactly on peakAssessment's boundaries, all multiples of 100. */
const PROBE_STEP_M = 10;
const PROBE_MAX_M = 9000;

/**
 * The seven bands, read out of `assessPeak` rather than copied from it.
 *
 * peakAssessment owns the thresholds. Restating "band 4 starts at 2,900 m" here
 * would create a second table that drifts from the first the moment anyone tunes
 * one of them — and the passport would then file a summit under a class the rest
 * of the app disagrees with. Probing costs 900 pure calls, once, at module load.
 *
 * Latitude 0 is passed because band depends on elevation alone; latitude shapes
 * only the season window, which nothing here reads.
 */
export const BAND_SPECS: PassportBandSpec[] = (() => {
  const specs: PassportBandSpec[] = [];
  for (let m = 0; m <= PROBE_MAX_M; m += PROBE_STEP_M) {
    const assessment = assessPeak(m, 0);
    const last = specs[specs.length - 1];
    if (last && last.band === assessment.band) continue;
    if (last) last.ceilingM = m;
    specs.push({
      band: assessment.band,
      label: assessment.label,
      shortLabel: assessment.shortLabel,
      skills: assessment.skills,
      floorM: m,
      ceilingM: null,
    });
  }
  return specs;
})();

const bandOf = (elevationM: number): PeakAssessment["band"] => assessPeak(elevationM, 0).band;

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** Everything `useMountainImage` needs to find a photograph of the peak. */
export interface PassportPeakRef {
  name: string;
  elevationM?: number;
  lat?: number;
  lon?: number;
  curatedId?: string;
  wikipedia?: string;
  photo?: string;
}

export interface PassportIdentity {
  name: string;
  memberSince: string;
  /**
   * A local reference number, generated on this device from the athlete's name
   * and join date. It is NOT issued by anyone, it identifies nothing outside
   * this app, and the pages say so — a document number that looks official but
   * resolves to nothing is exactly the sort of prop this feature must not be.
   */
  expeditionId: string;
  /** The soonest active objective, or null when none is set. */
  currentObjective: { name: string; targetDate: string; elevationM?: number } | null;
}

export interface PassportAltitude {
  metres: number | null;
  /** Which of the two sources produced the figure. Never both at once. */
  source: "recorded" | "self-reported" | null;
  reason?: Unavailable;
  /** The other source, when it also holds a figure. Shown as a second line. */
  alsoRecordedM?: number;
  alsoReportedM?: number;
  /**
   * Set when a summit in the athlete's own log stands higher than the figure
   * above. Without it the document contradicts itself — a 4,167 m summit on one
   * page and "highest altitude 1,850 m" on another — and the reader has no way
   * to tell that the two sentences are answering different questions.
   */
  higherLoggedSummit?: { name: string; elevationM: number };
  note: string;
}

export interface PassportSession {
  title: string;
  typeLabel: string;
  distanceM: number | null;
  elevationGainM: number | null;
  movingSec: number | null;
  maxAltitudeM: number | null;
}

export interface PassportSummit {
  id: string;
  name: string;
  elevationM: number;
  /** ISO date the athlete recorded for the ascent. */
  date: string;
  band: PeakAssessment["band"];
  bandLabel: string;
  peak: PassportPeakRef;
  /** Always `user-added`. There is nothing else it could honestly be. */
  provenance: Provenance;
  /**
   * A non-simulated session recorded on the same local day, or null.
   *
   * MATCHED BY DATE ALONE. ICEFALL does not know that this recording IS the
   * ascent — nobody tagged it — so the page says "recorded that day" and never
   * "the ascent". Where nothing was recorded, the reason renders; no zeroes.
   */
  session: PassportSession | null;
  sessionReason: Unavailable;
}

export interface PassportBand extends PassportBandSpec {
  /**
   * Summits in the athlete's own log that fall in this band.
   *
   * null means ICEFALL has nothing to count at all (an empty log) and carries a
   * reason. Zero means the log is real and holds nothing in this band — which
   * the page renders as "no entry", never as the digit 0, because an empty band
   * says nothing about where the athlete has actually been.
   */
  entries: number | null;
  reason?: Unavailable;
  highest: { name: string; elevationM: number; date: string } | null;
}

export interface PassportSkill {
  label: string;
  /** True when the athlete has claimed it. Never inferred from activity. */
  reported: boolean;
}

export interface PassportSkillGroup {
  band: PeakAssessment["band"];
  label: string;
  floorM: number;
  skills: PassportSkill[];
}

export interface PassportTechnicalLevel {
  label: string | null;
  reason?: Unavailable;
  /** Always self-reported when a label exists. There is no other source. */
  provenance: Provenance;
  note: string;
}

export interface PassportExpeditions {
  count: number;
  note: string;
}

export interface PassportObjective {
  id: string;
  name: string;
  elevationM?: number;
  targetDate: string;
  /** The objective's own stored training-plan completion, 0–100. */
  preparation: number | null;
  classLabel: string | null;
  /** Readiness withheld or scored, straight from mountainReadiness. */
  readiness: { value: number | null; reason?: Unavailable };
  /** The dimension holding it back, when there is one. */
  limiting: string | null;
  requiresGuide: boolean;
  /**
   * True for a goal on a peak no human record backs. The page prints the
   * reason rather than a withheld score's generic copy: there is no class of
   * objective, no guide verdict and no readiness figure for it, and none of
   * the three may be derived from elevation in a booklet somebody may show a
   * guide. See `services/peakTier.ts`.
   */
  unsurveyed?: true;
}

export interface Passport {
  identity: PassportIdentity;
  highestAltitude: PassportAltitude;
  summits: PassportSummit[];
  /** Set when the summit log is empty — the pages render the reason. */
  summitsReason?: Unavailable;
  expeditions: PassportExpeditions;
  technicalLevel: PassportTechnicalLevel;
  /** Seven, ordered high to low, so the page reads as an altimeter. */
  bands: PassportBand[];
  skillGroups: PassportSkillGroup[];
  /** Claims that match nothing on ICEFALL's roster, surfaced verbatim. */
  extraSkills: string[];
  skillsReported: number;
  skillsRoster: number;
  upcoming: PassportObjective[];
  upcomingReason?: Unavailable;
  verificationNotice: string;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Local calendar key. NEVER toISOString(): a UTC key shifts the day for anyone
 * west of Greenwich after mid-afternoon, which would match an evening session to
 * the wrong summit. The same bug has already bitten the training week strip.
 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Shortest claim worth matching on, as in mountainReadiness. */
const MIN_CLAIM_CHARS = 4;

/**
 * Does a reported skill cover a roster entry?
 *
 * Deliberately the same conservative containment test `mountainReadiness` uses
 * for `skillClaimed`, so the passport and the coach credit an athlete's claims
 * identically. It is duplicated rather than imported because that helper is
 * private to the readiness module; if it is ever exported, delete this.
 */
function claimMatches(required: string, claims: string[]): boolean {
  const want = normalise(required);
  return claims.some((raw) => {
    const got = normalise(raw);
    if (got.length < MIN_CLAIM_CHARS) return false;
    return got === want || want.includes(got) || got.includes(want);
  });
}

/** Altitude figures outside this are sensor noise, not places anyone has been. */
const ALTITUDE_PLAUSIBLE_MIN_M = -500;
const ALTITUDE_PLAUSIBLE_MAX_M = 8900;

const ID_ALPHABET = "23456789ACDEFHJKLMNPRTUVWXY";

/**
 * A stable local reference for the document.
 *
 * FNV-1a over the athlete's name and join date, so the same athlete keeps the
 * same number across reloads and two athletes are unlikely to share one. It is a
 * label on a local document and nothing more — see `PassportIdentity`.
 */
function expeditionIdFor(name: string, memberSince: string): string {
  let hash = 0x811c9dc5;
  // The CALENDAR DATE only, never the full timestamp. `memberSince` carries a
  // time of day, and the demo athlete's is regenerated relative to now on every
  // load — seeding from it produced a record number that changed each time the
  // page was opened, which is not a record number. The cover and the identity
  // page both print this, so it has to be the same number every time.
  const seed = `${name.trim().toLowerCase()}|${memberSince.slice(0, 10)}`;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ID_ALPHABET[hash % ID_ALPHABET.length];
    // xorshift32 between characters, so the eight symbols are not a slide of
    // the same value with a visible pattern in it.
    hash ^= hash << 13;
    hash >>>= 0;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    hash >>>= 0;
  }
  return `IF-${out.slice(0, 4)}-${out.slice(4)}`;
}

const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  new: "New to the mountains",
  developing: "Developing",
  experienced: "Experienced",
  advanced: "Advanced",
};

const DISCIPLINE_RUNGS = ["beginner", "intermediate", "advanced", "expert"] as const;
type DisciplineRung = (typeof DISCIPLINE_RUNGS)[number];

const RUNG_LABEL: Record<DisciplineRung, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

export interface PassportInput {
  name: string;
  memberSince: string;
  /**
   * Whether onboarding has been completed.
   *
   * Load-bearing. `User.experience` falls back to the demo fixture's value when
   * the athlete has never answered, so reading it unconditionally would print a
   * mock's "Experienced" onto a real person's document as though they had said
   * it. Before onboarding, the level is not reported.
   */
  onboarded: boolean;
  declaredExperience: ExperienceLevel;
  summitsLogged: Summit[];
  objectives: SavedObjective[];
  goals: Goal[];
  activities: RecordedActivity[];
  coachProfile: CoachProfile;
  expeditions: Expedition[];
  /** Injectable for tests. Defaults to now. */
  now?: Date;
}

/* -------------------------------------------------------------------------- */
/* Summits                                                                     */
/* -------------------------------------------------------------------------- */

interface MergedSummit {
  key: string;
  name: string;
  elevationM: number;
  date: string;
  peak: PassportPeakRef;
}

/**
 * The athlete's completed summits, from both places they can be entered.
 *
 * `user.summits` is the career record; an objective ticked as summited is the
 * same event entered from the map. A peak that appears in both is ONE ascent —
 * the career date is kept, because that is the date of the ascent, while the
 * objective supplies the coordinates and photograph the career record lacks.
 * Two rows for one mountain would inflate a count somebody may act on.
 */
function mergeSummits(summits: Summit[], objectives: SavedObjective[]): MergedSummit[] {
  const byKey = new Map<string, MergedSummit>();

  for (const s of summits) {
    if (!Number.isFinite(s.elevationM)) continue;
    const key = normalise(s.mountainId || s.name);
    if (key.length === 0) continue;
    byKey.set(key, {
      key,
      name: s.name,
      elevationM: s.elevationM,
      date: s.date,
      peak: { name: s.name, elevationM: s.elevationM, curatedId: s.mountainId || undefined },
    });
  }

  for (const o of objectives) {
    if (!o.summitedAt || !Number.isFinite(o.elevationM)) continue;
    const key = normalise(o.curatedId ?? o.name);
    if (key.length === 0) continue;
    const peak: PassportPeakRef = {
      name: o.name,
      elevationM: o.elevationM,
      lat: o.lat,
      lon: o.lon,
      curatedId: o.curatedId,
      wikipedia: o.wikipedia,
      photo: o.photo,
    };
    const existing = byKey.get(key);
    if (existing) {
      // Metadata only. The ascent date already on record stands.
      existing.peak = { ...peak, name: existing.name, elevationM: existing.elevationM };
      continue;
    }
    byKey.set(key, {
      key,
      name: o.name,
      elevationM: o.elevationM,
      date: o.summitedAt,
      peak,
    });
  }

  return [...byKey.values()].sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

/** Sessions the athlete actually recorded, indexed by local day. */
function sessionsByDay(activities: RecordedActivity[]): Map<string, RecordedActivity[]> {
  const map = new Map<string, RecordedActivity[]>();
  for (const a of activities) {
    // Simulated recordings are labelled SIMULATED in the feed and are not
    // evidence of a day on a mountain. Excluded here as everywhere else.
    if (a.simulated) continue;
    const started = new Date(a.startedAt);
    if (Number.isNaN(started.getTime())) continue;
    const key = dayKey(started);
    const list = map.get(key);
    if (list) list.push(a);
    else map.set(key, [a]);
  }
  return map;
}

function toSession(a: RecordedActivity): PassportSession | null {
  const positive = (n: number | null | undefined) =>
    typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;

  const session: PassportSession = {
    title: a.title,
    typeLabel: activityById(a.activityTypeId).label,
    distanceM: positive(a.distanceM),
    elevationGainM: positive(a.elevationGainM),
    movingSec: positive(a.movingSec) ?? positive(a.durationSec),
    maxAltitudeM:
      typeof a.maxAltitudeM === "number" &&
      Number.isFinite(a.maxAltitudeM) &&
      a.maxAltitudeM > ALTITUDE_PLAUSIBLE_MIN_M &&
      a.maxAltitudeM < ALTITUDE_PLAUSIBLE_MAX_M
        ? a.maxAltitudeM
        : null,
  };

  // A recording that carried no usable figure adds nothing to the page and
  // would render as a row of blanks. Better to say nothing was recorded.
  const hasFigure =
    session.distanceM !== null ||
    session.elevationGainM !== null ||
    session.movingSec !== null ||
    session.maxAltitudeM !== null;
  return hasFigure ? session : null;
}

/* -------------------------------------------------------------------------- */
/* Altitude                                                                    */
/* -------------------------------------------------------------------------- */

function highestAltitude(
  activities: RecordedActivity[],
  coachProfile: CoachProfile,
  summits: MergedSummit[],
): PassportAltitude {
  let recorded: number | null = null;
  let realSessions = 0;

  for (const a of activities) {
    if (a.simulated) continue;
    realSessions++;
    const alt = a.maxAltitudeM;
    if (
      typeof alt === "number" &&
      Number.isFinite(alt) &&
      alt > ALTITUDE_PLAUSIBLE_MIN_M &&
      alt < ALTITUDE_PLAUSIBLE_MAX_M &&
      (recorded === null || alt > recorded)
    ) {
      recorded = alt;
    }
  }

  const claimed = coachProfile.maxAltitudeM;
  const reported =
    typeof claimed === "number" && Number.isFinite(claimed) && claimed > 0 ? claimed : null;

  const highestSummit = summits.reduce<MergedSummit | null>(
    (best, s) => (best === null || s.elevationM > best.elevationM ? s : best),
    null,
  );

  const withSummitContext = (figure: PassportAltitude): PassportAltitude => {
    if (highestSummit === null) return figure;
    if (figure.metres !== null && highestSummit.elevationM <= figure.metres) return figure;
    return {
      ...figure,
      higherLoggedSummit: { name: highestSummit.name, elevationM: highestSummit.elevationM },
    };
  };

  // The observed figure wins when both exist. A measurement and an estimate are
  // not equal evidence, and the estimate is kept on the page rather than dropped
  // so the athlete can see the two do not agree.
  if (recorded !== null) {
    return withSummitContext({
      metres: recorded,
      source: "recorded",
      alsoReportedM: reported ?? undefined,
      note: "The highest point a recorded session reached. Simulated recordings are excluded.",
    });
  }

  if (reported !== null) {
    return withSummitContext({
      metres: reported,
      source: "self-reported",
      note: "The highest altitude you have told ICEFALL you have been to. Nothing measured it.",
    });
  }

  // Two different absences. "You have recorded sessions but none carried an
  // altitude reading" and "you have recorded nothing at all" send an athlete to
  // different places, so they do not share a reason.
  return withSummitContext({
    metres: null,
    source: null,
    reason: realSessions > 0 ? "no-data" : "not-reported",
    note:
      realSessions > 0
        ? "No recorded session carried an altitude reading, and no altitude has been reported."
        : "Nothing recorded and nothing reported.",
  });
}

/* -------------------------------------------------------------------------- */
/* Technical level                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The athlete's own declared standing. Never derived from training.
 *
 * Order of sources, strongest claim first: the per-discipline levels they set in
 * the Coach profile, then the single level chosen at onboarding. Both are
 * self-reported and labelled as such — there is no third source, because a
 * technical standard is not something a phone can observe.
 */
function technicalLevel(
  coachProfile: CoachProfile,
  onboarded: boolean,
  declared: ExperienceLevel,
): PassportTechnicalLevel {
  const entries = Object.entries(coachProfile.disciplineExperience).filter(
    (entry): entry is [string, DisciplineRung] =>
      (DISCIPLINE_RUNGS as readonly string[]).includes(entry[1]),
  );

  if (entries.length > 0) {
    const best = entries.reduce((a, b) =>
      DISCIPLINE_RUNGS.indexOf(b[1]) > DISCIPLINE_RUNGS.indexOf(a[1]) ? b : a,
    );
    const disciplines = entries.map(([d]) => d).join(", ");
    return {
      label: RUNG_LABEL[best[1]],
      provenance: "self-reported",
      note: `The highest level you have reported, across ${disciplines}. Your own assessment — ICEFALL has not tested it and cannot.`,
    };
  }

  if (onboarded) {
    return {
      label: EXPERIENCE_LABEL[declared],
      provenance: "self-reported",
      note: "The experience level you chose during onboarding. Your own assessment, not a grade.",
    };
  }

  return {
    label: null,
    reason: "not-reported",
    provenance: "self-reported",
    note: "You have not told ICEFALL what standard you climb at, and it will not guess.",
  };
}

/* -------------------------------------------------------------------------- */
/* Build                                                                       */
/* -------------------------------------------------------------------------- */

export function buildPassport(input: PassportInput): Passport {
  const now = input.now ?? new Date();
  const merged = mergeSummits(input.summitsLogged, input.objectives);
  const byDay = sessionsByDay(input.activities);

  /* ---- Summits ----------------------------------------------------------- */

  const summits: PassportSummit[] = merged.map((s) => {
    const date = new Date(s.date);
    const sameDay = Number.isNaN(date.getTime()) ? [] : (byDay.get(dayKey(date)) ?? []);
    // Where a day holds several recordings, the one with most ascent is the one
    // most likely to be the mountain day. Still only a same-day match, and the
    // page never calls it the ascent.
    const best = sameDay.reduce<RecordedActivity | null>(
      (acc, a) => (acc === null || a.elevationGainM > acc.elevationGainM ? a : acc),
      null,
    );
    const band = bandOf(s.elevationM);
    return {
      id: s.key,
      name: s.name,
      elevationM: s.elevationM,
      date: s.date,
      band,
      bandLabel: BAND_SPECS.find((b) => b.band === band)?.label ?? "",
      peak: s.peak,
      // The only honest value. See the header of this file.
      provenance: "user-added",
      session: best ? toSession(best) : null,
      sessionReason: "no-data",
    };
  });

  /* ---- Bands -------------------------------------------------------------- */

  const empty = merged.length === 0;
  const bands: PassportBand[] = BAND_SPECS.map((spec): PassportBand => {
    const inBand = summits.filter((s) => s.band === spec.band);
    const highest = inBand.reduce<PassportSummit | null>(
      (best, s) => (best === null || s.elevationM > best.elevationM ? s : best),
      null,
    );
    return {
      ...spec,
      // null, not zero, when there is no log at all: an empty document cannot
      // say anything about which bands an athlete has been in.
      entries: empty ? null : inBand.length,
      reason: empty ? "not-reported" : undefined,
      highest: highest
        ? { name: highest.name, elevationM: highest.elevationM, date: highest.date }
        : null,
    };
  })
    // High to low, so the page reads down like an altimeter rather than up like
    // a levelling system.
    .sort((a, b) => b.band - a.band);

  /* ---- Skills ------------------------------------------------------------- */

  const claims = input.coachProfile.technicalSkills.filter((c) => c.trim().length > 0);

  const skillGroups: PassportSkillGroup[] = BAND_SPECS.map((spec) => ({
    band: spec.band,
    label: spec.label,
    floorM: spec.floorM,
    skills: spec.skills.map((label) => ({ label, reported: claimMatches(label, claims) })),
  })).sort((a, b) => b.band - a.band);

  const roster = skillGroups.flatMap((g) => g.skills);
  const extraSkills = claims.filter((c) => !roster.some((r) => claimMatches(r.label, [c])));

  /* ---- Upcoming ----------------------------------------------------------- */

  const active = input.goals
    .filter((g) => g.status === "active")
    .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate));

  const upcoming: PassportObjective[] = active.map((g) => {
    // Readiness needs an elevation to know what class of objective it is
    // assessing. Without one there is nothing to assess, and a default figure
    // would be an assessment of a mountain nobody named.
    if (typeof g.elevationM !== "number" || !Number.isFinite(g.elevationM)) {
      return {
        id: g.id,
        name: g.name,
        targetDate: g.targetDate,
        preparation: Number.isFinite(g.preparation) ? g.preparation : null,
        classLabel: null,
        readiness: { value: null, reason: "not-reported" },
        limiting: null,
        requiresGuide: false,
      };
    }

    /*
     * A REFERENCE ENTRY GETS NO CLASS, NO GUIDE VERDICT AND NO FIGURE. The
     * engine below derives all three from elevation bands, which is fine for a
     * surveyed objective (the band is a training benchmark beside a human
     * grade) and a fabrication for one nobody has been up on ICEFALL's behalf.
     * Measured 2026-09-11 on an Erciyes Dağı goal: the booklet printed "3,917 m
     * · Serious alpine" and "This class of ground calls for an IFMGA/UIAGM-
     * certified guide" three times, for a summer walk-up.
     */
    if (!g.mountainId) {
      return {
        id: g.id,
        name: g.name,
        elevationM: g.elevationM,
        targetDate: g.targetDate,
        preparation: Number.isFinite(g.preparation) ? g.preparation : null,
        classLabel: null,
        readiness: { value: null },
        limiting: null,
        requiresGuide: false,
        unsurveyed: true,
      };
    }

    /*
     * THE CLASS AND THE GUIDE VERDICT COME FROM THE PERSON WHO WROTE THE
     * RECORD, NOT FROM THE BAND. `assessment.label` is an elevation band and
     * `assessment.requiresGuide` is `band >= 4`, i.e. "above 2,900 m" — so
     * Gran Paradiso, whose record says `requiresProfessionalSupport: false`,
     * printed "Serious alpine" and "This class of ground calls for an
     * IFMGA/UIAGM-certified guide" in a booklet somebody may hand to one.
     * Measured live 2026-09-11. The peak page fixed the same tile a day
     * earlier; this is the same field, read the same way.
     */
    const curated = MOUNTAINS.find((m) => m.id === g.mountainId);
    const assessment = assessPeak(g.elevationM, g.lat ?? 0, g.lon);
    const readiness = assessObjectiveReadiness({
      peak: { name: g.name, elevationM: g.elevationM, lat: g.lat, lon: g.lon },
      activities: input.activities,
      summitsLogged: merged.map((s) => ({
        name: s.name,
        elevationM: s.elevationM,
        date: s.date,
      })),
      selfReported: {
        technicalSkills: claims.length > 0 ? claims : undefined,
        maxAltitudeM: input.coachProfile.maxAltitudeM,
        disciplineExperience: input.coachProfile.disciplineExperience,
      },
      now,
    });

    return {
      id: g.id,
      name: g.name,
      elevationM: g.elevationM,
      targetDate: g.targetDate,
      preparation: Number.isFinite(g.preparation) ? g.preparation : null,
      classLabel: curated?.difficultyLabel ?? assessment.label,
      readiness: { value: readiness.overall.value, reason: readiness.overall.reason },
      limiting: readiness.biggestGap?.label ?? null,
      requiresGuide: curated ? curated.requiresProfessionalSupport : assessment.requiresGuide,
    };
  });

  /* ---- Identity ----------------------------------------------------------- */

  const primary = active[0];

  return {
    identity: {
      name: input.name,
      memberSince: input.memberSince,
      expeditionId: expeditionIdFor(input.name, input.memberSince),
      currentObjective: primary
        ? { name: primary.name, targetDate: primary.targetDate, elevationM: primary.elevationM }
        : null,
    },
    highestAltitude: highestAltitude(input.activities, input.coachProfile, merged),
    summits,
    summitsReason: summits.length === 0 ? "not-reported" : undefined,
    expeditions: {
      count: input.expeditions.length,
      // Named precisely. These are trips the athlete created in ICEFALL, on this
      // device — not expeditions undertaken, and not published anywhere, because
      // there is no network to publish them to.
      note: "Expeditions you have created in ICEFALL. Held on this device; none has been published, and creating one is not undertaking it.",
    },
    technicalLevel: technicalLevel(input.coachProfile, input.onboarded, input.declaredExperience),
    bands,
    skillGroups,
    extraSkills,
    skillsReported: roster.filter((s) => s.reported).length + extraSkills.length,
    skillsRoster: roster.length,
    upcoming,
    upcomingReason: upcoming.length === 0 ? "not-reported" : undefined,
    verificationNotice: VERIFICATION_NOTICE,
  };
}
