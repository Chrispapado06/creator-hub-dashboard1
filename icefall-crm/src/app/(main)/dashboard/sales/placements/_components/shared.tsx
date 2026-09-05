"use client";

import * as React from "react";

import { CalendarIcon, MountainIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { DestinationRow, PlacementEffectiveStatus } from "./data";
import { formatDay } from "./format";

/** The status pill: an outline badge with a coloured dot. */
const DOT: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" },
  pending: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

/**
 * Written out as literal state names. A tone assembled from the status string
 * would produce no class at all — Tailwind scans source text.
 */
export const placementState = (s: PlacementEffectiveStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "active" ? "ok" : s === "expired" ? "pending" : s === "cancelled" ? "bad" : "neutral";

export function StatusBadge({
  state,
  label,
  className,
}: {
  state: "ok" | "pending" | "bad" | "neutral";
  label: string;
  className?: string;
}) {
  const m = DOT[state];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium capitalize", m.badge, className)}>
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {label}
    </Badge>
  );
}

/**
 * A destination's photograph, or a neutral tile.
 *
 * There are 304 destinations and a limited set of licensed photographs.
 * ICEFALL does not scrape imagery, so the rest have none — and an <img> that
 * fails to load leaves an empty box that reads as a broken page rather than a
 * missing picture. The tile underneath is always there; the photograph covers
 * it when one exists.
 */
export function DestinationImage({
  id,
  kind,
  className,
}: {
  id: string;
  kind: DestinationRow["kind"];
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-muted", className)}>
      <MountainIcon className="size-4 text-muted-foreground" aria-hidden />
      {!failed && (
        // biome-ignore lint/performance/noImgElement: next/image routes these through
        // the optimizer, which answers 500 for the destination slugs that have no
        // photograph — the whole point of this element is that a missing photograph
        // falls back to the tile underneath rather than breaking the card.
        <img
          src={`/img/destinations/${id}.jpg`}
          alt=""
          aria-hidden
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {kind === "trek" && !failed && <span aria-hidden className="absolute inset-0 bg-black/10" />}
    </span>
  );
}

/**
 * One line describing a destination.
 *
 * A MOUNTAIN leads with its summit elevation. A TREK does not have one — its
 * high point is a different claim, and a metre figure beside a trek name reads
 * as a summit somebody stood on. So a trek leads with how long it takes, and
 * says "high point" explicitly where that is known.
 */
export function describe(m: DestinationRow): string {
  const bits: string[] = [];
  if (m.kind === "mountain") {
    bits.push(m.elevation_m ? `${m.elevation_m.toLocaleString("en-GB")}m` : "Elevation not recorded");
    if (m.range) bits.push(m.range);
  } else {
    const lo = m.duration_days_min;
    const hi = m.duration_days_max;
    if (lo) bits.push(lo === hi || !hi ? `${lo} days` : `${lo}–${hi} days`);
    if (m.max_altitude_m) bits.push(`high point ${m.max_altitude_m.toLocaleString("en-GB")}m`);
  }
  if (m.region) bits.push(m.region);
  return bits.length ? bits.join(" · ") : "No detail recorded";
}

/** A calendar day picked from a month grid. Unset shows its placeholder, never a blank. */
export function DateButton({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => {
    if (!value) return undefined;
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          className="w-full justify-start gap-2 font-normal"
        >
          <CalendarIcon className="size-3.5" />
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? (formatDay(value) ?? placeholder) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(picked) => {
            if (!picked) return;
            const y = picked.getFullYear();
            const m = `${picked.getMonth() + 1}`.padStart(2, "0");
            const d = `${picked.getDate()}`.padStart(2, "0");
            onChange(`${y}-${m}-${d}`);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
