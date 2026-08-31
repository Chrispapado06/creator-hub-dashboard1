// Server-safe display bits (no hooks) for the experiment tracker.
import type { ReactNode } from "react";
import type { ExperimentStatus } from "@/lib/tracker-types";

export function Lift({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted">—</span>;
  const cls = pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-muted";
  return <span className={cls}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
}

const STATUS_STYLES: Record<ExperimentStatus, string> = {
  running: "border-accent/40 bg-accent/10 text-indigo-300",
  concluded: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  confounded: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  insufficient_data: "border-border bg-surface-2 text-muted",
};
const STATUS_LABEL: Record<ExperimentStatus, string> = {
  running: "running",
  concluded: "concluded",
  confounded: "confounded",
  insufficient_data: "insufficient data",
};

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return <Chip className={STATUS_STYLES[status]}>{STATUS_LABEL[status]}</Chip>;
}

const ACTION_STYLES: Record<string, string> = {
  scale: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  hold: "border-accent/40 bg-accent/10 text-indigo-300",
  kill: "border-red-500/40 bg-red-500/10 text-red-300",
  unreadable: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

export function ActionChip({ action }: { action: string }) {
  return <Chip className={ACTION_STYLES[action] ?? "border-border bg-surface-2 text-muted"}>{action}</Chip>;
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}
