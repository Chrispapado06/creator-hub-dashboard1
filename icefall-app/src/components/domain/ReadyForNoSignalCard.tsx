import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { shouldShowCard } from "@/mountain/readyModel";
import { useReadyForNoSignal } from "@/mountain/useReadyForNoSignal";

/**
 * A one-line nudge in the week before a trip: how much of "Ready for no signal"
 * is still undone, and the way to the screen that does it.
 *
 * It states, it does not sell. No countdown and no colour escalation — the
 * things on the checklist are minutes of work, and an alarm-coloured strip for
 * a missing policy number would be shouting at somebody who is already packing.
 *
 * It renders NOTHING when there is nothing to say: no trip, a trip more than a
 * week away or already finished, or everything done. It never downloads
 * anything on its own (`auto: false`) — this sits on screens nobody opened to
 * start a download.
 */
export default function ReadyForNoSignalCard({ className }: { className?: string }) {
  const { summary, day } = useReadyForNoSignal();

  if (!shouldShowCard(day, summary)) return null;

  const when =
    day?.kind === "before"
      ? day.daysToGo <= 1
        ? "You leave tomorrow."
        : `You leave in ${day.daysToGo} days.`
      : "Your trip is running.";

  return (
    <Link
      to="/trip/ready"
      className={cn(
        "-mx-5 flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-white/[0.03]",
        className,
      )}
    >
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-azure/70" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="tnum block text-[13px] text-snow">
          Ready for no signal · {summary.headline}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-mist">
          {when} {summary.todo === 1 ? "One thing" : `${summary.todo} things`} left to do while you
          still have a signal.
        </span>
      </span>
      <ChevronRight
        size={16}
        strokeWidth={1.8}
        className="shrink-0 self-center text-mist-dim"
        aria-hidden
      />
    </Link>
  );
}
