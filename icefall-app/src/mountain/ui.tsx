/**
 * MOUNTAIN MODE'S SHARED VISUAL LANGUAGE (mockup spec §0).
 *
 * Every Mountain screen is built from the pieces in this file, so the whole mode
 * reads as one thing: ONE HERO per screen, quiet flat rows beneath it, hairlines
 * between rows and NO BOXES around them. The only filled or bordered rectangles
 * in the mockups are buttons, the amber alarm frame and the red emergency bar —
 * so this file gives you buttons and nothing box-shaped.
 *
 * THE CONTRACT for the screen builders
 * ------------------------------------
 * Import relatively (`./ui` from `src/mountain/`, `../ui` from `src/mountain/trip/`);
 * a bare `@/mountain/ui` would fail the Mountain import allowlist in
 * `src/trip/offline.test.ts`.
 *
 *   <SectionLabel>            small grey UPPERCASE letter-spaced label
 *   <HeroNumber>              the one very large number on a screen
 *   <Unit>                    a unit rendered a step lighter than its number
 *   <Row>                     one flat hairline row (link, button or plain)
 *   <StatRow>                 label + value(+unit) + right-aligned grey note
 *   <BigButton>               the three mockup buttons, plus amber for the alarm
 *   buttonClass(variant,size) the same classes, for a control you build yourself
 *   M_ROW / M_LABEL           the raw class strings, for the same reason
 *
 * Everything takes `className`, so a screen can add spacing without forking a
 * component. Nothing here fetches, stores or decides anything — pass real values
 * in, and where you have no real value pass the honest empty line instead. Never
 * hard-code a mockup's example number.
 *
 * TAP TARGETS. Every interactive thing here is at least 64 px tall (`min-h-16`),
 * including the small `size="sm"` buttons, which get smaller text and padding
 * but keep the height. This is glove-first safety UI; do not shrink them.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Tone                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The five inks these screens use. `snow` is a primary value, `mist` a
 * secondary one, `azure` the app's own accent (on plan, primary action),
 * `alert` amber (caution — turnaround, unwell, stale position) and `danger`
 * red (emergency only).
 */
export type Tone = "snow" | "mist" | "azure" | "alert" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  snow: "text-snow",
  mist: "text-mist",
  azure: "text-azure",
  alert: "text-alert",
  danger: "text-danger",
};

/* -------------------------------------------------------------------------- */
/* Section label                                                               */
/* -------------------------------------------------------------------------- */

/** The raw section-label classes, for a label you cannot render as a component. */
export const M_LABEL = "section-label";

export interface SectionLabelProps {
  children: ReactNode;
  /** Heading element where the label heads a region; a paragraph otherwise. */
  as?: "p" | "h1" | "h2" | "h3";
  /** Grey by default. `azure` for a route/day line, `alert` for a caution one. */
  tone?: Extract<Tone, "mist" | "azure" | "alert">;
  id?: string;
  className?: string;
}

/**
 * `TURNAROUND`, `DAYLIGHT`, `SAVED ON THIS PHONE`. Small, uppercase,
 * letter-spaced, grey. Capitalisation comes from CSS, so pass normal prose and
 * a screen reader still reads a word rather than an acronym.
 */
export function SectionLabel({ children, as = "p", tone = "mist", id, className }: SectionLabelProps) {
  const Tag = as;
  return (
    <Tag id={id} className={cn(M_LABEL, tone !== "mist" && TONE_TEXT[tone], className)}>
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/* Numbers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A unit set beside a number: smaller, and a step lighter in grey, so the
 * number is what the eye lands on. `4,180` `m`, `9h 10m`, `1.2` `km`.
 */
export function Unit({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("ml-2 text-[0.42em] font-normal tracking-normal text-mist", className)}>{children}</span>;
}

export interface HeroNumberProps {
  /** The number itself — always computed, never a literal from the mockups. */
  value: ReactNode;
  /** Optional unit, rendered lighter and smaller by `<Unit>`. */
  unit?: ReactNode;
  /** `hero` is the one-per-screen size; `large` is the sub-hero (a stat hero). */
  size?: "hero" | "large";
  /** White by default; amber on the turnaround alarm; grey for a stale value. */
  tone?: Tone;
  id?: string;
  className?: string;
}

/**
 * THE ONE HERO. Very large, tight, light-weight. Exactly one per screen — if a
 * screen seems to want two, one of them is a `<StatRow>`.
 *
 * It renders whatever it is given, including an honest empty line: when there
 * is no turnaround time, pass the existing "No turnaround time set" wording as
 * `value` with `tone="mist"` and the slot keeps its shape rather than collapsing.
 */
export function HeroNumber({ value, unit, size = "hero", tone = "snow", id, className }: HeroNumberProps) {
  return (
    <p
      id={id}
      className={cn(
        size === "hero" ? "m-text-huge" : "m-text-number",
        "font-light tracking-[-0.02em]",
        TONE_TEXT[tone],
        className,
      )}
    >
      {value}
      {unit != null && unit !== "" && <Unit>{unit}</Unit>}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/** The raw flat-row classes. A hairline above, full-bleed, 64 px tall, no box. */
export const M_ROW =
  "flex min-h-16 w-full items-center justify-between gap-3 border-t border-hairline px-5 text-left";

export interface RowProps {
  children: ReactNode;
  /** Renders a `<Link>`. */
  to?: string;
  /** Renders a `<button>`. With neither, it is a plain `<div>`. */
  onClick?: () => void;
  /** The `›` on the right of a row that opens something. */
  chevron?: boolean;
  /** Drops the hairline — for the first row where a label already separates. */
  noRule?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

/**
 * One flat row. No border, no background, no card — a hairline above it and
 * nothing else. Put whatever you like inside; `<StatRow>` is the common shape.
 */
export function Row({
  children,
  to,
  onClick,
  chevron,
  noRule,
  disabled,
  "aria-label": ariaLabel,
  className,
}: RowProps) {
  const classes = cn(M_ROW, noRule && "border-t-0", className);
  const inner = (
    <>
      {children}
      {chevron && <ChevronRight size={20} strokeWidth={1.8} aria-hidden className="shrink-0 text-mist-dim" />}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} aria-label={ariaLabel} className={classes}>
        {inner}
      </Link>
    );
  }
  if (onClick || disabled) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className={classes}
      >
        {inner}
      </button>
    );
  }
  return (
    <div aria-label={ariaLabel} className={classes}>
      {inner}
    </div>
  );
}

export interface StatRowProps {
  /** The grey caps label: `NEXT`, `DAYLIGHT`, `ALTITUDE`. */
  label: ReactNode;
  /** The value. Pass the honest absent wording where there is no number. */
  value: ReactNode;
  /** Rendered lighter and smaller beside the value. */
  unit?: ReactNode;
  /** Right-aligned grey detail: `sunset 20:42`, `GPS ±8 m`, `1.9 km · 520 m up`. */
  note?: ReactNode;
  /** White value by default; `mist` for an absent one, `alert` for a caution. */
  tone?: Tone;
  to?: string;
  onClick?: () => void;
  chevron?: boolean;
  noRule?: boolean;
  className?: string;
}

/**
 * The mockups' repeating row: grey caps label, then the value with its unit a
 * step lighter, with a grey note pushed to the right. Two lines, one hairline,
 * no box.
 */
export function StatRow({
  label,
  value,
  unit,
  note,
  tone = "snow",
  to,
  onClick,
  chevron,
  noRule,
  className,
}: StatRowProps) {
  return (
    <Row
      to={to}
      onClick={onClick}
      chevron={chevron}
      noRule={noRule}
      className={cn("flex-col items-stretch justify-center gap-1 py-3", className)}
    >
      <SectionLabel>{label}</SectionLabel>
      <span className="flex items-baseline justify-between gap-3">
        <span className={cn("m-text-title leading-tight", TONE_TEXT[tone])}>
          {value}
          {unit != null && unit !== "" && <Unit>{unit}</Unit>}
        </span>
        {note != null && note !== "" && (
          <span className="m-text-label shrink-0 text-right text-mist">{note}</span>
        )}
      </span>
    </Row>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `azure` is the primary action on a screen (START AN ACTIVITY, CHECK HOW I
 * FEEL, SYMPTOM CHECK, RETRACE MY ROUTE). `azure-outline` is the secondary one.
 * `red-outline` is SOS from a calm screen; `red` is filled and belongs to the
 * emergency screen alone (CALL 112). `amber` / `amber-outline` belong to the
 * turnaround alarm and the symptom states.
 */
export type ButtonVariant = "azure" | "azure-outline" | "red" | "red-outline" | "amber" | "amber-outline";

const VARIANT: Record<ButtonVariant, string> = {
  /* `text-obsidian` is the ground colour, so it flips with the theme and stays
     readable on azure in both dark and glare. */
  azure: "bg-azure text-obsidian",
  "azure-outline": "border-[1.5px] border-azure bg-transparent text-azure",
  /* Not `text-obsidian` on red: white is the readable ink on both reds.
     FILLED red uses `--ice-danger-fill`, the vivid emergency red (spec §0);
     OUTLINED red keeps `--ice-danger`, which is the red that has to stay
     readable as ink on the near-black ground. See mountainTheme.css. */
  red: "bg-[color:var(--ice-danger-fill,#d92b1f)] text-[color:var(--ice-on-accent,#fff)]",
  "red-outline": "border-[1.5px] border-danger bg-transparent text-danger",
  amber: "bg-alert text-obsidian",
  "amber-outline": "border-[1.5px] border-alert bg-transparent text-alert",
};

/**
 * The button classes on their own, for a control this file does not cover — a
 * `<Link>` you need extra props on, or a cell inside a grid of states.
 * `sm` keeps the 64 px tap height and only shrinks the text and padding.
 */
export function buttonClass(variant: ButtonVariant, size: "lg" | "sm" = "lg"): string {
  return cn(
    "inline-flex min-h-16 items-center justify-center gap-2 rounded-[12px] text-center font-semibold uppercase leading-tight tracking-[0.1em] transition-colors",
    size === "lg" ? "w-full px-5 text-[17px]" : "px-4 text-[13px]",
    VARIANT[variant],
  );
}

export interface BigButtonProps {
  children: ReactNode;
  variant: ButtonVariant;
  /** A smaller line inside the same button (CALL 112 → `France and Italy`). */
  sub?: ReactNode;
  size?: "lg" | "sm";
  to?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  className?: string;
}

/** Full-width uppercase letter-spaced action. A link when given `to`. */
export function BigButton({
  children,
  variant,
  sub,
  size = "lg",
  to,
  onClick,
  type = "button",
  disabled,
  "aria-label": ariaLabel,
  "aria-pressed": ariaPressed,
  className,
}: BigButtonProps) {
  const classes = cn(buttonClass(variant, size), sub != null && "flex-col gap-1 py-3", className);
  const inner = (
    <>
      <span>{children}</span>
      {sub != null && sub !== "" && (
        <span className="text-[13px] font-normal normal-case tracking-normal opacity-90">{sub}</span>
      )}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} aria-label={ariaLabel} className={classes}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={cn(classes, disabled && "opacity-45")}
    >
      {inner}
    </button>
  );
}
