// Small formatting helpers shared across pages.

export function usd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

export function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "" : ""}${n.toFixed(0)}%`;
}

/** Color band for an ROI value: green >100%, yellow 0–100%, red <0%. */
export function roiTone(roi: number | null): "green" | "yellow" | "red" | "muted" {
  if (roi == null) return "muted";
  if (roi > 100) return "green";
  if (roi >= 0) return "yellow";
  return "red";
}

/** Today's date as YYYY-MM-DD (local). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
