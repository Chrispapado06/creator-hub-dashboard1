import { CircleDashed, Hourglass, Lock, PenLine, Sigma, Unplug, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isKnown, type Score, type Unavailable } from "@/coach/types";

/**
 * The absence layer.
 *
 * ICEFALL's first house rule is that every metric is either a value or a reason
 * it is missing — never a zero, never a dash standing in for arithmetic that
 * never happened. This file is where that rule becomes pixels.
 *
 * Missing data is DESIGNED here, not caught. An athlete who has not connected a
 * sleep source should see a deliberate, calm piece of UI telling them so, in the
 * same visual register as a real number: an icon in a dashed hairline circle, a
 * title, one line of explanation. If absence looked like an error, people would
 * learn to ignore it — and the whole point is that they read it and understand
 * exactly what the coach can and cannot see before they plan a day on a mountain.
 *
 * Five states, and every member of `Unavailable` maps to one of them:
 *
 *   NOT REPORTED     the athlete owes us a self-report        not-reported
 *   NO SENSOR        no source is linked, or it is locked     not-connected · needs-permission
 *   NOT ENOUGH DATA  recorded, but too thin to compute from   too-little-history · no-data
 *   ESTIMATED        a real value, derived rather than measured
 *   SELF-REPORTED    a real value, but an opinion not a measurement
 *
 * The last two are qualifiers rather than absences: the number is genuine, but
 * the athlete is owed the provenance before they act on it. A derived figure and
 * a measured one must never look identical.
 *
 * NAMING NOTE: `UNAVAILABLE_COPY` also exists in `@/coach/types` as a
 * `Record<Unavailable, string>` for prose assembled inside the coach modules.
 * This one is the UI's title/detail pair. They are deliberately separate — the
 * sentence a paragraph needs ("no source connected") is not the sentence a card
 * needs — so a screen importing both must alias one of them.
 */

/* -------------------------------------------------------------------------- */
/* Qualifiers                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A caveat attached to a value that DOES exist.
 *
 * `estimated`     — computed from something adjacent rather than measured
 *                   directly (load from ascent and duration, say).
 * `self-reported` — the athlete's own opinion of how they feel. Never call this
 *                   a measurement: it moves with mood, and treating it as
 *                   physiology is exactly the overreach house rule 2 forbids.
 */
export type DataQualifier = "estimated" | "self-reported";

const QUALIFIER_COPY: Record<DataQualifier, { label: string; detail: string; icon: LucideIcon }> = {
  estimated: {
    label: "Estimated",
    detail: "Derived from available data and may vary.",
    icon: Sigma,
  },
  "self-reported": {
    label: "Self-reported",
    // Was "Based on how you reported feeling", which was written when the only
    // self-report was a check-in. The badge now also carries claims of FACT —
    // technical competences, the highest altitude someone says they have been
    // to, the objectives on a passport — and describing a claim that they can
    // run a crevasse rescue as a report of how they feel misdescribes it in the
    // one place the caveat is supposed to be exact. This wording is true of
    // both: a check-in is the athlete's own report, and so is a skill.
    detail: "Your own report, not a measurement.",
    icon: UserRound,
  },
};

/* -------------------------------------------------------------------------- */
/* The five states                                                             */
/* -------------------------------------------------------------------------- */

/** The visual family a reason belongs to. Copy still varies per reason. */
type StateKind = "not-reported" | "no-sensor" | "not-enough-data";

/**
 * Title and one-line explanation for every reason a coach value can be missing.
 *
 * Copy rules applied here, all of them load-bearing:
 *
 *  - Second person. The athlete is being spoken to, not described.
 *  - The line must be TRUE for that specific reason. `needs-permission` shares
 *    the NO SENSOR visual family with `not-connected`, but it does not share its
 *    sentence: telling someone to connect a device they have already connected
 *    sends them to fix hardware that is not broken. Same icon family, honest words.
 *  - No blame, no nudge. "You haven't logged this yet" is a fact. "Log it now to
 *    unlock your score" would be a lever, and levers around training data push
 *    people to record sessions they did not do.
 */
export const UNAVAILABLE_COPY: Record<Unavailable, { title: string; detail: string }> = {
  "not-reported": {
    title: "Not reported",
    detail: "You haven't logged this yet.",
  },
  "not-connected": {
    title: "No sensor",
    detail: "Connect a supported device to see this.",
  },
  "needs-permission": {
    title: "Permission needed",
    detail: "Allow ICEFALL access to this source to see it.",
  },
  "too-little-history": {
    title: "Not enough data",
    detail: "We need more history to calculate this.",
  },
  "no-data": {
    title: "Not enough data",
    detail: "We need more data to calculate this.",
  },
};

const STATE_KIND: Record<Unavailable, StateKind> = {
  "not-reported": "not-reported",
  "not-connected": "no-sensor",
  "needs-permission": "no-sensor",
  "too-little-history": "not-enough-data",
  "no-data": "not-enough-data",
};

/** One icon per reason, thin enough to read as instrumentation rather than UI. */
const REASON_ICON: Record<Unavailable, LucideIcon> = {
  "not-reported": PenLine,
  "not-connected": Unplug,
  "needs-permission": Lock,
  "too-little-history": Hourglass,
  "no-data": CircleDashed,
};

type StateSize = "sm" | "md" | "lg";

const SIZE: Record<
  StateSize,
  { ring: number; icon: number; stroke: number; title: string; detail: string; gap: string }
> = {
  sm: {
    ring: 26,
    icon: 12,
    stroke: 1.6,
    title: "text-[9px]",
    detail: "text-[10px]",
    gap: "mt-1.5",
  },
  md: { ring: 34, icon: 15, stroke: 1.5, title: "text-[10px]", detail: "text-[11px]", gap: "mt-2" },
  lg: {
    ring: 48,
    icon: 20,
    stroke: 1.4,
    title: "text-[10px]",
    detail: "text-[12px]",
    gap: "mt-2.5",
  },
};

/* -------------------------------------------------------------------------- */
/* UnavailableState                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The canonical rendering of "ICEFALL does not have this".
 *
 * Deliberately not styled as an error: no alert colour, no warning triangle,
 * nothing that implies the athlete did something wrong. A dashed circle is the
 * house shorthand for an empty slot (the same treatment the goal-gap list uses),
 * and it reads as "space for a value" rather than "failure".
 */
export function UnavailableState({
  reason,
  size = "md",
  className,
}: {
  reason: Unavailable;
  size?: StateSize;
  className?: string;
}) {
  const copy = UNAVAILABLE_COPY[reason];
  const Icon = REASON_ICON[reason];
  const cfg = SIZE[size];

  return (
    <div
      className={cn("flex flex-col items-center text-center", className)}
      data-state={STATE_KIND[reason]}
      data-reason={reason}
    >
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
        style={{ width: cfg.ring, height: cfg.ring }}
      >
        <Icon size={cfg.icon} strokeWidth={cfg.stroke} />
      </span>
      <p className={cn("section-label", cfg.title, cfg.gap)}>{copy.title}</p>
      <p className={cn("mt-1 max-w-[22ch] leading-relaxed text-mist-dim", cfg.detail)}>
        {copy.detail}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* QualifierBadge                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Provenance for a value that exists.
 *
 * Neutral rather than azure: this is a caveat, not an accent, and azure is spent
 * on the number itself. The full explanation rides on `title` so the badge stays
 * one word wide next to a metric without losing the honest sentence.
 */
export function QualifierBadge({ kind }: { kind: DataQualifier }) {
  const copy = QUALIFIER_COPY[kind];
  const Icon = copy.icon;

  return (
    <span
      title={copy.detail}
      className="inline-flex items-center gap-1 rounded-full border border-hairline-strong px-1.5 py-[2px] text-[9px] font-medium uppercase tracking-[0.1em] text-mist-dim"
    >
      <Icon size={9} strokeWidth={1.6} aria-hidden="true" />
      {copy.label}
      <span className="sr-only">. {copy.detail}</span>
    </span>
  );
}

/** The qualifier's explanation as plain text, for callers writing a caption. */
export const qualifierDetail = (kind: DataQualifier) => QUALIFIER_COPY[kind].detail;

/* -------------------------------------------------------------------------- */
/* ScoreValue                                                                  */
/* -------------------------------------------------------------------------- */

const VALUE_SIZE: Record<StateSize, string> = {
  sm: "text-[17px]",
  md: "text-[28px]",
  lg: "text-[40px]",
};

const UNIT_SIZE: Record<StateSize, string> = {
  sm: "text-[10px]",
  md: "text-[12px]",
  lg: "text-[14px]",
};

/**
 * Renders a `Score`: the value when known, the correct unavailable state when not.
 *
 * NEVER a zero. `score.value === null` means the calculation did not happen, and
 * a zero would claim it did and returned nothing — the single most dangerous
 * substitution in this app, because "0 recovery" and "recovery unknown" would
 * lead an athlete to opposite decisions on the same morning.
 *
 * A null with no reason attached is an upstream bug. It falls back to `no-data`,
 * which is the weakest claim available: something is missing and we will not
 * pretend to know why.
 */
export function ScoreValue({
  score,
  unit,
  size = "md",
  qualifier,
  className,
}: {
  score: Score;
  unit?: string;
  size?: StateSize;
  qualifier?: DataQualifier;
  className?: string;
}) {
  if (!isKnown(score)) {
    return (
      <UnavailableState reason={score.reason ?? "no-data"} size={size} className={className} />
    );
  }

  return (
    <div className={cn("flex flex-col items-start", className)}>
      <p
        className={cn(
          "tnum font-extralight leading-none tracking-[-0.02em] text-snow",
          VALUE_SIZE[size],
        )}
      >
        {score.value}
        {unit && <span className={cn("ml-1 font-normal text-mist", UNIT_SIZE[size])}>{unit}</span>}
      </p>
      {qualifier && (
        <span className="mt-2">
          <QualifierBadge kind={qualifier} />
        </span>
      )}
    </div>
  );
}
