import { useEffect, useState, type JSX } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check } from "lucide-react";
import { Button, Disclaimer } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { supabase } from "@/backend/client";
import { REPORT_QUEUED_NOTICE, queueReport } from "@/social/comments";
import { cn } from "@/lib/utils";

/**
 * REPORTING A POST — a reason, then whatever else needs saying.
 *
 * THE SIX REASONS ARE THE DATABASE'S, NOT THIS FILE'S. `reports.reason` carries
 * `check (reason in ('spam','harassment','off_platform_payment','safety',
 * 'impersonation','other'))` — chat migration 20260818090000 — so a seventh
 * option invented for the UI would be a constraint violation at submit time,
 * i.e. a report a person believed they had filed. The values below are the
 * constraint's, character for character; only the labels are ours.
 *
 * THE FREE TEXT IS `detail`, a plain nullable column. It is where the reason
 * list stops being enough, which on a mountaineering feed is most of the time —
 * "safety" covers both a cornice photographed from the wrong side and a person
 * being goaded into a route they cannot climb, and moderation needs to know
 * which.
 *
 * WHERE IT GOES, HONESTLY. If there is a server and a session, the row is
 * inserted and the returned id is the proof. If there is not — no backend,
 * signed out, or the insert refused — the report falls back to the on-device
 * queue that `social/comments.ts` already keeps, and THE SCREEN SAYS WHICH OF
 * THE TWO HAPPENED. A report that silently evaporates is worse than a button
 * that admits what it can do; a report that claims to have reached moderation
 * when it reached localStorage is worse than both.
 */

/**
 * `reports` is not in `backend/types.ts` — that file predates the social
 * migration and belongs to another session, so it is imported from rather than
 * edited. The insert shape below was checked against the migration by hand.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/** The CHECK constraint's values. Changing one silently breaks the insert. */
type ReportReason =
  | "spam"
  | "harassment"
  | "off_platform_payment"
  | "safety"
  | "impersonation"
  | "other";

const REASONS: readonly { value: ReportReason; label: string; detail: string }[] = [
  {
    value: "safety",
    label: "It puts someone in danger",
    // First, deliberately. Somebody reporting a person about to be hurt should
    // not have to read a list — the same reason `SUPPORT_TYPES` opens with it.
    detail: "Advice that could get a climber killed, or pressure onto a route somebody cannot climb.",
  },
  {
    value: "harassment",
    label: "Harassment or abuse",
    detail: "Aimed at a person: threats, pile-ons, or someone who will not stop.",
  },
  {
    value: "spam",
    label: "Spam or a scam",
    detail: "Selling, bots, repeated posting, or something that is simply not what it says it is.",
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
    detail: "A climber, a guide, or a company being posted as by somebody who is not them.",
  },
  {
    value: "other",
    label: "Something else",
    detail: "Anything the five above do not cover. Say what it is below.",
  },
];

type Outcome =
  /** The row exists on the server and has an id. */
  | { where: "server" }
  /** Kept on this device. `note` says why it could not go further. */
  | { where: "device"; note: string };

export function ReportDialog({
  postId,
  onClose,
}: {
  /** Null closes the dialog. The feed owns which post is being reported. */
  postId: string | null;
  onClose(): void;
}): JSX.Element {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Reporting a second post must not inherit the first one's reason, and this
  // component stays mounted between the two — the feed only swaps `postId`.
  useEffect(() => {
    setReason(null);
    setDetail("");
    setBusy(false);
    setOutcome(null);
  }, [postId]);

  if (!postId) return <></>;

  // Narrowing a prop does not survive into the closures below — parameters are
  // mutable bindings as far as the compiler is concerned. Captured once.
  const id = postId;

  /**
   * "Something else" with no words is a report nobody can act on: it names no
   * behaviour and points at nothing in the post. Every other reason carries its
   * own meaning, so the box stays optional for them.
   */
  const needsDetail = reason === "other" && detail.trim().length === 0;
  const canSend = reason !== null && !needsDetail && !busy;

  async function send() {
    if (!reason) return;
    setBusy(true);

    const text = detail.trim();
    const local = (note: string) => {
      // The on-device queue keeps the reason string it is given; the post id is
      // the subject, which is what `social/comments.ts` expects.
      queueReport(id, reason);
      setOutcome({ where: "device", note });
      setBusy(false);
    };

    if (!supabase || !untyped) {
      local(REPORT_QUEUED_NOTICE);
      return;
    }

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      local(
        "A report carries who made it, so it needs your account. This one is kept on this device instead and has not reached anybody — sign in and report it again to send it.",
      );
      return;
    }

    // `.select("id")` for the same reason the composer does it: the id is the
    // only evidence the row exists. Without it a missing error would be read as
    // a delivery.
    const { data, error } = await untyped
      .from("reports")
      .insert({
        reporter_id: sess.session.user.id,
        post_id: id,
        reason,
        detail: text.length > 0 ? text : null,
      })
      .select("id")
      .single();

    if (error || !data) {
      local(
        "This could not be sent to ICEFALL, so it is kept on this device and has not reached moderation. Nothing was lost — reporting it again when you have signal will send it.",
      );
      return;
    }

    setOutcome({ where: "server" });
    setBusy(false);
  }

  /* ---- Sent ------------------------------------------------------------- */

  if (outcome) {
    return (
      <Sheet title="Reported" onClose={onClose}>
        <div className="space-y-4 py-4">
          {outcome.where === "server" ? (
            <>
              <p className="text-[13px] leading-relaxed text-snow">
                Your report is stored and open in ICEFALL's moderation queue.
              </p>
              <Disclaimer>
                ICEFALL does not promise a review time. Nothing has been reviewed here yet, so there
                is no average to quote — when there is one, it will say so rather than estimating.
                You will not be told what was decided about somebody else's account.
              </Disclaimer>
            </>
          ) : (
            <p className="text-[13px] leading-relaxed text-snow">{outcome.note}</p>
          )}
          <Button className="w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </Sheet>
    );
  }

  /* ---- The form --------------------------------------------------------- */

  return (
    <Sheet title="Report this post" onClose={onClose}>
      <div className="space-y-4 py-4">
        <p className="text-[11.5px] leading-relaxed text-mist-dim">
          Pick the closest reason, then say whatever the list leaves out. The author is not told who
          reported them.
        </p>

        <div className="space-y-2">
          {REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-start gap-3 rounded-tile border px-3.5 py-3 text-left transition-colors",
                  active
                    ? "border-azure/55 bg-azure/[0.08]"
                    : "border-hairline bg-elevated/30 hover:border-hairline-strong",
                )}
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
          <label
            htmlFor="report-detail"
            className="section-label block"
          >
            {reason === "other" ? "What happened" : "Anything else (optional)"}
          </label>
          <textarea
            id="report-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={4}
            placeholder="What did you see, and where in the post?"
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
