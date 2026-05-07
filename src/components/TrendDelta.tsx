import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  current: number;
  previous: number;
  /** When true, a *decrease* is the good direction (e.g. churn, refund rate) */
  inverse?: boolean;
  /** Format the absolute delta. Defaults to a localized number. */
  format?: (n: number) => string;
  /** Show absolute delta alongside the percentage */
  showAbsolute?: boolean;
  className?: string;
  /** Visual size — default uses sm text */
  size?: "xs" | "sm";
};

const fmtPct = (n: number) => {
  const abs = Math.abs(n);
  if (!Number.isFinite(abs)) return "—";
  if (abs >= 1000) return `${n > 0 ? "+" : "-"}${Math.round(abs).toLocaleString()}%`;
  if (abs >= 100) return `${n > 0 ? "+" : ""}${Math.round(n)}%`;
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
};

/** Inline up/down/flat delta indicator. Pass current + previous values; we do the math. */
export function TrendDelta({
  current,
  previous,
  inverse = false,
  format,
  showAbsolute = false,
  className,
  size = "sm",
}: Props) {
  const delta = current - previous;
  const pct = previous === 0
    ? (current === 0 ? 0 : 100)
    : ((current - previous) / Math.abs(previous)) * 100;

  const direction: "up" | "down" | "flat" =
    Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down";

  const isGood =
    direction === "flat" ? null : (direction === "up") !== inverse;

  const Icon =
    direction === "flat" ? Minus : direction === "up" ? TrendingUp : TrendingDown;

  const color =
    isGood === null
      ? "text-muted-foreground"
      : isGood
        ? "text-success"
        : "text-destructive";

  const textSize = size === "xs" ? "text-[11px]" : "text-xs";
  const iconSize = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", textSize, color, className)}>
      <Icon className={iconSize} />
      <span>{fmtPct(pct)}</span>
      {showAbsolute && (
        <span className="text-muted-foreground font-normal">
          ({delta > 0 ? "+" : ""}{format ? format(delta) : delta.toLocaleString()})
        </span>
      )}
    </span>
  );
}
