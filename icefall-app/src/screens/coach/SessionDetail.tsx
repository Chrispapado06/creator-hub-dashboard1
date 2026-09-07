import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Moon,
  Share,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { Avatar, Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, Stagger, TABBAR_STICKY_BOTTOM } from "@/components/layout/chrome";
import { DifficultyDots } from "@/components/domain/cards";
import { useMountainImage } from "@/components/domain/MountainImage";
// `UNAVAILABLE_COPY` exists in both DataState and @/coach/types with different
// shapes — the title/detail pair a card needs versus the single phrase a
// sentence needs. This screen wants the former, so the latter is not imported.
import {
  QualifierBadge,
  ScoreValue,
  UnavailableState,
  UNAVAILABLE_COPY,
} from "@/components/coach/DataState";
import { useCoachIntel, type CoachIntel } from "@/coach/hooks";
import {
  buildSession,
  modifySession,
  PRIMARY_TARGET_LABELS,
  type CoachSession,
  type Modification,
  type SessionBlock,
  type SessionItem,
} from "@/coach/sessions";
import { exerciseById, type Equipment, type Exercise } from "@/coach/exercises";
import { COACH_DISCLAIMER, isKnown, type Score, type Unavailable } from "@/coach/types";
import { useApp } from "@/state/AppState";
import { useTraining } from "@/tracking/training";
import { FOCUS_LABELS, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Goal, TrainingDay, TrainingWeek } from "@/types";

/**
 * Session detail — one planned day, turned into work the athlete can actually do.
 *
 * Route: /coach/session/:date
 *
 * This screen is the last thing between a plan and a body doing something, so
 * it is where ICEFALL's honesty rules bite hardest:
 *
 *  1. NOTHING IS SHOWN THAT WAS NOT COMPUTED. Every figure on this page comes
 *     from `buildSession`, which either has the number or writes the reason it
 *     does not into the tile. There is not a single `?? 0` or `"—"` below.
 *
 *  2. NO PHYSIOLOGY IS CLAIMED. There are no heart-rate zones and no target
 *     paces anywhere on this screen, because ICEFALL has never measured this
 *     athlete's maximum, resting or threshold heart rate. Effort is described in
 *     words — see EFFORT in src/coach/sessions.ts — and the screen says why.
 *
 *  3. EVERY ADAPTATION IS EXPLAINED IN FULL. `modifySession` returns prose with
 *     each change; that prose is rendered prominently rather than summarised,
 *     because an athlete who cannot see what was taken out of a session will
 *     quietly put it back in.
 *
 *  4. A REST DAY IS RENDERED AS REST. No exercises, no start button, no modify
 *     actions — offering "a lighter version" of a rest day is how rest quietly
 *     stops being rest, and the plan's hard days depend on it not doing so.
 */

/* -------------------------------------------------------------------------- */
/* Equipment                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The stored profile keeps equipment as `string[]` so persisted data can never
 * crash a type change in the exercise library. Narrowing happens here, once.
 */
const EQUIPMENT_IDS: readonly string[] = [
  "none",
  "dumbbells",
  "barbell",
  "kettlebell",
  "step",
  "pull-up-bar",
  "bench",
  "resistance-band",
  "treadmill",
  "stairs",
  "pack",
  "hangboard",
];

/**
 * What the athlete has told us they own, or `undefined` when they have told us
 * nothing.
 *
 * The distinction is load-bearing and easy to get wrong. `buildSession` reads an
 * empty array as "this athlete owns nothing at all" and prescribes bodyweight
 * only; it reads `undefined` as "we were never told", prescribes normally, and
 * adds a caution saying the session assumes the movements are available. An
 * untouched profile starts as `[]` (see EMPTY_COACH_PROFILE in AppState), so
 * passing it straight through would silently convert "never asked" into a
 * confident claim about the athlete's garage. Empty therefore means unstated.
 */
function statedEquipment(ids: string[]): Equipment[] | undefined {
  const known = ids.filter((id): id is Equipment => EQUIPMENT_IDS.includes(id));
  return known.length > 0 ? known : undefined;
}

/* -------------------------------------------------------------------------- */
/* Locating the day                                                            */
/* -------------------------------------------------------------------------- */

interface Located {
  week: TrainingWeek;
  day: TrainingDay;
}

/** The planned day for this date, or null. Never a nearest-match. */
function locate(weeks: TrainingWeek[], date: string | undefined): Located | null {
  if (!date) return null;
  for (const week of weeks) {
    const day = week.days.find((d) => d.date === date);
    if (day) return { week, day };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Modifications                                                               */
/* -------------------------------------------------------------------------- */

interface AppliedMod {
  /** Unique per application so the same action can be applied twice. */
  key: string;
  /** The athlete's own words, echoed back above the explanation. */
  label: string;
  mod: Modification;
}

/**
 * Fold every requested change over the planned session, in the order asked for.
 *
 * Modifications compose rather than replace: "I only have 30 minutes" followed
 * by "I'm tired" must produce a session that is both shorter and easier. Each
 * step keeps its own explanation, so the athlete reads the history of what
 * happened to their session rather than a single merged claim.
 */
function applyMods(
  base: CoachSession,
  mods: AppliedMod[],
): { session: CoachSession; changes: { key: string; label: string; explanation: string }[] } {
  let session = base;
  const changes: { key: string; label: string; explanation: string }[] = [];

  for (const applied of mods) {
    const result = modifySession(session, applied.mod);
    session = result.session;
    changes.push({ key: applied.key, label: applied.label, explanation: result.explanation });
  }

  return { session, changes };
}

/**
 * Areas the modification engine can actually match to movements.
 *
 * Taken from DISCOMFORT_AREAS in sessions.ts. Offering an area the engine cannot
 * match would produce a modification that says "ICEFALL could not tell which
 * movements load that" for a word this screen itself suggested, so the chips and
 * the matcher are kept in step. Anything not listed goes through the free-text
 * field, where an unmatched area is answered honestly rather than guessed at.
 */
const SORE_AREAS = [
  "Knee",
  "Lower leg",
  "Ankle",
  "Hamstring",
  "Hip",
  "Back",
  "Shoulder",
  "Wrist",
] as const;

/**
 * The intensity tile's label, taken from the tuple sessions.ts exports rather
 * than retyped, so renaming the tile there cannot silently orphan the lookups
 * that read its value out of `targets`.
 */
const INTENSITY_LABEL = PRIMARY_TARGET_LABELS[2];

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function SessionDetail() {
  const { date } = useParams<{ date: string }>();
  const intel = useCoachIntel();
  const { goals } = useApp();

  const located = useMemo(() => locate(intel.plan?.weeks ?? [], date), [intel.plan, date]);
  const goal = useMemo(() => goals.find((g) => g.id === intel.goal?.id), [goals, intel.goal?.id]);

  if (!intel.plan) return <NoPlanState hasGoal={Boolean(intel.goal)} />;
  if (!located) return <NoSessionState date={date} />;

  // Keyed on the date so navigating between two sessions starts from the
  // planned session again — carrying "I'm tired" from Tuesday onto Wednesday
  // would silently reduce a session the athlete never asked to change.
  return <SessionView key={located.day.date} located={located} goal={goal} intel={intel} />;
}

function SessionView({
  located,
  goal,
  intel,
}: {
  located: Located;
  goal: Goal | undefined;
  intel: CoachIntel;
}) {
  const { week, day } = located;
  const navigate = useNavigate();
  const { coachProfile, toggleSession } = useApp();
  // Completion folds a manual tick together with sessions a recorded activity
  // already satisfies. `useCoachIntel` exposes neither, so it is read from the
  // training layer that owns both rather than re-derived here.
  const training = useTraining();

  const [mods, setMods] = useState<AppliedMod[]>([]);
  const [openItem, setOpenItem] = useState<string | null>(null);
  /**
   * Monotonic id for applied modifications. A counter rather than a timestamp
   * taken inside the state updater: updaters have to be pure, and two identical
   * requests ("I'm tired" twice) must still be two distinct rows in the list of
   * what changed rather than collapsing into one.
   */
  const modSeq = useRef(0);

  const equipment = useMemo(
    () => statedEquipment(coachProfile.availableEquipment),
    [coachProfile.availableEquipment],
  );

  /**
   * `experience` is deliberately not passed.
   *
   * sessions.ts caps movement difficulty at moderate when it is unstated and
   * says so in a caution the screen renders — which is the honest outcome,
   * because the only experience ICEFALL holds is the athlete's mountain
   * experience from onboarding, and mapping "experienced on hills" onto "ready
   * to load a barbell" is exactly the kind of silent inference the coach is not
   * allowed to make. When a movement-experience answer exists it should be
   * passed here explicitly.
   */
  const base = useMemo(
    () => buildSession({ day, goalName: intel.goal?.name, equipment }),
    [day, intel.goal?.name, equipment],
  );

  const { session, changes } = useMemo(() => applyMods(base, mods), [base, mods]);

  const completed = training.completedByDate.get(day.date) ?? day.completed;
  const recorded = training.satisfiedByActivity.has(day.date);

  const addMod = (label: string, mod: Modification) => {
    modSeq.current += 1;
    const key = `mod-${modSeq.current}`;
    setMods((m) => [...m, { key, label, mod }]);
  };

  const intensityTarget = session.targets.find((t) => t.label === INTENSITY_LABEL);

  return (
    <Screen padded={false}>
      <SessionHero
        session={session}
        day={day}
        week={week}
        goal={goal}
        adapted={changes.length > 0}
        onBack={() => navigate(-1)}
      />

      <div className="px-5">
        <Stagger>
          {/* ---- Stat tiles ------------------------------------------------ */}
          <Rise className="pt-5">
            <div className="grid grid-cols-3 gap-2.5">
              {PRIMARY_TARGET_LABELS.map((label) => (
                <StatTile
                  key={label}
                  label={label}
                  value={session.targets.find((t) => t.label === label)?.value}
                />
              ))}
            </div>
            {/* The reason there is no "Zone 3" anywhere on this screen. It is a
                deliberate absence, so it is stated rather than left as a gap. */}
            <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
              Effort is written in words, not zones. ICEFALL has never measured your maximum,
              resting or threshold heart rate, so any zone or target pace printed here would be a
              number with nothing behind it.
            </p>
          </Rise>

          {/* ---- Adaptations ----------------------------------------------- */}
          {changes.length > 0 && (
            <Rise className="pt-6">
              <SectionLabel
                action={
                  <button
                    type="button"
                    onClick={() => setMods([])}
                    className="inline-flex h-11 items-center gap-1.5 text-[11px] text-mist transition-colors hover:text-snow"
                  >
                    <Undo2 size={13} strokeWidth={1.6} />
                    Reset to planned
                  </button>
                }
              >
                What changed
              </SectionLabel>
              <div className="mt-3 space-y-2.5">
                {changes.map((c) => (
                  <div
                    key={c.key}
                    className="rounded-card border border-hairline bg-slate p-4 border-l-2 border-l-azure"
                  >
                    <p className="section-label text-azure/85">You said: {c.label}</p>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-snow/90">
                      {c.explanation}
                    </p>
                  </div>
                ))}
              </div>
            </Rise>
          )}

          {/* ---- Purpose --------------------------------------------------- */}
          <Rise className="pt-6">
            <SectionLabel>Purpose</SectionLabel>
            <p className="mt-3 text-[13px] leading-relaxed text-mist">{session.purpose}</p>
          </Rise>

          {/* ---- Target ---------------------------------------------------- */}
          <Rise className="pt-6">
            <SectionLabel>Target</SectionLabel>
            <Card className="mt-3" inset={false}>
              <div className="px-4">
                {session.targets.map((t, i) => (
                  <div
                    key={t.label}
                    className={cn(
                      "flex items-start justify-between gap-4 py-3.5",
                      i > 0 && "border-t border-hairline",
                    )}
                  >
                    <p className="shrink-0 text-[12px] text-mist">{t.label}</p>
                    <p className="tnum text-right text-[13px] leading-snug text-snow">{t.value}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 border-t border-hairline py-3.5">
                  <p className="shrink-0 text-[12px] text-mist">Planned difficulty</p>
                  <DifficultyDots level={day.difficulty} />
                </div>
              </div>
            </Card>
            {day.detail && (
              <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
                From your plan: {day.detail}
              </p>
            )}
          </Rise>

          {/* ---- Readiness ------------------------------------------------- */}
          <Rise className="pt-6">
            <BeforeYouStart
              readiness={intel.readiness}
              recoveryInputs={intel.recovery.inputs}
              checkedIn={intel.recovery.inputs.some((i) => i.id === "energy" && i.value !== null)}
            />
          </Rise>

          {/* ---- The work -------------------------------------------------- */}
          {session.isRest ? (
            <Rise className="pt-6">
              <RestDay session={session} />
            </Rise>
          ) : (
            <>
              {session.blocks.map((block) => (
                <Rise key={block.id} className="pt-6">
                  <Block
                    block={block}
                    openItem={openItem}
                    onToggleItem={(id) => setOpenItem((cur) => (cur === id ? null : id))}
                    intensity={intensityTarget?.value}
                  />
                </Rise>
              ))}

              {session.blocks.length === 0 && (
                <Rise className="pt-6">
                  <Card>
                    <SectionLabel>No work prescribed</SectionLabel>
                    <p className="mt-3 text-[13px] leading-relaxed text-mist">
                      Nothing in the exercise library matches this session with the equipment
                      ICEFALL knows about, so it has not improvised one. The notes from your coach
                      below say what would change that.
                    </p>
                  </Card>
                </Rise>
              )}

              {/* ---- Modify ------------------------------------------------ */}
              <Rise className="pt-6">
                <ModifyPanel onApply={addMod} />
              </Rise>
            </>
          )}

          {/* ---- Tips from Coach ------------------------------------------- */}
          <Rise className="pt-6">
            <CoachTips session={session} firstName={intel.firstName} />
          </Rise>

          <Rise className="pt-6">
            <Disclaimer>{COACH_DISCLAIMER}</Disclaimer>
          </Rise>
        </Stagger>

        {/* ---- Sticky action ----------------------------------------------- */}
        <StickyAction
          session={session}
          completed={completed}
          recorded={recorded}
          onStart={() => navigate("/activity/select")}
          /**
           * The fallback has to be the state the athlete is looking at, not the
           * plan's seeded flag. `toggleSession` flips `override ?? fallback`, and
           * the tick shown here is `override ?? (satisfied-by-activity || seeded)`
           * — so passing the seeded flag alone on a day a recorded activity
           * already satisfied would compute `false`, write `true`, and leave the
           * control visibly unchanged when tapped.
           */
          onToggleComplete={() => toggleSession(week.index, day.date, recorded || day.completed)}
        />
      </div>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

function SessionHero({
  session,
  day,
  week,
  goal,
  adapted,
  onBack,
}: {
  session: CoachSession;
  day: TrainingDay;
  week: TrainingWeek;
  goal: Goal | undefined;
  adapted: boolean;
  onBack: () => void;
}) {
  // No goal means no mountain, and a mountain photograph attached to a session
  // that is not preparing for one would be decoration pretending to be context.
  // The header falls back to plain graphite rather than borrowing a summit.
  const image = useMountainImage({
    name: goal?.name ?? "",
    elevationM: goal?.elevationM,
    lat: goal?.lat,
    lon: goal?.lon,
    photo: goal?.photo,
    wikipedia: goal?.wikipedia,
  });

  const share = () => {
    const url = window.location.href;
    // navigator.share exists only on mobile Safari and Chrome; the clipboard is
    // the honest fallback rather than a control that silently does nothing.
    if (navigator.share) void navigator.share({ title: session.title, url }).catch(() => {});
    else void navigator.clipboard?.writeText(url).catch(() => {});
  };

  const intensity = session.targets.find((t) => t.label === INTENSITY_LABEL)?.value;

  return (
    <div className="relative h-[290px] w-full overflow-hidden bg-slate">
      {goal && (
        <img
          src={image.src}
          alt=""
          aria-hidden
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            image.real ? "opacity-100" : "opacity-45",
          )}
        />
      )}
      <div className="absolute inset-0 scrim-bottom" />

      <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
        >
          <ChevronRight size={17} strokeWidth={1.7} className="rotate-180" />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={share}
          aria-label="Share this session"
          className="grid h-11 w-11 place-items-center rounded-full border border-hairline bg-obsidian/60 text-snow backdrop-blur transition-colors hover:border-azure/50"
        >
          <Share size={16} strokeWidth={1.7} />
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        <p className="section-label text-azure/85">
          Week {week.index} · {week.block}
        </p>
        <h1 className="display mt-2 text-[32px] leading-[1.06] text-snow">{session.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="azure">{FOCUS_LABELS[session.focus] ?? session.focus}</Badge>
          {intensity && <Badge tone="neutral">{intensity}</Badge>}
          {adapted && <Badge tone="summit">Adapted</Badge>}
        </div>

        <p className="tnum mt-2.5 text-[12px] text-mist">
          {fmtDate(day.date, { weekday: "long" })}
        </p>

        {/* Tier of the photograph, never hidden: band artwork must not be able
            to pass as a photograph of the athlete's actual objective. */}
        {goal && !image.real && image.caption && (
          <p className="mt-2 text-[10px] leading-relaxed text-mist-dim">{image.caption}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat tile                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One header tile.
 *
 * `buildSession` guarantees all three primary tiles exist and writes the reason
 * into the value where a figure does not exist ("Not set by your plan"), so the
 * missing branch here is a defence against an upstream change rather than the
 * normal path — and it still refuses to print a zero or a dash.
 */
function StatTile({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="rounded-tile border border-hairline bg-graphite p-3.5">
      <p className="section-label">{label}</p>
      {value === undefined ? (
        <p className="mt-2.5 text-[11px] leading-snug text-mist-dim">Not computed</p>
      ) : (
        <p className="tnum mt-2.5 text-[15px] font-light leading-snug text-snow">{value}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Before you start                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Recovery inputs the athlete typed in, as opposed to the ones ICEFALL derived.
 *
 * This distinction is the whole reason `QualifierBadge` exists. An energy score
 * of 4 is an opinion that moves with mood; a load ratio of 1.3 is arithmetic
 * over sessions that were actually recorded. Rendering them identically would
 * let an athlete read their own mood back as a measurement of their body, which
 * is the overreach the coach is not allowed to make.
 */
const SELF_REPORTED_INPUTS = new Set(["energy", "soreness", "sleep", "stress", "motivation"]);

/** Check-in fields are 1–5, so the scale is printed with them. */
const CHECK_IN_SCALE = " / 5";

/**
 * The one readiness factor with no data source at all — not today, and not
 * after a year of recording.
 *
 * HRV needs a chest strap or a watch talking to a native health store. No
 * browser API exposes it, iOS has no Web Bluetooth, and there is nothing
 * adjacent ICEFALL could derive it from without inventing physiology. It is
 * listed rather than omitted so the athlete knows the coach is not quietly
 * reading something it cannot read.
 */
const HRV_FACTOR = {
  label: "Heart-rate variability",
  detail: "No browser API exposes HRV, and ICEFALL will not infer it from anything else.",
} as const;

/**
 * One recovery input, with its provenance or its absence.
 *
 * Three renderings and no fourth: a value the athlete reported, a value ICEFALL
 * derived, or the named reason there is no value. Nothing falls through to a
 * zero or a dash.
 */
function InputRow({
  label,
  value,
  reason,
  scaled,
}: {
  label: string;
  value: number | null;
  reason?: Unavailable;
  scaled: boolean;
}) {
  if (value === null) {
    const copy = UNAVAILABLE_COPY[reason ?? "no-data"];
    return (
      <div className="flex items-start justify-between gap-4 border-t border-hairline py-3 first:border-t-0">
        <p className="text-[12px] leading-snug text-mist">{label}</p>
        <div className="max-w-[20ch] text-right">
          <p className="section-label">{copy.title}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-mist-dim">{copy.detail}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t border-hairline py-3 first:border-t-0">
      <p className="text-[12px] leading-snug text-mist">{label}</p>
      <div className="flex shrink-0 items-center gap-2.5">
        <QualifierBadge kind={scaled ? "self-reported" : "estimated"} />
        <span className="tnum text-[14px] font-light text-snow">
          {value}
          {scaled && <span className="text-[11px] text-mist">{CHECK_IN_SCALE}</span>}
        </span>
      </div>
    </div>
  );
}

/**
 * The readiness strip, shown before the work rather than after it.
 *
 * This is the screen where a readiness number can actually change a decision, so
 * it renders the real `Score` — including its null states — and names every
 * factor the coach could not see. Nothing here tells the athlete whether they
 * are recovered: it tells them what ICEFALL looked at.
 */
function BeforeYouStart({
  readiness,
  recoveryInputs,
  checkedIn,
}: {
  readiness: { score: Score; guidance: string; missing: string[] };
  recoveryInputs: { id: string; label: string; value: number | null; reason?: Unavailable }[];
  checkedIn: boolean;
}) {
  return (
    <Card>
      <SectionLabel>Before you start</SectionLabel>

      <div className="mt-4 flex items-start gap-5">
        <div className="shrink-0">
          <ScoreValue
            score={readiness.score}
            size="md"
            // Readiness is assembled from load, recorded sessions and what the
            // athlete reported. None of it is measured physiology, so the number
            // carries its provenance rather than passing as an instrument
            // reading. With no check-in it is derived data only.
            qualifier={
              isKnown(readiness.score) ? (checkedIn ? "self-reported" : "estimated") : undefined
            }
          />
          {isKnown(readiness.score) && <p className="section-label mt-2">Readiness</p>}
        </div>
        <p className="flex-1 text-[13px] leading-relaxed text-mist">{readiness.guidance}</p>
      </div>

      {readiness.missing.length > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="section-label">Not counted in that number</p>
          <ul className="mt-2.5 space-y-1.5">
            {readiness.missing.map((m) => (
              <li key={m} className="flex items-start gap-2 text-[12px] leading-relaxed text-mist">
                <Circle
                  size={5}
                  strokeWidth={0}
                  fill="currentColor"
                  className="mt-1.5 shrink-0 text-mist-dim"
                />
                {m}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
            {checkedIn
              ? "These fill in as you record sessions — the score rests on what survived rather than on an assumed average."
              : "Recording today's check-in and your sessions is what fills these in. Nothing has been averaged in to cover them."}
          </p>
          {!checkedIn && (
            <Button asChild variant="secondary" size="sm" className="mt-3.5">
              <Link to="/coach">Check in with the coach</Link>
            </Button>
          )}
        </div>
      )}

      {/* Every input the recovery assessment looked at, present or absent, with
          its provenance attached. Sleep duration and resting heart rate arrive
          here with reason "not-connected" — the honest NO SENSOR state — rather
          than as a filled bar the athlete could mistake for a reading. */}
      <div className="mt-5 border-t border-hairline pt-4">
        <p className="section-label">What ICEFALL read today</p>
        <div className="mt-2">
          {recoveryInputs.map((input) => (
            <InputRow
              key={input.id}
              label={input.label}
              value={input.value}
              reason={input.reason}
              scaled={SELF_REPORTED_INPUTS.has(input.id)}
            />
          ))}
        </div>
      </div>

      {/* A factor with no data source at all. Not a gap waiting to be filled by
          using the app more — no amount of recording produces it — so it is
          stated separately and permanently rather than sitting in the list
          above as though it were one check-in away. */}
      <div className="mt-5 border-t border-hairline pt-4">
        <p className="section-label">No source, and there will not be one</p>
        <div className="mt-3.5 flex items-start gap-4 rounded-tile border border-hairline bg-slate/60 p-4">
          <UnavailableState reason="not-connected" size="sm" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium text-snow/85">{HRV_FACTOR.label}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{HRV_FACTOR.detail}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                      */
/* -------------------------------------------------------------------------- */

function Block({
  block,
  openItem,
  onToggleItem,
  intensity,
}: {
  block: SessionBlock;
  openItem: string | null;
  onToggleItem: (id: string) => void;
  intensity: string | undefined;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5">
        <span className="h-3.5 w-px shrink-0 bg-azure" aria-hidden />
        <span className="section-label">{block.label}</span>
        <span className="tnum ml-auto text-[11px] text-mist-dim">
          {block.items.length} {block.items.length === 1 ? "movement" : "movements"}
        </span>
      </div>

      {block.note && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">{block.note}</p>
      )}

      <Card className="mt-3" inset={false}>
        <div className="px-4">
          {block.items.map((item, i) => (
            <ExerciseRow
              key={`${block.id}-${item.exerciseId}-${i}`}
              item={item}
              open={openItem === `${block.id}-${i}`}
              onToggle={() => onToggleItem(`${block.id}-${i}`)}
              divided={i > 0}
              fallbackIntensity={block.kind === "main" ? intensity : undefined}
            />
          ))}
        </div>
      </Card>
    </section>
  );
}

/**
 * The prescription line for one movement.
 *
 * Every field is optional in `SessionItem` because the library genuinely does
 * not prescribe sets for everything — finger loading on a hangboard is the
 * athlete's business, not a number ICEFALL can invent. Missing fields are
 * therefore omitted from this line and the item's own note carries the reason;
 * nothing here fills a gap with a plausible default.
 */
function prescription(item: SessionItem): string[] {
  const parts: string[] = [];
  if (item.sets !== undefined && item.reps !== undefined) parts.push(`${item.sets} × ${item.reps}`);
  else if (item.sets !== undefined) parts.push(`${item.sets} sets`);
  else if (item.reps !== undefined) parts.push(`${item.reps} reps`);
  if (item.durationMin !== undefined) parts.push(`${item.durationMin} min`);
  if (item.restSec !== undefined) parts.push(`${item.restSec} s rest`);
  return parts;
}

function ExerciseRow({
  item,
  open,
  onToggle,
  divided,
  fallbackIntensity,
}: {
  item: SessionItem;
  open: boolean;
  onToggle: () => void;
  divided: boolean;
  fallbackIntensity: string | undefined;
}) {
  const exercise: Exercise | undefined = exerciseById(item.exerciseId);
  const parts = prescription(item);
  const effort = item.intensity ?? fallbackIntensity;

  return (
    <div className={cn(divided && "border-t border-hairline")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-3 py-3.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-light leading-snug text-snow">{item.name}</p>
          {parts.length > 0 && (
            <p className="tnum mt-1 text-[12px] text-mist">{parts.join(" · ")}</p>
          )}
        </div>
        <ChevronDown
          size={15}
          strokeWidth={1.6}
          className={cn(
            "shrink-0 text-mist-dim transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="pb-4">
          {effort && (
            <div className="rounded-tile border border-hairline bg-slate/60 px-3.5 py-3">
              <p className="section-label">Effort</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-snow/85">{effort}</p>
            </div>
          )}

          {item.note && <p className="mt-3 text-[12px] leading-relaxed text-mist">{item.note}</p>}

          {exercise ? (
            <>
              <div className="mt-4 border-l border-azure/30 pl-3">
                <p className="section-label text-azure/85">Why it transfers</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                  {exercise.relevanceReason}
                </p>
              </div>

              <p className="section-label mt-4">How to do it</p>
              <ol className="mt-2 space-y-2">
                {exercise.instructions.map((line, i) => (
                  <li key={line} className="flex gap-2.5 text-[12px] leading-relaxed text-mist">
                    <span className="tnum shrink-0 text-mist-dim">{i + 1}</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone={exercise.mountainRelevance === "high" ? "azure" : "neutral"}>
                  {exercise.mountainRelevance} transfer
                </Badge>
                {exercise.equipment
                  .filter((e) => e !== "none")
                  .map((e) => (
                    <Badge key={e} tone="neutral">
                      {e.replace(/-/g, " ")}
                    </Badge>
                  ))}
                {exercise.highJointLoad && <Badge tone="alert">Loads the joint hard</Badge>}
              </div>
            </>
          ) : (
            /* An id the library does not hold. Rather than render an empty
               shell, the row says plainly that there are no instructions —
               inventing technique cues for an unknown movement is exactly the
               fabrication the house rules forbid. */
            <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
              This movement is not in ICEFALL's exercise library, so there are no instructions or
              mountain-relevance notes for it. Have the technique checked by a qualified coach
              before loading it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rest day                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A rest day, rendered as rest.
 *
 * No exercises, no "gentle options", no start control. The copy explains why
 * doing nothing is the training, because an athlete who does not understand
 * that will fill the day in, and the plan's hard sessions depend on them not
 * doing so.
 */
function RestDay({ session }: { session: CoachSession }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline text-azure">
          <Moon size={16} strokeWidth={1.5} />
        </span>
        <div>
          <p className="text-[15px] font-light text-snow">Rest is the session</p>
          <p className="section-label mt-1">No training prescribed</p>
        </div>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-mist">{session.purpose}</p>

      <p className="mt-3 text-[13px] leading-relaxed text-mist">
        Adaptation happens on days like this one, not during the work that provoked it. Nothing has
        been offered here to fill the day, because a light optional circuit is how a rest day
        quietly stops being one.
      </p>

      {session.cautions.map((c) => (
        <p
          key={c}
          className="mt-3 border-l border-azure/30 pl-3 text-[12px] leading-relaxed text-mist-dim"
        >
          {c}
        </p>
      ))}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Modify                                                                      */
/* -------------------------------------------------------------------------- */

function ModifyPanel({ onApply }: { onApply: (label: string, mod: Modification) => void }) {
  const [soreOpen, setSoreOpen] = useState(false);
  const [soreText, setSoreText] = useState("");

  const chip =
    "min-h-[44px] rounded-tile border border-hairline bg-graphite px-4 py-3 text-left text-[13px] " +
    "font-light text-snow transition-colors hover:border-azure/40 hover:bg-white/[0.03]";

  return (
    <section>
      <SectionLabel>Adapt this session</SectionLabel>
      <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
        Every change below removes work. Nothing here makes the session harder to fit it into less
        time, and nothing you skip is owed back later.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          className={chip}
          onClick={() => onApply("I only have 30 minutes", { kind: "time", minutes: 30 })}
        >
          I only have 30 minutes
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => onApply("Only bodyweight", { kind: "equipment", equipment: ["none"] })}
        >
          Only bodyweight
        </button>
        <button
          type="button"
          className={cn(chip, soreOpen && "border-azure/40")}
          aria-expanded={soreOpen}
          onClick={() => setSoreOpen((o) => !o)}
        >
          <span className="flex items-center justify-between gap-2">
            Something feels sore
            <SlidersHorizontal size={13} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
          </span>
        </button>
        <button
          type="button"
          className={chip}
          onClick={() => onApply("I'm tired", { kind: "fatigue" })}
        >
          I'm tired
        </button>
      </div>

      {soreOpen && (
        <Card className="mt-3">
          <p className="text-[12px] leading-relaxed text-mist">
            Where? ICEFALL routes the heavier joint loading away from it and reduces the rest. It
            cannot tell you what is going on — if it is still there in a few days, or it changes how
            you move, have it assessed rather than training around it.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {SORE_AREAS.map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => {
                  onApply(`${area} feels sore`, { kind: "discomfort", area });
                  setSoreOpen(false);
                }}
                className="min-h-[44px] rounded-full border border-hairline px-4 text-[12px] text-snow transition-colors hover:border-azure/40"
              >
                {area}
              </button>
            ))}
          </div>
          <div className="mt-3.5 flex gap-2">
            <input
              value={soreText}
              onChange={(e) => setSoreText(e.target.value)}
              placeholder="Somewhere else"
              aria-label="Where does it feel sore"
              className="h-11 min-w-0 flex-1 rounded-tile border border-hairline bg-slate px-3.5 text-[13px] text-snow placeholder:text-mist-dim focus:border-azure/40 focus:outline-none"
            />
            <Button
              variant="secondary"
              size="md"
              disabled={soreText.trim().length === 0}
              onClick={() => {
                onApply(`${soreText.trim()} feels sore`, {
                  kind: "discomfort",
                  area: soreText.trim(),
                });
                setSoreText("");
                setSoreOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Tips from Coach                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The cautions `buildSession` produced, attributed to the coach.
 *
 * These are the real generated notes — the equipment gap, the guide requirement
 * on technical days, the turnaround time on a long day. Nothing generic has been
 * added to make the card look fuller.
 */
function CoachTips({ session, firstName }: { session: CoachSession; firstName: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name="ICEFALL Coach" size={32} />
        <div>
          <p className="text-[13px] font-light text-snow">Tips from Coach</p>
          <p className="section-label mt-1">For {firstName}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {session.cautions.map((c) => (
          <p key={c} className="text-[12px] leading-relaxed text-mist">
            {c}
          </p>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Sticky action                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The one azure control on the screen.
 *
 * On a rest day there is deliberately nothing to start. On a session ICEFALL
 * cannot record — strength, technical — starting means the tracker, which would
 * be a GPS trace of a gym floor, so the primary control is completion instead
 * and the label says which it is rather than implying a recording that will
 * never exist.
 */
function StickyAction({
  session,
  completed,
  recorded,
  onStart,
  onToggleComplete,
}: {
  session: CoachSession;
  completed: boolean;
  recorded: boolean;
  onStart: () => void;
  onToggleComplete: () => void;
}) {
  const recordable =
    session.focus === "endurance" ||
    session.focus === "intervals" ||
    session.focus === "long-mountain" ||
    session.focus === "recovery";

  return (
    <div
      className="sticky -mx-5 mt-8 border-t border-hairline bg-obsidian/95 px-5 pb-4 pt-3 backdrop-blur"
      style={{ bottom: TABBAR_STICKY_BOTTOM }}
    >
      {recorded && !session.isRest && (
        <p className="mb-2.5 text-[11px] leading-relaxed text-mist-dim">
          An activity you recorded on this date already satisfies this session.
        </p>
      )}

      {session.isRest ? (
        <Button variant="secondary" size="lg" className="w-full" onClick={onToggleComplete}>
          {completed ? <Check size={16} strokeWidth={1.8} /> : null}
          {completed ? "Rest day taken" : "Mark rest day as taken"}
        </Button>
      ) : (
        <div className="flex gap-2.5">
          {recordable ? (
            <>
              <Button size="lg" className="flex-1" onClick={onStart}>
                Start session
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-[52px] px-0"
                aria-label={completed ? "Mark as not complete" : "Mark as complete"}
                onClick={onToggleComplete}
              >
                <Check
                  size={18}
                  strokeWidth={1.8}
                  className={completed ? "text-azure" : "text-mist"}
                />
              </Button>
            </>
          ) : (
            <Button size="lg" className="w-full" onClick={onToggleComplete}>
              {completed ? <Check size={16} strokeWidth={1.8} /> : null}
              {completed ? "Session complete" : "Mark session complete"}
            </Button>
          )}
        </div>
      )}

      {!session.isRest && !recordable && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          ICEFALL cannot record this session — there is nothing for GPS to trace indoors — so mark
          it off when it is done.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty states                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The new athlete: no goal, so no plan, so no session.
 *
 * Deliberately not a placeholder session. ICEFALL cannot write a training week
 * without knowing what it is for, and a generic one would be a guess dressed as
 * a prescription.
 */
function NoPlanState({ hasGoal }: { hasGoal: boolean }) {
  return (
    <Screen>
      <div className="pt-16">
        <Stagger>
          <Rise>
            <UnavailableState reason={hasGoal ? "no-data" : "not-reported"} size="lg" />
          </Rise>
          <Rise className="pt-6">
            <h1 className="text-center text-[20px] font-light text-snow">
              {hasGoal ? "No plan for this objective yet" : "No training plan"}
            </h1>
            <p className="mx-auto mt-3 max-w-[34ch] text-center text-[13px] leading-relaxed text-mist">
              {hasGoal
                ? "ICEFALL builds the week from your objective and the sessions you record. There is nothing scheduled for this date yet."
                : "A training plan is built from an objective — its altitude, its date and what it demands. Set one and the weeks are generated around it. ICEFALL will not write a generic week, because a plan that is not for anything cannot prepare you for anything."}
            </p>
          </Rise>
          <Rise className="pt-7">
            <div className="flex justify-center gap-2.5">
              <Button asChild size="md">
                <Link to="/goals">{hasGoal ? "Review your objective" : "Set an objective"}</Link>
              </Button>
              <Button asChild variant="secondary" size="md">
                <Link to="/coach/training">Training</Link>
              </Button>
            </div>
          </Rise>
        </Stagger>
      </div>
    </Screen>
  );
}

/** A plan exists, but nothing is scheduled on the requested date. */
function NoSessionState({ date }: { date: string | undefined }) {
  return (
    <Screen>
      <div className="pt-16">
        <Stagger>
          <Rise>
            <UnavailableState reason="no-data" size="lg" />
          </Rise>
          <Rise className="pt-6">
            <h1 className="text-center text-[20px] font-light text-snow">Nothing planned here</h1>
            <p className="mx-auto mt-3 max-w-[34ch] text-center text-[13px] leading-relaxed text-mist">
              {date
                ? `Your plan has no session on ${fmtDate(date)}. It runs from the week your build started to your objective's date.`
                : "No date was given, so there is no session to show."}
            </p>
          </Rise>
          <Rise className="pt-7">
            <div className="flex justify-center">
              <Button asChild variant="secondary" size="md">
                <Link to="/coach/training">Open your plan</Link>
              </Button>
            </div>
          </Rise>
        </Stagger>
      </div>
    </Screen>
  );
}
