import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mountain as MountainIcon } from "lucide-react";

import { SegmentedTabs } from "@/components/layout/chrome";
import { fmtElevation } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sync } from "@/services/repository";
import { usePrimaryGoal } from "@/state/AppState";
import type { Goal, Mountain } from "@/types";

/**
 * THE SHELL EVERY COACH PAGE SHARES — to the owner's Coach designs of
 * 2026-09-04: a large serif title, a subtitle, the current objective with a
 * "Change" action, then the internal strip TODAY · PLAN · FUEL · PROGRESS ·
 * CHAT, and only then the page's own content.
 *
 * IT LIVES INSIDE EACH PAGE'S SCROLLER, NOT IN THE LAYOUT. The layout used to
 * pin the strip above the outlet, which is right for a compact header and
 * wrong for this one: the designs show the title scrolling away with the
 * page. So `CoachHead` renders at the top of each page's `Screen`, and the
 * layout keeps only what must be shared — the light surface and the swipe.
 *
 * THE OBJECTIVE LINE. "Mont Blanc · Alpine climb" in the drawings. A goal
 * carries no discipline, so the second half is the curated mountain's own
 * hand-written `difficultyLabel` ("Serious alpine"), or the route the athlete
 * named as the goal's subtitle, or nothing — never a category the data does
 * not hold. The same rule Explore's hub applies to the same line.
 */

/* -------------------------------------------------------------------------- */
/* Palette — page-local literals, not tokens                                   */
/* -------------------------------------------------------------------------- */

/*
 * The palette is shared with Explore's hub and lives in
 * components/layout/editorialPalette.ts — every value a CSS variable with a
 * value per theme, so these pages follow the person's light/dark choice
 * without a conditional. Re-exported here so the Coach pages keep one import.
 */
import {
  ACCENT,
  INK,
  ON_PRIMARY,
  ON_STRONG,
  PRIMARY,
  STRONG,
  TILE,
  TINT,
  WHITE,
} from "@/components/layout/editorialPalette";

export { ACCENT, INK, ON_PRIMARY, ON_STRONG, PRIMARY, STRONG, TILE, TINT, WHITE };

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whole days between today and a target date, both read as LOCAL calendar
 * days — the same function Explore's hub uses, for the same reason: a
 * countdown a day out west of Greenwich is a small lie that changes a plan.
 */
export function daysUntil(iso: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  let target: Date;

  if (match) {
    const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    target = new Date(y, mo - 1, d);
    if (target.getFullYear() !== y || target.getMonth() !== mo - 1 || target.getDate() !== d) {
      return null;
    }
  } else {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function countdownLabel(days: number | null): string {
  if (days === null) return "Target date not recorded";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  if (days === 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"} to go`;
}

/* -------------------------------------------------------------------------- */
/* The objective                                                               */
/* -------------------------------------------------------------------------- */

export interface ObjectiveContext {
  goal: Goal | undefined;
  mountain: Mountain | undefined;
  /** "Serious alpine" — the curated label, else the goal's subtitle, else null. */
  kind: string | null;
  days: number | null;
}

export function useObjective(): ObjectiveContext {
  const goal = usePrimaryGoal();
  const mountain = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  return {
    goal,
    mountain,
    kind: mountain?.difficultyLabel ?? goal?.subtitle ?? null,
    days: goal ? daysUntil(goal.targetDate) : null,
  };
}

/* -------------------------------------------------------------------------- */
/* The strip                                                                   */
/* -------------------------------------------------------------------------- */

export const COACH_TABS = [
  { value: "/coach/today", label: "Today" },
  { value: "/coach/plan", label: "Plan" },
  { value: "/coach/fuel", label: "Fuel" },
  { value: "/coach/progress", label: "Progress" },
  { value: "/coach/chat", label: "Chat" },
] as const;

export type CoachTab = (typeof COACH_TABS)[number]["value"];

/** `/coach` is Today. Detail routes light the tab they were reached from. */
export function activeCoachTab(pathname: string): CoachTab {
  if (pathname === "/coach" || pathname === "/coach/") return "/coach/today";
  const hit = [...COACH_TABS]
    .sort((a, b) => b.value.length - a.value.length)
    .find((t) => pathname === t.value || pathname.startsWith(`${t.value}/`));
  return hit?.value ?? "/coach/today";
}

/* -------------------------------------------------------------------------- */
/* The head                                                                    */
/* -------------------------------------------------------------------------- */

export function CoachHead({
  title,
  subtitle,
  objective = "card",
  objectiveDetail = "countdown",
}: {
  title: string;
  subtitle?: string;
  /** "card" — the tile with the mountain icon; "line" — one line of text. */
  objective?: "card" | "line" | "none";
  /**
   * The card's second line. Today's design shows the summit height; Fuel's
   * shows the days to go. Both are the goal's own figures.
   */
  objectiveDetail?: "countdown" | "elevation";
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = activeCoachTab(pathname);

  return (
    <div>
      <h1 className="display text-[56px] leading-[0.95] text-snow">{title}</h1>
      {subtitle && <p className="mt-2 text-[17px] leading-snug text-mist">{subtitle}</p>}

      {objective !== "none" && <ObjectiveContextRow variant={objective} detail={objectiveDetail} />}

      <div className="mt-5">
        <SegmentedTabs
          tabs={COACH_TABS}
          value={active}
          onChange={(v) => navigate(v)}
          variant="section"
        />
      </div>
    </div>
  );
}

function ObjectiveContextRow({
  variant,
  detail,
}: {
  variant: "card" | "line";
  detail: "countdown" | "elevation";
}) {
  const { goal, kind, days } = useObjective();

  if (!goal) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] bg-graphite px-3.5 py-3 shadow-[0_1px_8px_rgba(20,24,40,0.05)]">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]"
            style={{ backgroundColor: TINT.blue, color: ACCENT.blue }}
          >
            <MountainIcon size={18} strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-snow">No objective set</p>
            <p className="text-[13px] text-mist">Everything here follows one.</p>
          </div>
        </div>
        <Link to="/goals" className="shrink-0 text-[15px] text-azure">
          Set one
        </Link>
      </div>
    );
  }

  // Elevation only when the goal actually carries one; a custom objective
  // without a height falls back to the countdown rather than to a blank.
  const figure =
    detail === "elevation" && typeof goal.elevationM === "number" && Number.isFinite(goal.elevationM)
      ? `${fmtElevation(goal.elevationM)} m`
      : countdownLabel(days);
  const second = kind ? `${kind} · ${figure}` : figure;

  if (variant === "line") {
    return (
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[16px] text-snow">
          {goal.name}
          {kind && <span className="text-mist"> · {kind}</span>}
        </p>
        <Link to="/goals" className="shrink-0 text-[15px] text-azure">
          Change
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] bg-graphite px-3.5 py-3 shadow-[0_1px_8px_rgba(20,24,40,0.05)]">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px]"
          style={{ backgroundColor: TINT.blue, color: ACCENT.blue }}
        >
          <MountainIcon size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-snow">{goal.name}</p>
          <p className="tnum truncate text-[13px] text-mist">{second}</p>
        </div>
      </div>
      <Link to="/goals" className="shrink-0 text-[15px] text-azure">
        Change
      </Link>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small shared pieces                                                         */
/* -------------------------------------------------------------------------- */

/** A white rounded card, or a tinted one. */
export function CoachCard({
  children,
  className,
  tint,
}: {
  children: React.ReactNode;
  className?: string;
  tint?: keyof typeof TINT;
}) {
  return (
    <section
      className={cn(
        "rounded-[24px] p-5 shadow-[0_1px_10px_rgba(20,24,40,0.05)]",
        !tint && "bg-graphite",
        className,
      )}
      style={tint ? { backgroundColor: TINT[tint] } : undefined}
    >
      {children}
    </section>
  );
}

/** The small uppercase label above a card's title. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[12px] font-medium uppercase tracking-[0.16em] text-mist", className)}>
      {children}
    </p>
  );
}

/** A status pill. `tone` is the ink; the surface is a tint of it. */
export function Chip({
  children,
  tone = "neutral",
  filled = false,
  className,
}: {
  children: React.ReactNode;
  tone?: "blue" | "green" | "peach" | "lavender" | "neutral";
  filled?: boolean;
  className?: string;
}) {
  const style =
    tone === "neutral"
      ? undefined
      : filled
        ? // A filled chip is a solid accent, so it takes the app's own pair:
          // the tint ink is a light blue in dark mode, unreadable under white.
          { backgroundColor: PRIMARY, color: ON_PRIMARY }
        : { backgroundColor: TINT[tone], color: ACCENT[tone] };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]",
        tone === "neutral" && "border border-hairline-strong text-snow",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}
