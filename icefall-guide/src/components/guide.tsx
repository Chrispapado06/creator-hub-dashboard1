import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The two pieces this app needs that the athlete app does not.
 *
 * Everything else — Card, Button, Badge, SectionLabel, Screen, Rise — is the
 * shared ICEFALL design system, copied verbatim so the two apps cannot drift.
 */

export type NoticeTone = "neutral" | "gold" | "summit" | "alert" | "danger";

/**
 * A statement the reader must not miss. Same left-rule idiom as `Disclaimer`
 * in the athlete app, with a tone, because a lapsed licence and a routine note
 * cannot look identical.
 */
export function Notice({
  children,
  tone = "gold",
  className,
}: {
  children: ReactNode;
  tone?: NoticeTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-r-tile border-l bg-white/[0.02] py-3 pl-3.5 pr-3.5",
        tone === "neutral" && "border-hairline-strong",
        tone === "gold" && "border-gold/40",
        tone === "summit" && "border-summit/50",
        tone === "alert" && "border-alert/50",
        tone === "danger" && "border-danger/55",
        className,
      )}
    >
      <div className="text-[12px] leading-relaxed text-mist">{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="section-label">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{hint}</p>}
    </label>
  );
}

/** One input treatment, so a form never looks assembled from two apps. */
export const inputClass =
  "w-full rounded-tile border border-hairline bg-elevated/60 px-3 py-2.5 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-gold";
