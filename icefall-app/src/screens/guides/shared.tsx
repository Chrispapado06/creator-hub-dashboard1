import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Footprints,
  Languages,
  Layers,
  Mountain,
  MountainSnow,
  Pickaxe,
  Pyramid,
  ShieldQuestion,
  Snowflake,
  Star,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { Badge, Card, Disclaimer } from "@/components/ui/primitives";
import { MountainThumb } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import {
  GUIDE_MATCH_CAPTION,
  GUIDE_MATCH_DISCLAIMER,
  type GuideMatch,
  type GuideMatchFactor,
} from "@/guides/matching";
import { REVIEWS_NEED_BOOKINGS_NOTICE } from "@/guides/engagement";
import {
  AVAILABILITY_LABELS,
  CREDENTIAL_CLAIM_NOTICE,
  GUIDE_DEMO_NOTICE,
  GUIDE_VS_COMPANY,
  SPECIALITY_LABELS,
  credentialStatus,
  type Guide,
  type GuideCredential,
  type Speciality,
} from "@/guides/types";
import { mountainsOf } from "./filters";

/**
 * The pieces the directory and the profile both draw.
 *
 * One file, so the two screens cannot end up making different claims about the
 * same guide. The caption under a score, the word beside a qualification and
 * the sentence under a demo badge are all load-bearing — a second copy of any
 * of them is how one screen quietly becomes more flattering than the other.
 */

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A guide's portrait.
 *
 * NO REAL PERSON'S PHOTOGRAPH APPEARS HERE, and none may be added without that
 * guide's consent. `src` is only ever set for demo guides, and those portraits
 * are GAN-generated faces of people who do not exist — see `Guide.portrait`.
 * Attaching a real face to an invented name, an invented IFMGA licence and an
 * invented ascent record would misrepresent that person as a working guide, in
 * a trade where a client acts on exactly that impression.
 *
 * Falls back to initials whenever there is no portrait or the file fails to
 * load — the demo portraits are gitignored, so a teammate cloning this repo
 * gets initials and a working layout rather than eight broken images.
 */
export function GuidePortrait({
  name,
  src,
  size = 56,
  className,
}: {
  name: string;
  /** Demo guides only. Never a real person. */
  src?: string;
  size?: number;
  className?: string;
}) {
  // Which src failed, NOT a boolean. React reuses a component instance when a
  // list reorders or filters, so a bare `failed` flag would follow the position
  // rather than the picture: one guide's missing file would blank out whichever
  // guide landed in that slot next.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  if (src && failedSrc !== src) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className={cn(
          "block shrink-0 overflow-hidden rounded-tile border border-hairline bg-elevated/40",
          className,
        )}
      >
        {/* Not lazy: these are ~17 KB, they sit at the top of the list, and a
            portrait that fades in after the name has already rendered reads as
            a broken avatar. */}
        <img
          src={src}
          alt=""
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.3) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 font-light tracking-[0.08em] text-mist",
        className,
      )}
    >
      {initials.length > 0 ? initials : "··"}
    </span>
  );
}

/**
 * DEMO first, then a paid slot if one is ever sold.
 *
 * Both are disclosures rather than decoration. `featured` is labelled and takes
 * no part in the ranking — `rankGuides` ignores it outright — because a client
 * cannot tell a bought position from a qualification.
 */
export function GuideBadges({ guide }: { guide: Guide }) {
  return (
    <>
      {guide.demo && <Badge tone="azure">Demo</Badge>}
      {guide.featured && (
        <Badge tone="neutral" title="Paid placement. Not a qualification, and not a ranking.">
          Featured
        </Badge>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The number                                                                  */
/* -------------------------------------------------------------------------- */

/** True when at least one factor could be computed, so the number means something. */
const isComparable = (match: GuideMatch) => match.factors.some((f) => f.weight > 0);

/**
 * The score and the words saying what it is, as one component — so the number
 * can never be drawn without its caption.
 *
 * `variant` changes the typography and nothing else. The compact directory row
 * needed a smaller number, and the obvious shortcut — printing the score on its
 * own and captioning the list once at the top — is exactly the separation this
 * component exists to prevent: a bare 72 beside a name reads as a verdict on a
 * professional, and the caption is the whole of what stops it.
 */
export function GuideCompatibility({
  match,
  align = "right",
  variant = "block",
  className,
}: {
  match: GuideMatch;
  align?: "left" | "right";
  variant?: "block" | "inline";
  className?: string;
}) {
  const comparable = isComparable(match);

  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-baseline gap-1.5", className)}>
        {comparable ? (
          <span className="tnum text-[13px] font-light leading-none text-snow">{match.score}</span>
        ) : (
          <span className="text-[11px] leading-none text-mist">Not comparable</span>
        )}
        <span className="section-label text-[9px]">{GUIDE_MATCH_CAPTION}</span>
      </span>
    );
  }

  return (
    <div className={cn(align === "right" ? "text-right" : "text-left", className)}>
      {comparable ? (
        <p className="tnum text-[22px] font-light leading-none text-snow">{match.score}</p>
      ) : (
        // Not a zero. "Nothing to compare" and "compared, and nothing lined up"
        // would lead an athlete to opposite conclusions about the same guide.
        <p className="text-[13px] leading-none text-mist">Not comparable</p>
      )}
      <p className="section-label mt-2 text-[9px]">{GUIDE_MATCH_CAPTION}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The working                                                                 */
/* -------------------------------------------------------------------------- */

/** The engine prefixes a dropped factor's note; the heading already says it. */
const NOT_COUNTED_PREFIX = "Not counted. ";
const withoutPrefix = (note: string) =>
  note.startsWith(NOT_COUNTED_PREFIX) ? note.slice(NOT_COUNTED_PREFIX.length) : note;

export function WhyThisGuideMatches({
  match,
  className,
}: {
  match: GuideMatch;
  className?: string;
}) {
  const counted = match.factors.filter((f) => f.weight > 0);
  const dropped = match.factors.filter((f) => f.weight === 0);

  return (
    <div className={className}>
      <p className="section-label">Why this guide matches</p>

      <p className="mt-2 text-[12px] leading-relaxed text-mist">
        {match.headline}. {GUIDE_MATCH_DISCLAIMER}
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
            against the guide. What remains shares out their weight.
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
          Nothing could be compared, so there is no number. Set an objective and the comparison has
          something to work with.
        </p>
      )}
    </div>
  );
}

/**
 * One factor that counted: whether it lined up, the engine's own sentence, and
 * the share of the number it carried. The share is the APPLIED weight — the
 * nominal one would not add up to what the athlete can see.
 */
function CountedFactor({ factor }: { factor: GuideMatchFactor }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-snow">{factor.label}</span>
        {/* The words, not only the colour — azure on graphite is not a state
            anybody should have to infer. */}
        <span className={cn("text-[11px]", factor.met ? "text-azure" : "text-mist-dim")}>
          {factor.met ? "Lines up" : "Does not line up"}
        </span>
      </div>

      <div
        className="mt-1.5 h-[2px] w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="img"
        aria-label={`${factor.label}: ${factor.score} out of 100`}
      >
        <div
          className={cn("h-full rounded-full", factor.met ? "bg-azure/70" : "bg-mist-dim/50")}
          style={{ width: `${Math.max(0, Math.min(100, factor.score))}%` }}
        />
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-mist">{factor.note}</p>
      <p className="tnum mt-1 text-[10px] text-mist-dim">
        {Math.round(factor.weight * 100)}% of this comparison
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Facts about a guide                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Guided ascents, mountain by mountain.
 *
 * The most useful thing this directory holds about somebody you might tie into
 * a rope with, so it is the most prominent thing after their name. There is no
 * follower count, no booking volume and no response time anywhere near it —
 * none of those says anything about a mountain.
 *
 * A mountain the guide names but records no ascents of is shown as exactly
 * that. It is not a zero to be hidden: "works it, has not summited it with a
 * client" is a real and useful distinction, and rounding it away in either
 * direction would be dishonest.
 */
export function AscentsByMountain({
  guide,
  highlight,
  limit,
  className,
}: {
  guide: Guide;
  /** The athlete's objective, pulled to the top and marked. */
  highlight?: string;
  limit?: number;
  className?: string;
}) {
  const wanted = (highlight ?? "").trim().toLowerCase();

  const rows = mountainsOf(guide)
    .map((mountain) => ({
      mountain,
      ascents: guide.ascentsByMountain[mountain] ?? 0,
      isObjective: mountain.toLowerCase() === wanted,
    }))
    .sort((a, b) => Number(b.isObjective) - Number(a.isObjective) || b.ascents - a.ascents);

  const shown = limit ? rows.slice(0, limit) : rows;

  return (
    <div className={className}>
      <ul className="space-y-2.5">
        {shown.map((row) => (
          <li key={row.mountain} className="flex items-center gap-3">
            <MountainThumb peak={{ name: row.mountain }} size={38} />
            <div className="min-w-0 flex-1">
              <p
                className={cn("truncate text-[13px]", row.isObjective ? "text-azure" : "text-snow")}
              >
                {row.mountain}
              </p>
              <p className="tnum mt-0.5 text-[11px] text-mist">
                {row.ascents > 0
                  ? `${row.ascents.toLocaleString("en-GB")} guided ascents`
                  : "Works it — no guided ascents recorded"}
              </p>
            </div>
            {row.isObjective && <Badge tone="azure">Your objective</Badge>}
          </li>
        ))}
      </ul>

      {limit !== undefined && rows.length > shown.length && (
        <p className="tnum mt-2.5 text-[11px] text-mist-dim">
          and {rows.length - shown.length} more mountains
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        Counts recorded by the guide. ICEFALL has not seen these ascents and cannot check them
        {guide.demo ? ", and on a demo guide the figures are invented outright" : ""}.
      </p>
    </div>
  );
}

/** The standing status, said as a status rather than as a diary. */
export function AvailabilityLine({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <div className={className}>
      <p className="section-label">Availability</p>
      <p className="mt-1.5 text-[13px] text-snow">{AVAILABILITY_LABELS[guide.availability]}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">
        A standing status the guide set, not a calendar. ICEFALL holds no diary for anyone, so
        nothing here says a particular set of dates is free — ask them
        {guide.demo ? ". Invented on a demo guide, like the rest" : ""}.
      </p>
    </div>
  );
}

/**
 * What a day rate is and is not, in one sentence.
 *
 * Shared by the full line and the pill so the compact rendering cannot quietly
 * become the flattering one: a bare "€620 /day" on a card is read as the price
 * of the trip, and it is the price of one person's time.
 */
export function rateProvenance(guide: Guide): string {
  return `The guide's own figure for their time. Permits, huts, lifts, travel and their expenses sit on top of it${
    guide.demo ? ", and this figure is invented on a demo guide" : ""
  }.`;
}

/** The day rate. Always a figure in this model, and always with what it buys. */
export function RateLine({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <div className={className}>
      <p className="section-label">Day rate</p>
      <p className="tnum mt-1.5 text-[15px] font-light text-snow">
        €{guide.dailyRateEur.toLocaleString("en-GB")} a day
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">{rateProvenance(guide)}</p>
    </div>
  );
}

/**
 * The rate as a pill, for a row or a sticky footer.
 *
 * Carries `rateProvenance` on the element itself rather than dropping the
 * caveat: the sentence reaches a pointer and a screen reader, and the screen
 * placing this pill is expected to print it in full somewhere on the page.
 */
export function GuideRateBadge({
  guide,
  size = "sm",
  className,
}: {
  guide: Guide;
  size?: "sm" | "md";
  className?: string;
}) {
  const figure = `€${guide.dailyRateEur.toLocaleString("en-GB")}`;

  return (
    <span
      title={rateProvenance(guide)}
      aria-label={`${figure} a day. ${rateProvenance(guide)}`}
      className={cn(
        "inline-flex items-baseline gap-1 rounded-full border border-hairline-strong bg-white/[0.03]",
        size === "sm" ? "px-2.5 py-1" : "px-3.5 py-1.5",
        className,
      )}
    >
      <span
        className={cn("tnum font-light text-snow", size === "sm" ? "text-[13px]" : "text-[16px]")}
      >
        {figure}
      </span>
      <span className={cn("text-mist-dim", size === "sm" ? "text-[10px]" : "text-[11px]")}>
        /day
      </span>
    </span>
  );
}

/**
 * Qualifications, rendered as CLAIMED.
 *
 * `credentialStatus` is the branch: it returns "Verified" only for a credential
 * whose `verified` is true, and that field is typed as the literal `false`, so
 * the verified rendering below is modelled and unreachable. Nothing in this
 * build checks a register.
 */
export function Credentials({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <div className={className}>
      {/* Above the list, not under it: the notice says "every qualification
          below", and a caveat somebody reaches after reading the licence has
          already done its damage. */}
      <Disclaimer className="mb-3.5">{CREDENTIAL_CLAIM_NOTICE}</Disclaimer>
      <ul className="space-y-3">
        {guide.credentials.map((c) => {
          const status = credentialStatus(c);
          return (
            <li key={c.label} className="flex items-start gap-2.5">
              <ShieldQuestion
                size={14}
                strokeWidth={1.5}
                className="mt-[2px] shrink-0 text-mist-dim"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] text-snow">{c.label}</p>
                  <Badge tone={status === "Verified" ? "summit" : "neutral"}>{status}</Badge>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-mist">{c.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The qualification a guide leads with, or nothing when they list none. */
export function primaryCredential(guide: Guide): GuideCredential | undefined {
  return guide.credentials[0];
}

/**
 * One line of qualification, for a card, a row or a pinned header.
 *
 * The status word travels WITH the label and is never dropped for space. A
 * truncated "IFMGA / UIAGM mountain guide" with no "claimed" beside it is the
 * precise thing `CREDENTIAL_CLAIM_NOTICE` exists to prevent, so the label
 * truncates and the word does not.
 */
export function GuideCredentialLine({ guide, className }: { guide: Guide; className?: string }) {
  const credential = primaryCredential(guide);

  if (!credential) {
    return <p className={cn("text-[11.5px] text-mist-dim", className)}>No qualification listed</p>;
  }

  return (
    <p
      title={CREDENTIAL_CLAIM_NOTICE}
      className={cn("flex min-w-0 items-baseline gap-1.5 text-[11.5px] text-mist", className)}
    >
      <span className="truncate">{credential.label}</span>
      <span className="shrink-0 text-mist-dim">· {credentialStatus(credential).toLowerCase()}</span>
    </p>
  );
}

export function Specialities({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {guide.specialities.map((s) => (
        <span
          key={s}
          className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-mist"
        >
          {SPECIALITY_LABELS[s]}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Speciality tiles                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One icon per speciality, in one place.
 *
 * The filter sheet, the directory row and the profile all draw from this map,
 * so a tile cannot mean ice climbing on one screen and something else on the
 * next. The icon is decoration: `SPECIALITY_LABELS` is the wording, it is
 * always rendered beneath, and nothing here is ever the only thing identifying
 * a tile.
 */
export const SPECIALITY_ICONS: Record<Speciality, LucideIcon> = {
  mountaineering: Mountain,
  glacier: Waves,
  ice: Pickaxe,
  rock: Pyramid,
  mixed: Layers,
  "ski-mountaineering": MountainSnow,
  winter: Snowflake,
  "high-altitude": Wind,
  trekking: Footprints,
};

/**
 * The speciality tiles, four across.
 *
 * Two modes from one component so the filter sheet and a profile cannot drift
 * apart: pass `onToggle` and the tiles become buttons carrying `aria-pressed`;
 * omit it and they are plain tiles. Selection is azure OUTLINE plus a lit icon —
 * never colour alone, which on graphite is a state somebody has to infer.
 */
export function SpecialityGrid({
  specialities,
  selected,
  onToggle,
  className,
}: {
  specialities: readonly Speciality[];
  selected?: readonly Speciality[];
  onToggle?: (speciality: Speciality) => void;
  className?: string;
}) {
  if (specialities.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {specialities.map((speciality) => {
        const Icon = SPECIALITY_ICONS[speciality];
        const on = selected?.includes(speciality) ?? false;

        const inner = (
          <>
            <Icon
              size={17}
              strokeWidth={1.5}
              aria-hidden="true"
              className={on ? "text-azure" : "text-mist-dim"}
            />
            <span className="text-[9.5px] leading-[1.25]">{SPECIALITY_LABELS[speciality]}</span>
          </>
        );

        // 74 px clears the 44 px tap target with the label sitting under the
        // icon rather than beside it.
        const tile = cn(
          "flex min-h-[74px] flex-col items-center justify-center gap-2 rounded-tile border px-1.5 py-2.5 text-center transition-colors",
          on ? "border-azure/45 bg-azure/[0.06] text-snow" : "border-hairline text-mist",
        );

        if (!onToggle) {
          return (
            <span key={speciality} className={tile}>
              {inner}
            </span>
          );
        }

        return (
          <button
            key={speciality}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(speciality)}
            className={cn(tile, on ? "" : "hover:border-hairline-strong hover:text-snow")}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The three figures                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Years, expeditions led and the highest altitude guided.
 *
 * Three large numbers in a row is the most persuasive thing on a guide's page
 * and not one of them has been checked, so the band carries its provenance as
 * part of itself rather than leaving it to whichever screen draws it.
 */
export function GuideStatBand({ guide, className }: { guide: Guide; className?: string }) {
  const cells: { label: string; value: string; unit?: string }[] = [
    { label: "Years exp", value: guide.yearsGuiding.toLocaleString("en-GB") },
    { label: "Expeditions", value: guide.expeditionsLed.toLocaleString("en-GB") },
    { label: "Highest guided", value: guide.highestGuidedM.toLocaleString("en-GB"), unit: "m" },
  ];

  return (
    <div className={className}>
      <div className="grid grid-cols-3 rounded-tile border border-hairline">
        {cells.map((cell, i) => (
          <div
            key={cell.label}
            className={cn("px-2 py-3.5 text-center", i > 0 && "border-l border-hairline")}
          >
            <p className="tnum text-[20px] font-light leading-none text-snow">
              {cell.value}
              {cell.unit && <span className="ml-1 text-[11px] text-mist">{cell.unit}</span>}
            </p>
            <p className="section-label mt-2 text-[9px]">{cell.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
        Figures the guide records. ICEFALL has not seen a logbook, a carnet or a summit and has
        checked none of them
        {guide.demo ? ", and on a demo guide all three are invented outright" : ""}.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Where a rating on this build actually comes from.
 *
 * Only a demo record carries `rating` at all — see rule 4 in `@/guides/types` —
 * so the demo sentence is the one that renders today. The other branch exists
 * for the day a completed booking produces a real one, and says the condition
 * out loud rather than assuming it has been met.
 */
function ratingProvenance(guide: Guide): string {
  return guide.demo
    ? "Invented alongside the rest of this demonstration guide. No booking has ever completed on ICEFALL, so no review of anybody exists."
    : "A review requires a completed ICEFALL booking by the person writing it.";
}

/**
 * Stars, the average and the review count.
 *
 * Renders nothing at all when there is no rating, rather than an empty star row
 * — five hollow stars beside a name reads as a bad score, and "nobody has
 * reviewed this person" is the opposite claim. `fallback` turns that silence
 * into the sentence for screens with the room for it.
 */
export function GuideStars({
  guide,
  size = "sm",
  fallback = false,
  note = false,
  className,
}: {
  guide: Guide;
  size?: "sm" | "md";
  /** Print why there is no rating instead of rendering nothing. */
  fallback?: boolean;
  /** Print the provenance sentence under the row. */
  note?: boolean;
  className?: string;
}) {
  const { rating, reviewCount } = guide;

  if (rating === undefined || reviewCount === undefined) {
    if (!fallback) return null;
    return (
      <p className={cn("text-[11px] leading-relaxed text-mist-dim", className)}>
        {REVIEWS_NEED_BOOKINGS_NOTICE}
      </p>
    );
  }

  const filled = Math.round(rating);
  const provenance = ratingProvenance(guide);
  const stars = size === "sm" ? 11 : 13;

  return (
    <div className={className}>
      <p
        title={provenance}
        aria-label={`${rating} out of 5, from ${reviewCount} reviews. ${provenance}`}
        className={cn("flex items-center gap-1.5", size === "sm" ? "text-[11.5px]" : "text-[13px]")}
      >
        <span className="flex shrink-0 items-center gap-[2px]" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={stars}
              strokeWidth={1.6}
              className={i <= filled ? "text-azure" : "text-mist-dim/50"}
              fill={i <= filled ? "currentColor" : "none"}
            />
          ))}
        </span>
        <span className="tnum shrink-0 text-snow">{rating.toFixed(1)}</span>
        {/* Never let "(37 reviews)" break across lines — a lone "(37" reads as a
            truncated number rather than a wrapped label. */}
        <span className="tnum shrink-0 whitespace-nowrap text-mist-dim">
          ({reviewCount.toLocaleString("en-GB")} reviews)
        </span>
      </p>
      {note && <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{provenance}</p>}
    </div>
  );
}

export type ReviewStars = 1 | 2 | 3 | 4 | 5;
export type ReviewDistribution = Record<ReviewStars, number>;

const STAR_ROWS: ReviewStars[] = [5, 4, 3, 2, 1];

/**
 * The five-to-one breakdown.
 *
 * `counts` IS DELIBERATELY UNSUPPLIABLE TODAY. Nothing in this build holds a
 * per-star breakdown of anything: the demo guides carry an invented average and
 * an invented total and no reviews behind either, so a distribution drawn from
 * them would be a second invention layered on the first — bars an athlete would
 * read as thirty-seven people's opinions. The parameter is modelled for the day
 * completed bookings produce real reviews, exactly as `verified` is on a
 * credential, and until then the bars render empty and the reason is printed
 * underneath rather than a shape being fabricated to fill them.
 */
export function RatingDistribution({
  guide,
  counts,
  className,
}: {
  guide: Guide;
  counts?: ReviewDistribution;
  className?: string;
}) {
  const total = counts ? STAR_ROWS.reduce((sum, star) => sum + counts[star], 0) : 0;

  return (
    <div className={className}>
      <ul className="space-y-2">
        {STAR_ROWS.map((star) => {
          const n = counts?.[star] ?? 0;
          const pct = total > 0 ? (n / total) * 100 : 0;
          return (
            <li key={star} className="flex items-center gap-2.5">
              <span className="tnum w-2 shrink-0 text-[11px] text-mist-dim">{star}</span>
              <span
                role="img"
                aria-label={`${star} stars: ${n} reviews`}
                className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.06]"
              >
                <span
                  className="block h-full rounded-full bg-azure/70"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="tnum w-6 shrink-0 text-right text-[11px] text-mist-dim">{n}</span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
        {counts ? ratingProvenance(guide) : REVIEWS_NEED_BOOKINGS_NOTICE}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Mountains, as names only                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The ground a guide names, as chips.
 *
 * Names and nothing else. `AscentsByMountain` is the component that may attach
 * a figure to a mountain, because it is the one that also prints where the
 * figure came from; a chip has no room for that, so it makes no claim beyond
 * "this guide lists this mountain".
 */
export function GuideMountainChips({
  guide,
  limit = 4,
  highlight,
  className,
}: {
  guide: Guide;
  limit?: number;
  /** The athlete's objective, pulled to the front and marked. */
  highlight?: string;
  className?: string;
}) {
  const wanted = (highlight ?? "").trim().toLowerCase();
  const all = mountainsOf(guide).sort(
    (a, b) => Number(b.toLowerCase() === wanted) - Number(a.toLowerCase() === wanted),
  );
  const shown = all.slice(0, limit);
  const rest = all.length - shown.length;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {shown.map((mountain) => {
        const isObjective = mountain.toLowerCase() === wanted;
        return (
          <span
            key={mountain}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px]",
              isObjective ? "border-azure/45 bg-azure/10 text-azure" : "border-hairline text-mist",
            )}
          >
            {mountain}
          </span>
        );
      })}
      {rest > 0 && (
        <span className="tnum rounded-full border border-hairline px-2.5 py-1 text-[11px] text-mist-dim">
          +{rest} more
        </span>
      )}
    </div>
  );
}

export function LanguagesLine({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-[12px] text-mist", className)}>
      <Languages size={12} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
      {guide.languages.join(" · ")}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* The directory row                                                           */
/* -------------------------------------------------------------------------- */

/** Said wherever the standing status is compressed to two words. */
const AVAILABILITY_TITLE =
  "A standing status the guide set, not a calendar. ICEFALL holds no diary for anyone, so nothing here says a particular set of dates is free.";

/**
 * One guide, compact, for the directory.
 *
 * WHAT THE COMPRESSION IS NOT ALLOWED TO DROP. A row this size is where an
 * honest profile turns into an advert, because every caveat is a candidate for
 * the cutting-room floor. Four things therefore stay, whatever the height:
 *
 *   · the DEMO badge, so an invented person is never mistaken for a listed one;
 *   · the word beside the qualification, which is "claimed" and never a tick;
 *   · the caption under the compatibility number, drawn by `GuideCompatibility`
 *     itself so the two cannot be separated here;
 *   · the engine's own one-line reason, so a number the athlete cannot check
 *     always arrives with the sentence behind it.
 *
 * The whole row is the link to the profile — the rate pill and the availability
 * are statements, not controls, and neither is a booking affordance.
 */
export function GuideRow({
  guide,
  match,
  to,
  className,
}: {
  guide: Guide;
  /** The comparison behind the ordering. Omitted where nothing was compared. */
  match?: GuideMatch;
  to: string;
  className?: string;
}) {
  const mountains = mountainsOf(guide);
  const shown = mountains.slice(0, 3);
  const more = mountains.length - shown.length;

  return (
    <Link
      to={to}
      className={cn(
        "block rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <GuidePortrait name={guide.name} src={guide.portrait} size={56} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate text-[15px] font-light leading-tight text-snow">
              {guide.name}
            </h3>
            <GuideBadges guide={guide} />
          </div>

          <GuideCredentialLine guide={guide} className="mt-1.5" />
          <GuideStars guide={guide} className="mt-1.5" />

          {shown.length > 0 && (
            <p className="mt-1.5 truncate text-[11px] text-mist-dim">
              {shown.join(" · ")}
              {more > 0 && ` · +${more}`}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2.5">
          <GuideRateBadge guide={guide} />
          <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" className="text-mist-dim" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <p className="tnum min-w-0 truncate text-[11px] text-mist">
          <span>{guide.yearsGuiding.toLocaleString("en-GB")} yrs exp</span>
          <span aria-hidden="true"> · </span>
          <span title={AVAILABILITY_TITLE}>{AVAILABILITY_LABELS[guide.availability]}</span>
        </p>
        {match && <GuideCompatibility match={match} variant="inline" className="shrink-0" />}
      </div>

      {match && <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{match.headline}.</p>}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Standing notices                                                            */
/* -------------------------------------------------------------------------- */

export function DemoGuidesNotice({ className }: { className?: string }) {
  return <Disclaimer className={className}>{GUIDE_DEMO_NOTICE}</Disclaimer>;
}

/**
 * §15 — a guide is not a company.
 *
 * People confuse the two constantly and it costs them: they read about a named
 * professional, book a package, and meet a guide whose name and qualification
 * nobody ever told them. Both columns are shown together — half of this is a
 * sales pitch — and neither is presented as the better answer, because which is
 * right depends on the permit, the range and the objective.
 */
export function GuideVsCompany({
  className,
  action,
}: {
  className?: string;
  action?: React.ReactNode;
}) {
  const sides: { label: string; points: string[] }[] = [
    { label: "A mountain guide", points: GUIDE_VS_COMPANY.guide },
    { label: "An expedition company", points: GUIDE_VS_COMPANY.company },
  ];

  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <Mountain size={16} strokeWidth={1.5} className="mt-[2px] shrink-0 text-mist-dim" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-light text-snow">A guide is not a company</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
            Neither column is the better answer. On some mountains the permit is issued to an
            organisation and an individual is not an option at all.
          </p>

          <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2">
            {sides.map((side) => (
              <div key={side.label} className="rounded-tile border border-hairline p-3">
                <p className="section-label">{side.label}</p>
                <ul className="mt-2.5 space-y-1.5">
                  {side.points.map((p) => (
                    <li key={p} className="flex gap-2 text-[11.5px] leading-relaxed text-mist">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure/70" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {action && <div className="mt-3.5">{action}</div>}
        </div>
      </div>
    </Card>
  );
}
