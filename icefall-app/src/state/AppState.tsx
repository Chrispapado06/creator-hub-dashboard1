import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Discipline, ExperienceLevel, Goal, User } from "@/types";
import type { CheckIn as CoachCheckIn } from "@/coach/types";
import {
  FREE_COACH_INTERACTIONS_PER_MONTH,
  TRIAL_DAYS,
  hasFeature,
  type FeatureId,
  type TierId,
} from "@/growth/tiers";
import { USER } from "@/data/mock/athlete";
import { GOALS } from "@/data/mock/goals";
import { MOUNTAINS } from "@/data/mock/mountains";
import { monthsAhead } from "@/data/mock/clock";
import { LOCAL_ATHLETE_ID } from "@/network/types";
import type { AthleteProfile, ConnectionRequest, Expedition } from "@/network/types";
import { coarsen } from "@/network/privacy";
import type { GroupMessage, GroupStyle, GroupTrainingSession, RsvpStatus } from "@/network/groups";
import type { ItemStatus, PackItem } from "@/services/checklist";
import { normalise as normaliseBudget, type BudgetState } from "@/coach/budget";

/**
 * Personalisation is the product's central principle, so onboarding answers,
 * added goals and completed sessions survive a reload. Everything lives in one
 * versioned localStorage record; a schema change bumps the key.
 */
const STORAGE_KEY = "icefall.state.v1";

/** See `addHydration`: the demo athlete's day, in DEV only. Zero everywhere else. */
const SEEDED_HYDRATION_ML = import.meta.env.DEV ? 1850 : 0;

/** See the `goals` memo: the demo athlete's objectives, in DEV only. */
const SEEDED_GOALS: Goal[] = import.meta.env.DEV ? GOALS : [];

/**
 * A mountain the athlete is keeping an eye on. Holds enough to render a row
 * without a lookup, because discovered peaks aren't in any local table.
 */
export interface SavedObjective {
  id: string;
  name: string;
  elevationM: number;
  lat: number;
  lon: number;
  /** Set when this is one of the ten hand-written ICEFALL mountains. */
  curatedId?: string;
  photo?: string;
  /** OSM `wikipedia` tag — resolves the peak's photograph. */
  wikipedia?: string;
  addedAt: string;
  /** ISO date the summit was reached. Undefined until marked done. */
  summitedAt?: string;
}

/** First run starts from the curated objectives rather than an empty screen. */
function seedObjectives(): SavedObjective[] {
  return MOUNTAINS.map((m) => ({
    id: `curated:${m.id}`,
    name: m.name,
    elevationM: m.elevationM,
    lat: m.coords.lat,
    lon: m.coords.lon,
    curatedId: m.id,
    photo: m.photo,
    addedAt: new Date(0).toISOString(),
  }));
}

export interface OnboardingAnswers {
  name: string;
  disciplines: Discipline[];
  experience: ExperienceLevel;
  goalName: string;
  goalMountainId?: string;
  goalElevationM?: number;
}

interface Persisted {
  onboarded: boolean;
  /**
   * ISO date this install first ran.
   *
   * Written once and never rewritten. The demo fixture's `memberSince` is
   * computed as "three years before now" at module load, so anything seeded from
   * it changed value every calendar day — the passport's Record no. is hashed
   * from it and was different each morning, and the cover claimed a membership
   * that predated the install by three years.
   */
  memberSince?: string;
  name?: string;
  disciplines?: Discipline[];
  experience?: ExperienceLevel;
  customGoals: Goal[];
  /** `${weekIndex}:${isoDate}` → completed. Overrides the generated plan. */
  sessionOverrides: Record<string, boolean>;
  hydrationMl?: number;
  kudos: string[];
  /** Drives the calorie estimate. Was hardcoded to 72 kg for everyone. */
  bodyMassKg?: number;
  autoPause?: boolean;
  objectives?: SavedObjective[];
  threads?: EnquiryThread[];
  /** Newest first. One entry per day at most. */
  account?: Account;
  /** Written by installs that predate tiers, so `tier` may be missing at runtime. */
  subscription?: Partial<Subscription>;
  coachUsage?: CoachUsage;
  checkIns?: CoachCheckIn[];
  coachProfile?: CoachProfile;
  /** Coach AI spend this month. See @/coach/budget — the REAL cap is server-side. */
  coachBudget?: BudgetState;
  notifications?: NotificationPrefs;
  /* ---- Expedition Network (see the block above `AppStateValue`) ----------- */
  // All optional, so records written before the network existed load unchanged
  // and read as opted out — which is the correct default for anyone who has
  // never been asked. No storage-key bump is needed to add an optional field.
  networkOptIn?: boolean;
  locationOptIn?: boolean;
  myProfile?: AthleteProfile;
  expeditions?: Expedition[];
  connectionRequests?: ConnectionRequest[];
  blockedIds?: string[];
  /* ---- Group planning (see the block above `groupSessions`) --------------- */
  // Keyed to an expedition id, and optional for the same reason as everything
  // above: records written before groups had a workspace load unchanged and
  // read as a group nobody has planned anything in yet.
  groupSessions?: GroupTrainingSession[];
  groupMessages?: GroupMessage[];
  groupNotes?: Record<string, string>;
  groupChecklistShared?: Record<string, boolean>;
  groupStyle?: Record<string, GroupStyle>;
  /* ---- Equipment checklist (see the block above `checklistStatuses`) ------ */
  // Optional for the same reason as the network fields: records written before
  // the checklist existed load unchanged and read as an untouched list.
  checklistStatuses?: Record<string, Record<string, ItemStatus>>;
  packItems?: Record<string, PackItem[]>;
  packTargetGrams?: Record<string, number>;
}

/**
 * Deliberately empty. A profile that pretends the athlete owns a full gym or
 * has climbed at altitude would feed fabricated inputs straight into readiness.
 */
const EMPTY_COACH_PROFILE: CoachProfile = {
  disciplineExperience: {},
  availableEquipment: [],
  trainingDays: [],
  typicalSessionMin: 60,
  technicalSkills: [],
};

const EMPTY: Persisted = {
  onboarded: false,
  customGoals: [],
  sessionOverrides: {},
  kudos: [],
};

/** Today, as an ISO date. Stamped once, the first time the app runs. */
const todayIso = () => new Date().toISOString();

function load(): Persisted {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY, memberSince: todayIso(), objectives: seedObjectives() };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    // Existing installs predate the objectives list — seed it once.
    return {
      ...EMPTY,
      ...parsed,
      objectives: parsed.objectives ?? seedObjectives(),
      // Installs that predate this field get stamped now rather than inheriting
      // the fixture's rolling date. Once written it never moves again.
      memberSince: parsed.memberSince ?? todayIso(),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * A local id that cannot collide with the one issued a moment before it.
 *
 * `Date.now()` alone is not enough for records the athlete can create in quick
 * succession — two messages posted inside the same millisecond would share an
 * id, and both React keys and every by-id lookup (RSVPs, deletion) would then
 * act on the wrong row. The counter is per session, which is all that is needed:
 * the timestamp separates sessions and the counter separates within one.
 */
let idSeq = 0;
const localId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idSeq++).toString(36)}`;

/**
 * An enquiry the athlete has written to an expedition operator.
 *
 * Held on the device. ICEFALL has no operator network connected, so nothing is
 * transmitted and no reply will ever arrive — the compose screen says so before
 * you write a word. The shape is the one a real backend would use, so wiring it
 * up later doesn't touch the screens.
 */
export interface EnquiryMessage {
  id: string;
  from: "you" | "operator";
  body: string;
  at: string;
}

export interface EnquiryThread {
  id: string;
  operatorId: string;
  operatorName: string;
  peakName: string;
  elevationM?: number;
  /** The goal this enquiry came from, for the link back. */
  goalId?: string;
  messages: EnquiryMessage[];
  createdAt: string;
}

/**
 * What the athlete has told ICEFALL about themselves, as opposed to what it
 * measured. Kept separate from recorded data on purpose: the Coach must always
 * be able to tell the difference between "we observed this" and "they said so",
 * and technical and altitude experience can only ever be the latter.
 */
export interface CoachProfile {
  /** Discipline id → experience level, e.g. { hiking: "advanced" }. */
  disciplineExperience: Record<string, "beginner" | "intermediate" | "advanced" | "expert">;
  /** Equipment ids from `@/coach/exercises`. Drives session generation. */
  availableEquipment: string[];
  /** 0 = Sunday … 6 = Saturday. Days the athlete can normally train. */
  trainingDays: number[];
  typicalSessionMin: number;
  /** Technical competences the athlete claims. Never inferred from activity. */
  technicalSkills: string[];
  /** Highest altitude actually reached, self-reported. */
  maxAltitudeM?: number;
}

/**
 * The athlete's ICEFALL account.
 *
 * ICEFALL has no auth backend, so this is a profile on this device and nothing
 * more. That is stated in the sign-up flow rather than implied, and it is why
 * NO PASSWORD IS STORED here: the sign-up form validates one so the rules are
 * real, then discards it. Persisting a credential that gates nothing would be
 * security theatre and a genuine liability if the device were shared.
 */
export interface Account {
  name: string;
  email: string;
  createdAt: string;
  /** Always true today. A server-backed account would be false. */
  local: true;
}

/**
 * The athlete's ICEFALL plan.
 *
 * IMPORTANT: no payment is taken and no card is ever collected. ICEFALL has no
 * payment processor wired up, so `startTrial` begins a LOCAL trial and nothing
 * is charged when it ends — the paywall states that plainly rather than
 * implying a silent renewal. When billing lands, this is the seam: swap the
 * local dates for the processor's subscription record and the screens above it
 * do not change.
 *
 * The prices in `@/growth/tiers` — Free €0, Pro €14.99 a month or €119.99 a
 * year, Elite €29.99 a month or €249.99 a year — are what the plans WILL cost
 * when subscriptions go live. Not one of them has ever been charged to anyone,
 * and every surface that shows them says so.
 *
 * Do not "complete" this by adding a card form. Collecting payment details into
 * a prototype with no processor is both useless and unsafe.
 */
export interface Subscription {
  /**
   * `active` exists for the day billing lands. NOTHING IN THIS BUILD SETS IT —
   * there is no processor to confirm a payment, so an app that could mark
   * itself paid would be marking itself paid on nothing.
   */
  status: "none" | "trialing" | "active" | "expired";
  /** The plan bought. Defaults to `free`; the trial grants `pro` for its length. */
  tier: TierId;
  /** ISO. Set when the trial begins. */
  startedAt?: string;
  /** ISO. `TRIAL_DAYS` after `startedAt`. */
  endsAt?: string;
}

/**
 * Prices, plans and gating live in `@/growth/tiers` — one table, so a price
 * change cannot leave stale copy behind on a screen nobody re-read.
 *
 * Re-exported here because screens already reach for the subscription through
 * this module, and two import paths for the same constant is how the two drift.
 */
export { TRIAL_DAYS };

/**
 * Coach interactions used in one calendar month.
 *
 * The free allowance is metered rather than described: a limit that is written
 * on the plan card and enforced nowhere is a claim the app cannot keep, and one
 * that is enforced without being visible is worse.
 */
export interface CoachUsage {
  /** `YYYY-MM`, from LOCAL date components — see `monthKey`. */
  month: string;
  count: number;
}

/**
 * The current month, built from local date components.
 *
 * NEVER toISOString() here: a UTC key rolls the month over early for anyone
 * west of Greenwich, so on the last evening of the month their allowance would
 * silently reset — or, on the first evening, be counted against the month they
 * have already left. The same bug already bit the training week strip.
 */
function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface NotificationPrefs {
  training: boolean;
  recovery: boolean;
  goal: boolean;
  conditions: boolean;
}

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  training: true,
  recovery: true,
  goal: true,
  conditions: false,
};

interface AppStateValue {
  user: User;
  goals: Goal[];
  onboarded: boolean;
  completeOnboarding: (a: OnboardingAnswers) => void;
  resetAll: () => void;
  isSessionComplete: (weekIndex: number, date: string, fallback: boolean) => boolean;
  toggleSession: (weekIndex: number, date: string, fallback: boolean) => void;
  hydrationMl: number;
  addHydration: (ml: number) => void;
  bodyMassKg: number;
  setBodyMassKg: (kg: number) => void;
  autoPause: boolean;
  setAutoPause: (on: boolean) => void;
  hasKudos: (postId: string) => boolean;
  toggleKudos: (postId: string) => void;
  addGoal: (g: Omit<Goal, "id" | "status" | "preparation">) => void;
  /** Only goals the athlete created can be removed; the seeded ones are fixtures. */
  removeGoal: (id: string) => void;
  canRemoveGoal: (id: string) => boolean;
  objectives: SavedObjective[];
  addObjective: (o: Omit<SavedObjective, "addedAt">) => void;
  removeObjective: (id: string) => void;
  toggleSummited: (id: string) => void;
  hasObjective: (id: string) => boolean;
  threads: EnquiryThread[];
  startEnquiry: (t: Omit<EnquiryThread, "id" | "messages" | "createdAt">, body: string) => string;
  replyToThread: (threadId: string, body: string) => void;
  removeThread: (threadId: string) => void;
  account: Account | undefined;
  createAccount: (a: { name: string; email: string }) => void;
  subscription: Subscription;
  /** Days left in the trial, or null when no trial is running. */
  trialDaysLeft: number | null;
  /** Starts a local `TRIAL_DAYS` trial of Pro. Takes no payment — there is none to take. */
  startTrial: () => void;
  /** What the athlete can use today: `pro` while trialing, otherwise the plan they hold. */
  currentTier: TierId;
  /**
   * Whether the current tier includes a feature. Gates growth surfaces only —
   * never an athlete's own recorded training, and never something they had
   * yesterday.
   */
  can: (id: FeatureId) => boolean;
  /** This month's Coach usage. Resets on the local month boundary. */
  coachUsage: CoachUsage;
  /** Interactions left this month, or null when the tier is unlimited. */
  coachInteractionsLeft: number | null;
  /** Call once per answered Coach question. Only counts on a metered tier. */
  recordCoachInteraction: () => void;
  signOut: () => void;
  checkIns: CoachCheckIn[];
  /** Today's check-in, or undefined when it hasn't been done. Never a default. */
  todaysCheckIn: CoachCheckIn | undefined;
  saveCheckIn: (c: Omit<CoachCheckIn, "date">) => void;
  coachProfile: CoachProfile;
  updateCoachProfile: (patch: Partial<CoachProfile>) => void;
  /** This month's Coach AI spend, in micro-dollars. Resets on the month boundary. */
  coachBudget: BudgetState;
  /** Bank one credit and what the exchange actually cost. */
  recordCoachSpend: (micros: number) => void;
  notifications: NotificationPrefs;
  setNotification: (k: keyof NotificationPrefs, v: boolean) => void;

  /* ---- Expedition Network ------------------------------------------------ */

  /**
   * Whether the athlete has opted into the Expedition Network at all.
   *
   * FALSE until they say otherwise. Nothing about them is compared, matched or
   * held as a network profile before that — not that it could go anywhere:
   * there is no server and there are no other members, so every list in this
   * feature is empty and must render its empty state rather than sample people.
   */
  networkOptIn: boolean;
  setNetworkOptIn: (on: boolean) => void;
  /**
   * A SEPARATE and likewise FALSE-by-default opt-in for approximate location.
   *
   * Joining the network is not consent to be located, so the two are distinct
   * switches. Nothing may read the device's position until this is true, and
   * `updateMyProfile` refuses to store an area while it is false. Turning it
   * off deletes the stored area rather than hiding it.
   */
  locationOptIn: boolean;
  setLocationOptIn: (on: boolean) => void;
  /** Null until the athlete fills anything in. Never a pre-populated example. */
  myProfile: AthleteProfile | null;
  /**
   * Patches the local profile, creating it on first write.
   *
   * Two rules are enforced here rather than trusted to callers: `verified` is
   * always false, and any location is coarsened before it is stored.
   */
  updateMyProfile: (patch: Partial<AthleteProfile>) => void;
  /**
   * Expeditions THIS athlete created, on THIS device. Real, local and the only
   * ones that exist — there is no directory of other people's trips to browse.
   */
  expeditions: Expedition[];
  createExpedition: (e: Omit<Expedition, "id" | "createdAt" | "createdBy" | "memberIds">) => string;
  leaveExpedition: (id: string) => void;
  /**
   * Messages written to other athletes. Every one is `queued` and stays queued:
   * nothing is transmitted and no reply can arrive. See `NETWORK_NOT_CONNECTED_NOTICE`.
   */
  connectionRequests: ConnectionRequest[];
  /** Returns the local id of the queued request. Refuses anyone blocked. */
  queueConnection: (toAthleteId: string, message: string) => string;
  blockedIds: string[];
  blockAthlete: (id: string) => void;
  /** Blocking must be reversible; an irreversible one-tap block is a trap. */
  unblockAthlete: (id: string) => void;

  /* ---- Group planning ----------------------------------------------------

     The planning surface behind a group — sessions, notes, messages and how the
     party intends to climb. All of it is keyed to an expedition id, all of it is
     held on this device, and none of it goes anywhere: there is no server and no
     other members, so an RSVP tells nobody, a message reaches nobody, and
     sharing the checklist shares with nobody. Every screen below says so before
     the athlete writes rather than after.

     A group deleted through `leaveExpedition` takes all of it with it, so
     nothing is left keyed to a party that no longer exists.                    */

  /** Every planned session, across every group. Empty until one is planned. */
  groupSessions: GroupTrainingSession[];
  addGroupSession: (
    groupId: string,
    session: { title: string; dayKey: string; time?: string; place?: string; note?: string },
  ) => string;
  removeGroupSession: (sessionId: string) => void;
  /**
   * The local athlete's own RSVP. `null` clears it back to no reply, which is
   * a distinct state from "not going" and has to stay recoverable.
   */
  setSessionRsvp: (sessionId: string, status: RsvpStatus | null) => void;
  /**
   * Messages written in a group. Held here, delivered nowhere — the model
   * carries no delivery status on purpose. See `GROUP_CHAT_NOTICE`.
   */
  groupMessages: GroupMessage[];
  postGroupMessage: (groupId: string, body: string) => string;
  removeGroupMessage: (messageId: string) => void;
  /** Free planning text per group id. */
  groupNotes: Record<string, string>;
  setGroupNote: (groupId: string, text: string) => void;
  /**
   * Whether the athlete has chosen to share their own checklist statuses with
   * a group. FALSE by default: what somebody has and has not sorted is theirs,
   * and it is never shared by omission. Recording it changes nothing today.
   */
  groupChecklistShared: Record<string, boolean>;
  setGroupChecklistShared: (groupId: string, shared: boolean) => void;
  /**
   * Guided or independent, per group id. ABSENT means not recorded — never
   * "independent", which would be ICEFALL deciding on someone's behalf that
   * they are climbing without a guide.
   */
  groupStyle: Record<string, GroupStyle>;
  setGroupStyle: (groupId: string, style: GroupStyle | null) => void;

  /* ---- Equipment checklist ----------------------------------------------- */

  /**
   * What the athlete has recorded against each generated kit item, keyed
   * goalId → itemId.
   *
   * ABSENT is not "need": an item with no entry has simply not been reviewed,
   * and the completion figure counts it as outstanding rather than claiming the
   * athlete said anything about it. Nothing is ever pre-filled — a checklist
   * that starts half-ticked would be packing someone's bag for them.
   */
  checklistStatuses: Record<string, Record<string, ItemStatus>>;
  setChecklistStatus: (goalId: string, itemId: string, status: ItemStatus) => void;
  /** Undoes a mis-tap. Returns the row to "not reviewed", not to "need". */
  clearChecklistStatus: (goalId: string, itemId: string) => void;
  /**
   * Itemised pack weights the athlete entered, keyed goalId.
   *
   * Every gram here was typed in by them. ICEFALL never seeds this from a
   * catalogue weight or an average — see `PackItem.grams`, which is null until
   * something is actually weighed.
   */
  packItems: Record<string, PackItem[]>;
  addPackItem: (goalId: string, item: Omit<PackItem, "id">) => void;
  removePackItem: (goalId: string, itemId: string) => void;
  /** The athlete's own target, or their operator's. ICEFALL sets no default. */
  packTargetGrams: Record<string, number>;
  setPackTarget: (goalId: string, grams: number | null) => void;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode or quota — the app still works, it just won't remember.
    }
  }, [state]);

  const user = useMemo<User>(
    () => ({
      ...USER,
      name: state.name ?? USER.name,
      disciplines: state.disciplines ?? USER.disciplines,
      experience: state.experience ?? USER.experience,
      onboarded: state.onboarded,
      /**
       * PERSONAL CLAIMS ARE NOT INHERITED FROM THE FIXTURE.
       *
       * Spreading `USER` brought the demo athlete's invented history with it:
       * four summits they never climbed and five achievements they never earned,
       * rendered as their own on the Profile, and printed on the Mountain
       * Passport and the Mountain CV — a document whose entire framing is that
       * it is a record of what this person has actually done. In DEV the fixture
       * is still useful for seeing a populated passport, so it is kept there and
       * nowhere else.
       */
      summits: import.meta.env.DEV ? USER.summits : [],
      achievements: import.meta.env.DEV ? USER.achievements : [],
      /**
       * AND THE SAME APPLIES TO THE LEVEL, WHICH THIS FIX ORIGINALLY MISSED.
       *
       * `...USER` also carried `level: 24`, `xp: 12540` and `xpToNext: 14000`,
       * so a fresh install opened the Profile at Level 24 with 12,540 XP and
       * "1,460 XP to level 25" — sitting directly beneath career totals that
       * had just been corrected to zero. A level is a claim about what the
       * athlete has done, exactly like a summit, and there is no XP engine in
       * the app: nothing awards it, nothing spends it, and the curve those
       * three numbers imply was never designed. Points ARE real (they are
       * awarded per recorded activity by `tracking/points.ts`), and the Profile
       * shows those instead.
       *
       * `xpToNext: 0` is the marker for "no progression model is running", and
       * the Profile reads it that way rather than printing a threshold nobody
       * chose.
       */
      level: import.meta.env.DEV ? USER.level : 1,
      xp: import.meta.env.DEV ? USER.xp : 0,
      xpToNext: import.meta.env.DEV ? USER.xpToNext : 0,
      // A real date for this install, not "three years before whenever you
      // happen to open the app".
      memberSince: state.memberSince ?? USER.memberSince,
    }),
    [state.name, state.disciplines, state.experience, state.onboarded, state.memberSince],
  );

  /**
   * THE OBJECTIVE IS THE ATHLETE'S, OR THERE ISN'T ONE.
   *
   * The three fixture goals were merged in unconditionally, so a production
   * install carried Mont Blanc via the Goûter Route, the Matterhorn and Everest
   * as this person's own active objectives — with `trainingStartedAt` eleven
   * weeks ago, `preparation: 62`, and a gap list making direct claims about what
   * they had and had not done: *"Altitude exposure above 4,000 m — one rotation
   * completed of three"*, *"Crevasse rescue refresher outstanding"*, *"Loaded
   * carries at 15 kg not yet started"*.
   *
   * Worse than a stray card, because `usePrimaryGoal` sorts by SOONEST target
   * date rather than preferring the athlete's own. Mont Blanc sits eight months
   * out, so an athlete who finished onboarding naming an objective further away
   * had the fixture's mountain promoted over their own — and Home, the Coach,
   * the kit checklist, the conditions band and the benchmark all orient on the
   * primary goal. The whole app pointed at a mountain they never chose and told
   * them they were twelve weeks into training for it.
   *
   * Same rule as the summits, the achievements and the level above: in DEV the
   * fixture is worth having so a populated app can be judged, and nowhere else.
   */
  const goals = useMemo<Goal[]>(() => [...state.customGoals, ...SEEDED_GOALS], [state.customGoals]);

  const completeOnboarding = useCallback((a: OnboardingAnswers) => {
    setState((s) => {
      /**
       * Only create a goal when the athlete named one we don't already track —
       * and "already track" has to mean the list they will actually see.
       *
       * This read `GOALS` directly. Once the fixture became DEV-only that was a
       * bypass with teeth: in production an athlete who typed "Mont Blanc",
       * "Matterhorn" or "Everest" during onboarding would match a fixture goal
       * that is no longer in `goals`, so no objective was created and they
       * finished onboarding with none at all — having just named one. Matching
       * against `SEEDED_GOALS` keeps the dedupe honest in DEV and inert in
       * production, which is what the check was for.
       */
      const existing = SEEDED_GOALS.find(
        (g) =>
          g.mountainId === a.goalMountainId ||
          g.name.toLowerCase() === a.goalName.trim().toLowerCase(),
      );

      const customGoals =
        existing || !a.goalName.trim()
          ? s.customGoals
          : [
              {
                id: `goal-custom-${Date.now()}`,
                name: a.goalName.trim(),
                subtitle: "Custom objective",
                elevationM: a.goalElevationM,
                mountainId: a.goalMountainId,
                trainingStartedAt: new Date().toISOString(),
                targetDate: monthsAhead(10),
                preparation: 5,
                status: "active" as const,
                gaps: [
                  "Training plan not yet generated",
                  "Baseline fitness assessment outstanding",
                ],
              },
              ...s.customGoals,
            ];

      return {
        ...s,
        onboarded: true,
        name: a.name.trim() || USER.name,
        disciplines: a.disciplines,
        experience: a.experience,
        customGoals,
      };
    });
  }, []);

  const resetAll = useCallback(() => {
    setState(EMPTY);
    // Recorded activities, points and achievements live in their own store —
    // a "reset app" that left them behind wasn't a reset.
    try {
      localStorage.removeItem("icefall.activities.v1");
      localStorage.removeItem("icefall.athlete.v1");
    } catch {
      /* private mode — nothing to clear */
    }
  }, []);

  const threads = useMemo(() => state.threads ?? [], [state.threads]);

  const startEnquiry = useCallback(
    (thread: Omit<EnquiryThread, "id" | "messages" | "createdAt">, body: string) => {
      const now = new Date().toISOString();
      const id = `thread-${Date.now()}`;
      setState((s) => ({
        ...s,
        threads: [
          {
            ...thread,
            id,
            createdAt: now,
            messages: [{ id: `msg-${Date.now()}`, from: "you", body, at: now }],
          },
          ...(s.threads ?? []),
        ],
      }));
      return id;
    },
    [],
  );

  const replyToThread = useCallback((threadId: string, body: string) => {
    const now = new Date().toISOString();
    setState((s) => ({
      ...s,
      threads: (s.threads ?? []).map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, { id: `msg-${Date.now()}`, from: "you", body, at: now }],
            }
          : t,
      ),
    }));
  }, []);

  const removeThread = useCallback((threadId: string) => {
    setState((s) => ({ ...s, threads: (s.threads ?? []).filter((t) => t.id !== threadId) }));
  }, []);

  /* ---- Account ----------------------------------------------------------- */

  const account = state.account;

  const createAccount = useCallback((a: { name: string; email: string }) => {
    setState((s) => ({
      ...s,
      account: {
        name: a.name.trim(),
        email: a.email.trim().toLowerCase(),
        createdAt: new Date().toISOString(),
        local: true,
      },
    }));
  }, []);

  const subscription = useMemo<Subscription>(() => {
    const stored = state.subscription;
    const sub: Subscription = {
      status: stored?.status ?? "none",
      // Installs from before tiers existed have no `tier`. Free is the honest
      // default: holding a paid plan is something that has to have happened,
      // not something we assume because a record is old.
      tier: stored?.tier ?? "free",
      startedAt: stored?.startedAt,
      endsAt: stored?.endsAt,
    };

    // Expiry is derived on read rather than written by a timer — a stored
    // "trialing" flag would keep claiming an active trial for anyone who left
    // the app closed for a week, and no timer runs in a closed app.
    const lapsed =
      (sub.status === "trialing" || sub.status === "active") &&
      sub.endsAt !== undefined &&
      new Date(sub.endsAt) <= new Date();

    // A lapsed trial leaves no plan behind. Nothing was charged, so nothing was
    // bought — the tier falls back to free and the screens say what that means.
    if (lapsed) return { ...sub, status: "expired", tier: "free" };
    return sub;
  }, [state.subscription]);

  const trialDaysLeft = useMemo(() => {
    if (subscription.status !== "trialing" || !subscription.endsAt) return null;
    const ms = new Date(subscription.endsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  }, [subscription]);

  const startTrial = useCallback(() => {
    setState((s) => {
      // A second tap must not quietly extend a trial that is already running.
      const running =
        s.subscription?.status === "trialing" &&
        s.subscription.endsAt !== undefined &&
        new Date(s.subscription.endsAt) > new Date();
      if (running) return s;

      const now = new Date();
      const ends = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
      return {
        ...s,
        // Tier `pro`, because that is what the trial opens. No payment method is
        // taken to start it and nothing is charged when it ends.
        subscription: {
          status: "trialing",
          tier: "pro",
          startedAt: now.toISOString(),
          endsAt: ends.toISOString(),
        },
      };
    });
  }, []);

  /**
   * The tier in force right now.
   *
   * Pro for the length of the trial, then whatever plan is actually held —
   * which, with no processor connected, is free for everyone.
   */
  const currentTier = useMemo<TierId>(
    () => (subscription.status === "trialing" ? "pro" : subscription.tier),
    [subscription],
  );

  const can = useCallback((id: FeatureId) => hasFeature(currentTier, id), [currentTier]);

  /* ---- Coach usage ------------------------------------------------------ */

  // Read against the current month rather than trusting the stored key: a month
  // that has rolled over reads as zero used, without needing a write to make it
  // true. The reset lands on the athlete's own calendar, not UTC's.
  const coachUsage = useMemo<CoachUsage>(() => {
    const month = monthKey();
    const stored = state.coachUsage;
    return stored && stored.month === month ? stored : { month, count: 0 };
  }, [state.coachUsage]);

  const coachInteractionsLeft = useMemo<number | null>(() => {
    if (hasFeature(currentTier, "coach.unlimited")) return null;
    return Math.max(0, FREE_COACH_INTERACTIONS_PER_MONTH - coachUsage.count);
  }, [currentTier, coachUsage]);

  const recordCoachInteraction = useCallback(() => {
    // Unlimited tiers are not counted. If a trial's usage were logged, the free
    // allowance would already be spent the moment the trial lapsed — the athlete
    // would be told they have three questions a month and be given none.
    if (hasFeature(currentTier, "coach.unlimited")) return;
    setState((s) => {
      const month = monthKey();
      const prev = s.coachUsage?.month === month ? s.coachUsage.count : 0;
      return { ...s, coachUsage: { month, count: prev + 1 } };
    });
  }, [currentTier]);

  // Signing out clears the account but deliberately keeps recorded activity and
  // goals — losing an athlete's training history because they tapped sign out
  // would be unforgivable, and there is no server to restore it from.
  const signOut = useCallback(() => {
    setState((s) => ({ ...s, account: undefined }));
  }, []);

  /* ---- Coach ------------------------------------------------------------ */

  const checkIns = useMemo(() => state.checkIns ?? [], [state.checkIns]);

  // Local date components, never toISOString(): a UTC date string shifts the
  // day for anyone west of Greenwich after mid-afternoon, which already caused
  // a real bug in the training week strip.
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const todaysCheckIn = useMemo(() => checkIns.find((c) => c.date === todayKey()), [checkIns]);

  const saveCheckIn = useCallback((c: Omit<CoachCheckIn, "date">) => {
    const date = todayKey();
    setState((s) => {
      const rest = (s.checkIns ?? []).filter((x) => x.date !== date);
      return { ...s, checkIns: [{ ...c, date }, ...rest].slice(0, 180) };
    });
  }, []);

  const coachProfile = useMemo<CoachProfile>(
    () => ({ ...EMPTY_COACH_PROFILE, ...(state.coachProfile ?? {}) }),
    [state.coachProfile],
  );

  const coachBudget = useMemo(() => normaliseBudget(state.coachBudget), [state.coachBudget]);

  const recordCoachSpend = useCallback((micros: number) => {
    setState((s) => {
      const current = normaliseBudget(s.coachBudget);
      return {
        ...s,
        coachBudget: {
          ...current,
          // One reply, one credit — whatever it happened to cost.
          creditsUsed: current.creditsUsed + 1,
          spentMicros: current.spentMicros + Math.max(0, Math.ceil(micros) || 0),
        },
      };
    });
  }, []);

  const updateCoachProfile = useCallback((patch: Partial<CoachProfile>) => {
    setState((s) => ({
      ...s,
      coachProfile: { ...EMPTY_COACH_PROFILE, ...(s.coachProfile ?? {}), ...patch },
    }));
  }, []);

  const notifications = useMemo<NotificationPrefs>(
    () => ({ ...DEFAULT_NOTIFICATIONS, ...(state.notifications ?? {}) }),
    [state.notifications],
  );

  const setNotification = useCallback((k: keyof NotificationPrefs, v: boolean) => {
    setState((s) => ({
      ...s,
      notifications: { ...DEFAULT_NOTIFICATIONS, ...(s.notifications ?? {}), [k]: v },
    }));
  }, []);

  /* ---- Expedition Network ------------------------------------------------ */

  /**
   * ICEFALL has no server, no user database and no other users, and none of the
   * state below changes that. It holds what the athlete wrote on this device.
   *
   * So: nothing here is ever seeded with an example person, a demo profile or a
   * sample expedition. Every collection starts empty and stays empty until the
   * athlete puts something in it, because at zero users the empty state is the
   * truth. A fabricated partner in this store would reach the screens as a real
   * person to plan a mountain around.
   */

  const networkOptIn = state.networkOptIn === true;
  const locationOptIn = state.locationOptIn === true;
  const myProfile = state.myProfile ?? null;

  const setNetworkOptIn = useCallback((on: boolean) => {
    // Leaving the network does not delete the profile: there is nowhere it was
    // published to, and silently destroying what someone wrote would be worse
    // than keeping it on their own device. Location is the exception below,
    // because a stored position is the one field that stays sensitive.
    setState((s) => ({ ...s, networkOptIn: on }));
  }, []);

  const setLocationOptIn = useCallback((on: boolean) => {
    setState((s) => {
      if (on) return { ...s, locationOptIn: true };
      // Off means gone, not hidden. A position kept "just in case" after
      // someone withdrew consent is a position they no longer know exists.
      const profile = s.myProfile;
      if (!profile || profile.approxLocation === undefined) {
        return { ...s, locationOptIn: false };
      }
      const cleared: AthleteProfile = { ...profile };
      delete cleared.approxLocation;
      return { ...s, locationOptIn: false, myProfile: cleared };
    });
  }, []);

  const updateMyProfile = useCallback((patch: Partial<AthleteProfile>) => {
    setState((s) => {
      const base: AthleteProfile = s.myProfile ?? {
        // One athlete per device, one constant id — see LOCAL_ATHLETE_ID.
        id: LOCAL_ATHLETE_ID,
        displayName: s.name ?? s.account?.name ?? "",
        previousObjectives: [],
        lookingFor: [],
        verified: false,
      };

      const next: AthleteProfile = {
        ...base,
        ...patch,
        id: base.id,
        // Not negotiable and not settable. There is no verification system, so
        // there is no state of the world in which this is true.
        verified: false,
      };

      // Location is handled after the spread so a patch cannot smuggle a
      // precise position past the opt-in or past the coarsening grid. This is
      // the single write boundary for location in the app: everything
      // downstream — matching, display, export — reads a value that is already
      // quantised, so no future caller can leak what was never stored.
      const wantsLocation = patch.approxLocation;
      if (wantsLocation !== undefined && s.locationOptIn === true) {
        const c = coarsen(wantsLocation.lat, wantsLocation.lon);
        next.approxLocation = { label: wantsLocation.label, lat: c.lat, lon: c.lon };
      } else if (wantsLocation === undefined && "approxLocation" in patch) {
        delete next.approxLocation;
      } else if (s.locationOptIn !== true) {
        delete next.approxLocation;
      }

      return { ...s, myProfile: next };
    });
  }, []);

  const expeditions = useMemo(() => state.expeditions ?? [], [state.expeditions]);

  const createExpedition = useCallback(
    (e: Omit<Expedition, "id" | "createdAt" | "createdBy" | "memberIds">) => {
      const id = `expedition-${Date.now()}`;
      setState((s) => ({
        ...s,
        expeditions: [
          {
            ...e,
            id,
            createdBy: s.myProfile?.id ?? LOCAL_ATHLETE_ID,
            // One member, because one member is who exists. The party is never
            // padded towards `sizeMin` to make the group look populated.
            memberIds: [s.myProfile?.id ?? LOCAL_ATHLETE_ID],
            createdAt: new Date().toISOString(),
          },
          ...(s.expeditions ?? []),
        ],
      }));
      return id;
    },
    [],
  );

  const leaveExpedition = useCallback((id: string) => {
    setState((s) => {
      const meId = s.myProfile?.id ?? LOCAL_ATHLETE_ID;
      const next = (s.expeditions ?? [])
        .map((e) => (e.id === id ? { ...e, memberIds: e.memberIds.filter((m) => m !== meId) } : e))
        // An expedition nobody is on is not a group waiting for members: with
        // no backend there is no one who could ever join it, so it is dropped
        // rather than left as an empty record implying a trip still stands.
        .filter((e) => e.memberIds.length > 0);

      // Everything the workspace holds is keyed to a group id, so a group that
      // has gone must take its sessions, messages, notes and preferences with
      // it. Orphaned rows would otherwise sit in storage keyed to a party that
      // no longer exists — and would reattach to any future id that matched.
      const surviving = new Set(next.map((e) => e.id));
      const gone = (s.expeditions ?? [])
        .map((e) => e.id)
        .filter((expeditionId) => !surviving.has(expeditionId));
      if (gone.length === 0) return { ...s, expeditions: next };

      const notes = { ...(s.groupNotes ?? {}) };
      const shared = { ...(s.groupChecklistShared ?? {}) };
      const styles = { ...(s.groupStyle ?? {}) };
      for (const groupId of gone) {
        delete notes[groupId];
        delete shared[groupId];
        delete styles[groupId];
      }

      return {
        ...s,
        expeditions: next,
        groupSessions: (s.groupSessions ?? []).filter((x) => surviving.has(x.groupId)),
        groupMessages: (s.groupMessages ?? []).filter((x) => surviving.has(x.groupId)),
        groupNotes: notes,
        groupChecklistShared: shared,
        groupStyle: styles,
      };
    });
  }, []);

  const connectionRequests = useMemo(
    () => state.connectionRequests ?? [],
    [state.connectionRequests],
  );

  const queueConnection = useCallback((toAthleteId: string, message: string) => {
    const id = `connection-${Date.now()}`;
    setState((s) => {
      // Blocking someone must actually stop messages going to them, even from a
      // screen that forgot to check.
      if ((s.blockedIds ?? []).includes(toAthleteId)) return s;
      return {
        ...s,
        connectionRequests: [
          {
            id,
            toAthleteId,
            message,
            sentAt: new Date().toISOString(),
            // The only status there is. Nothing was sent; see the type.
            status: "queued",
          },
          ...(s.connectionRequests ?? []),
        ],
      };
    });
    return id;
  }, []);

  const blockedIds = useMemo(() => state.blockedIds ?? [], [state.blockedIds]);

  const blockAthlete = useCallback((id: string) => {
    setState((s) => {
      const blocked = s.blockedIds ?? [];
      return {
        ...s,
        blockedIds: blocked.includes(id) ? blocked : [...blocked, id],
        // Anything already written to them goes with the block. Leaving a
        // queued message addressed to someone the athlete has just blocked is
        // the app holding open a channel they closed.
        connectionRequests: (s.connectionRequests ?? []).filter((r) => r.toAthleteId !== id),
      };
    });
  }, []);

  const unblockAthlete = useCallback((id: string) => {
    setState((s) => ({ ...s, blockedIds: (s.blockedIds ?? []).filter((b) => b !== id) }));
  }, []);

  /* ---- Group planning ----------------------------------------------------- */

  const groupSessions = useMemo(() => state.groupSessions ?? [], [state.groupSessions]);

  const addGroupSession = useCallback(
    (
      groupId: string,
      session: { title: string; dayKey: string; time?: string; place?: string; note?: string },
    ) => {
      const id = localId("group-session");
      setState((s) => ({
        ...s,
        groupSessions: [
          {
            ...session,
            id,
            groupId,
            // No RSVP is recorded on creation. Planning a session is not the
            // same as committing to it, and a pre-filled "going" would be the
            // app answering on the athlete's behalf.
            rsvps: {},
            createdAt: new Date().toISOString(),
          },
          ...(s.groupSessions ?? []),
        ],
      }));
      return id;
    },
    [],
  );

  const removeGroupSession = useCallback((sessionId: string) => {
    setState((s) => ({
      ...s,
      groupSessions: (s.groupSessions ?? []).filter((x) => x.id !== sessionId),
    }));
  }, []);

  const setSessionRsvp = useCallback((sessionId: string, status: RsvpStatus | null) => {
    setState((s) => {
      const meId = s.myProfile?.id ?? LOCAL_ATHLETE_ID;
      return {
        ...s,
        groupSessions: (s.groupSessions ?? []).map((session) => {
          if (session.id !== sessionId) return session;
          const rsvps = { ...session.rsvps };
          // Null deletes the entry rather than storing a placeholder: "has not
          // replied" and "is not coming" are different facts about a session,
          // and a mis-tap has to be recoverable to the first of them.
          if (status === null) delete rsvps[meId];
          else rsvps[meId] = status;
          return { ...session, rsvps };
        }),
      };
    });
  }, []);

  const groupMessages = useMemo(() => state.groupMessages ?? [], [state.groupMessages]);

  const postGroupMessage = useCallback((groupId: string, body: string) => {
    const id = localId("group-message");
    setState((s) => ({
      ...s,
      groupMessages: [
        ...(s.groupMessages ?? []),
        {
          id,
          groupId,
          authorId: s.myProfile?.id ?? LOCAL_ATHLETE_ID,
          body,
          at: new Date().toISOString(),
        },
      ],
    }));
    return id;
  }, []);

  const removeGroupMessage = useCallback((messageId: string) => {
    setState((s) => ({
      ...s,
      groupMessages: (s.groupMessages ?? []).filter((m) => m.id !== messageId),
    }));
  }, []);

  const groupNotes = useMemo(() => state.groupNotes ?? {}, [state.groupNotes]);

  const setGroupNote = useCallback((groupId: string, text: string) => {
    setState((s) => {
      const all = { ...(s.groupNotes ?? {}) };
      // An emptied note is removed rather than stored as "", so a group with
      // nothing written in it renders its empty state instead of a blank box
      // that looks like something failed to load.
      if (text.trim() === "") delete all[groupId];
      else all[groupId] = text;
      return { ...s, groupNotes: all };
    });
  }, []);

  const groupChecklistShared = useMemo(
    () => state.groupChecklistShared ?? {},
    [state.groupChecklistShared],
  );

  const setGroupChecklistShared = useCallback((groupId: string, shared: boolean) => {
    setState((s) => ({
      ...s,
      groupChecklistShared: { ...(s.groupChecklistShared ?? {}), [groupId]: shared },
    }));
  }, []);

  const groupStyle = useMemo(() => state.groupStyle ?? {}, [state.groupStyle]);

  const setGroupStyle = useCallback((groupId: string, style: GroupStyle | null) => {
    setState((s) => {
      const all = { ...(s.groupStyle ?? {}) };
      // Cleared means NOT RECORDED again, not "independent". Leaving a default
      // behind would have ICEFALL asserting that a party is climbing without a
      // guide when all the athlete did was change their mind.
      if (style === null) delete all[groupId];
      else all[groupId] = style;
      return { ...s, groupStyle: all };
    });
  }, []);

  /* ---- Equipment checklist ----------------------------------------------- */

  const checklistStatuses = useMemo(() => state.checklistStatuses ?? {}, [state.checklistStatuses]);

  const setChecklistStatus = useCallback((goalId: string, itemId: string, status: ItemStatus) => {
    setState((s) => {
      const all = s.checklistStatuses ?? {};
      return {
        ...s,
        checklistStatuses: {
          ...all,
          [goalId]: { ...(all[goalId] ?? {}), [itemId]: status },
        },
      };
    });
  }, []);

  const clearChecklistStatus = useCallback((goalId: string, itemId: string) => {
    setState((s) => {
      const all = s.checklistStatuses ?? {};
      const forGoal = all[goalId];
      if (!forGoal || !(itemId in forGoal)) return s;
      // Deleted rather than set to a placeholder value: "not reviewed" has to
      // be recoverable, or an accidental tap becomes a permanent claim about
      // equipment the athlete never looked at.
      const next = { ...forGoal };
      delete next[itemId];
      return { ...s, checklistStatuses: { ...all, [goalId]: next } };
    });
  }, []);

  const packItems = useMemo(() => state.packItems ?? {}, [state.packItems]);

  const addPackItem = useCallback((goalId: string, item: Omit<PackItem, "id">) => {
    setState((s) => {
      const all = s.packItems ?? {};
      return {
        ...s,
        packItems: {
          ...all,
          [goalId]: [...(all[goalId] ?? []), { ...item, id: `pack-${Date.now()}` }],
        },
      };
    });
  }, []);

  const removePackItem = useCallback((goalId: string, itemId: string) => {
    setState((s) => {
      const all = s.packItems ?? {};
      return {
        ...s,
        packItems: { ...all, [goalId]: (all[goalId] ?? []).filter((p) => p.id !== itemId) },
      };
    });
  }, []);

  const packTargetGrams = useMemo(() => state.packTargetGrams ?? {}, [state.packTargetGrams]);

  const setPackTarget = useCallback((goalId: string, grams: number | null) => {
    setState((s) => {
      const all = s.packTargetGrams ?? {};
      // Null clears the target outright. A cleared target must not linger as a
      // zero, which would render as a 0 kg goal nobody set.
      if (grams === null || !Number.isFinite(grams) || grams <= 0) {
        const next = { ...all };
        delete next[goalId];
        return { ...s, packTargetGrams: next };
      }
      return { ...s, packTargetGrams: { ...all, [goalId]: Math.round(grams) } };
    });
  }, []);

  const sessionKey = (w: number, d: string) => `${w}:${d}`;

  const isSessionComplete = useCallback(
    (w: number, d: string, fallback: boolean) =>
      state.sessionOverrides[sessionKey(w, d)] ?? fallback,
    [state.sessionOverrides],
  );

  const toggleSession = useCallback((w: number, d: string, fallback: boolean) => {
    setState((s) => {
      const k = sessionKey(w, d);
      const current = s.sessionOverrides[k] ?? fallback;
      return { ...s, sessionOverrides: { ...s.sessionOverrides, [k]: !current } };
    });
  }, []);

  /**
   * A FRESH INSTALL HAS DRUNK NOTHING.
   *
   * The default here was 1,850 ml, inherited from the demo athlete's day, so
   * the nutrition screen opened claiming the athlete had already drunk 1.8 L
   * before they touched it — the same fixture-as-personal-record mistake as the
   * summits below, in a place nobody was looking. In DEV the seeded figure is
   * still useful for judging a populated screen; everywhere else it starts at
   * nothing and only their own taps move it.
   */
  const addHydration = useCallback((ml: number) => {
    setState((s) => ({ ...s, hydrationMl: Math.max(0, (s.hydrationMl ?? SEEDED_HYDRATION_ML) + ml) }));
  }, []);

  const setBodyMassKg = useCallback((kg: number) => {
    setState((s) => ({ ...s, bodyMassKg: Math.max(30, Math.min(200, Math.round(kg))) }));
  }, []);

  const setAutoPause = useCallback((on: boolean) => {
    setState((s) => ({ ...s, autoPause: on }));
  }, []);

  const hasKudos = useCallback((id: string) => state.kudos.includes(id), [state.kudos]);

  const toggleKudos = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      kudos: s.kudos.includes(id) ? s.kudos.filter((k) => k !== id) : [...s.kudos, id],
    }));
  }, []);

  const addGoal = useCallback((g: Omit<Goal, "id" | "status" | "preparation">) => {
    setState((s) => ({
      ...s,
      customGoals: [
        {
          ...g,
          id: `goal-custom-${Date.now()}`,
          status: "active",
          preparation: 5,
          trainingStartedAt: g.trainingStartedAt ?? new Date().toISOString(),
        },
        ...s.customGoals,
      ],
    }));
  }, []);

  const removeGoal = useCallback((id: string) => {
    setState((s) => ({ ...s, customGoals: s.customGoals.filter((g) => g.id !== id) }));
  }, []);

  const canRemoveGoal = useCallback(
    (id: string) => state.customGoals.some((g) => g.id === id),
    [state.customGoals],
  );

  const objectives = useMemo(() => state.objectives ?? [], [state.objectives]);

  const addObjective = useCallback((o: Omit<SavedObjective, "addedAt">) => {
    setState((s) => {
      if ((s.objectives ?? []).some((x) => x.id === o.id)) return s;
      return {
        ...s,
        objectives: [{ ...o, addedAt: new Date().toISOString() }, ...(s.objectives ?? [])],
      };
    });
  }, []);

  const removeObjective = useCallback((id: string) => {
    setState((s) => ({ ...s, objectives: (s.objectives ?? []).filter((o) => o.id !== id) }));
  }, []);

  const toggleSummited = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      objectives: (s.objectives ?? []).map((o) =>
        o.id === id ? { ...o, summitedAt: o.summitedAt ? undefined : new Date().toISOString() } : o,
      ),
    }));
  }, []);

  const hasObjective = useCallback(
    (id: string) => (state.objectives ?? []).some((o) => o.id === id),
    [state.objectives],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      user,
      goals,
      onboarded: state.onboarded,
      completeOnboarding,
      resetAll,
      isSessionComplete,
      toggleSession,
      hydrationMl: state.hydrationMl ?? SEEDED_HYDRATION_ML,
      addHydration,
      bodyMassKg: state.bodyMassKg ?? 72,
      setBodyMassKg,
      autoPause: state.autoPause ?? true,
      setAutoPause,
      hasKudos,
      toggleKudos,
      addGoal,
      removeGoal,
      canRemoveGoal,
      objectives,
      addObjective,
      removeObjective,
      toggleSummited,
      hasObjective,
      threads,
      startEnquiry,
      replyToThread,
      removeThread,
      account,
      createAccount,
      signOut,
      subscription,
      trialDaysLeft,
      startTrial,
      currentTier,
      can,
      coachUsage,
      coachInteractionsLeft,
      recordCoachInteraction,
      checkIns,
      todaysCheckIn,
      saveCheckIn,
      coachProfile,
      updateCoachProfile,
      coachBudget,
      recordCoachSpend,
      notifications,
      setNotification,
      networkOptIn,
      setNetworkOptIn,
      locationOptIn,
      setLocationOptIn,
      myProfile,
      updateMyProfile,
      expeditions,
      createExpedition,
      leaveExpedition,
      connectionRequests,
      queueConnection,
      blockedIds,
      blockAthlete,
      unblockAthlete,
      groupSessions,
      addGroupSession,
      removeGroupSession,
      setSessionRsvp,
      groupMessages,
      postGroupMessage,
      removeGroupMessage,
      groupNotes,
      setGroupNote,
      groupChecklistShared,
      setGroupChecklistShared,
      groupStyle,
      setGroupStyle,
      checklistStatuses,
      setChecklistStatus,
      clearChecklistStatus,
      packItems,
      addPackItem,
      removePackItem,
      packTargetGrams,
      setPackTarget,
    }),
    [
      user,
      goals,
      state.onboarded,
      state.hydrationMl,
      state.bodyMassKg,
      state.autoPause,
      completeOnboarding,
      resetAll,
      isSessionComplete,
      toggleSession,
      addHydration,
      setBodyMassKg,
      setAutoPause,
      hasKudos,
      toggleKudos,
      addGoal,
      removeGoal,
      canRemoveGoal,
      objectives,
      addObjective,
      removeObjective,
      toggleSummited,
      hasObjective,
      threads,
      startEnquiry,
      replyToThread,
      removeThread,
      account,
      createAccount,
      signOut,
      subscription,
      trialDaysLeft,
      startTrial,
      currentTier,
      can,
      coachUsage,
      coachInteractionsLeft,
      recordCoachInteraction,
      checkIns,
      todaysCheckIn,
      saveCheckIn,
      coachProfile,
      updateCoachProfile,
      coachBudget,
      recordCoachSpend,
      notifications,
      setNotification,
      networkOptIn,
      setNetworkOptIn,
      locationOptIn,
      setLocationOptIn,
      myProfile,
      updateMyProfile,
      expeditions,
      createExpedition,
      leaveExpedition,
      connectionRequests,
      queueConnection,
      blockedIds,
      blockAthlete,
      unblockAthlete,
      groupSessions,
      addGroupSession,
      removeGroupSession,
      setSessionRsvp,
      groupMessages,
      postGroupMessage,
      removeGroupMessage,
      groupNotes,
      setGroupNote,
      groupChecklistShared,
      setGroupChecklistShared,
      groupStyle,
      setGroupStyle,
      checklistStatuses,
      setChecklistStatus,
      clearChecklistStatus,
      packItems,
      addPackItem,
      removePackItem,
      packTargetGrams,
      setPackTarget,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppStateProvider");
  return v;
}

/** The soonest active objective — drives NEXT GOAL and the coach's context. */
export function usePrimaryGoal() {
  const { goals } = useApp();
  return useMemo(
    () =>
      goals
        .filter((g) => g.status === "active")
        .sort((a, b) => +new Date(a.targetDate) - +new Date(b.targetDate))[0],
    [goals],
  );
}
