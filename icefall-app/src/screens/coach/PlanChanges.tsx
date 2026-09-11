import { useMemo, useState } from "react";
import { Undo2 } from "lucide-react";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import {
  describeChange,
  readableDay,
  usePlanChangeHistory,
  type PlanAdjustment,
} from "@/tracking/adjustments";
import { useTraining } from "@/tracking/training";
import { useCoachActions } from "@/coach/planActions";

/**
 * EVERY CHANGE ANYBODY MADE TO THE PLAN — what, when, why, by whom, and Undo.
 *
 * ============================================================================
 * WHY THIS SCREEN IS NOT OPTIONAL
 * ============================================================================
 *
 * A coach that can rearrange somebody's training and leaves no record of having
 * done it is not a coach, it is a plan that changes by itself. The athlete opens
 * the calendar on Tuesday, finds Saturday's long day on Sunday, and has no way
 * to find out whether they asked for that, whether the coach did it, or why.
 *
 * So the history is a requirement of the acting, not a feature beside it, and
 * it is the SAME RECORDS the calendar is built from — see
 * `tracking/adjustments.ts`. It cannot fall out of step with the plan, because
 * the plan is these rows applied to the generator's output. There is no second
 * log to drift.
 *
 * ============================================================================
 * WHAT UNDO ACTUALLY DOES, SINCE THE WORD IS USUALLY A LIE
 * ============================================================================
 *
 * It DELETES THE RECORD from the applied set. It does not apply an opposite
 * change on top. The plan is recomputed from the generator plus what is left,
 * so undoing a move returns exactly the plan that move was never in — not an
 * approximation of it, and not a plan carrying an edit and a counter-edit that
 * nearly cancel.
 *
 * A change made as ONE ACT undoes as one act. "Push the week back a day" is six
 * moves the athlete agreed to once; undoing a sixth of it would leave a week
 * nobody chose.
 *
 * ============================================================================
 * WHAT IT SAYS OUT LOUD
 * ============================================================================
 *
 *   · WHOSE WORDS THE REASON IS. A reason written by the coach is shown as the
 *     coach's, a reason the athlete gave is shown as theirs. They are never
 *     merged into one voice, and the line above them — "Moved to Sun 21 Sep" —
 *     is the app's own sentence, derived from the record rather than written by
 *     a model.
 *   · WHEN A CHANGE NO LONGER APPLIES. An objective whose date has moved far
 *     enough can leave a change pointing at a day the plan no longer contains.
 *     That is said on the row rather than hidden, because an athlete who moved
 *     a session is entitled to know the day it moved to has gone.
 *   · WHERE IT IS KEPT. This device. There is no server table for plan changes;
 *     the migration that would add one is an unapplied draft.
 *
 * ============================================================================
 * WHY UNDO CAN BE REFUSED HERE — PHASE 2
 * ============================================================================
 *
 * One case, and only one: undoing a change that would put a harder session back
 * on TODAY, on a day readiness or recovery has already downgraded. The roadmap
 * rule says such a day is never made harder "not by the model, not by a tool,
 * not by the athlete tapping through a confirmation", and a tap on this button
 * is that tap — the coach eased today because readiness is 38, and Undo would
 * hand the hard session straight back.
 *
 * It is not a general restriction on Undo. Yesterday's changes, next week's
 * changes and every change on a day that has not been downgraded undo exactly
 * as they always did, and the plan comes back byte for byte as the change was
 * never in it. The refusal is computed by the same `planGuard` the coach's own
 * tools go through, by simulating the removal and comparing today.
 *
 * IT IS SAID ON THE ROW RATHER THAN SWALLOWED. The tap is accepted, the reason
 * appears under the change with the real numbers in it, and the button stays —
 * because the refusal expires: the athlete can check in again tomorrow.
 *
 * ============================================================================
 * NO BOXES. Flat rows, hairlines and spacing — the same shapes as `/coach/
 * memory`, which this screen is the sibling of.
 */
export default function PlanChanges() {
  const { goal, strandedAdjustments } = useTraining();
  const { entries } = usePlanChangeHistory(goal?.id);
  /* The same gate the coach's tools pass through, so the two cannot disagree
     about what today is allowed to become. */
  const { undo } = useCoachActions();
  /* Refusals by entry id. Component state rather than a store: the refusal is
     about this moment's readiness, and it should not outlive the screen. */
  const [refused, setRefused] = useState<Record<string, string>>({});

  /* Which records the plan could not take. Looked up by id rather than
     recomputed, so this screen and the calendar cannot disagree about it. */
  const strandedById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of strandedAdjustments) m.set(s.adjustment.id, s.reason);
    return m;
  }, [strandedAdjustments]);

  const line = (a: PlanAdjustment) => `${readableDay(a.date)} · ${describeChange(a)}`;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Plan changes"
          subtitle="Kept on this device"
          back="/coach/plan"
          large
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">
            Everything you or your coach has changed about this plan, newest first. Your plan is
            built from your objective and then these changes are applied on top, so undoing one puts
            the plan back exactly as it was before — nothing is layered over anything.
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
            These are kept on this phone. A new phone opens on the unchanged plan, and erasing your
            data in Settings takes them with it.
          </p>
        </Rise>

        {!goal ? (
          <Group label="Changes">
            <p className="py-3 text-[13px] text-mist">
              You have no active objective, so there is no plan to change yet.
            </p>
          </Group>
        ) : (
          <Group label={entries.length > 0 ? `Changes · ${entries.length}` : "Changes"}>
            {entries.length === 0 ? (
              <p className="py-3 text-[13px] text-mist">
                Nothing changed yet. When you or your coach move, shorten, ease or clear a session,
                it is recorded here with the reason.
              </p>
            ) : (
              <div>
                {entries.map((e) => {
                  const stranded = e.adjustments
                    .map((a) => strandedById.get(a.id))
                    .find((r): r is string => r !== undefined);
                  return (
                    <div
                      key={e.id}
                      className="-mx-5 flex items-start gap-3.5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                    >
                      <div className="min-w-0 flex-1">
                        {e.adjustments.map((a) => (
                          <p
                            key={a.id}
                            className={
                              e.undoneAt
                                ? "text-[14px] leading-relaxed text-mist line-through"
                                : "text-[14px] leading-relaxed text-snow"
                            }
                          >
                            {line(a)}
                          </p>
                        ))}

                        {e.why ? (
                          <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
                            “{e.why}” — {e.by === "coach" ? "your coach" : "you"}
                          </p>
                        ) : null}

                        <p className="mt-1 text-[11.5px] text-mist">
                          {new Date(e.at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "long",
                          })}
                          {e.undoneAt
                            ? ` · Undone ${new Date(e.undoneAt).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "long",
                              })}`
                            : ""}
                          {/* Said on the row rather than left to be discovered
                              on a calendar that quietly no longer shows it. */}
                          {!e.undoneAt && stranded ? ` · No longer applies. ${stranded}` : ""}
                        </p>

                        {refused[e.id] ? (
                          <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
                            {refused[e.id]}
                          </p>
                        ) : null}
                      </div>

                      {e.undoneAt ? null : (
                        <button
                          type="button"
                          onClick={() => {
                            const verdict = undo(e.id);
                            setRefused((r) =>
                              verdict.allowed
                                ? { ...r, [e.id]: "" }
                                : { ...r, [e.id]: verdict.reason },
                            );
                          }}
                          aria-label={`Undo: ${e.adjustments.map(line).join(", ")}`}
                          className="-mr-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-snow"
                        >
                          <Undo2 size={16} strokeWidth={1.7} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Group>
        )}
      </Stagger>
    </Screen>
  );
}
