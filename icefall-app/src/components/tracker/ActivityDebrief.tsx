import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Disclaimer } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  buildDebrief,
  deleteDebrief,
  saveDebrief,
  useDebriefFor,
  DEBRIEF_BODY,
  DEBRIEF_EFFORT,
  DEBRIEF_BODY_LABEL,
  type ActivityDebrief as DebriefRecord,
  type DebriefBodyId,
} from "@/tracking/debrief";
import { debriefSignals } from "@/tracking/debriefEffects";
import { SAFETY_DISCLAIMER, SAFETY_MESSAGES, type SafetyCategory } from "@/coach/safety";

/**
 * THE POST-ACTIVITY DEBRIEF, ON SCREEN.
 *
 * Three questions, asked once per activity, and then the answer to the question
 * the athlete is actually asking by answering them: and what did that change?
 *
 * ── THE RULES THIS SCREEN IS HELD TO ────────────────────────────────────────
 *
 *  1. NO MICROPHONE. The roadmap allows voice notes; this app has no recording
 *     path (see the header of `tracking/debrief.ts`). A button that opened
 *     nothing would claim a capability that does not exist, so there is not
 *     one — and no "voice notes coming soon" either, which is a promise.
 *
 *  2. NO BOXES. Three questions separated by space and a label each, not three
 *     bordered panels. The one bordered thing on this screen is the safety
 *     message, and that border is doing the one job a border is for here: it
 *     is a genuinely distinct object, and it is the object that must not be
 *     skimmed past.
 *
 *  3. THE ANSWERS LAND SOMEWHERE, AND IT SAYS WHERE. On save, the consequences
 *     from `debriefEffects.ts` are printed. They are past tense and specific —
 *     what recovery is now counting, what the next session can be built around.
 *     A "thanks, saved" would be the same silence in a friendlier voice.
 *
 *  4. PAIN GOES THROUGH THE SAFETY LAYER FIRST. `buildDebrief` calls
 *     `checkSafety` before it classifies anything, and when it fires this
 *     screen shows the layer's own fixed words and its disclaimer, verbatim,
 *     above everything else. No paraphrase, no summary, no icon instead of the
 *     text. The debrief is still saved — with the category on it — so that
 *     nothing downstream quietly treats it as ordinary soreness.
 */

export function ActivityDebriefSection({
  activityId,
  activityStartedAt,
  className,
}: {
  activityId: string;
  activityStartedAt: string;
  className?: string;
}) {
  const saved = useDebriefFor(activityId);
  return saved ? (
    <SavedView debrief={saved} className={className} />
  ) : (
    <AskView activityId={activityId} activityStartedAt={activityStartedAt} className={className} />
  );
}

/* -------------------------------------------------------------------------- */
/* Asking                                                                      */
/* -------------------------------------------------------------------------- */

const EFFORT_VALUES = Array.from(
  { length: DEBRIEF_EFFORT.max - DEBRIEF_EFFORT.min + 1 },
  (_, i) => DEBRIEF_EFFORT.min + i,
);

function AskView({
  activityId,
  activityStartedAt,
  className,
}: {
  activityId: string;
  activityStartedAt: string;
  className?: string;
}) {
  /**
   * Nothing is preselected.
   *
   * A default of 5, or of "Normal", is an answer nobody gave — and unlike a
   * missing figure it is indistinguishable from a real one the moment it is
   * saved. The save control stays disabled until both are actually tapped.
   */
  const [effort, setEffort] = useState<number | null>(null);
  const [body, setBody] = useState<DebriefBodyId | null>(null);
  /** null = not asked yet, false = "nothing hurt", true = the box is open. */
  const [hurt, setHurt] = useState<boolean | null>(null);
  const [note, setNote] = useState("");

  const ready = effort !== null && body !== null && hurt !== null && (!hurt || note.trim() !== "");

  function save() {
    if (effort === null || body === null || hurt === null) return;
    const built = buildDebrief({
      activityId,
      activityStartedAt,
      effort,
      body,
      painNote: hurt ? note : "",
    });
    /* NOTE WHAT IS NOT DONE HERE: the returned `built.safety` is not held in
       this component's state. Saving swaps this whole view out for `SavedView`,
       so a safety message rendered from local state would appear and vanish in
       the same tick — a fixed emergency message that flashes is worse than one
       that never rendered, because nobody can say afterwards whether it was
       shown. `SavedView` draws it from the CATEGORY ON THE RECORD instead, so
       it is there on this visit and on every later one. */
    saveDebrief(built.debrief);
  }

  return (
    <section className={cn("mt-10", className)}>
      <h2 className="text-[19px] font-normal text-snow">How did that feel?</h2>
      <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-mist">
        Three questions. ICEFALL recorded the distance and the ascent; it has no way of knowing what
        the session cost you.
      </p>

      {/* ---- 1. Effort ------------------------------------------------------ */}
      <div className="mt-7">
        <p className="section-label">How hard did it feel</p>
        <div className="mt-3 flex gap-1.5">
          {EFFORT_VALUES.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} out of ${DEBRIEF_EFFORT.max}`}
              aria-pressed={effort === n}
              onClick={() => setEffort(n)}
              className={cn(
                "tnum h-11 flex-1 rounded-[10px] border text-[13px] transition-colors",
                effort === n
                  ? "border-azure bg-azure/[0.12] text-snow"
                  : "border-hairline text-mist hover:border-azure/40 hover:text-snow",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-mist-dim">
          <span>Barely noticed it</span>
          <span>Nothing left</span>
        </div>
        {/* Rule 5, at the point of entry rather than only where it surfaces. */}
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          Your own rating. ICEFALL keeps it apart from anything it measured, and says so wherever it
          uses it.
        </p>
      </div>

      {/* ---- 2. The body ---------------------------------------------------- */}
      <div className="mt-8">
        <p className="section-label">How the body feels now</p>
        <div className="mt-3 space-y-px">
          {DEBRIEF_BODY.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={body === b.id}
              onClick={() => setBody(b.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left transition-colors",
                body === b.id ? "bg-azure/[0.10]" : "hover:bg-white/[0.03]",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                  body === b.id
                    ? "border-azure text-azure"
                    : "border-hairline-strong text-transparent",
                )}
              >
                <Check size={12} strokeWidth={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] text-snow">{b.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-mist">{b.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ---- 3. Pain -------------------------------------------------------- */}
      <div className="mt-8">
        <p className="section-label">Any pain</p>
        <div className="mt-3 flex gap-2">
          <Choice label="No pain" selected={hurt === false} onClick={() => setHurt(false)} />
          <Choice label="Something hurt" selected={hurt === true} onClick={() => setHurt(true)} />
        </div>
        {hurt === true && (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={400}
              placeholder="Where, and what it felt like."
              className="mt-3 w-full resize-none rounded-[10px] border border-hairline bg-transparent p-3 text-[14px] leading-relaxed text-snow placeholder:text-mist-dim focus:border-azure/50 focus:outline-none"
            />
            <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
              Naming the body part is what lets ICEFALL build the next session around it. Anything
              describing an injury, a fall or something sudden gets safety guidance instead — it is
              not something to train around.
            </p>
          </>
        )}
      </div>

      {/* ---- Save ----------------------------------------------------------- */}
      <button
        type="button"
        disabled={!ready}
        onClick={save}
        className={cn(
          "mt-7 flex h-[52px] w-full items-center justify-center rounded-full text-[15px] transition-opacity",
          ready
            ? "border border-azure/60 text-azure hover:bg-azure/[0.08]"
            : "border border-hairline text-mist-dim opacity-60",
        )}
      >
        Save debrief
      </button>
    </section>
  );
}

function Choice({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-11 flex-1 rounded-[10px] border text-[13.5px] transition-colors",
        selected
          ? "border-azure bg-azure/[0.12] text-snow"
          : "border-hairline text-mist hover:border-azure/40 hover:text-snow",
      )}
    >
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Answered                                                                    */
/* -------------------------------------------------------------------------- */

function SavedView({ debrief, className }: { debrief: DebriefRecord; className?: string }) {
  /* The consequences of THIS debrief alone. `debriefSignals` takes a list
     because recovery reads the whole history; here the athlete is looking at
     one activity and must not be shown a change another session caused. */
  const signals = useMemo(() => debriefSignals([debrief]), [debrief]);

  const flagged = debrief.pain.reported ? debrief.pain.safety : null;

  return (
    <section className={cn("mt-10", className)}>
      <h2 className="text-[19px] font-normal text-snow">Your debrief</h2>

      {/* FIRST, above the answers. The athlete described something acute, and
          the fixed guidance is the only thing on this screen that matters. */}
      {flagged && <SafetyBlock category={flagged} />}

      <div className="mt-4 space-y-2.5">
        <Line label="How hard it felt" value={`${debrief.effort} out of ${DEBRIEF_EFFORT.max}`} />
        <Line label="The body" value={DEBRIEF_BODY_LABEL[debrief.body]} />
        <Line
          label="Pain"
          value={debrief.pain.reported ? debrief.pain.note : "None reported"}
          /* The athlete's own words, marked as a quotation rather than set in
             the same type as ICEFALL's. */
          quoted={debrief.pain.reported}
        />
      </div>

      {/* What it changed. The whole reason the questions are worth asking. */}
      <div className="mt-7">
        <p className="section-label">What that changed</p>
        <div className="mt-3 space-y-3">
          {signals.consequences.map((c, i) => (
            <p key={`${c.id}-${i}`} className="text-[13px] leading-relaxed text-mist">
              {c.text}
            </p>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => deleteDebrief(debrief.activityId)}
        className="mt-6 h-11 text-[12.5px] text-mist transition-colors hover:text-snow"
      >
        Answer again
      </button>
    </section>
  );
}

function Line({ label, value, quoted }: { label: string; value: string; quoted?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <p className="shrink-0 text-[12.5px] text-mist">{label}</p>
      <p
        className={cn(
          "text-right text-[13.5px] leading-snug",
          quoted ? "italic text-snow/85" : "text-snow",
        )}
      >
        {quoted ? `“${value}”` : value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The safety answer                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The fixed safety message, rendered exactly as the layer wrote it.
 *
 * The one bordered object on this screen, and the border is earned: this is a
 * different kind of thing from the questions around it, and it is the thing
 * that must not be skimmed. Nothing here is generated, shortened, or softened —
 * `safety.body` and `safety.disclaimer` are printed whole. There is no
 * "dismiss": the athlete scrolls past it if they choose to, but the app does
 * not offer to put it away.
 */
function SafetyBlock({ category }: { category: SafetyCategory }) {
  return (
    /* `danger`, not `alert`: the palette separates caution from severe, and
       every message the safety layer emits ends in "call emergency services",
       "go down now" or "get this assessed today". None of them is a caution.

       Read out of `SAFETY_MESSAGES` by the stored category rather than from a
       copy saved with the debrief. A message frozen into a record on the day it
       was written would keep being shown months after the wording was improved,
       and there is exactly one correct version of these eleven messages. */
    <div className="mt-5 rounded-card border border-danger/55 bg-danger/[0.07] p-4">
      <div className="flex items-center gap-2 text-danger">
        <AlertTriangle size={16} strokeWidth={1.8} />
        <p className="section-label text-danger">Stop and read this</p>
      </div>
      {SAFETY_MESSAGES[category].split("\n\n").map((para, i) => (
        <p key={i} className="mt-3 text-[13.5px] leading-relaxed text-snow">
          {para}
        </p>
      ))}
      <Disclaimer className="mt-4">{SAFETY_DISCLAIMER}</Disclaimer>
    </div>
  );
}
