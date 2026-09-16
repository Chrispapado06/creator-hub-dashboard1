/**
 * THE TRIP SUB-SCREENS' SHARED CHROME (mockup spec §8).
 *
 * The Documents mockup sets the pattern for every screen under the Trip tab —
 * itinerary, documents, gear, contacts, phrasebook, journal and the coach:
 *
 *   · a back arrow and a centred uppercase title, nothing else in that row;
 *   · flat three-line rows — title, detail, and a grey line saying where the
 *     thing actually lives — with a hairline between them and NO BOX.
 *
 * Six screens each inventing their own header is exactly why the mode read as
 * six different apps, so the header and the row live here and every screen
 * imports them. Colours, sizes and buttons still come from `../ui`: this file
 * adds arrangement, not a second set of tokens.
 */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { MOUNTAIN_PATHS } from "../paths";
import { M_ROW, SectionLabel } from "../ui";

/**
 * The grey third line. It says where the thing is, which on these screens is
 * always this phone and nowhere else — so it is a statement of fact, not a
 * reassurance we cannot back up.
 */
export const SAVED_HERE_LINE = "Saved on this phone";

export interface SubHeaderProps {
  /** Rendered uppercase by the label's own CSS; pass normal prose. */
  title: string;
  /** Where the arrow goes. The Trip tab unless a screen is deeper than that. */
  backTo?: string;
  /** A control on the right — CANCEL on a form, for instance. */
  action?: ReactNode;
}

/** Back arrow · centred caps title. The first row of every Trip sub-screen. */
export function SubHeader({ title, backTo = MOUNTAIN_PATHS.trip, action }: SubHeaderProps) {
  return (
    <div className="grid grid-cols-[64px_1fr_64px] items-center">
      <Link
        to={backTo}
        aria-label="Back"
        className="flex min-h-16 items-center justify-center text-mist"
      >
        <ArrowLeft size={24} strokeWidth={1.8} aria-hidden />
      </Link>
      <SectionLabel as="h1" className="text-center text-snow">
        {title}
      </SectionLabel>
      {/* Keeps the title centred whether or not there is a control here. */}
      <span className="flex min-h-16 items-center justify-center">{action}</span>
    </div>
  );
}

export interface SubRowProps {
  /** White first line: what the thing is called. */
  title: ReactNode;
  /** Grey second line: the detail that tells two of them apart. */
  detail?: ReactNode;
  /** Grey third line. Usually `SAVED_HERE_LINE`; never a claim about a server. */
  note?: ReactNode;
  /** A word on the right — `Open`, a size, a count. */
  trailing?: ReactNode;
  to?: string;
  onClick?: () => void;
  /** On by default: these rows open something. Pass `false` for a plain row. */
  chevron?: boolean;
  "aria-expanded"?: boolean;
  "aria-label"?: string;
  className?: string;
}

/**
 * One flat three-line row, 64 px tall at the least. Built here rather than from
 * `<Row>` because these rows also expand in place (a document preview, a
 * journal photo) and so need `aria-expanded`, which a link never has.
 */
export function SubRow({
  title,
  detail,
  note,
  trailing,
  to,
  onClick,
  chevron = true,
  "aria-expanded": ariaExpanded,
  "aria-label": ariaLabel,
  className,
}: SubRowProps) {
  const classes = cn(M_ROW, "items-center py-3", className);
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block m-text-body leading-snug text-snow">{title}</span>
        {detail != null && detail !== "" && (
          <span className="mt-1 block m-text-label leading-snug text-mist">{detail}</span>
        )}
        {note != null && note !== "" && (
          <span className="mt-1 block m-text-label leading-snug text-mist-dim">{note}</span>
        )}
      </span>
      {trailing != null && trailing !== "" && (
        <span className="m-text-label shrink-0 text-right text-mist">{trailing}</span>
      )}
      {chevron && (
        <ChevronRight size={20} strokeWidth={1.8} aria-hidden className="shrink-0 text-mist-dim" />
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} aria-label={ariaLabel} className={classes}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={ariaExpanded}
        aria-label={ariaLabel}
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

/** A grey sentence in the flow of a sub-screen: an empty state, a caveat, a total. */
export function SubNote({
  children,
  tone = "mist",
  className,
}: {
  children: ReactNode;
  tone?: "mist" | "dim" | "alert";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "px-5 py-4 m-text-label leading-snug",
        tone === "alert" ? "text-alert" : tone === "dim" ? "text-mist-dim" : "text-mist",
        className,
      )}
    >
      {children}
    </p>
  );
}
