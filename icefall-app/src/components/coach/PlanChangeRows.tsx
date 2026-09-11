import { Undo2 } from "lucide-react";

import { Eyebrow } from "@/screens/coach/shell";
import type { CoachChange } from "@/coach/pendingChanges";

/**
 * A CHANGE TO THE PLAN, UNDER THE MESSAGE THAT PROPOSED IT.
 *
 * ============================================================================
 * EVERY FIGURE ON THIS COMPONENT CAME OUT OF THE ENGINE
 * ============================================================================
 *
 * `proposal.days` is built by `previewAction`, which runs `buildPlanForGoal`
 * and `applyAdjustments` twice — once without the change and once with it — and
 * describes each day with `describeDay`. Nothing rendered here is a string the
 * model produced, with exactly one exception: `why`, which is shown in
 * quotation marks with "your coach" after it, because it is the coach's reason
 * and the athlete is entitled to know whose sentence it is.
 *
 * That separation is the visible half of rule 1. The claim and the arithmetic
 * sit on the same rows, so a reason that does not match what happened is
 * contradicted an inch below itself rather than being the only account there is.
 *
 * ============================================================================
 * THE THREE STATES, AND WHY REFUSED HAS NO BUTTONS
 * ============================================================================
 *
 *   APPLIED  — already done. One control: Undo.
 *   CONFIRM  — nothing written. Two controls: Apply, Not now.
 *   REFUSED  — nothing written and nothing will be. NO CONTROLS AT ALL.
 *
 * A refusal with a disabled button under it invites the tap and then denies it,
 * which reads as the app being awkward. A refusal with no button at all reads
 * as the answer it is. The reason is always shown, and when the reason is the
 * safety guard it names the actual measurements — see `planGuard.ts`.
 *
 * NO BOXES. An eyebrow, rows, hairlines and spacing. The before/after is two
 * lines of type with the old one in `mist` and the new one in `snow`; a border
 * around it would be the fifth card the owner has objected to.
 */
export function PlanChangeRows({
  change,
  onApply,
  onDecline,
  onUndo,
}: {
  change: CoachChange;
  onApply: () => void;
  onDecline: () => void;
  onUndo: () => void;
}) {
  const { proposal, status } = change;
  const refused = status === "refused" || proposal.outcome === "refused";
  const done = status === "applied";
  const settled = status === "declined" || status === "undone" || status === "failed";

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <Eyebrow className={refused ? "!text-mist" : "!text-azure/70"}>
        {refused ? "Not changed" : done ? "Plan changed" : settled ? "Plan change" : "Plan change"}
      </Eyebrow>

      {!refused && (
        <p className="mt-2 text-[14px] leading-relaxed text-snow">
          {proposal.summary}
          {status === "undone" ? " · undone" : status === "declined" ? " · not applied" : ""}
        </p>
      )}

      {/* The coach's own sentence, quoted and attributed. The only model-written
          text on this component. */}
      {proposal.why ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
          “{proposal.why}” — your coach
        </p>
      ) : null}

      {/* BEFORE AND AFTER, one pair per day the change touches. Hidden once the
          athlete has declined or undone it: the rows describe a plan that is no
          longer going to exist, and leaving them up would be the screen showing
          a change that did not happen. */}
      {!refused && !settled && proposal.days.length > 0 && (
        <div className="mt-3">
          {proposal.days.map((d) => (
            <div
              key={d.date}
              className="border-t border-hairline py-2.5 first:border-t-0 first:pt-0"
            >
              <p className="text-[11.5px] uppercase tracking-[0.1em] text-mist-dim">{d.label}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-mist">{d.before}</p>
              <p className="text-[13px] leading-relaxed text-snow">{d.after}</p>
            </div>
          ))}
        </div>
      )}

      {proposal.note ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{proposal.note}</p>
      ) : null}

      {change.problem ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{change.problem}</p>
      ) : null}

      {/* Controls. Nothing at all on a refusal — see the header. */}
      {!refused && status === "pending" && (
        <div className="mt-3 flex items-center gap-5">
          <button
            type="button"
            onClick={onApply}
            className="text-[13px] text-azure transition-colors hover:text-azure-bright"
          >
            Apply this change
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="text-[13px] text-mist transition-colors hover:text-snow"
          >
            Not now
          </button>
        </div>
      )}

      {done && (
        <div className="mt-3 flex items-center gap-5">
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1.5 text-[13px] text-mist transition-colors hover:text-snow"
          >
            <Undo2 size={14} strokeWidth={1.7} aria-hidden="true" />
            Undo
          </button>
          {/* Where it lives from now on. The chat bubble is not the record —
              the plan is, and the history screen is how to find it later. */}
          <span className="text-[12.5px] text-mist-dim">Kept in Plan changes</span>
        </div>
      )}
    </div>
  );
}
