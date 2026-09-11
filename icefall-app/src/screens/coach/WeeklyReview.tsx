import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { QualifierBadge, type DataQualifier } from "@/components/coach/DataState";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group } from "@/components/settings/kit";
import { describeDay, useCoachActions, type PlanProposal } from "@/coach/planActions";
import { useWeeklyReview } from "@/coach/weeklyReviewStore";
import type { ReviewDay, ReviewFinding, ReviewProposal } from "@/coach/weeklyReview";
import { readableDay } from "@/tracking/adjustments";

/**
 * THE WEEKLY REVIEW — WHAT THE WEEK ASKED FOR, WHAT IT CONTAINED, AND THE FEW
 * CHANGES THAT FOLLOW.
 *
 * ============================================================================
 * WHAT THIS SCREEN CLAIMS ABOUT ITSELF, WHICH IS THE FIRST HONESTY QUESTION
 * ============================================================================
 *
 * It says it was COMPUTED when the athlete opened ICEFALL, and it prints the
 * time. It does not say it was sent, delivered, or that anybody was notified on
 * Sunday evening, because ICEFALL is a PWA: there is no native wrapper and no
 * Apple push certificate, so nothing in this codebase can reach a closed app.
 * `docs/weekly-review-notifications.md` is the owner's list of what would have
 * to exist first. Until it does, "waiting for you when you next open it" is the
 * true version of "proactive" and is the version written here.
 *
 * ============================================================================
 * EVERY FIGURE COMES FROM AN ENGINE
 * ============================================================================
 *
 *   · the week's counts — `coach/weeklyReview.ts`, from the plan and the feed;
 *   · each day's prescription — `describeDay`, the same function the chat's
 *     before/after uses, reading the generator's own output;
 *   · each proposal's before and after — `previewAction`, computed at render
 *     and RECOMPUTED at the tap;
 *   · each measured vital — `recovery.vitals`, with the instrument's name and
 *     the night it belongs to attached at the source.
 *
 * Nothing on this screen is a sentence a model wrote, because no model is
 * involved in a review. The prose is the app's and the numbers are the
 * engines'.
 *
 * ============================================================================
 * NOTHING APPLIES SILENTLY — AND THAT IS STRONGER HERE THAN IN THE CHAT
 * ============================================================================
 *
 * `previewAction` classifies a change as "applied", "confirm" or "refused", and
 * the chat commits the first kind straight away: the athlete asked for it a
 * second ago, in words, and a small immediate change does not need confirming
 * twice.
 *
 * A REVIEW WAS NOT ASKED FOR. So this screen never commits without a tap,
 * whatever the preview returns — the buttons are the only path to
 * `commitProposal` here. The threshold's note is still shown when there is one,
 * because it is the sentence that says WHY a particular change is worth
 * stopping for.
 *
 * That is a restriction on this screen's own behaviour. It is not a change to
 * any guard: the refusals, the re-preview at the tap and the commit-time
 * re-evaluation are all exactly the ones `coach/planActions.ts` runs for the
 * chat.
 *
 * ============================================================================
 * NO BOXES. Flat rows, hairlines and spacing — the same shapes as
 * `/coach/plan/changes`, which this screen is the sibling of.
 */

/* -------------------------------------------------------------------------- */
/* Small pieces                                                                */
/* -------------------------------------------------------------------------- */

/** What kind of evidence a finding rests on, as the shared badge understands it. */
const BADGE_FOR: Record<ReviewFinding["kind"], DataQualifier | null> = {
  recorded: "measured",
  ticked: "self-reported",
  "self-reported": "self-reported",
  measured: "measured",
  /* A statement about what the plan asks for is neither measured nor reported.
     It is the app's own arithmetic on its own generator, and badging it would
     put it in a family it does not belong to. */
  plan: null,
};

/**
 * How a day's completion was established, in one short phrase.
 *
 * A TICK AND A RECORDING ARE NEVER THE SAME WORD. "Completed" over both would
 * be the exact collapse rule 5 exists to prevent — one of them is an instrument
 * of sorts, the other is somebody's memory of a Tuesday.
 */
function evidenceLabel(d: ReviewDay): { text: string; tone: string } {
  if (d.day.focus === "rest") return { text: "Rest day", tone: "text-mist-dim" };
  switch (d.evidence) {
    case "recorded":
      return { text: "Recorded", tone: "text-azure" };
    case "ticked":
      return { text: "You ticked it", tone: "text-mist" };
    default:
      return { text: "Not completed", tone: "text-mist" };
  }
}

/** One activity as a line, from what was actually stored. */
function activityLine(a: ReviewDay["activities"][number]): string {
  const parts = [
    `${Math.round(a.durationSec / 60)} min`,
    a.distanceKm > 0 ? `${a.distanceKm.toFixed(1)} km` : null,
    a.elevationGainM > 0 ? `${Math.round(a.elevationGainM)} m up` : null,
  ].filter(Boolean);
  return `${a.title} · ${parts.join(" · ")}`;
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

type ProposalStatus = "pending" | "applied" | "declined" | "refused" | "failed";

export default function WeeklyReview() {
  const { review, proposals, openedAt, markOpened, decline } = useWeeklyReview();
  const { preview, commit } = useCoachActions();

  /* Opening the screen is what "seen" means. Recorded once, so the hub's badge
     goes away and does not come back for this week. */
  useEffect(() => {
    if (review.state === "ready") markOpened();
  }, [review.state, markOpened]);

  const [status, setStatus] = useState<Record<string, ProposalStatus>>({});
  const [problem, setProblem] = useState<Record<string, string>>({});

  /* PREVIEWED HERE SO THE ATHLETE READS THE REAL BEFORE AND AFTER, not a
     description of one. `previewAction` is pure and writes nothing, so doing it
     on render costs a plan rebuild and changes no state. It is run AGAIN at the
     tap — see below — because minutes may have passed. */
  const previews = useMemo(
    () => proposals.map((p) => ({ proposal: p, preview: preview(p.action) })),
    [proposals, preview],
  );

  const w = review.window;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Weekly review"
          subtitle={w ? `${w.block} · ${readableDay(w.start)} to ${readableDay(w.end)}` : undefined}
          back="/coach"
          large
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">
            {/* THE HONEST ACCOUNT OF WHEN THIS HAPPENED. Computed, waiting —
                never "sent". */}
            ICEFALL worked this out when you opened Coach
            {review.computedAt
              ? ` at ${new Date(review.computedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
            , from the week that has just finished. It cannot reach you while the app is closed —
            ICEFALL has no way to send you anything — so a review is computed and waits here until
            you come back to it.
          </p>
          {openedAt ? (
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
              You first opened this week's review on{" "}
              {new Date(openedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
            </p>
          ) : null}
        </Rise>

        {review.state !== "ready" ? (
          <Group label="Nothing to review">
            <p className="py-3 text-[14px] leading-relaxed text-snow">{review.note}</p>
          </Group>
        ) : (
          <>
            {/* ---------------------------------------------------------------- */}
            {/* The week, day by day                                              */}
            {/* ---------------------------------------------------------------- */}
            <Group label={`The week · ${review.counts.prescribed} sessions`}>
              <div>
                {review.days.map((d) => {
                  const ev = evidenceLabel(d);
                  return (
                    <div
                      key={d.day.date}
                      className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-[14px] leading-relaxed text-snow">
                          {d.label} · {describeDay(d.day)}
                        </p>
                        <p className={`shrink-0 text-[12px] ${ev.tone}`}>{ev.text}</p>
                      </div>

                      {d.activities.map((a) => (
                        <p key={a.id} className="mt-1 text-[13px] leading-relaxed text-mist">
                          {activityLine(a)}
                        </p>
                      ))}

                      {/* A day somebody changed says so here too, so the week
                          reads as it was actually lived rather than as it was
                          first generated. */}
                      {d.changes.map((c) => (
                        <p key={c.id} className="mt-1 text-[12px] leading-relaxed text-mist-dim">
                          Changed · “{c.why}” — {c.by === "coach" ? "your coach" : "you"}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Group>

            {/* ---------------------------------------------------------------- */}
            {/* What it came to                                                   */}
            {/* ---------------------------------------------------------------- */}
            <Group label="What it came to">
              <div>
                {review.findings.map((f) => {
                  const badge = BADGE_FOR[f.kind];
                  return (
                    <div
                      key={f.id}
                      className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                    >
                      <p className="text-[14px] leading-relaxed text-snow">{f.text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {badge ? <QualifierBadge kind={badge} /> : null}
                        {/* THE NUMBERS THE SENTENCE WAS BUILT FROM, printed
                            beside it. A reader who wants to check the prose
                            against the arithmetic should not have to leave. */}
                        <p className="text-[11.5px] text-mist-dim">{f.figures.join(" · ")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Group>

            {/* ---------------------------------------------------------------- */}
            {/* Measured                                                          */}
            {/* ---------------------------------------------------------------- */}
            <Group label="Measured">
              <div>
                {review.vitals.inWindow.length === 0 && review.vitals.outside.length === 0 ? (
                  <p className="py-3 text-[13px] leading-relaxed text-mist">
                    No instrument reported a reading for this week. Nothing in the review above
                    rests on a measurement of your body.
                  </p>
                ) : (
                  [...review.vitals.inWindow, ...review.vitals.outside].map((v) => (
                    <div
                      key={v.id}
                      className="-mx-5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-[14px] text-snow">{v.label}</p>
                        <p className="tnum shrink-0 text-[14px] text-snow">
                          {v.value} {v.unit}
                        </p>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-mist">
                        {v.sourceLabel ? `From ${v.sourceLabel}. ` : ""}
                        {v.measuredOn
                          ? `${readableDay(v.measuredOn)}${v.when ? ` — ${v.when}` : ""}. `
                          : "The instrument did not say which night this belongs to. "}
                        {review.vitals.inWindow.includes(v)
                          ? "That night falls inside this week."
                          : "That night is outside the week reviewed here."}
                      </p>
                      <div className="mt-2">
                        <QualifierBadge kind="measured" />
                      </div>
                    </div>
                  ))
                )}
                {/* SAID WHETHER OR NOT THERE IS A READING. One night is not a
                    week, and a figure printed under a weekly heading will be
                    read as a weekly one unless the screen refuses it. */}
                <p className="-mx-5 border-t border-hairline px-5 pt-3.5 text-[12.5px] leading-relaxed text-mist-dim">
                  {review.vitals.coverage}
                </p>
              </div>
            </Group>

            {/* ---------------------------------------------------------------- */}
            {/* Proposed changes                                                  */}
            {/* ---------------------------------------------------------------- */}
            <Group
              label={previews.length > 0 ? `Proposed changes · ${previews.length}` : "Your plan"}
            >
              {previews.length === 0 ? (
                <p className="py-3 text-[13px] leading-relaxed text-snow">
                  {review.allClear
                    ? "Nothing needs changing. The week held together well enough that ICEFALL has no change to suggest, and a review that invented one to look useful would be worth less than this sentence."
                    : "You have already dealt with everything this review had to suggest."}
                </p>
              ) : (
                <div>
                  {previews.map(({ proposal, preview: p }) => (
                    <ProposalRow
                      key={proposal.id}
                      proposal={proposal}
                      preview={p}
                      status={status[proposal.id] ?? "pending"}
                      problem={problem[proposal.id] ?? ""}
                      onApply={() => {
                        /* RE-PREVIEWED AT THE TAP. The review may have been on
                           screen for a while; a check-in filed in between is
                           exactly the thing that turns the guard's answer from
                           yes to no. */
                        const fresh = preview(proposal.action);
                        if (fresh.outcome === "refused") {
                          setStatus((s) => ({ ...s, [proposal.id]: "refused" }));
                          setProblem((s) => ({ ...s, [proposal.id]: fresh.note }));
                          return;
                        }
                        const result = commit(fresh);
                        setStatus((s) => ({
                          ...s,
                          [proposal.id]: result.ok ? "applied" : "failed",
                        }));
                        setProblem((s) => ({ ...s, [proposal.id]: result.problem }));
                      }}
                      onDecline={() => {
                        decline(proposal.id);
                        setStatus((s) => ({ ...s, [proposal.id]: "declined" }));
                      }}
                    />
                  ))}
                </div>
              )}
            </Group>

            <Rise>
              <p className="pt-6 text-[12.5px] leading-relaxed text-mist-dim">
                Changes you accept are recorded on{" "}
                <Link to="/coach/plan/changes" className="text-azure">
                  Plan changes
                </Link>{" "}
                with their reason, and can be undone there. This review, and whether you have read
                it, are kept on this phone only — a new phone will offer it again.
              </p>
            </Rise>
          </>
        )}
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* One proposal                                                                */
/* -------------------------------------------------------------------------- */

function ProposalRow({
  proposal,
  preview,
  status,
  problem,
  onApply,
  onDecline,
}: {
  proposal: ReviewProposal;
  preview: PlanProposal;
  status: ProposalStatus;
  problem: string;
  onApply: () => void;
  onDecline: () => void;
}) {
  const refusedNow = preview.outcome === "refused";
  const settled = status !== "pending";

  return (
    <div className="-mx-5 border-t border-hairline px-5 py-4 first:border-t-0">
      {/* The app's own one-line account of the change, from the engine. */}
      <p className="text-[14px] leading-relaxed text-snow">{preview.summary}</p>

      <p className="mt-2 text-[13px] leading-relaxed text-mist">{proposal.rationale}</p>

      {/* WHAT TRIGGERED IT, as measurements rather than as an assertion. Every
          line here can be checked on another screen. */}
      <ul className="mt-2.5 space-y-1">
        {proposal.basis.map((b) => (
          <li key={b} className="text-[12.5px] leading-relaxed text-mist-dim">
            {b}
          </li>
        ))}
      </ul>

      {/* Before and after, straight from `previewAction`. */}
      {preview.days.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {preview.days.map((d) => (
            <div key={d.date}>
              <p className="text-[12.5px] text-mist-dim">{d.label}</p>
              <p className="text-[13px] leading-relaxed text-mist">
                {d.before} → <span className="text-snow">{d.after}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* The threshold's own sentence, or the refusal's. Shown because it is
          what says why this one is worth stopping for. */}
      {preview.note ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{preview.note}</p>
      ) : null}

      {problem ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{problem}</p>
      ) : null}

      {settled ? (
        <p className="mt-3 text-[13px] text-mist">
          {status === "applied"
            ? "Applied. It is on Plan changes with an Undo."
            : status === "declined"
              ? "Left alone. Nothing was written, and this will not be offered again."
              : status === "refused"
                ? "Not applied."
                : "Nothing was written."}
        </p>
      ) : (
        <div className="mt-3.5 flex items-center gap-3">
          <button
            type="button"
            onClick={onApply}
            disabled={refusedNow}
            className="rounded-full border border-hairline-strong px-4 py-1.5 text-[13px] text-snow transition-colors hover:border-azure/50 disabled:opacity-40"
          >
            Make this change
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="px-1 py-1.5 text-[13px] text-mist transition-colors hover:text-snow"
          >
            Not now
          </button>
        </div>
      )}
    </div>
  );
}
