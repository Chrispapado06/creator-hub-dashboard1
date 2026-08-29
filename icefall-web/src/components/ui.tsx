import { useState, type ReactNode } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { monogram, verificationSentence } from "@/data/demo";

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-tile font-normal transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-9 px-3.5 text-[13px]",
        size === "md" && "h-11 px-5 text-[14px]",
        size === "lg" && "h-12 px-6 text-[15px]",
        variant === "primary" && "bg-azure text-obsidian hover:bg-azure-bright",
        variant === "secondary" && "border border-hairline bg-slate text-snow hover:bg-elevated",
        variant === "ghost" && "text-mist hover:bg-slate hover:text-snow",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-hairline bg-graphite",
        hover && "transition-colors hover:border-hairline-strong",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("section-label", className)}>{children}</p>;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "azure" | "summit";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px]",
        tone === "neutral" && "border-hairline-strong text-mist",
        tone === "azure" && "border-azure/40 text-azure",
        tone === "summit" && "border-summit/45 text-summit",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The verified tick — a button, never decoration.
 *
 * Opens the exact sentence ICEFALL is entitled to say: a member of staff read
 * this guide's documents on a date and did not ring the association. A bare tick
 * means "trust this person" to someone about to follow them onto a glacier.
 */
export function VerifiedTick({ verifiedOn, size = 15 }: { verifiedOn: string; size?: number }) {
  const [open, setOpen] = useState(false);

  /*
   * NO DATE, NO TICK.
   *
   * This used to render the badge unconditionally, so a listing with
   * `verifiedOn: ""` still got a blue check — and the first listing to have an
   * empty date was Elite Exped, a REAL company ICEFALL has no relationship
   * with. The badge is the most load-bearing element on a marketplace card:
   * it is the difference between "we checked this operator" and "we did not",
   * on a page where the reader may be choosing who to hire on glaciated ground.
   * It is never decorative and it is never a default.
   */
  if (!verifiedOn) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={verificationSentence(verifiedOn)}
        className="text-azure"
      >
        <BadgeCheck size={size} strokeWidth={2} />
      </button>
      {open && (
        <span className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-tile border border-hairline bg-elevated px-3 py-2 text-[11.5px] leading-relaxed text-mist shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
          {verificationSentence(verifiedOn)}
        </span>
      )}
    </span>
  );
}

/**
 * A guide's portrait. GAN face of nobody, or a monogram when the file is absent
 * (they are gitignored). Never a real person's photograph.
 */
export function GuidePhoto({
  name,
  src,
  size = 48,
  className,
}: {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src && failed !== src) {
    return (
      <span
        style={{ width: size, height: size }}
        className={cn("block shrink-0 overflow-hidden rounded-full border border-hairline bg-slate", className)}
      >
        <img
          src={src}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
          onError={() => setFailed(src)}
        />
      </span>
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-hairline bg-elevated/50 tracking-[0.05em] text-mist",
        className,
      )}
    >
      {monogram(name)}
    </span>
  );
}

/** Star rating — demo only, and always shown with its review count. */
export function Rating({ value, reviews }: { value: number; reviews: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Star size={13} strokeWidth={1.6} className="text-azure" fill="currentColor" />
      <span className="tnum text-[13px] text-snow">{value.toFixed(1)}</span>
      <span className="tnum text-[12px] text-mist-dim">({reviews})</span>
    </span>
  );
}

/** The house editorial mark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M2 20L9 7l4 7 2.5-4L22 20H2Z" stroke="var(--ice-azure)" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-light tracking-[0.28em] text-snow">ICEFALL</span>
    </span>
  );
}
