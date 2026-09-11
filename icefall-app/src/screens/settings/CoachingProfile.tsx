import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { DateField } from "@/components/ui/DateField";
import { Disclaimer } from "@/components/ui/primitives";
import { Rise } from "@/components/layout/chrome";
import { ChoiceRow, Group, InfoRow, SettingsPage } from "@/components/settings/kit";
import {
  ALTITUDE_BANDS,
  ALTITUDE_ILLNESS,
  BASELINES,
  DISCIPLINES,
  EQUIPMENT,
  isoDayKey,
  LEVELS,
  LEVEL_TO_EXPERIENCE,
  MOVEMENT_LEVELS,
  pickEquipment,
  SESSION_LENGTHS,
  SKILL_GROUPS,
  WEEK,
} from "@/coach/answers";
import { LIMITATIONS, limitationLabel } from "@/coach/limitations";
import { canTrainAround } from "@/coach/sessions";
import { useCoachingBinding } from "@/coach/profileBinding";
import { useCoachingHydrationState } from "@/settings/hydrate";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import type { Equipment } from "@/coach/exercises";
import type { CoachingAnswersResult } from "@/settings/sync";

/**
 * EDIT COACHING PROFILE — the screen that did not exist.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * Every answer in the signup questionnaire was permanent. `updateCoachProfile`
 * had exactly two callers in the whole app — the questionnaire and the free
 * readiness test — and neither is a screen anybody goes back to. So an athlete
 * who bought a barbell, lost a training day, recovered from the knee they
 * declared, or moved their expedition by a month had no way to say so, and
 * every engine downstream kept prescribing against the answer they gave once.
 * The target date was the sharpest case: the entire plan is built backwards
 * from it, and the only way to change it was to delete the objective and lose
 * its record with it.
 *
 * ── IT WRITES WHERE THE QUESTIONNAIRE WRITES ───────────────────────────────
 *
 * Not a second write path and not a second vocabulary. The option lists are
 * `@/coach/answers`, which the questionnaire also imports — the ids in them are
 * what the engines read, so a label or an id edited on one screen and not the
 * other would be two different questions filling one field. The write is
 * `coach/profileBinding.ts`, which is the same local-then-server order signup
 * uses and the same place the fetch lands.
 *
 * ── WHAT IT WILL NOT LET SOMEBODY CHANGE, AND WHY EACH ONE ─────────────────
 *
 * · SEX AT BIRTH. `rememberSexForEnergy` refuses to overwrite an answer that is
 *   already held, and it refuses for a reason: it is one constant in a
 *   resting-energy equation, the Fuel screen states what it narrowed, and a
 *   control here that silently did nothing would be the worst thing an account
 *   centre can contain. Changing it needs a path that can say "this is already
 *   set", and that is the Fuel screen's business, not this one's.
 * · GENDER and WHERE YOU FOUND ICEFALL. Both are recorded and read by nothing —
 *   the signup steps say so in those words. An edit screen for an answer that
 *   changes nothing would be inventing a reason to come back here.
 * · THE OBJECTIVE ITSELF. Picking a different mountain is not an edit, it is a
 *   new objective with its own plan and its own record; Goals owns that.
 *   The DATE is an edit and is here.
 * · THE NAME, which is `profiles.display_name` and belongs to Edit profile.
 *   Two screens writing one name is how the app and the public row disagree.
 *
 * ── NO BOXES ───────────────────────────────────────────────────────────────
 *
 * Flat rows, section labels and space, like the rest of settings. The one
 * hairline is BETWEEN rows, which is the kit's own rule: consecutive settings
 * rows are genuinely unlike each other and there is no icon column aligning
 * them.
 */

/* -------------------------------------------------------------------------- */
/* The two controls the settings kit does not have                            */
/* -------------------------------------------------------------------------- */

const ROW_DIVIDE = "-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0";

const CHIP = "rounded-pill border px-3 py-1.5 text-[12px] transition-colors";
const CHIP_ON = "border-azure/55 bg-azure/[0.12] text-azure";
const CHIP_OFF = "border-hairline-strong text-mist hover:text-snow";

/** Several answers at once. The same chips `ChoiceRow` uses, multi-select. */
function MultiRow<T extends string>({
  title,
  detail,
  options,
  value,
  onToggle,
  footer,
}: {
  title: string;
  detail?: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onToggle: (v: T) => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className={ROW_DIVIDE}>
      <p className="text-[14px] text-snow">{title}</p>
      {detail && <p className="mt-1 text-[11.5px] leading-relaxed text-mist">{detail}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value.includes(o.value)}
            onClick={() => onToggle(o.value)}
            className={cn(CHIP, value.includes(o.value) ? CHIP_ON : CHIP_OFF)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}

/**
 * A number with a unit, committed on blur rather than per keystroke.
 *
 * Per keystroke would send a request for "1", "17" and "175" on the way to a
 * height, and the first two are inside the column's CHECK — so the server would
 * briefly, truthfully hold a height of 1 cm. A REFUSED value is not written
 * anywhere, locally or remotely: the box goes back to what is actually held,
 * because a box showing a number nothing has stored is the screen lying.
 */
function NumberRow({
  title,
  detail,
  unit,
  value,
  min,
  max,
  onCommit,
}: {
  title: string;
  detail?: string;
  unit: string;
  value: number | undefined;
  min: number;
  max: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? "" : String(value));

  const commit = () => {
    const n = Number((draft ?? "").replace(",", "."));
    if (Number.isFinite(n) && n >= min && n <= max) onCommit(Math.round(n * 10) / 10);
    setDraft(null);
  };

  return (
    <div className={cn(ROW_DIVIDE, "flex items-start gap-3.5")}>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-snow">{title}</span>
        {detail && (
          <span className="mt-1 block text-[11.5px] leading-relaxed text-mist">{detail}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 self-center">
        <input
          inputMode="decimal"
          aria-label={title}
          value={shown}
          placeholder="—"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="tnum w-16 border-b border-hairline-strong bg-transparent pb-1 text-right text-[13px] text-snow outline-none focus:border-azure"
        />
        <span className="text-[11.5px] text-mist-dim">{unit}</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* What the last save actually did                                            */
/* -------------------------------------------------------------------------- */

/**
 * ONE SENTENCE, AND IT NEVER SAYS MORE THAN HAPPENED.
 *
 * The local write has already landed by the time this renders — that is what
 * makes the screen instant and what makes it work with no signal — so the
 * question a sentence here answers is only ever "did it reach the account", and
 * `saveCoachingAnswers` reports per seam rather than per screen because the two
 * halves genuinely fail apart.
 */
function outcomeOf(result: CoachingAnswersResult | null): string | null {
  if (!result) return null;
  const seams = [result.columns, result.answers].filter((r) => r !== null);
  if (seams.length === 0) return null;
  if (seams.every((r) => r.state === "saved")) return "Saved to your ICEFALL account.";
  const queued = seams.find((r) => r.keptOnDevice);
  if (queued) {
    return `${queued.message} It will be sent the next time ICEFALL opens with a signal.`;
  }
  return seams.find((r) => r.state !== "saved")?.message ?? null;
}

/* -------------------------------------------------------------------------- */

export default function CoachingProfile() {
  const { coachProfile, user, goals, setGoalTargetDate, canRemoveGoal, bodyMassKgSet } = useApp();
  const { settings } = useSettings();
  const { save } = useCoachingBinding();
  const hydration = useCoachingHydrationState();

  const [result, setResult] = useState<CoachingAnswersResult | null>(null);
  const [dateNote, setDateNote] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const objective = goals.find((g) => g.status === "active") ?? null;
  /* Only an objective this athlete created can be moved — the seeded fixtures
     are DEV-only and are not theirs. `setGoalTargetDate` says so by returning
     false; this asks the same question up front, through `canRemoveGoal`, which
     is AppState's existing "is this one of theirs" answer. Reading the id
     prefix here instead would be a second copy of a fact AppState owns. */
  const movable = objective !== null && canRemoveGoal(objective.id);

  const equipment = (coachProfile.availableEquipment ?? []) as Equipment[];
  const limitations = coachProfile.limitations ?? [];
  const skills = coachProfile.technicalSkills ?? [];
  const days = coachProfile.trainingDays ?? [];

  const send = (patch: Parameters<typeof save>[0]) => {
    void save(patch).then(setResult);
  };

  const altitudeBand = useMemo(() => {
    if (typeof coachProfile.maxAltitudeM !== "number") return null;
    return (
      [...ALTITUDE_BANDS].reverse().find((b) => coachProfile.maxAltitudeM! >= b.lowerM) ?? null
    );
  }, [coachProfile.maxAltitudeM]);

  /* The disciplines whose level can be set. Kept as the tiles' own ids, not the
     `Discipline` union: three offered disciplines have no member of that union
     and their levels live only in `disciplineExperience`. */
  const chosen = Object.keys(coachProfile.disciplineExperience);

  const status = outcomeOf(result);

  return (
    <SettingsPage
      title="Coaching profile"
      subtitle="The answers ICEFALL builds your training from."
    >
      <Rise>
        <p className="text-[12.5px] leading-relaxed text-mist">
          Every answer here changes something ICEFALL prescribes — which movements appear in a
          session, which days your week sits on, how fast it is willing to suggest you go up. Change
          one and the next session you open is built from the new answer.
        </p>
        {status && <p className="mt-3 text-[11.5px] leading-relaxed text-azure">{status}</p>}
        {hydration.kind === "failed" && hydration.tell && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-mist-dim">{hydration.message}</p>
        )}
      </Rise>

      {/* ---- The objective ------------------------------------------------- */}
      <Group label="Your objective">
        {objective === null ? (
          <InfoRow
            title="No objective set"
            detail="Pick a mountain on Goals and the whole app orients around it — including the length of your plan."
          />
        ) : (
          <>
            <InfoRow
              title={objective.name}
              detail={`Target ${fmtDate(objective.targetDate)}. Your plan's length, its build blocks and the countdown on Home are all derived from this date.`}
            />
            {movable ? (
              <div className={ROW_DIVIDE}>
                <p className="text-[14px] text-snow">Target date</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
                  Moving it rebuilds the plan around the new date. Nothing you have already trained
                  is lost — how prepared you are is counted from the sessions you completed, and
                  that does not move with the date.
                </p>
                <DateField
                  label="Target date"
                  /* The LOCAL day of a stored instant, never `slice(0, 10)`:
                     the field holds 06:00 local, which is the previous calendar
                     day in UTC east of about UTC+7 — the exact bug this project
                     has fixed twice at the render end. */
                  value={isoDayKey(new Date(objective.targetDate))}
                  min={isoDayKey(new Date())}
                  onChange={(iso) => {
                    /* Anchored at 06:00 LOCAL, the one shape this field holds —
                       see `Onboarding.finish`. A bare day would be read as UTC
                       midnight by `buildPlanForGoal` and land a day early west
                       of Greenwich. */
                    const [y, m, d] = iso.split("-").map(Number);
                    const at = new Date(y, m - 1, d, 6, 0, 0, 0);
                    const moved = setGoalTargetDate(objective.id, at.toISOString());
                    setDateNote(
                      moved
                        ? "Target date moved. Your plan is rebuilt from it."
                        : "ICEFALL could not move that objective's date.",
                    );
                    /* Sent so the next device rebuilds the same plan rather than
                       the ten-month one the restore used to invent. */
                    send({
                      objective: {
                        goalName: objective.name,
                        ...(objective.mountainId ? { goalMountainId: objective.mountainId } : {}),
                        ...(typeof objective.elevationM === "number"
                          ? { goalElevationM: objective.elevationM }
                          : {}),
                        goalTargetDate: at.toISOString(),
                        ...(objective.trainingStartedAt
                          ? { goalTrainingStartedAt: objective.trainingStartedAt }
                          : {}),
                      },
                    });
                  }}
                  className="mt-3"
                />
                {dateNote && <p className="mt-2 text-[11.5px] text-mist">{dateNote}</p>}
              </div>
            ) : (
              <InfoRow
                title="This objective's date cannot be moved here"
                detail="It is one of the sample objectives that only appear in development builds, not one you created."
              />
            )}
            <div className={ROW_DIVIDE}>
              <Link to="/goals" className="text-[12.5px] text-azure">
                Change the mountain on Goals →
              </Link>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist">
                A different mountain is a new objective with its own plan and its own record, not an
                edit to this one.
              </p>
            </div>
          </>
        )}
      </Group>

      {/* ---- The week ------------------------------------------------------ */}
      <Group label="Your week">
        <MultiRow
          title="Days you can train"
          detail="Your sessions are laid onto these days; every other day is a rest day. One rest day is kept whatever you pick."
          options={WEEK.map((d) => ({ value: String(d.day), label: d.label }))}
          value={days.map(String)}
          onToggle={(v) => {
            const day = Number(v);
            const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
            send({ trainingDays: next });
          }}
          footer={
            days.length === 0 ? (
              <p className="mt-2.5 text-[11px] leading-relaxed text-mist">
                No days given, so ICEFALL uses its own week — six sessions with Thursday as the rest
                day.
              </p>
            ) : undefined
          }
        />
        <ChoiceRow
          title="A normal session"
          /* The exemption is the QUESTION'S, not a rule bolted on afterwards:
             signup asks "roughly, on a day you are not doing something long in
             the mountains", so capping the long day would read the athlete as
             having said something they were never asked. Worded here the way
             the payoff screen words it, for the same reason. */
          detail="Roughly, on a day you are not doing something long in the mountains. Every session is cut to it, with distance and vertical scaled to match — the long mountain day is the exception, because that is the day the question set aside."
          options={SESSION_LENGTHS.map((m) => ({ value: String(m), label: `${m} min` }))}
          value={String(coachProfile.typicalSessionMin ?? "")}
          onChange={(v) => send({ typicalSessionMin: Number(v) })}
        />
        <ChoiceRow
          title="How much you train at the moment"
          detail="Week one starts one session above what you already do and builds from there. Change it and the ramp changes with it."
          options={BASELINES.map((b) => ({ value: b.id, label: b.label, detail: b.note }))}
          value={coachProfile.trainingBaseline ?? ""}
          onChange={(v) => send({ trainingBaseline: v })}
        />
      </Group>

      {/* ---- What sessions are built from ---------------------------------- */}
      <Group label="Training">
        <MultiRow
          title="What you can train with"
          detail="No movement is prescribed whose kit you do not have. Bodyweight only cannot be true beside a barbell, so picking it clears the rest."
          options={EQUIPMENT.map((e) => ({ value: e.id, label: e.label }))}
          value={equipment}
          onToggle={(v) => send({ availableEquipment: pickEquipment(equipment, v) })}
        />
        <ChoiceRow
          title="Strength training you have done"
          detail="This is a question about barbells and gym work, not about mountains. It caps how hard a movement may be and how many the main block carries."
          options={MOVEMENT_LEVELS.map((m) => ({ value: m.id, label: m.label, detail: m.note }))}
          value={coachProfile.movementExperience ?? "unstated"}
          onChange={(v) =>
            /* "unstated" is a decline and is stored as an absence, because the
               generator treats a decline and a never-asked identically — capped
               at moderate, with the cap in the session's own cautions. */
            send({ movementExperience: v === "unstated" ? null : v })
          }
        />
        <MultiRow
          title="What to train around"
          detail="A constraint on what may be prescribed, never a diagnosis. ICEFALL will change what it loads; it will not judge what you can load."
          options={LIMITATIONS.map((l) => ({ value: l.id, label: l.label }))}
          value={limitations}
          onToggle={(v) => {
            const next = limitations.includes(v)
              ? limitations.filter((x) => x !== v)
              : [...limitations, v];
            send({ limitations: next });
          }}
          footer={
            <>
              <textarea
                value={note ?? coachProfile.limitationsNote ?? ""}
                maxLength={300}
                rows={2}
                placeholder="Anything else, in your own words"
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => {
                  if (note === null) return;
                  send({ limitationsNote: note.trim() });
                  setNote(null);
                }}
                className="mt-3 w-full resize-none border-b border-hairline-strong bg-transparent pb-2 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure"
              />
              {/* Said once, here, rather than four times in the list above: the
                  engine builds sessions from the joints a movement loads, so
                  four of these categories change what is prescribed and four
                  match nothing at all. `canTrainAround` is the engine's own
                  answer, asked directly rather than kept as a second list that
                  could fall out of step with it. */}
              {limitations.length > 0 && (
                <p className="mt-2.5 text-[11px] leading-relaxed text-mist">
                  {/* `canTrainAround` is the engine's own answer, asked through
                      the same `limitationLabel` the session screen passes it, so
                      this line cannot claim an adjustment the engine will not
                      make. */}
                  {limitations.filter((id) => canTrainAround(limitationLabel(id))).length > 0
                    ? "Sessions are built around what ICEFALL can train around, and every session says which."
                    : "ICEFALL has no way to change a session for what you have told it, and it says so on the session rather than pretending."}
                </p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
                Your own words reach the coach when you talk to it. They do not change a session on
                their own — the categories above are what the session engine reads.
              </p>
            </>
          }
        />
      </Group>

      {/* ---- The mountain answers ------------------------------------------ */}
      <Group label="On the mountain">
        {chosen.length === 0 ? (
          <InfoRow
            title="No disciplines recorded"
            detail="You answered none at signup. Nothing here is scored against them — they set the line the coach reads about you and the intent your recorder opens on."
          />
        ) : (
          chosen.map((id) => (
            <ChoiceRow
              key={id}
              title={DISCIPLINES.find((d) => d.id === id)?.label ?? id}
              detail="Recorded as context and shown back on your readiness. Deliberately not scored, and it never changes how hard a movement is."
              options={LEVELS.map((l) => ({ value: l.id, label: l.label }))}
              value={coachProfile.disciplineExperience[id] ?? ""}
              onChange={(v) => {
                const levels = { ...coachProfile.disciplineExperience, [id]: v };
                /* `user.experience` is the STRONGEST level across disciplines —
                   one value derived from these, written in the same act so the
                   passport and the profile cannot disagree with this screen. */
                const strongest = LEVELS.map((l) => l.id)
                  .filter((lid) => Object.values(levels).includes(lid))
                  .at(-1);
                send({
                  disciplineExperience: levels,
                  ...(strongest ? { experience: LEVEL_TO_EXPERIENCE[strongest] } : {}),
                });
              }}
            />
          ))
        )}
        {SKILL_GROUPS.map((group) => (
          <MultiRow
            key={group.title}
            title={group.title}
            detail="Each claim is matched against what your objective actually asks for."
            options={group.skills.map((s) => ({ value: s, label: s }))}
            value={skills}
            onToggle={(v) =>
              send({
                technicalSkills: skills.includes(v)
                  ? skills.filter((s) => s !== v)
                  : [...skills, v],
              })
            }
          />
        ))}
        <ChoiceRow
          title="Highest you have been"
          detail="The floor your altitude readiness reasons from. It is never inferred from anything you record."
          options={ALTITUDE_BANDS.map((b) => ({ value: b.id, label: b.label }))}
          value={altitudeBand?.id ?? ""}
          onChange={(v) =>
            send({ maxAltitudeM: ALTITUDE_BANDS.find((b) => b.id === v)?.lowerM ?? null })
          }
        />
        <ChoiceRow
          title="Altitude sickness"
          detail="Slows the ascent schedule ICEFALL is willing to suggest, and never speeds it up. It changes no score — a history says nothing about where you have been."
          options={ALTITUDE_ILLNESS.map((a) => ({ value: a.id, label: a.label, detail: a.note }))}
          value={coachProfile.altitudeIllness ?? ""}
          onChange={(v) => send({ altitudeIllness: v })}
        />
      </Group>

      {/* ---- The body numbers ---------------------------------------------- */}
      <Group label="Your body">
        <NumberRow
          title="Weight"
          detail="The calories on every recorded activity, and your daily energy estimate."
          unit="kg"
          value={bodyMassKgSet ?? undefined}
          min={30}
          max={200}
          onCommit={(n) => send({ bodyMassKg: n })}
        />
        <NumberRow
          title="Height"
          detail="With your year of birth, it selects the resting-energy equation and narrows the daily band. On its own it changes nothing."
          unit="cm"
          value={settings.heightCm}
          min={100}
          max={250}
          onCommit={(n) => send({ heightCm: Math.round(n) })}
        />
        <NumberRow
          title="Year of birth"
          detail="Narrows the same band. It is never used to derive a maximum heart rate — that stays a population average ICEFALL will not print as your number."
          unit=""
          value={settings.birthYear}
          min={1900}
          max={new Date().getFullYear() - 5}
          onCommit={(n) => send({ birthYear: Math.round(n) })}
        />
      </Group>

      {/* ---- The answers this screen will not change ----------------------- */}
      <Group label="Not editable here">
        <InfoRow
          title="Sex at birth"
          detail="One term in the resting-energy equation, and ICEFALL refuses to overwrite an answer it already holds. A control here would look live and do nothing."
        />
        <InfoRow
          title="Gender"
          detail="Recorded on your account and read by nothing — no session, no plan, no readiness figure, no calorie estimate."
        />
        <InfoRow
          title="Where you found ICEFALL"
          detail="The one question that was for ICEFALL rather than for you. Changing it would change nothing you can see."
        />
        <InfoRow
          title="Your name"
          detail="Changed on Edit profile, which is also what other climbers see."
        />
      </Group>

      <Rise className="pt-4">
        <Disclaimer>
          These answers are yours, not measurements. ICEFALL records them as things you reported and
          keeps them apart from what it has actually seen you do — which is why an experience level
          appears on your readiness as context and is never scored.
        </Disclaimer>
      </Rise>
    </SettingsPage>
  );
}
