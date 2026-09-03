import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * WIDENED FOR THE SHADCN COMPONENT SET, 2026-09-03.
 *
 * This was a join-the-truthy-strings helper, which is all the CRM's own markup
 * ever needed. The 59 components brought in from the theme need two things it
 * could not do, and every one of the 14 typecheck failures was one of them:
 *
 *   OBJECT SYNTAX     cn({ "w-1": isThin, "my-0.5": isTight })
 *   CONFLICT MERGING  cn("px-2", props.className) where className is "px-4"
 *
 * The second is the one that matters. Without `twMerge`, a caller passing
 * `px-4` to a component whose base is `px-2` gets BOTH classes, and which wins
 * is decided by their order in the compiled stylesheet — not by the caller.
 * Every `className` override in the new component set would be a coin flip.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "··";
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

/**
 * A date, formatted for a person.
 *
 * NEVER `new Date("YYYY-MM-DD")` for a calendar day — that parses as UTC
 * midnight and renders as the previous day anywhere west of Greenwich. A
 * placement expiring "on the 30th" showing as the 29th to a reviewer in New York
 * is the kind of bug that gets a slot released a day early. Split the parts and
 * build a local date instead.
 */
export function formatDay(isoDay: string | null | undefined): string | null {
  if (!isoDay) return null;
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A timestamp (which really is an instant, so parsing it directly is correct). */
export function formatMoment(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function daysUntil(isoDay: string): number {
  const [y, m, d] = isoDay.slice(0, 10).split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then - today) / 86_400_000);
}
