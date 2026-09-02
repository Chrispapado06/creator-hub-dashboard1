import type { JSX } from "react";
import { Mountain } from "lucide-react";
import { SUMMITS_SELF_REPORTED, summitDateLabel, useSummitLog } from "@/social/summits";
import { fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * THE CLAIM PART OF A SUMMIT POST — the block the owner's profile mockup drew
 * as "SUMMIT LOG · Aiguille du Tour · 3,542 m".
 *
 * ── WHAT IT DRAWS, AND WHAT IT REFUSES TO DRAW ───────────────────────────────
 *
 * It draws exactly four things, because exactly four things are stored: the
 * chip that says what kind of claim this is, the peak (with its height when
 * there is one), the sentence "Summited <day> via <route>", and the conditions
 * the climber found. `public.summit_logs` has no other column, so this card has
 * no other element — a card that draws what the table cannot store is a card
 * that will one day draw the wrong thing.
 *
 * NO TICK. NO SHIELD. NO BADGE. NOWHERE THE WORD "VERIFIED".
 * This is the single rule this component exists to keep, and it is not a
 * stylistic preference. ICEFALL has already fixed what the word means —
 * `SUMMIT_VERIFIED_MEANING`: "the summit was reached during an activity
 * recorded in ICEFALL, and the track reached the summit. It is not a check on
 * the person" — and NOTHING CAN CURRENTLY SATISFY IT: recorded activities live
 * on the device and no track has ever reached a server. That is why the
 * migration has no `verified` column and no way to earn one. A tick here would
 * therefore be a mark nobody could have earned, drawn beside a claim ICEFALL
 * has not checked, on a screen somebody uses to decide who to go up a mountain
 * with. The footer says the true thing instead, in the owner's own words, from
 * the one constant every summit surface shares: `SUMMITS_SELF_REPORTED`.
 *
 * ── WHAT BELONGS TO `PostCard` AND IS NOT REPEATED HERE ──────────────────────
 *
 * The byline, the identity mark, the timestamp, the photograph, the like and
 * the comment count are all `PostCard`'s, and `PostCard` already draws them for
 * every post including this one. THE POST BODY IS ALSO PostCard's — the
 * climber's free notes are `posts.body`, and `PostCard` prints them in its own
 * `whitespace-pre-wrap` paragraph immediately around this block. Printing them
 * here as well would show the same paragraph twice, which is precisely the
 * duplication this split of work exists to prevent. So this component takes a
 * post id, draws the CLAIM, and stops.
 *
 * ── WHY IT RETURNS `null` SO READILY ─────────────────────────────────────────
 *
 * Most posts are not summits, and a feed may render this beside every one of
 * them. `SummitLogResult` says it exactly: `summit: null` with `state: "ready"`
 * is an ordinary post, and `null` with any other state is nobody having found
 * out. BOTH DRAW NOTHING — not a placeholder, not a skeleton, not an error.
 * A post whose summit could not be read is a post with no summit visible on it;
 * what it must never do is say "no summit", and a component that renders
 * nothing cannot. The alternative is an error sentence under every ordinary
 * post in the feed about a claim nobody said was there.
 *
 * `summit_logs` is not deployed yet — the owner gates migrations — so
 * `not-provisioned` is the state every post is in today and this card correctly
 * draws nothing anywhere. That is the honest picture of a feature that has no
 * table behind it, and it needs no code change on the day it does.
 */

export function SummitLogCard({
  postId,
  className,
}: {
  postId: string;
  /**
   * Placement is the caller's, not this component's. It draws no padding and no
   * border of its own because it sits inside a card that already has both —
   * `PostCard` insets its content by `px-4`, and a second box drawn around this
   * one would double every edge.
   */
  className?: string;
}): JSX.Element | null {
  const { summit } = useSummitLog(postId);

  // Loading, ordinary post, unreachable and not-provisioned all land here, and
  // all four are drawn the same way: as nothing. See the note above.
  if (!summit) return null;

  /*
   * `typeof === "number"`, NOT a truthiness test, and the difference is a real
   * elevation rather than a style point.
   *
   * `elevation_m` is `check (elevation_m is null or elevation_m between 0 and
   * 9000)`, so 0 is a value the column accepts and a figure a climber may
   * genuinely have recorded. A `summit.elevationM ? …` test drops it silently
   * and prints the peak as though no height had ever been given, which is the
   * exact confusion between a MEASURED nought and an unmeasured absence that
   * this app keeps apart everywhere. `null` omits the height entirely; `0`
   * prints "0 m".
   */
  const elevationM = summit.elevationM;
  const hasElevation = typeof elevationM === "number";

  // Trimmed before testing: the column allows whitespace, and " " is not a route.
  const route = summit.route?.trim();
  const conditions = summit.conditions?.trim();

  return (
    <div className={cn("space-y-2.5", className)}>
      {/* ---- The chip -----------------------------------------------------
          The app's existing summit-log mark (SummitLogKit draws the identical
          pill), sized to `PostCard`'s own chip so the two read as one card.
          A mountain, not a rosette: it names the subject, it does not rank it. */}
      <p>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-2.5 py-1 text-[9.5px] uppercase tracking-[0.14em] text-mist">
          <Mountain size={11} strokeWidth={1.8} aria-hidden className="text-azure" />
          Summit log
        </span>
      </p>

      {/* ---- The peak ------------------------------------------------------
          `peak_name` is NOT NULL, so this line always has something to say.
          The height is a separate span in mist so the eye reads the mountain
          first and the figure second — and it is absent, not zeroed, when the
          climber did not record one. */}
      <p className="text-[17px] font-light leading-snug text-snow">
        {summit.peakName}
        {hasElevation && (
          <span className="tnum text-[13.5px] text-mist">
            {" · "}
            {fmtElevation(elevationM)} m
          </span>
        )}
      </p>

      {/* ---- The day, and the way up ---------------------------------------
          One sentence rather than two labelled fields: it is how a climber says
          it, and `route` is optional in the column, so the clause simply is not
          there when they did not name one.

          `summitDateLabel` and never `new Date(summit.summitedOn)`. A bare
          `YYYY-MM-DD` parses as UTC midnight, which renders as the previous day
          everywhere west of Greenwich — the off-by-one f2cb54c fixed across the
          app — and an ascent dated a day early is a wrong claim about a
          mountain. The data layer exports the label for exactly this reason. */}
      <p className="tnum text-[12px] leading-relaxed text-mist-dim">
        Summited {summitDateLabel(summit.summitedOn)}
        {route ? ` via ${route}` : ""}.
      </p>

      {/* ---- Conditions ----------------------------------------------------
          The load-bearing field, and the reason another climber reads this at
          all: "is the route in, where does the snow start". It gets the box
          because it is the part somebody will plan a day on. */}
      {conditions && (
        <div className="rounded-tile border border-azure/30 bg-azure/[0.05] px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-azure/85">Conditions</p>
          <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-snow">
            {conditions}
          </p>
        </div>
      )}

      {/*
       * THE FOOTER, WORD FOR WORD FROM THE OWNER'S MOCKUP, VIA THE CONSTANT.
       *
       * It is on every summit log rather than once per screen, because this
       * block travels — a feed, a profile, a mountain page — and a sentence
       * that lives on the screen instead of on the claim is a sentence that
       * goes missing the first time the claim is rendered somewhere new. Read
       * from `SUMMITS_SELF_REPORTED` rather than typed out, so the feed card,
       * the profile list and the chart cannot drift into three different
       * promises about the same thing.
       *
       * Quiet, not apologetic: it is the true description of what a summit log
       * is, and it is the reason no tick appears above it.
       */}
      <p className="text-[10.5px] leading-relaxed text-mist-dim">
        Self-reported. {SUMMITS_SELF_REPORTED}
      </p>
    </div>
  );
}
