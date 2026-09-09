import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Satellite } from "lucide-react";
import { cn } from "@/lib/utils";
import { METRICS, formatReading } from "@/tracking/metrics";
import type { MetricId, MetricReading, GpsQuality } from "@/tracking/types";
import type { LiveCue } from "@/tracking/insights";

/** Metrics that are modelled rather than measured — always marked as such. */
export const ESTIMATED_METRICS: MetricId[] = ["calories"];

/* -------------------------------------------------------------------------- */
/* MetricTile                                                                  */
/* -------------------------------------------------------------------------- */

export function MetricTile({
  id,
  reading,
  size = "md",
  className,
}: {
  id: MetricId;
  reading: MetricReading;
  size?: "sm" | "md" | "hero";
  className?: string;
}) {
  const def = METRICS[id];
  const { text, unit, muted } = formatReading(id, reading);
  const estimated = !muted && ESTIMATED_METRICS.includes(id);

  const cfg = {
    sm: { v: "text-[17px]", u: "text-[10px]", l: "text-[9px]" },
    md: { v: "text-[26px]", u: "text-[12px]", l: "text-[10px]" },
    hero: { v: "text-[64px]", u: "text-[20px]", l: "text-[10px]" },
  }[size];

  return (
    <div className={className}>
      <div className="section-label mb-1.5 flex items-center gap-1.5">
        <span className={cfg.l}>{def.label}</span>
        {estimated && <span className="text-mist-dim/60">est</span>}
      </div>
      <div
        className={cn(
          "tnum leading-none tracking-[-0.02em]",
          size === "hero" ? "font-extralight" : "font-light",
          muted ? "text-mist-dim" : "text-snow",
          cfg.v,
        )}
      >
        {text}
        {unit && (
          <span className={cn("ml-1 font-normal", muted ? "text-mist-dim/70" : "text-mist", cfg.u)}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* GpsBadge                                                                    */
/* -------------------------------------------------------------------------- */

const QUALITY_COPY: Record<GpsQuality, { label: string; tone: string }> = {
  excellent: { label: "Excellent", tone: "text-summit" },
  good: { label: "Good", tone: "text-azure" },
  weak: { label: "Weak", tone: "text-alert" },
  none: { label: "No signal", tone: "text-danger" },
};

/**
 * Compact by design: it shares a 375 px row with the activity chip, and the
 * activity must never be the thing that gets truncated. The satellite glyph
 * carries the "GPS" meaning so the word itself is redundant.
 */
export function GpsBadge({
  quality,
  accuracyM,
  indoor,
  className,
}: {
  quality: GpsQuality;
  accuracyM: number | null;
  indoor?: boolean;
  className?: string;
}) {
  if (indoor) {
    return (
      <span
        className={cn(
          "shrink-0 whitespace-nowrap text-[10px] uppercase tracking-[0.12em] text-mist-dim",
          className,
        )}
      >
        No GPS
      </span>
    );
  }

  const q = QUALITY_COPY[quality];

  return (
    <span className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap", className)}>
      <Satellite size={12} strokeWidth={1.6} className={q.tone} />
      <span className={cn("text-[10px] font-medium uppercase tracking-[0.12em]", q.tone)}>
        {q.label}
      </span>
      {accuracyM !== null && quality !== "none" && (
        <span className="tnum text-[10px] text-mist-dim">±{Math.round(accuracyM)}m</span>
      )}
    </span>
  );
}

/** Persistent marker whenever the position source is the simulator. */
export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-alert/40 bg-alert/10 px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.14em] text-alert",
        className,
      )}
    >
      Simulated
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* CueToast — rare, brief, never blocking                                     */
/* -------------------------------------------------------------------------- */

/**
 * `className` overrides the position, and one caller needs it to.
 *
 * These float just under the top bar, which is the right place when the map is
 * the only thing beneath them. On a route-following walk the follow panel holds
 * that slot, and a toast landing on top of it covers the state a walker is
 * checking — measured 9 Sep 2026, with the signal-lost toast sitting across the
 * panel's own "Signal lost" heading. `LiveTracker` drops them into the column
 * below the panel instead.
 */
export function CueToast({ cue, className }: { cue: LiveCue | null; className?: string }) {
  return (
    <AnimatePresence>
      {cue && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={cn("pointer-events-none absolute inset-x-5 top-[86px] z-30", className)}
        >
          <div className="rounded-tile border border-azure/25 bg-obsidian/92 px-4 py-3 backdrop-blur-xl">
            <p className="section-label text-azure/80">{cue.label}</p>
            <p className="mt-1.5 text-[13px] text-snow">{cue.body}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* SignalWarning                                                               */
/* -------------------------------------------------------------------------- */

export function SignalWarning({
  show,
  message,
  className,
}: {
  show: boolean;
  message: string;
  className?: string;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={cn("pointer-events-none absolute inset-x-5 top-[86px] z-30", className)}
        >
          <div className="flex items-start gap-2.5 rounded-tile border border-alert/30 bg-obsidian/92 px-4 py-3 backdrop-blur-xl">
            <AlertTriangle size={14} strokeWidth={1.7} className="mt-px shrink-0 text-alert" />
            <p className="text-[12px] leading-relaxed text-mist">{message}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
