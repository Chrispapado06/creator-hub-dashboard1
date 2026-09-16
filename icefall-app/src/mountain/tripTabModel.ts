/**
 * The pure half of the Trip tab (plan §3.5): day wording, dates, which source
 * the numbers' age is about, and which kit rows are shown. No React, no network.
 */

import type { Source } from "@/data/mountainRescue";
import type { ChecklistItem, ItemStatus } from "@/services/checklist";

import type { TripDay } from "./tripModel";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "13 Sep". Built by hand so it reads the same on every phone locale. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

/** "12–13 Sep", "30 Sep – 2 Oct", "13 Sep". */
export function dateRange(start: string, end: string): string {
  if (start === end) return shortDate(start);
  const [sy, sm] = start.split("-");
  const [ey, em] = end.split("-");
  if (sy === ey && sm === em) return `${Number(start.slice(8))}–${shortDate(end)}`;
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** Always from `TripDay`, so no negative or overflowing day number can appear. */
export function dayHeadline(day: TripDay): string {
  switch (day.kind) {
    case "during":
      return `Day ${day.dayNumber} of ${day.totalDays}`;
    case "before":
      return day.daysToGo === 1 ? "Starts tomorrow" : `Starts in ${day.daysToGo} days`;
    case "after":
      return day.daysSinceEnd === 1 ? "Dates ended yesterday" : `Dates ended ${day.daysSinceEnd} days ago`;
  }
}

/**
 * The source the numbers' age sentence is about: the OLDEST read date among
 * them, because the reader's question is how old the weakest link is (plan §5.2).
 */
export function oldestSource<T extends { source: Source }>(numbers: T[]): Source | null {
  if (numbers.length === 0) return null;
  return numbers.map((n) => n.source).reduce((a, b) => (b.checked < a.checked ? b : a));
}

/**
 * Which kit rows the Trip tab lists — the same rule as the full app's
 * checklist screen, so the two never disagree: a row the athlete recorded
 * something against always shows; documents need that feature; otherwise the
 * full list or the essentials.
 */
export function visibleKit(
  items: ChecklistItem[],
  statuses: Record<string, ItemStatus>,
  access: { full: boolean; documents: boolean },
): ChecklistItem[] {
  return items.filter((item) => {
    if (statuses[item.id] !== undefined) return true;
    if (item.category === "documents") return access.documents;
    return access.full || item.essential;
  });
}
