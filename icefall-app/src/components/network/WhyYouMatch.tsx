import { cn } from "@/lib/utils";
import type { MatchFactor, MatchResult } from "@/network/matching";

/**
 * The working behind a compatibility score.
 *
 * WHAT THE NUMBER IS
 *
 * Two ICEFALL profiles, compared. Nothing else feeds it: not identity, not
 * qualifications, not experience anybody has checked, not how much either
 * person trains. Every surface that shows the number shows this caption with
 * it, and the caption is a constant so two screens cannot end up making
 * different claims about the same figure.
 *
 * WHAT IT IS NOT
 *
 * It is not a safety judgement and no wording here may drift into one. ICEFALL
 * verifies nobody, so a high number means two plans line up and says nothing at
 * all about whether either person should be on that mountain or whether they
 * are safe to meet. There is no adjective anywhere in this file — no
 * "excellent", no "strong", no grade — because flattery about a climbing
 * partner is how somebody ends up on a route with a stranger they never
 * questioned.
 *
 * THE ONE RULE THE LAYOUT ENFORCES
 *
 * A factor with an applied weight of 0 was DROPPED: one side or the other had
 * nothing to compare, so it is an unknown and its `score` is meaningless
 * filler. It is rendered as its note under NOT COUNTED, and never as a bar at
 * zero — an empty bar reads as "scored nothing", which is the one thing it does
 * not mean. When every factor was dropped there is no number to show at all,
 * and `CompatibilityScore` shows the headline instead of a 0 that would read as
 * a verdict.
 */

/** The caption that must travel with the number, wherever it is drawn. */
export const COMPATIBILITY_CAPTION = "Compatibility based on your ICEFALL profiles";

/** The standing qualification, in one sentence. */
export const COMPATIBILITY_NOTE =
  "It describes how two plans line up, never a person. ICEFALL does not check anyone's identity, experience, qualifications or safety, so this is not a judgement that either of you is ready for the mountain or safe to meet.";

/** True when at least one factor could be computed, so the number means something. */
export const isComparable = (match: MatchResult) => match.factors.some((f) => f.weight > 0);

/** The engine prefixes a dropped factor's note; the heading already says it. */
const NOT_COUNTED_PREFIX = "Not counted. ";

const withoutPrefix = (note: string) =>
  note.startsWith(NOT_COUNTED_PREFIX) ? note.slice(NOT_COUNTED_PREFIX.length) : note;

/* -------------------------------------------------------------------------- */
/* The number                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The score and its caption, as one unit.
 *
 * They are one component precisely so the number cannot be drawn without the
 * sentence that says what it is.
 */
export function CompatibilityScore({
  match,
  align = "right",
  className,
}: {
  match: MatchResult;
  align?: "left" | "right";
  className?: string;
}) {
  const comparable = isComparable(match);

  return (
    <div className={cn(align === "right" ? "text-right" : "text-left", className)}>
      {comparable ? (
        <p className="tnum text-[22px] font-light leading-none text-snow">{match.score}</p>
      ) : (
        // Not a zero. "Nothing to compare" and "compared, and they line up on
        // nothing" would lead an athlete to opposite conclusions about the same
        // stranger.
        <p className="text-[13px] leading-none text-mist">Not comparable</p>
      )}
      <p className="section-label mt-2 text-[9px]">Compatibility</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The working                                                                 */
/* -------------------------------------------------------------------------- */

export function WhyYouMatch({ match, className }: { match: MatchResult; className?: string }) {
  const counted = match.factors.filter((f) => f.weight > 0);
  const dropped = match.factors.filter((f) => f.weight === 0);

  return (
    <div className={className}>
      <p className="section-label">Why you match</p>

      <p className="mt-2 text-[12px] leading-relaxed text-mist">
        {match.headline}. {COMPATIBILITY_CAPTION}. {COMPATIBILITY_NOTE}
      </p>

      {counted.length > 0 && (
        <ul className="mt-3.5 space-y-3">
          {counted.map((factor) => (
            <li key={factor.id}>
              <CountedFactor factor={factor} />
            </li>
          ))}
        </ul>
      )}

      {dropped.length > 0 && (
        <div className="mt-4 rounded-tile border border-hairline bg-white/[0.015] p-3">
          <p className="section-label">Not counted</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
            Nothing to compare on these, so they are left out of the number rather than counted
            against anyone. The weights of what remains are shared out over them.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {dropped.map((factor) => (
              <li key={factor.id} className="text-[11px] leading-relaxed text-mist-dim">
                <span className="text-mist">{factor.label}</span> — {withoutPrefix(factor.note)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {counted.length === 0 && (
        <p className="mt-3 text-[12px] leading-relaxed text-mist-dim">
          Nothing could be compared, so there is no number. Fill in your objective, your dates and
          what you are looking for and the comparison has something to work with.
        </p>
      )}
    </div>
  );
}

/**
 * One factor that counted.
 *
 * Shows whether it was met, the note the engine wrote for it, and the share of
 * the score it carried. The share is the APPLIED weight — what the factor was
 * actually worth once the dropped ones were taken out — because the nominal
 * weight would not add up to what the athlete can see.
 *
 * The bar is the factor's own 0–100 score. A genuine zero is drawn as a genuine
 * zero: "different objectives" is a measurement, and it is the one that holds
 * the whole score down.
 */
function CountedFactor({ factor }: { factor: MatchFactor }) {
  const share = Math.round(factor.weight * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-snow">{factor.label}</span>
        <span
          className={cn("text-[11px]", factor.met ? "text-azure" : "text-mist-dim")}
          // The words, not only the colour: azure on graphite is not a state
          // anyone should have to infer.
        >
          {factor.met ? "Lines up" : "Does not line up"}
        </span>
      </div>

      <div
        className="mt-1.5 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="img"
        aria-label={`${factor.label}: ${factor.score} out of 100`}
      >
        {/* Restrained on purpose: several of these stack up in one card, and
            azure is a 5% accent in this app rather than a fill. */}
        <div
          className={cn("h-full rounded-full", factor.met ? "bg-azure/45" : "bg-mist-dim/40")}
          style={{ width: `${Math.max(0, Math.min(100, factor.score))}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-mist">{factor.note}</p>
      <p className="tnum mt-1 text-[10px] text-mist-dim">{share}% of this comparison</p>
    </div>
  );
}
