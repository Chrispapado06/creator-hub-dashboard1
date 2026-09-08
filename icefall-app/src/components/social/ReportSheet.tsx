import { useEffect, useState, type JSX } from "react";
import { Check } from "lucide-react";
import { Button, Disclaimer } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { report, type ReportKind, type ReportOutcome, type ReportReason } from "@/social/safety";
import { cn } from "@/lib/utils";

/**
 * REPORTING A PERSON OR A CONVERSATION — a reason, then whatever else needs
 * saying, and then the truth about where it went.
 *
 * ── WHY THIS EXISTS BESIDE `ReportDialog` ────────────────────────────────────
 *
 * `ReportDialog` reports a POST and writes its own insert. This one reports
 * anything `social/safety.ts` can name — a profile, a thread — and writes
 * nothing itself: it calls `report()` and prints the `ReportOutcome.message` it
 * gets back, VERBATIM. That module already distinguishes the only three
 * outcomes that matter and refuses to collapse them:
 *
 *   moderation  the row exists on ICEFALL's server and its id is the proof;
 *   device      it is on this phone, reached nobody, and CAN be sent later;
 *   nowhere     it reached nobody and never can.
 *
 * A screen that composed its own sentence would eventually claim the first
 * while the second happened, which is the exact failure that module was written
 * to end. So this file holds no copy about delivery at all.
 *
 * ── WHAT IT IS SAFE TO OPEN THIS ON, TODAY ───────────────────────────────────
 *
 * `subject_id` (a profile) and `thread_id` are live columns on `public.reports`.
 * The other five reference columns ship in 20260903010000, and until that is
 * pushed a report about one of them comes back `{where: "device"}` and says so
 * — which is honest, but a control offered on the strength of it should be
 * chosen deliberately rather than by accident.
 *
 * THE PERSON REPORTED IS NOT TOLD, and nothing here may ever be built into a
 * notice. Reporting is moderation and is separate from support: nothing written
 * here reaches a reply.
 */

/**
 * The CHECK constraint's six values with the labels this app puts on them.
 *
 * The VALUES are `reports.reason`'s own — `check (reason in
 * ('spam','harassment','off_platform_payment','safety','impersonation',
 * 'other'))`, 20260818090000 — and `social/safety.ts` validates against the
 * same list before the insert. `ReportDialog` holds a third copy for a post,
 * with the wording aimed at a post; these are repeated rather than shared
 * because the labels differ and the values must not.
 */
const REASONS: readonly { value: ReportReason; label: string; detail: string }[] = [
  {
    value: "safety",
    // First, deliberately. Somebody reporting a person about to be hurt should
    // not have to read a list.
    label: "They are putting someone in danger",
    detail:
      "Advice that could get a climber killed, or pressure onto a route somebody cannot climb.",
  },
  {
    value: "harassment",
    label: "Harassment or abuse",
    detail: "Aimed at a person: threats, pile-ons, or someone who will not stop.",
  },
  {
    value: "spam",
    label: "Spam or a scam",
    detail: "Selling, bots, repeated messages, or something that is simply not what it says it is.",
  },
  {
    value: "off_platform_payment",
    label: "Asked me to pay off ICEFALL",
    detail:
      "Somebody moving money out of the app. It is the failure that costs a climber the most, so it is reported on its own rather than as spam.",
  },
  {
    value: "impersonation",
    label: "Pretending to be someone else",
    detail: "A climber, a guide or a company being posted as by somebody who is not them.",
  },
  {
    value: "other",
    label: "Something else",
    detail: "Anything the five above do not cover. Say what it is below.",
  },
];

export function ReportSheet({
  kind,
  id,
  title,
  intro,
  initialReason = null,
  onClose,
}: {
  /** What is being reported. `social/safety.ts` maps it to the one column. */
  kind: ReportKind;
  /** The uuid of that thing. Null closes the sheet — the caller owns which. */
  id: string | null;
  /** The sheet's own heading, e.g. "Report this person". */
  title: string;
  /** One line above the reasons, naming what a report does here. */
  intro?: string;
  /**
   * A reason chosen for the reader by the surface that opened this — the
   * off-platform warning in a thread already knows what it flagged. It is a
   * pre-selection and never a submission: the reader can change it, and nothing
   * is sent until they press the button.
   */
  initialReason?: ReportReason | null;
  onClose(): void;
}): JSX.Element {
  const [reason, setReason] = useState<ReportReason | null>(initialReason);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ReportOutcome | null>(null);

  // Reporting a second thing must not inherit the first one's reason: the
  // caller keeps this mounted and swaps `id`.
  useEffect(() => {
    setReason(initialReason);
    setDetail("");
    setBusy(false);
    setOutcome(null);
  }, [id, initialReason]);

  if (!id) return <></>;
  const subject = id;

  /**
   * "Something else" with no words is a report nobody can act on: it names no
   * behaviour and points at nothing. Every other reason carries its own
   * meaning, so the box stays optional for them.
   */
  const needsDetail = reason === "other" && detail.trim().length === 0;
  const canSend = reason !== null && !needsDetail && !busy;

  async function send() {
    if (!reason) return;
    setBusy(true);
    const result = await report({ kind, id: subject, reason, detail: detail.trim() });
    setOutcome(result);
    setBusy(false);
  }

  /* ---- Where it went ------------------------------------------------------ */

  if (outcome) {
    return (
      <Sheet title={outcome.where === "moderation" ? "Reported" : "Not sent"} onClose={onClose}>
        <div className="space-y-4 py-4">
          {/* THE MODULE'S OWN SENTENCE, WORD FOR WORD. It is the only thing on
              this screen that knows whether the row exists. */}
          <p className="text-[13px] leading-relaxed text-snow">{outcome.message}</p>
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </Sheet>
    );
  }

  /* ---- The form ----------------------------------------------------------- */

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-4 py-4">
        <p className="text-[11.5px] leading-relaxed text-mist-dim">
          {intro ?? "Pick the closest reason, then say whatever the list leaves out."} They are not
          told who reported them.
        </p>

        {/* Flat rows on hairlines rather than six bordered tiles: a reason is a
            choice in a list, not six separate objects. */}
        <div className="divide-y divide-hairline border-y border-hairline">
          {REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                aria-pressed={active}
                className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-white/[0.02]"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13.5px]", active ? "text-azure" : "text-snow")}>
                    {r.label}
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-mist-dim">
                    {r.detail}
                  </span>
                </span>
                {active && (
                  <Check size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-azure" />
                )}
              </button>
            );
          })}
        </div>

        <div>
          <label htmlFor="report-sheet-detail" className="section-label block">
            {reason === "other" ? "What happened" : "Anything else (optional)"}
          </label>
          <textarea
            id="report-sheet-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={4}
            placeholder="What did you see, and when?"
            className="mt-2 w-full resize-none rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[13.5px] leading-relaxed text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
          />
          {needsDetail && (
            <p className="mt-1.5 text-[11px] text-mist-dim">
              “Something else” needs a line saying what it is — otherwise there is nothing to look
              into.
            </p>
          )}
        </div>

        <Button className="w-full" disabled={!canSend} onClick={() => void send()}>
          {busy ? "Sending…" : "Send report"}
        </Button>

        <Disclaimer>
          Reporting is moderation, and it is separate from support. Nothing you write here reaches a
          reply — it goes to the queue that removes content and restricts accounts.
        </Disclaimer>
      </div>
    </Sheet>
  );
}
