import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";

/**
 * A one-line note about the trial, for the top of a screen.
 *
 * It is INFORMATION, not a sales tool, and the difference is the whole point:
 *
 *   - no dismiss control, because there is nothing here to escape from — it is
 *     a status line, and a strip you have to close reads as an advert
 *   - no countdown, no colour escalation as the days run down, no "act now".
 *     ICEFALL has no payment processor, so a deadline would be pressure towards
 *     something that cannot even happen
 *   - the expired state says plainly that nothing was charged and nothing was
 *     locked, because the alternative is letting an athlete assume otherwise
 *
 * Renders nothing when no trial has been started. See src/screens/auth/Trial.tsx
 * for the offer itself and the reasoning behind all of the above.
 */
export default function TrialBanner({ className }: { className?: string }) {
  const { subscription, trialDaysLeft } = useApp();

  if (subscription.status === "none") return null;

  const trialing = subscription.status === "trialing";
  // `trialDaysLeft` is null unless a trial is genuinely running. If the two ever
  // disagree, say nothing rather than invent a number of days.
  if (trialing && trialDaysLeft === null) return null;

  const headline = trialing
    ? (trialDaysLeft ?? 0) <= 1
      ? "Your trial ends within a day"
      : `${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left in your trial`
    : "Your trial has ended";

  // Kept short enough to sit on one line at phone width — a status strip that
  // wraps to three lines stops reading as a status strip.
  const detail = trialing
    ? "Billing isn't connected — nothing is charged."
    : "Nothing was charged, and nothing is locked.";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-tile border border-hairline bg-elevated/40 px-3.5 py-2.5",
        className,
      )}
    >
      <span
        className={cn(
          "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
          trialing ? "bg-azure/70" : "bg-white/20",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="tnum text-[12px] text-snow">{headline}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">{detail}</p>
      </div>
      <Link
        to="/subscribe"
        className="mt-px shrink-0 text-[11px] text-azure transition-colors hover:text-azure-bright"
      >
        See plan
      </Link>
    </div>
  );
}
