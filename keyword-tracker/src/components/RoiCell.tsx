import { pct, roiTone } from "@/lib/format";

const toneClass: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-300",
  yellow: "bg-amber-500/15 text-amber-300",
  red: "bg-red-500/15 text-red-300",
  muted: "bg-surface-2 text-muted",
};

/** ROI% pill, color-coded: green >100%, yellow 0–100%, red <0%. */
export function RoiCell({ roi }: { roi: number | null }) {
  const tone = roiTone(roi);
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClass[tone]}`}>
      {roi == null ? "—" : pct(roi)}
    </span>
  );
}
